export const FPS = 50

export const VISEMES = [
  { id: 0, label: 'Default', group: 'rest' },
  { id: 1, label: 'T H', group: 'cons' },
  { id: 2, label: 'F V', group: 'cons' },
  { id: 3, label: 'CH J SH', group: 'cons' },
  { id: 4, label: 'L', group: 'cons' },
  { id: 5, label: 'B M P', group: 'cons' },
  { id: 6, label: 'C D G K N S T X Y Z', group: 'cons' },
  { id: 7, label: 'Q U W', group: 'vowel' },
  { id: 8, label: 'o', group: 'vowel' },
  { id: 9, label: 'Ee', group: 'vowel' },
  { id: 10, label: 'A E I', group: 'vowel' },
  { id: 11, label: 'R', group: 'cons' },
] as const

export type VisemeId = (typeof VISEMES)[number]['id']
export type Language = 'id' | 'en'

export type Keyframe = {
  t: number
  v: number
  label: string
}

export type Timeline = {
  fps: number
  duration: number
  frames: number[]
  keyframes: Keyframe[]
}

export function visemeLabel(id: number): string {
  return VISEMES[id]?.label ?? 'Default'
}

export function toKeyframes(frames: number[], fps: number): Keyframe[] {
  const keys: Keyframe[] = []
  let prev = Number.NaN
  for (let i = 0; i < frames.length; i++) {
    const v = frames[i] ?? 0
    if (v !== prev) {
      keys.push({ t: i / fps, v, label: visemeLabel(v) })
      prev = v
    }
  }
  return keys
}

export function visemeAt(frames: number[], fps: number, time: number): number {
  if (frames.length === 0) return 0
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor(time * fps)))
  return frames[i] ?? 0
}

export function smoothVisemes(frames: number[], minHold: number): number[] {
  if (frames.length === 0) return frames
  const out = frames.slice()

  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== out[i - 1] && out[i] !== out[i + 1]) {
      out[i] = out[i - 1]
    }
  }

  let i = 0
  while (i < out.length) {
    let j = i + 1
    while (j < out.length && out[j] === out[i]) j++
    if (j - i < minHold && i > 0) {
      const fill = out[i - 1]
      for (let k = i; k < j; k++) out[k] = fill
    }
    i = j
  }

  return out
}
