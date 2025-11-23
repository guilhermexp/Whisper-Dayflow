/**
 * Audio Processing Service
 * Provides VAD (Voice Activity Detection) and audio normalization
 */

type AudioProcessingOptions = {
  // VAD options
  enableVad?: boolean
  vadThreshold?: number // Energy threshold for speech detection (0-1, default 0.01)
  vadWindowMs?: number // Window size in ms (default 30ms)
  vadMinSpeechMs?: number // Minimum speech duration to keep (default 250ms)
  vadPaddingMs?: number // Padding around speech segments (default 300ms)
  vadMinDurationForProcessing?: number // Only apply VAD if audio is longer than this (seconds)

  // Normalization options
  enableNormalization?: boolean
  targetRms?: number // Target RMS level (0-1, default 0.1)
  maxGain?: number // Maximum gain to apply (default 10)
}

type ProcessedAudio = {
  buffer: Buffer
  originalDuration: number
  processedDuration: number
  speechSegments: Array<{ start: number; end: number }>
  wasProcessed: boolean
}

export class AudioProcessingService {
  private readonly sampleRate = 16000 // Standard for speech recognition

  /**
   * Process audio buffer with VAD and normalization
   */
  async processAudio(
    audioBuffer: Buffer,
    options: AudioProcessingOptions = {}
  ): Promise<ProcessedAudio> {
    const {
      enableVad = true,
      vadThreshold = 0.01,
      vadWindowMs = 30,
      vadMinSpeechMs = 250,
      vadPaddingMs = 300,
      vadMinDurationForProcessing = 5,
      enableNormalization = true,
      targetRms = 0.1,
      maxGain = 10,
    } = options

    // Parse WAV to get samples
    const { samples, header } = this.parseWav(audioBuffer)
    const originalDuration = samples.length / this.sampleRate

    console.log(`[audio-processing] Input: ${originalDuration.toFixed(2)}s, ${samples.length} samples`)

    let processedSamples = samples
    let speechSegments: Array<{ start: number; end: number }> = []
    let wasProcessed = false

    // Apply normalization first (before VAD for better detection)
    if (enableNormalization) {
      processedSamples = this.normalizeAudio(processedSamples, targetRms, maxGain)
      wasProcessed = true
      console.log(`[audio-processing] Audio normalized to target RMS ${targetRms}`)
    }

    // Apply VAD only for longer audio
    if (enableVad && originalDuration >= vadMinDurationForProcessing) {
      const vadResult = this.detectSpeech(processedSamples, {
        threshold: vadThreshold,
        windowMs: vadWindowMs,
        minSpeechMs: vadMinSpeechMs,
        paddingMs: vadPaddingMs,
      })

      speechSegments = vadResult.segments

      if (speechSegments.length > 0) {
        processedSamples = this.extractSpeechSegments(processedSamples, speechSegments)
        wasProcessed = true
        const processedDuration = processedSamples.length / this.sampleRate
        console.log(
          `[audio-processing] VAD: ${speechSegments.length} segments, ` +
          `${originalDuration.toFixed(2)}s → ${processedDuration.toFixed(2)}s ` +
          `(${((1 - processedDuration / originalDuration) * 100).toFixed(1)}% reduction)`
        )
      } else {
        console.log(`[audio-processing] VAD: No speech detected, keeping original`)
      }
    }

    // Convert back to WAV buffer
    const processedBuffer = this.samplesToWav(processedSamples, header)
    const processedDuration = processedSamples.length / this.sampleRate

    return {
      buffer: processedBuffer,
      originalDuration,
      processedDuration,
      speechSegments,
      wasProcessed,
    }
  }

  /**
   * Parse WAV file to extract audio samples
   */
  private parseWav(buffer: Buffer): { samples: Float32Array; header: Buffer } {
    // Keep header for reconstruction
    const header = buffer.subarray(0, 44)

    // Read samples (16-bit PCM)
    const dataSize = buffer.length - 44
    const numSamples = Math.floor(dataSize / 2)
    const samples = new Float32Array(numSamples)

    for (let i = 0; i < numSamples; i++) {
      const offset = 44 + i * 2
      const int16 = buffer.readInt16LE(offset)
      samples[i] = Math.max(-1, Math.min(1, int16 / 32767))
    }

    return { samples, header }
  }

  /**
   * Convert samples back to WAV buffer
   */
  private samplesToWav(samples: Float32Array, originalHeader: Buffer): Buffer {
    const dataSize = samples.length * 2
    const fileSize = 44 + dataSize

    // Create new buffer
    const buffer = Buffer.alloc(fileSize)

    // Copy and update header
    originalHeader.copy(buffer, 0, 0, 44)

    // Update file size (offset 4)
    buffer.writeUInt32LE(fileSize - 8, 4)

    // Update data size (offset 40)
    buffer.writeUInt32LE(dataSize, 40)

    // Write samples
    for (let i = 0; i < samples.length; i++) {
      const int16 = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)))
      buffer.writeInt16LE(int16, 44 + i * 2)
    }

    return buffer
  }

  /**
   * Normalize audio to target RMS level
   */
  private normalizeAudio(
    samples: Float32Array,
    targetRms: number,
    maxGain: number
  ): Float32Array {
    // Calculate current RMS
    let sumSquares = 0
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i]
    }
    const currentRms = Math.sqrt(sumSquares / samples.length)

    if (currentRms < 0.0001) {
      // Audio is essentially silent
      return samples
    }

    // Calculate gain
    let gain = targetRms / currentRms
    gain = Math.min(gain, maxGain) // Limit maximum gain

    // Apply gain with soft clipping
    const normalized = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      let sample = samples[i] * gain
      // Soft clipping using tanh
      if (Math.abs(sample) > 0.9) {
        sample = Math.tanh(sample)
      }
      normalized[i] = Math.max(-1, Math.min(1, sample))
    }

    console.log(
      `[audio-processing] Normalization: RMS ${currentRms.toFixed(4)} → ${targetRms.toFixed(4)}, gain ${gain.toFixed(2)}x`
    )

    return normalized
  }

  /**
   * Detect speech segments using energy-based VAD
   */
  private detectSpeech(
    samples: Float32Array,
    options: {
      threshold: number
      windowMs: number
      minSpeechMs: number
      paddingMs: number
    }
  ): { segments: Array<{ start: number; end: number }> } {
    const { threshold, windowMs, minSpeechMs, paddingMs } = options

    const windowSamples = Math.floor((windowMs / 1000) * this.sampleRate)
    const minSpeechSamples = Math.floor((minSpeechMs / 1000) * this.sampleRate)
    const paddingSamples = Math.floor((paddingMs / 1000) * this.sampleRate)

    // Calculate energy for each window
    const energies: boolean[] = []
    for (let i = 0; i < samples.length; i += windowSamples) {
      const end = Math.min(i + windowSamples, samples.length)
      let energy = 0
      for (let j = i; j < end; j++) {
        energy += samples[j] * samples[j]
      }
      energy = Math.sqrt(energy / (end - i))
      energies.push(energy > threshold)
    }

    // Find speech segments
    const segments: Array<{ start: number; end: number }> = []
    let inSpeech = false
    let speechStart = 0

    for (let i = 0; i < energies.length; i++) {
      if (energies[i] && !inSpeech) {
        inSpeech = true
        speechStart = i * windowSamples
      } else if (!energies[i] && inSpeech) {
        inSpeech = false
        const speechEnd = i * windowSamples
        if (speechEnd - speechStart >= minSpeechSamples) {
          segments.push({
            start: Math.max(0, speechStart - paddingSamples),
            end: Math.min(samples.length, speechEnd + paddingSamples),
          })
        }
      }
    }

    // Handle case where speech extends to end
    if (inSpeech) {
      const speechEnd = samples.length
      if (speechEnd - speechStart >= minSpeechSamples) {
        segments.push({
          start: Math.max(0, speechStart - paddingSamples),
          end: speechEnd,
        })
      }
    }

    // Merge overlapping segments
    const merged = this.mergeSegments(segments)

    return { segments: merged }
  }

  /**
   * Merge overlapping or adjacent segments
   */
  private mergeSegments(
    segments: Array<{ start: number; end: number }>
  ): Array<{ start: number; end: number }> {
    if (segments.length === 0) return []

    // Sort by start time
    const sorted = [...segments].sort((a, b) => a.start - b.start)
    const merged: Array<{ start: number; end: number }> = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]

      if (current.start <= last.end) {
        // Overlapping, merge
        last.end = Math.max(last.end, current.end)
      } else {
        merged.push(current)
      }
    }

    return merged
  }

  /**
   * Extract speech segments from audio
   */
  private extractSpeechSegments(
    samples: Float32Array,
    segments: Array<{ start: number; end: number }>
  ): Float32Array {
    if (segments.length === 0) return samples

    // Calculate total length
    let totalLength = 0
    for (const seg of segments) {
      totalLength += seg.end - seg.start
    }

    // Extract segments
    const extracted = new Float32Array(totalLength)
    let offset = 0

    for (const seg of segments) {
      const length = seg.end - seg.start
      extracted.set(samples.subarray(seg.start, seg.end), offset)
      offset += length
    }

    return extracted
  }
}

// Singleton instance
export const audioProcessingService = new AudioProcessingService()
