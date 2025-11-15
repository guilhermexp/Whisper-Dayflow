import EventEmitter from "./event-emitter"
import { playSound } from "./sound"

const MIN_DECIBELS = -45

const logTime = (label: string) => {
  let time = performance.now()
  console.log(`${label} started at`, time)

  return (step: string) => {
    const now = performance.now()
    console.log(`${label} / ${step} took`, now - time)
    time = now
  }
}

const calculateRMS = (data: Uint8Array) => {
  let sumSquares = 0
  for (let i = 0; i < data.length; i++) {
    const normalizedValue = (data[i] - 128) / 128 // Normalize the data
    sumSquares += normalizedValue * normalizedValue
  }
  return Math.sqrt(sumSquares / data.length)
}

const normalizeRMS = (rms: number) => {
  rms = rms * 10
  const exp = 1.5 // Adjust exponent value; values greater than 1 expand larger numbers more and compress smaller numbers more
  const scaledRMS = Math.pow(rms, exp)

  // Scale between 0.01 (1%) and 1.0 (100%)
  return Math.min(1.0, Math.max(0.01, scaledRMS))
}

const TARGET_SAMPLE_RATE = 16000

const writeString = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

const encodeWavBuffer = (audioBuffer: AudioBuffer) => {
  const channelData = audioBuffer.getChannelData(0)
  const buffer = new ArrayBuffer(44 + channelData.length * 2)
  const view = new DataView(buffer)
  const sampleRate = audioBuffer.sampleRate

  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + channelData.length * 2, true)
  writeString(view, 8, "WAVE")
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true) // Subchunk1Size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // Mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // Byte rate
  view.setUint16(32, 2, true) // Block align
  view.setUint16(34, 16, true) // Bits per sample
  writeString(view, 36, "data")
  view.setUint32(40, channelData.length * 2, true)

  let offset = 44
  for (let i = 0; i < channelData.length; i++) {
    let sample = channelData[i]
    sample = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return buffer
}

const resampleToMono = async (audioBuffer: AudioBuffer, sampleRate: number) => {
  if (
    audioBuffer.sampleRate === sampleRate &&
    audioBuffer.numberOfChannels === 1
  ) {
    return audioBuffer
  }

  const offlineContext = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * sampleRate),
    sampleRate,
  )

  const source = offlineContext.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineContext.destination)
  source.start(0)

  return offlineContext.startRendering()
}

const convertBlobToWavBlob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer()
  const audioContext = new AudioContext()
  try {
    const decodedBuffer = await audioContext.decodeAudioData(
      arrayBuffer.slice(0),
    )
    const monoBuffer = await resampleToMono(decodedBuffer, TARGET_SAMPLE_RATE)
    const wavBuffer = encodeWavBuffer(monoBuffer)
    return new Blob([wavBuffer], { type: "audio/wav" })
  } finally {
    await audioContext.close().catch(() => {})
  }
}

export class Recorder extends EventEmitter<{
  "record-start": []
  "record-end": [Blob, number, string]
  "visualizer-data": [number]
  destroy: []
}> {
  stream: MediaStream | null = null
  mediaRecorder: MediaRecorder | null = null
  audioCuesEnabled = true

  constructor() {
    super()
  }

  setAudioCuesEnabled(enabled: boolean) {
    this.audioCuesEnabled = enabled
  }

  analyseAudio(stream: MediaStream) {
    let processFrameTimer: number | null = null

    const audioContext = new AudioContext()
    const audioStreamSource = audioContext.createMediaStreamSource(stream)

    const analyser = audioContext.createAnalyser()
    analyser.minDecibels = MIN_DECIBELS
    audioStreamSource.connect(analyser)

    const bufferLength = analyser.frequencyBinCount

    const domainData = new Uint8Array(bufferLength)
    const timeDomainData = new Uint8Array(analyser.fftSize)

    const animate = (fn: () => void) => {
      processFrameTimer = requestAnimationFrame(fn)
    }

    const detectSound = () => {
      const processFrame = () => {
        analyser.getByteTimeDomainData(timeDomainData)
        analyser.getByteFrequencyData(domainData)

        // Calculate RMS level from time domain data
        const rmsLevel = calculateRMS(timeDomainData)
        const rms = normalizeRMS(rmsLevel)

        this.emit("visualizer-data", rms)

        animate(processFrame)
      }

      animate(processFrame)
    }

    detectSound()

    return () => {
      processFrameTimer && cancelAnimationFrame(processFrameTimer)
      audioStreamSource.disconnect()
      audioContext.close()
    }
  }

  async startRecording() {
    this.stopRecording()

    const log = logTime("startRecording")

    const stream = (this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: "default",
      },
      video: false,
    }))

    log("getUserMedia")

    const mediaRecorder = (this.mediaRecorder = new MediaRecorder(stream, {
      audioBitsPerSecond: 128e3,
    }))
    log("new MediaRecorder")

    let audioChunks: Blob[] = []
    let startTime = Date.now()

    // Start timing for mediaRecorder.onstart
    mediaRecorder.onstart = () => {
      log("onstart")
      startTime = Date.now()
      this.emit("record-start")
      const stopAnalysing = this.analyseAudio(stream)
      this.once("destroy", stopAnalysing)
      if (this.audioCuesEnabled) {
        void playSound("begin_record")
      }
    }

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data)
    }
    mediaRecorder.onstop = async () => {
      const duration = Date.now() - startTime
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType })
      try {
        const wavBlob = await convertBlobToWavBlob(blob)
        this.emit("record-end", wavBlob, duration, "audio/wav")
      } catch (error) {
        console.error("[Recorder] Failed to convert audio to WAV", error)
        this.emit("record-end", blob, duration, blob.type)
      }

      audioChunks = []
    }

    mediaRecorder.start()
  }

  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop()
      this.mediaRecorder = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }


    this.emit("destroy")

  }
}
