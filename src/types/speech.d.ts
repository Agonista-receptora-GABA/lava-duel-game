declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition
    SpeechRecognition: typeof SpeechRecognition
  }

  var webkitSpeechRecognition: typeof SpeechRecognition

  class SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
    onend: ((this: SpeechRecognition, ev: Event) => void) | null
  }

  interface SpeechRecognitionEvent extends Event {
    resultIndex: number
    results: SpeechRecognitionResultList
  }
  interface SpeechRecognitionResultList {
    length: number
    [index: number]: SpeechRecognitionResult
  }
  interface SpeechRecognitionResult {
    length: number
    isFinal: boolean
    [index: number]: SpeechRecognitionAlternative
  }
  interface SpeechRecognitionAlternative {
    transcript: string
    confidence: number
  }
}

export {}
