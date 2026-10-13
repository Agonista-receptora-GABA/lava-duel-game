<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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
const { startListening, stopListening, supported } = useSpeechRecognition({
  lang: 'pl-PL',
  onResult: (text: string) => game.answer(text),
})

const currentPlayerId = computed(() => game.players.find(({ id }) => id === socket.id)?.id)
const opponents = computed(() => game.players.filter(({ id }) => id !== currentPlayerId.value))
const currentCategory = computed(() => categories.value.find(({ id }) => id === game.categoryId))

onMounted(async () => {
  categories.value = await game.fetchCategories()
  selectedCategoryId.value = categories.value[0]?.id ?? ''

  game.bindSocketEvents({
    onDuelStarted: (d) => {
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
      if (c.by === currentPlayerId.value) {
        stopListening()
      }
      if (c.turnId === currentPlayerId.value) {
        startListening()
      }
    },
    onDuelEnded: () => {
      stopListening()
    },
  })
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
        <img :src="game.current.img" alt="" style="max-width: 320px" />
        <p>Transkrypcja: {{ game.transcript }}</p>
        <button @click="game.pass()">Pas</button>
      </div>
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
