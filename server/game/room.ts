import type { Card, PublicCard, RoomState, RoomStatePayload } from '@shared/types/events.ts'

export const MAX_PLAYERS = 100
export const DEFAULT_PLAYER_NAME = 'Gracz'

export function createRoom(): RoomState {
  return {
    players: new Map(),
    max: MAX_PLAYERS,
    categoryId: null,
    deck: [],
    used: new Set(),
    currentIndex: null,
    current: null,
    duel: null,
  }
}

export function isRoomFull(room: RoomState) {
  return room.players.size >= room.max
}

export function addPlayer(room: RoomState, id: string, name?: string) {
  room.players.set(id, { id, name: name?.trim() || DEFAULT_PLAYER_NAME })
}

/**
 * Removes a player; a duel they took part in is dropped as well.
 * Returns true when a duel was ended by this removal (so the caller can notify the room).
 */
export function removePlayer(room: RoomState, playerId: string): boolean {
  room.players.delete(playerId)

  if (room.duel && (room.duel.aId === playerId || room.duel.bId === playerId)) {
    room.duel = null
    return true
  }

  return false
}

/**
 * Removes players whose socket no longer exists (e.g. the pod died without 'disconnecting').
 * `liveIds` = sockets actually connected to the room, across all pods.
 */
export function pruneDisconnectedPlayers(room: RoomState, liveIds: Set<string>) {
  for (const id of [...room.players.keys()]) {
    if (!liveIds.has(id)) removePlayer(room, id)
  }
}

export function toRoomStatePayload(room: RoomState): RoomStatePayload {
  return {
    players: Array.from(room.players, ([id, player]) => ({
      id,
      name: player.name,
    })),
    categoryId: room.categoryId,
    duel: room.duel
      ? {
          aId: room.duel.aId,
          bId: room.duel.bId,
          turnId: room.duel.turnId,
          score: room.duel.score,
        }
      : null,
    current: toPublicCard(room.current),
  }
}

export function toPublicCard(card: Card | null): PublicCard | null {
  return card ? { img: card.img } : null
}
