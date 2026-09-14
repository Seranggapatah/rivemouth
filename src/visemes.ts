export const FPS = 50
export const FADE_FRAMES = 4
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

export type VisemeKey = (typeof VISEME_KEYS)[number]

export const VISEMES = [
  { id: 0, key: null, label: 'Rest', group: 'rest' },
  { id: 1, key: 'TH', label: 'TH', group: 'cons' },
  { id: 2, key: 'FV', label: 'FV', group: 'cons' },
  { id: 3, key: 'CHJSH', label: 'CH J SH', group: 'cons' },
  { id: 4, key: 'L', label: 'L', group: 'cons' },
  { id: 5, key: 'BMP', label: 'BMP', group: 'cons' },
  { id: 6, key: 'CDGKN', label: 'CDGKN', group: 'cons' },
  { id: 7, key: 'QUW', label: 'QUW', group: 'vowel' },
  { id: 8, key: 'O', label: 'O', group: 'vowel' },
  { id: 9, key: 'EE', label: 'EE', group: 'vowel' },
  { id: 10, key: 'AE', label: 'AE', group: 'vowel' },
  { id: 11, key: 'R', label: 'R', group: 'cons' },
] as const

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
  let bestKey: VisemeKey | null = null
  let best = 0
  for (const key of VISEME_KEYS) {
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

export function soloPose(id: number, strength = 100): MouthPose {
  const key = visemeKey(id)
  const value = clampWeight(strength)
  if (!key || value <= 0) return { ...REST_POSE, weights: emptyWeights() }
  const weights = emptyWeights()
  weights[key] = value
  return { talking: true, primary: id, weights }
}

export function nonzeroWeights(weights: MouthWeights): { key: VisemeKey; value: number }[] {
  return VISEME_KEYS.map((key) => ({ key, value: weights[key] })).filter((item) => item.value > 0)
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

export function poseAt(frames: MouthPose[], fps: number, time: number): MouthPose {
  if (frames.length === 0) return { ...REST_POSE, weights: emptyWeights() }
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor(time * fps)))
  const pose = frames[i] ?? REST_POSE
  return {
    talking: pose.talking,
    primary: pose.primary,
    weights: copyWeights(pose.weights),
  }
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

type Run = { start: number; end: number; id: number }

function runsOf(ids: number[]): Run[] {
  const runs: Run[] = []
  let i = 0
  while (i < ids.length) {
    let j = i + 1
    while (j < ids.length && ids[j] === ids[i]) j++
    runs.push({ start: i, end: j, id: ids[i] ?? 0 })
    i = j
  }
  return runs
}

export function blendMouthFrames(
  ids: number[],
  strengths: number[],
  fadeFrames = FADE_FRAMES,
): MouthPose[] {
  const n = ids.length
  const out: MouthPose[] = new Array(n)
  const fade = Math.max(1, fadeFrames)
  const runs = runsOf(ids)
  const runAt = new Array<number>(n).fill(0)

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!
    for (let f = run.start; f < run.end; f++) runAt[f] = r
  }

  for (let f = 0; f < n; f++) {
    const run = runs[runAt[f]!]!
    const prev = runs[runAt[f]! - 1]
    const next = runs[runAt[f]! + 1]
    const weights = emptyWeights()
    const id = run.id
    const strength = strengths[f] ?? 0
    const into = f - run.start
    const remain = run.end - f

    if (id === 0 || strength <= 0) {
      if (prev && prev.id > 0 && into < fade) {
        const prevKey = visemeKey(prev.id)
        const prevStrength = strengths[prev.end - 1] ?? 0
        if (prevKey) {
          weights[prevKey] = clampWeight(prevStrength * (1 - (into + 1) / fade))
        }
      }
      const fading = nonzeroWeights(weights).length > 0
      out[f] = {
        talking: fading,
        primary: dominantViseme(weights),
        weights,
      }
      continue
    }

    const key = visemeKey(id)
    let arrive = 1
    if (prev && prev.id > 0 && into < fade) arrive = (into + 1) / fade
    let amount = strength * arrive
    if (next && next.id === 0 && remain <= fade) amount *= remain / fade
    if (key) weights[key] = clampWeight(amount)

    if (prev && prev.id > 0 && into < fade) {
      const prevKey = visemeKey(prev.id)
      const prevStrength = strengths[prev.end - 1] ?? strength
      if (prevKey) {
        weights[prevKey] = clampWeight(prevStrength * (1 - arrive))
      }
    }

    out[f] = {
      talking: true,
      primary: dominantViseme(weights) || id,
      weights,
    }
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
