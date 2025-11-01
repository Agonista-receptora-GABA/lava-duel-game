import { ref } from 'vue'

type SpeechRecognitionConstructor = new () => SpeechRecognition

type UseSpeechRecognitionOptions = {
  lang?: string
  onResult?: (text: string) => void
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
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    recognition.onresult = function (event: SpeechRecognitionEvent) {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res && res[0]) {
          const best = res[0].transcript || ''
          text = best
        }
      }
      const cleaned = text.trim().toLowerCase()
      opts.onResult?.(cleaned)
    }

    recognition.onend = () => {
      listening.value = false
    }
  }

  function startListening() {
    if (!supported) return
    if (!recognition) init()
    try {
      recognition?.start()
      listening.value = true
    } catch {
      // obsługa start() gdy już aktywny: ignoruj
    }
  }

  function stopListening() {
    if (recognition && listening.value) recognition.stop()
    listening.value = false
  }

  return { listening, supported, startListening, stopListening }
}
