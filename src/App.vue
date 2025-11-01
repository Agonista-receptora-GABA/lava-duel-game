<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGameStore } from './stores/game'
import { useSpeechRecognition } from './composables/speech'

const game = useGameStore()
const roomId = ref('pokoj-1')
const name = ref('Gracz')
const { startListening, stopListening, supported, listening } = useSpeechRecognition({
  lang: 'pl-PL',
  onResult: (text: string) => game.answer(text),
})

onMounted(() => game.bindSocketEvents())
</script>

<template>
  <main>
    <section>
      <input v-model="roomId" placeholder="Room ID" />
      <input v-model="name" placeholder="Nick" />
      <button @click="game.connect(roomId, name)">Dołącz</button>
    </section>

    <section v-if="game.players.length">
      <p>Graczy: {{ game.players.length }}</p>
      <div>
        <button @click="game.setCategory('polscy sportowcy', demoDeck.sport)">
          Ustaw kategorię: sport
        </button>
        <button @click="game.setCategory('przyprawy i zioła', demoDeck.ziola)">
          Ustaw kategorię: zioła
        </button>
      </div>
      <div>
        <label>Wybierz 1v1:</label>
        <select v-model="aId">
          <option v-for="p in game.players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model="bId">
          <option v-for="p in game.players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button @click="game.startDuel(aId, bId)" :disabled="!aId || !bId">Start 1v1</button>
      </div>

      <div v-if="game.current">
        <img :src="game.current.img" alt="obraz" style="max-width: 320px" />
        <p>Transkrypcja: {{ game.transcript }}</p>
        <button @click="game.pass()">Pas</button>
        <button @click="listening ? stopListening() : startListening()" :disabled="!supported">
          {{ listening ? 'Stop' : 'Mów' }}
        </button>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
const aId = ref('')
const bId = ref('')
const demoDeck = {
  sport: [
    { img: '/img/lewandowski.jpg', aliases: ['lewandowski', 'robert lewandowski'] },
    { img: '/img/swiatek.jpg', aliases: ['iga', 'iga świątek', 'świątek'] },
  ],
  ziola: [
    { img: '/img/bazylia.jpg', aliases: ['bazylia'] },
    { img: '/img/rozmaryn.jpg', aliases: ['rozmaryn'] },
  ],
}
</script>

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
