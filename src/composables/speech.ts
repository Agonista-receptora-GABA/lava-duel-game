import { ref } from 'vue'

type SpeechRecognitionConstructor = new () => SpeechRecognition

type UseSpeechRecognitionOptions = {
  lang?: string
  onResult?: (word: string) => void
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const listening = ref(false)
  const supported =
    typeof window !== 'undefined' &&
    (typeof window.SpeechRecognition !== 'undefined' ||
      typeof window.webkitSpeechRecognition !== 'undefined')

  let recognition: SpeechRecognition | null = null

  function getRecognition(): SpeechRecognition | null {
    if (typeof window === 'undefined') return null
    const Ctor: SpeechRecognitionConstructor | undefined =
      window.SpeechRecognition || window.webkitSpeechRecognition
    return Ctor ? new Ctor() : null
  }

  function init() {
    if (recognition) return
    recognition = getRecognition()
    if (!recognition) return

    recognition.lang = opts.lang || 'pl-PL'
    recognition.continuous = true // ciągły nasłuch
    recognition.interimResults = false // tylko finalne wyniki
    recognition.maxAlternatives = 1

    recognition.onresult = function (event: SpeechRecognitionEvent) {
      // Pobierz ostatni wynik rozpoznania
      const lastResult = event.results[event.results.length - 1]
      if (lastResult?.isFinal) {
        const text = lastResult[0]?.transcript.trim().toLowerCase() || ''
        // Wyodrębnij pojedyncze słowa z tekstu i ręcznie wywołaj onResult dla każdego słowa
        const words = text.split(/\s+/)
        words.forEach((word) => {
          if (word) opts.onResult?.(word)
        })
      }
    }

    recognition.onstart = () => {
      listening.value = true
    }

    recognition.onend = () => {
      // Jeśli chcesz, aby nasłuch był ciągły, automatycznie restartuj
      if (listening.value) {
        recognition?.start()
      }
    }
  }

  function startListening() {
    if (!supported) return
    if (!recognition) init()
    listening.value = true
    try {
      recognition?.start()
    } catch {
      // ignoruj jeśli start() jest wywołany gdy już działa
    }
  }

  function stopListening() {
    if (recognition && listening.value) {
      listening.value = false
      recognition.stop()
    }
  }

  return { listening, supported, startListening, stopListening }
}
