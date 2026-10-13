<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { PublicCategory } from '@shared/types/events'
import { useGameStore } from './stores/game'
import { useSpeechRecognition } from './composables/speech'
import { socket } from './socket'

const game = useGameStore()
const roomId = ref('pokoj-1')
const name = ref('Gracz')
const bId = ref('')
const categories = ref<PublicCategory[]>([])
const selectedCategoryId = ref('')
const clockNow = ref(Date.now())
const serverClockOffset = ref(0)
const duelResult = ref('')
let clockInterval: ReturnType<typeof setInterval> | undefined
const { startListening, stopListening, supported } = useSpeechRecognition({
  lang: 'pl-PL',
  onResult: (text: string) => game.answer(text),
})

const currentPlayerId = computed(() => game.players.find(({ id }) => id === socket.id)?.id)
const opponents = computed(() => game.players.filter(({ id }) => id !== currentPlayerId.value))
const currentCategory = computed(() => categories.value.find(({ id }) => id === game.categoryId))
const remainingSeconds = (playerId: string) => {
  const duel = game.duel
  if (!duel) return 0

  const elapsed =
    duel.turnId === playerId ? clockNow.value + serverClockOffset.value - duel.turnStartedAt : 0
  return Math.max(0, Math.ceil((duel.remainingMs[playerId]! - elapsed) / 1000))
}

onMounted(async () => {
  clockInterval = setInterval(() => {
    clockNow.value = Date.now()
  }, 100)

  categories.value = await game.fetchCategories()
  selectedCategoryId.value = categories.value[0]?.id ?? ''

  game.bindSocketEvents({
    onDuelStarted: (d) => {
      duelResult.value = ''
      serverClockOffset.value = d.serverNow - Date.now()
      if (!supported) {
        alert(
          'Rozpoznawanie mowy jest nieobsługiwane w Twojej przeglądarce, a bez tego nie można grać. Użyj nowszej przeglądarki',
        )
        return
      }
      if (d.turnId === currentPlayerId.value) {
        startListening()
      }
    },
    onCorrect: (c) => {
      serverClockOffset.value = c.serverNow - Date.now()
      if (c.by === currentPlayerId.value) {
        stopListening()
      }
      if (c.turnId === currentPlayerId.value) {
        startListening()
      }
    },
    onPassed: (p) => {
      serverClockOffset.value = p.serverNow - Date.now()
    },
    onDuelEnded: (result) => {
      stopListening()
      if (result.reason === 'timeout' && result.loserId && result.winnerId) {
        const loser = game.players.find(({ id }) => id === result.loserId)?.name ?? 'Gracz'
        const winner = game.players.find(({ id }) => id === result.winnerId)?.name ?? 'Gracz'
        duelResult.value = `Koniec czasu: ${loser} przegrywa. Wygrywa ${winner}.`
      }
    },
    onRoomState: (state) => {
      if (state.duel) {
        serverClockOffset.value = state.duel.serverNow - Date.now()
        if (state.duel.turnId === currentPlayerId.value && supported) startListening()
      }
    },
  })
})

onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
})
</script>

<template>
  <main>
    <form v-if="!currentPlayerId" @submit.prevent="game.connect(roomId, name)">
      <!-- maxlength = limits of the server (LIMITS in server/socket/schemas.ts): longer values are rejected -->
      <input v-model="roomId" placeholder="Room ID" maxlength="64" />
      <input v-model="name" placeholder="Nick" maxlength="32" />
      <button type="submit">Dołącz</button>
    </form>

    <section v-if="currentPlayerId && categories.length && !game.categoryId">
      <select v-model="selectedCategoryId" aria-label="Kategoria">
        <option v-for="category in categories" :key="category.id" :value="category.id">
          {{ category.label }}
        </option>
      </select>
      <button
        @click="game.setCategory(selectedCategoryId)"
        :disabled="!selectedCategoryId || !game.players.length"
      >
        Ustaw kategorię
      </button>
    </section>

    <section v-if="currentPlayerId">
      <p>Graczy: {{ game.players.length }}</p>
      <p v-if="game.categoryId">Kategoria: {{ currentCategory?.label ?? game.categoryId }}</p>
      <div>
        <label>Wyzwij na 1v1:</label>
        <select v-model="bId">
          <option v-for="p in opponents" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button @click="game.startDuel(bId)" :disabled="!bId || !game.categoryId">Start 1v1</button>
      </div>

      <div v-if="game.duel && game.current">
        <p>
          {{ game.players.find(({ id }) => id === game.duel?.aId)?.name }}:
          {{ remainingSeconds(game.duel.aId) }}s
          {{ game.duel.turnId === game.duel.aId ? '(tura)' : '' }}
        </p>
        <p>
          {{ game.players.find(({ id }) => id === game.duel?.bId)?.name }}:
          {{ remainingSeconds(game.duel.bId) }}s
          {{ game.duel.turnId === game.duel.bId ? '(tura)' : '' }}
        </p>
        <img :src="game.current.img" alt="" style="max-width: 320px" />
        <p>Transkrypcja: {{ game.transcript }}</p>
        <button @click="game.pass()">Pas</button>
      </div>
      <p v-if="duelResult" role="status">{{ duelResult }}</p>
    </section>
  </main>
</template>

<style>
main {
  font-family: sans-serif;
  padding: 1rem;
}
img {
  display: block;
  margin-top: 1rem;
}
</style>
