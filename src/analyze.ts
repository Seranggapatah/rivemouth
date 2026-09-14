import {
  FPS,
  blendMouthFrames,
  cartoonizeFrames,
  smoothVisemes,
  toKeyframes,
  type Language,
  type Timeline,
} from './visemes'
import { makeSpeechMask, stretchTokensToSpeech, transcriptToTokens } from './textToVisemes'

const FFT_SIZE = 1024

function hann(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  return w
}

function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]!
      re[j] = tr!
      const ti = im[i]
      im[i] = im[j]!
      im[j] = ti!
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      const half = len >> 1
      for (let j = 0; j < half; j++) {
        const i0 = i + j
        const i1 = i0 + half
        const vRe = re[i1]! * wRe - im[i1]! * wIm
        const vIm = re[i1]! * wIm + im[i1]! * wRe
        re[i1] = re[i0]! - vRe
        im[i1] = im[i0]! - vIm
        re[i0] += vRe
        im[i0] += vIm
        const nextRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextRe
      }
    }
  }
}

function bandEnergy(
  mag: Float32Array,
  sampleRate: number,
  f0: number,
  f1: number,
): number {
  const n = mag.length * 2
  const b0 = Math.max(0, Math.floor((f0 * n) / sampleRate))
  const b1 = Math.min(mag.length - 1, Math.ceil((f1 * n) / sampleRate))
  let sum = 0
  for (let i = b0; i <= b1; i++) sum += mag[i]! * mag[i]!
  return sum
}

function peakHz(
  mag: Float32Array,
  sampleRate: number,
  f0: number,
  f1: number,
): number {
  const n = mag.length * 2
  const b0 = Math.max(0, Math.floor((f0 * n) / sampleRate))
  const b1 = Math.min(mag.length - 1, Math.ceil((f1 * n) / sampleRate))
  let best = b0
  let bestVal = -1
  for (let i = b0; i <= b1; i++) {
    const v = mag[i]!
    if (v > bestVal) {
      bestVal = v
      best = i
    }
  }
  return (best * sampleRate) / n
}

function zcr(frame: Float32Array, from: number, len: number): number {
  let z = 0
  let prev = frame[from] ?? 0
  for (let i = 1; i < len; i++) {
    const x = frame[from + i] ?? 0
    if (prev === 0 || x === 0 ? prev !== x && prev * x <= 0 : prev * x < 0) z++
    prev = x
  }
  return z / Math.max(1, len)
}

function classifyFrame(
  rms: number,
  prevRms: number,
  thresh: number,
  z: number,
  f1: number,
  f2: number,
  high: number,
  midHigh: number,
  total: number,
  centroid: number,
): number {
  if (rms < thresh) return 0

  const highRatio = high / (total + 1e-12)

  if (highRatio > 0.32 && z > 0.11) {
    return midHigh > high * 0.85 ? 3 : 6
  }

  if (rms > prevRms * 2.6 && rms > thresh * 1.8) {
    return centroid < 1100 ? 5 : 6
  }

  if (z > 0.085 && rms < thresh * 7 && highRatio > 0.12 && centroid > 1400) {
    return centroid > 2800 ? 1 : 2
  }

  if (centroid < 650 && z < 0.055) return 5

  if (z < 0.11) {
    if (f2 < 1050 && f1 < 430) return 7
    if (f2 < 1250 && f1 >= 390 && f1 < 720) return 8
    if (f2 > 2050 && f1 < 470) return 9
    if (f2 > 1500 && f2 < 2100 && f1 > 300 && f1 < 650 && z < 0.07) return 11
    if (f2 > 1400 && f2 < 2000 && f1 < 550) return 4
    return 10
  }

  if (z < 0.09 && centroid > 800 && centroid < 1700) return 4
  return 6
}

async function decodeAudio(file: File): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  const buffer = await file.arrayBuffer()
  const audio = await ctx.decodeAudioData(buffer.slice(0))
  await ctx.close()
  return audio
}

function mixMono(audio: AudioBuffer): Float32Array {
  const len = audio.length
  const out = new Float32Array(len)
  const channels = audio.numberOfChannels
  for (let c = 0; c < channels; c++) {
    const data = audio.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += data[i]! / channels
  }
  return out
}

export async function analyzeVoice(
  file: File,
  transcript: string,
  language: Language,
  onProgress?: (ratio: number) => void,
): Promise<Timeline> {
  const audio = await decodeAudio(file)
  const samples = mixMono(audio)
  const sampleRate = audio.sampleRate
  const hop = Math.max(1, Math.round(sampleRate / FPS))
  const nFrames = Math.max(1, Math.ceil(samples.length / hop))
  const window = hann(FFT_SIZE)
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const mag = new Float32Array(FFT_SIZE / 2)

  const rms = new Array<number>(nFrames).fill(0)
  const raw = new Array<number>(nFrames).fill(0)

  for (let f = 0; f < nFrames; f++) {
    const start = f * hop
    let e = 0
    const take = Math.min(FFT_SIZE, samples.length - start)
    re.fill(0)
    im.fill(0)
    let prev = 0
    for (let i = 0; i < take; i++) {
      const x = samples[start + i] ?? 0
      const emphasized = x - 0.97 * prev
      prev = x
      e += x * x
      re[i] = emphasized * window[i]!
    }
    rms[f] = Math.sqrt(e / Math.max(1, take))
    fftInPlace(re, im)

    let total = 0
    let centroidSum = 0
    for (let i = 0; i < mag.length; i++) {
      const m = Math.hypot(re[i]!, im[i]!)
      mag[i] = m
      total += m
      centroidSum += m * ((i * sampleRate) / FFT_SIZE)
    }

    const centroid = total > 0 ? centroidSum / total : 0
    const high = bandEnergy(mag, sampleRate, 4000, 8000)
    const midHigh = bandEnergy(mag, sampleRate, 2000, 4000)
    const specTotal = bandEnergy(mag, sampleRate, 80, 8000)
    const f1 = peakHz(mag, sampleRate, 200, 900)
    const f2 = peakHz(mag, sampleRate, 800, 2800)
    const z = zcr(samples, start, Math.min(hop, samples.length - start))
    const prevRms = f > 0 ? rms[f - 1]! : rms[f]!

    raw[f] = classifyFrame(
      rms[f]!,
      prevRms,
      0.02,
      z,
      f1,
      f2,
      high,
      midHigh,
      specTotal,
      centroid,
    )

    if (onProgress && f % 40 === 0) {
      onProgress(0.15 + (f / nFrames) * 0.7)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  const sorted = rms.slice().sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.12)] ?? 0.002
  const thresh = Math.max(floor * 3.4, 0.008)

  for (let f = 0; f < nFrames; f++) {
    if (rms[f]! < thresh) raw[f] = 0
  }

  const speech = makeSpeechMask(rms, thresh, 3)
  let frames = cartoonizeFrames(smoothVisemes(raw, 3))
  const letters = new Array<string>(nFrames).fill('')
  const trimmed = transcript.trim()
  const usedTranscript = trimmed.length > 0

  if (usedTranscript) {
    const tokens = transcriptToTokens(trimmed, language)
    const aligned = stretchTokensToSpeech(tokens, nFrames, speech)
    const mixed = new Array<number>(nFrames).fill(0)
    for (let i = 0; i < nFrames; i++) {
      if (!speech[i]) {
        mixed[i] = 0
        continue
      }
      if (aligned.ids[i] === 0) {
        mixed[i] = frames[i] || 10
        letters[i] = aligned.letters[i] || ''
      } else {
        mixed[i] = aligned.ids[i]!
        letters[i] = aligned.letters[i] ?? ''
      }
    }
    frames = cartoonizeFrames(smoothVisemes(mixed, 1))
  }

  const voiced = rms.filter((value) => value >= thresh).sort((a, b) => a - b)
  const peak = voiced[Math.floor(voiced.length * 0.9)] ?? thresh * 6
  const rawStrength = frames.map((id, i) =>
    id === 0 ? 0 : rmsToStrength(rms[i] ?? 0, thresh, peak, id),
  )
  const strengths = smoothStrength(rawStrength, frames)
  const poses = blendMouthFrames(frames, strengths)

  onProgress?.(1)

  return {
    fps: FPS,
    duration: audio.duration,
    frames: poses,
    keyframes: toKeyframes(poses, FPS),
    rms,
    speech,
    letters,
    thresh,
    usedTranscript,
  }
}

function smoothStrength(values: number[], ids: number[]): number[] {
  const out = values.slice()
  for (let i = 1; i < values.length - 1; i++) {
    if (ids[i] === 5) continue
    out[i] = Math.round(values[i - 1]! * 0.18 + values[i]! * 0.64 + values[i + 1]! * 0.18)
  }
  return out
}

const STRENGTH_MUL: Record<number, number> = {
  0: 0,
  5: 0.82,
  7: 0.95,
  8: 1,
  9: 1,
  10: 1,
}

function rmsToStrength(rms: number, thresh: number, peak: number, viseme: number): number {
  if (rms < thresh || viseme <= 0) return 0
  const span = Math.max(peak - thresh, thresh)
  const t = Math.max(0, Math.min(1, (rms - thresh) / span))
  const mul = STRENGTH_MUL[viseme] ?? 0.8
  return Math.round(Math.max(1, Math.min(100, (40 + t * 60) * mul)))
}
