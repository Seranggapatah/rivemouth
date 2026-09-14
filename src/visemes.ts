export const FPS = 50
export const FADE_FRAMES = 3
export const TALKING_PROPERTY = 'TALKING'
export const VOWEL_IDS = new Set([7, 8, 9, 10])
export const CLOSED_IDS = new Set([5])

export const VISEME_KEYS = [
  'R',
  'AE',
  'EE',
  'O',
  'QUW',
  'BMP',
  'CDGKN',
  'L',
  'CHJSH',
  'FV',
  'TH',
] as const

export const CARTOON_KEYS = ['BMP', 'AE', 'EE', 'O', 'QUW'] as const

export type VisemeKey = (typeof VISEME_KEYS)[number]
export type CartoonKey = (typeof CARTOON_KEYS)[number]

export const VISEMES = [
  { id: 0, key: null, label: 'Rest', group: 'rest', hint: 'diam' },
  { id: 1, key: 'TH', label: 'TH', group: 'cons', hint: '' },
  { id: 2, key: 'FV', label: 'FV', group: 'cons', hint: '' },
  { id: 3, key: 'CHJSH', label: 'CH J SH', group: 'cons', hint: '' },
  { id: 4, key: 'L', label: 'L', group: 'cons', hint: '' },
  { id: 5, key: 'BMP', label: 'BMP', group: 'cons', hint: 'tertutup · M B P' },
  { id: 6, key: 'CDGKN', label: 'CDGKN', group: 'cons', hint: '' },
  { id: 7, key: 'QUW', label: 'QUW', group: 'vowel', hint: 'maju · U W' },
  { id: 8, key: 'O', label: 'O', group: 'vowel', hint: 'bulat · O' },
  { id: 9, key: 'EE', label: 'EE', group: 'vowel', hint: 'senyum · I' },
  { id: 10, key: 'AE', label: 'AE', group: 'vowel', hint: 'lebar · A E' },
  { id: 11, key: 'R', label: 'R', group: 'cons', hint: '' },
] as const

export const CARTOON_VISEMES: {
  id: number
  key: CartoonKey | null
  label: string
  hint: string
}[] = [
  { id: 0, key: null, label: 'Rest', hint: 'diam' },
  { id: 5, key: 'BMP', label: 'BMP', hint: 'tertutup · M B P' },
  { id: 10, key: 'AE', label: 'AE', hint: 'lebar · A E' },
  { id: 9, key: 'EE', label: 'EE', hint: 'senyum · I' },
  { id: 8, key: 'O', label: 'O', hint: 'bulat · O' },
  { id: 7, key: 'QUW', label: 'QUW', hint: 'maju · U W' },
]

export type VisemeId = (typeof VISEMES)[number]['id']
export type Language = 'id' | 'en'
export type MouthWeights = Record<VisemeKey, number>

export type MouthPose = {
  talking: boolean
  primary: number
  weights: MouthWeights
}

export type Keyframe = {
  t: number
  v: number
  label: string
  talking: boolean
  weights: MouthWeights
}

export type Timeline = {
  fps: number
  duration: number
  frames: MouthPose[]
  keyframes: Keyframe[]
  rms: number[]
  speech: boolean[]
  letters: string[]
  thresh: number
  usedTranscript: boolean
}

export const VISEME_COLOR: Record<number, string> = {
  0: '#2a2d36',
  1: '#5d8a7a',
  2: '#7a6b8a',
  3: '#8a7a5d',
  4: '#5d7a8a',
  5: '#8a5d6b',
  6: '#6b8a5d',
  7: '#5d6b8a',
  8: '#8a6b5d',
  9: '#5d8a8a',
  10: '#8a8a5d',
  11: '#6b5d8a',
}

export function emptyWeights(): MouthWeights {
  return {
    R: 0,
    AE: 0,
    EE: 0,
    O: 0,
    QUW: 0,
    BMP: 0,
    CDGKN: 0,
    L: 0,
    CHJSH: 0,
    FV: 0,
    TH: 0,
  }
}

export const REST_POSE: MouthPose = {
  talking: false,
  primary: 0,
  weights: emptyWeights(),
}

export function clampWeight(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function visemeKey(id: number): VisemeKey | null {
  return VISEMES[id]?.key ?? null
}

export function visemeLabel(id: number): string {
  return VISEMES[id]?.label ?? 'Rest'
}

export function visemeIdForKey(key: VisemeKey): number {
  return VISEMES.find((item) => item.key === key)?.id ?? 0
}

export function poseSignature(pose: MouthPose): string {
  return `${pose.talking ? 1 : 0}:${VISEME_KEYS.map((key) => pose.weights[key]).join(',')}`
}

export function dominantViseme(weights: MouthWeights): number {
  let bestKey: CartoonKey | null = null
  let best = 0
  for (const key of CARTOON_KEYS) {
    const value = weights[key]
    if (value > best) {
      best = value
      bestKey = key
    }
  }
  return bestKey && best > 0 ? visemeIdForKey(bestKey) : 0
}

export function copyWeights(weights: MouthWeights): MouthWeights {
  return { ...weights }
}

export function rememberPose(previous: MouthPose, nextId: number, strength = 100): MouthPose {
  if (nextId <= 0) return { talking: false, primary: 0, weights: emptyWeights() }
  const nextKey = visemeKey(nextId)
  if (!nextKey) return { talking: false, primary: 0, weights: emptyWeights() }

  let memoryId = 0
  let memoryValue = 0
  if (previous.primary > 0 && previous.primary !== nextId) {
    const memKey = visemeKey(previous.primary)
    memoryId = previous.primary
    memoryValue = memKey ? previous.weights[memKey] : strength
  } else {
    const leftover = nonzeroWeights(previous.weights).find((item) => item.key !== nextKey)
    if (leftover) {
      memoryId = visemeIdForKey(leftover.key)
      memoryValue = leftover.value
    }
  }

  return poseFromSlots(nextId, strength, memoryId, memoryValue)
}

export function soloPose(id: number, strength = 100): MouthPose {
  const key = visemeKey(id)
  const value = clampWeight(strength)
  if (!key || value <= 0) return { talking: false, primary: 0, weights: emptyWeights() }
  const weights = emptyWeights()
  weights[key] = value
  return { talking: true, primary: id, weights }
}

export function nonzeroWeights(weights: MouthWeights): { key: CartoonKey; value: number }[] {
  return CARTOON_KEYS.map((key) => ({ key, value: weights[key] })).filter((item) => item.value > 0)
}

export function toKeyframes(frames: MouthPose[], fps: number): Keyframe[] {
  const keys: Keyframe[] = []
  let prev = ''
  for (let i = 0; i < frames.length; i++) {
    const pose = frames[i] ?? REST_POSE
    const signature = poseSignature(pose)
    if (signature !== prev) {
      keys.push({
        t: i / fps,
        v: pose.primary,
        label: visemeLabel(pose.primary),
        talking: pose.talking,
        weights: copyWeights(pose.weights),
      })
      prev = signature
    }
  }
  return keys
}

export function frameIndex(fps: number, time: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, Math.floor(time * fps)))
}

export function poseAt(frames: MouthPose[], fps: number, time: number): MouthPose {
  if (frames.length === 0) return { ...REST_POSE, weights: emptyWeights() }
  const pose = frames[frameIndex(fps, time, frames.length)] ?? REST_POSE
  return {
    talking: pose.talking,
    primary: pose.primary,
    weights: copyWeights(pose.weights),
  }
}

export function letterAt(letters: string[], fps: number, time: number): string {
  if (letters.length === 0) return ''
  return letters[frameIndex(fps, time, letters.length)] ?? ''
}

export function visemeAt(frames: MouthPose[], fps: number, time: number): number {
  return poseAt(frames, fps, time).primary
}

export function smoothVisemes(frames: number[], minHold: number): number[] {
  if (frames.length === 0) return frames
  const out = frames.slice()

  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== out[i - 1] && out[i] !== out[i + 1]) {
      out[i] = out[i - 1]!
    }
  }

  let i = 0
  while (i < out.length) {
    let j = i + 1
    while (j < out.length && out[j] === out[i]) j++
    if (j - i < minHold && i > 0) {
      const fill = out[i - 1]!
      for (let k = i; k < j; k++) out[k] = fill
    }
    i = j
  }

  return out
}

export function toCartoonId(id: number, neighborVowel = 10): number {
  if (id <= 0) return 0
  if (id === 5 || id === 2) return 5
  if (id === 7) return 7
  if (id === 8) return 8
  if (id === 9 || id === 1 || id === 3) return 9
  if (id === 10) return 10
  return VOWEL_IDS.has(neighborVowel) ? neighborVowel : 10
}

export function cartoonizeFrames(ids: number[]): number[] {
  const neighbors = neighborVowels(ids)
  return ids.map((id, i) => toCartoonId(id, neighbors[i] ?? 10))
}

function neighborVowels(ids: number[]): number[] {
  const n = ids.length
  const prev = new Array<number>(n).fill(0)
  const next = new Array<number>(n).fill(0)
  let vowel = 0
  for (let i = 0; i < n; i++) {
    const id = ids[i] ?? 0
    if (VOWEL_IDS.has(id)) vowel = id
    else if (id === 0) vowel = 0
    prev[i] = vowel
  }
  vowel = 0
  for (let i = n - 1; i >= 0; i--) {
    const id = ids[i] ?? 0
    if (VOWEL_IDS.has(id)) vowel = id
    else if (id === 0) vowel = 0
    next[i] = vowel
  }
  return ids.map((_, i) => prev[i] || next[i] || 0)
}

function poseFromSlots(
  currentId: number,
  currentValue: number,
  memoryId: number,
  memoryValue: number,
): MouthPose {
  const weights = emptyWeights()
  const memKey = visemeKey(memoryId)
  const curKey = visemeKey(currentId)
  if (memKey && memoryId > 0) weights[memKey] = clampWeight(memoryValue)
  if (curKey && currentId > 0) {
    const value = clampWeight(currentValue)
    weights[curKey] = currentId === memoryId ? Math.max(weights[curKey], value) : value
  }
  const talking = currentId > 0 || (memoryId > 0 && memoryValue > 0)
  return {
    talking,
    primary: currentId > 0 ? currentId : memoryId > 0 ? memoryId : 0,
    weights,
  }
}

export function blendMouthFrames(
  ids: number[],
  strengths: number[],
  fadeFrames = FADE_FRAMES,
): MouthPose[] {
  const n = ids.length
  const rise = Math.max(1, fadeFrames)
  let currentId = 0
  let currentValue = 0
  let memoryId = 0
  let memoryValue = 0
  let restHold = 0
  const out: MouthPose[] = new Array(n)

  for (let f = 0; f < n; f++) {
    const id = toCartoonId(ids[f] ?? 0)
    const strength = id > 0 ? (strengths[f] ?? 0) : 0

    if (id !== currentId) {
      if (currentId > 0) {
        memoryId = currentId
        memoryValue = currentValue
      }
      currentId = id
      currentValue = 0
      restHold = 0
    }

    if (currentId === 0) {
      currentValue = 0
      restHold += 1
      if (restHold > rise + 2) {
        memoryId = 0
        memoryValue = 0
      }
    } else {
      currentValue = strength
    }

    out[f] = poseFromSlots(currentId, currentValue, memoryId, memoryValue)
  }

  return stabilizeTalking(out, 6)
}

function stabilizeTalking(poses: MouthPose[], hold: number): MouthPose[] {
  const out = poses.map((pose) => ({
    talking: pose.talking,
    primary: pose.primary,
    weights: copyWeights(pose.weights),
  }))

  let i = 0
  while (i < out.length) {
    if (out[i]?.talking) {
      i += 1
      continue
    }
    let j = i + 1
    while (j < out.length && !out[j]?.talking) j++
    const surrounded = i > 0 && j < out.length
    if (surrounded && j - i < hold) {
      for (let k = i; k < j; k++) out[k]!.talking = true
    }
    i = j
  }

  return out
}
