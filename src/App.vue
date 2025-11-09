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

      <div v-if="game.duel && game.current">
        <img :src="game.current.img" alt="" style="max-width: 320px" />
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
    { img: '/img/polish-athletes/lewandowski.jpg', aliases: ['lewandowski', 'robert lewandowski'] },
    { img: '/img/polish-athletes/swiatek.jpg', aliases: ['świątek', 'iga świątek'] },
    { img: '/img/polish-athletes/pudzian.jpg', aliases: ['pudzianowski', 'mariusz pudzianowski'] },
    { img: '/img/polish-athletes/gollob.jpg', aliases: ['gollob', 'tomasz gollob'] },
    { img: '/img/polish-athletes/holowczyc.jpg', aliases: ['hołowczyc', 'krzysztof hołowczyc'] },

    { img: '/img/polish-athletes/malysz.jpg', aliases: ['małysz', 'adam małysz'] },
    { img: '/img/polish-athletes/kubica.jpg', aliases: ['kubica', 'robert kubica'] },
    { img: '/img/polish-athletes/jedrzejczak.jpg', aliases: ['jędrzejczak', 'otylia jędrzejczak'] },
    { img: '/img/polish-athletes/gruszka.jpg', aliases: ['gruszka', 'piotr gruszka'] },
    { img: '/img/polish-athletes/kowalczyk.jpg', aliases: ['kowalczyk', 'justyna kowalczyk'] },

    { img: '/img/polish-athletes/swoboda.jpg', aliases: ['swoboda', 'ewa swoboda'] },
    { img: '/img/polish-athletes/czerkawski.jpg', aliases: ['czerkawski', 'mariusz czerkawski'] },
    { img: '/img/polish-athletes/zyla.jpg', aliases: ['żyła', 'piotr żyła'] },
    {
      img: '/img/polish-athletes/korzeniowski.jpg',
      aliases: ['korzeniowski', 'robert korzeniowski'],
    },
    { img: '/img/polish-athletes/szewinska.jpg', aliases: ['szewińska', 'irena szewińska'] },

    { img: '/img/polish-athletes/majewski.jpg', aliases: ['majewski', 'tomasz majewski'] },
    { img: '/img/polish-athletes/dudek.jpg', aliases: ['dudek', 'jerzy dudek'] },
    { img: '/img/polish-athletes/ziolkowski.jpg', aliases: ['ziółkowski', 'szymon ziółkowski'] },
    { img: '/img/polish-athletes/golota.jpg', aliases: ['gołota', 'andrzej gołota'] },
    {
      img: '/img/polish-athletes/kozakiewicz.jpg',
      aliases: ['kozakiewicz', 'władysław kozakiewicz'],
    },

    { img: '/img/polish-athletes/stoch.jpg', aliases: ['stoch', 'kamil stoch'] },
    { img: '/img/polish-athletes/zmarzlik.jpg', aliases: ['zmarzlik', 'bartosz zmarzlik'] },
    { img: '/img/polish-athletes/gortat.jpg', aliases: ['gortat', 'marcin gortat'] },
    { img: '/img/polish-athletes/blachowicz.jpg', aliases: ['błachowicz', 'jan błachowicz'] },
    { img: '/img/polish-athletes/szeremeta.jpg', aliases: ['szeremeta', 'julia szeremeta'] },

    { img: '/img/polish-athletes/nastula.jpg', aliases: ['nastula', 'paweł nastula'] },
    { img: '/img/polish-athletes/gruchala.jpg', aliases: ['gruchała', 'sylwia gruchała'] },
    { img: '/img/polish-athletes/miroslaw.jpg', aliases: ['mirosław', 'aleksandra mirosław'] },
    { img: '/img/polish-athletes/skolimowska.jpg', aliases: ['skolimowska', 'kamila skolimowska'] },
    { img: '/img/polish-athletes/janowicz.jpg', aliases: ['janowicz', 'jerzy janowicz'] },

    { img: '/img/polish-athletes/szczesny.jpg', aliases: ['szczęsny', 'wojciech szczęsny'] },
    {
      img: '/img/polish-athletes/michalczewski.jpg',
      aliases: ['michalczewski', 'dariusz michalczewski'],
    },
    { img: '/img/polish-athletes/adamek.jpg', aliases: ['adamek', 'tomasz adamek'] },
    { img: '/img/polish-athletes/guzowska.jpg', aliases: ['guzowska', 'iwona guzowska'] },
    { img: '/img/polish-athletes/pajor.jpg', aliases: ['pajor', 'ewa pajor'] },

    { img: '/img/polish-athletes/hurkacz.jpg', aliases: ['hurkacz', 'hubert hurkacz'] },
    { img: '/img/polish-athletes/szpilka.jpg', aliases: ['szpilka', 'artur szpilka'] },
    { img: '/img/polish-athletes/krychowiak.jpg', aliases: ['krychowiak', 'grzegorz krychowiak'] },
    { img: '/img/polish-athletes/kurek.jpg', aliases: ['kurek', 'bartosz kurek'] },
    { img: '/img/polish-athletes/boruc.jpg', aliases: ['boruc', 'artur boruc'] },

    {
      img: '/img/polish-athletes/wloszczowska.jpg',
      aliases: ['włoszczowska', 'maja włoszczowska'],
    },
    { img: '/img/polish-athletes/kolecki.jpg', aliases: ['kołecki', 'szymon kołecki'] },
    { img: '/img/polish-athletes/saleta.jpg', aliases: ['saleta', 'przemysław saleta'] },
    { img: '/img/polish-athletes/pyrek.jpg', aliases: ['pyrek', 'monika pyrek'] },
    { img: '/img/polish-athletes/szmal.jpg', aliases: ['szmal', 'sławomir szmal'] },
  ],
  ziola: [
    { img: '/img/spices-and-herbs/bazylia.jpg', aliases: ['bazylia'] },
    { img: '/img/spices-and-herbs/rozmaryn.jpg', aliases: ['rozmaryn'] },
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
