import { VOWEL_IDS, type Language } from './visemes'

export type PhoneToken = { v: number; w: number; g: string }

const WEIGHT = {
  vowel: 2.35,
  r: 1.15,
  l: 1.05,
  nasal: 0.85,
  fricative: 0.9,
  stop: 0.55,
  glide: 0.8,
  h: 0.5,
  space: 0.55,
} as const

const LEAD_INHERIT = new Set(['h', 'y'])
const HOLD_INHERIT = new Set([
  'l', 'r', 'n', 'd', 'g', 'k', 't', 's', 'z', 'x',
  'ny', 'ng', 'kh', 'ck',
])

const DIGRAPHS_ID: Record<string, PhoneToken> = {
  ny: { v: 10, w: WEIGHT.nasal, g: 'ny' },
  ng: { v: 10, w: WEIGHT.nasal, g: 'ng' },
  sy: { v: 9, w: WEIGHT.fricative, g: 'sy' },
  kh: { v: 10, w: WEIGHT.stop, g: 'kh' },
  ai: { v: 10, w: WEIGHT.vowel, g: 'ai' },
  au: { v: 8, w: WEIGHT.vowel, g: 'au' },
  oi: { v: 8, w: WEIGHT.vowel, g: 'oi' },
  ei: { v: 9, w: WEIGHT.vowel, g: 'ei' },
}

const DIGRAPHS_EN: Record<string, PhoneToken> = {
  th: { v: 9, w: WEIGHT.fricative, g: 'th' },
  ch: { v: 9, w: WEIGHT.fricative, g: 'ch' },
  sh: { v: 9, w: WEIGHT.fricative, g: 'sh' },
  zh: { v: 9, w: WEIGHT.fricative, g: 'zh' },
  ph: { v: 5, w: WEIGHT.fricative, g: 'ph' },
  wh: { v: 7, w: WEIGHT.glide, g: 'wh' },
  qu: { v: 7, w: WEIGHT.glide, g: 'qu' },
  ng: { v: 10, w: WEIGHT.nasal, g: 'ng' },
  ck: { v: 10, w: WEIGHT.stop, g: 'ck' },
  ee: { v: 9, w: WEIGHT.vowel, g: 'ee' },
  ea: { v: 9, w: WEIGHT.vowel, g: 'ea' },
  ie: { v: 9, w: WEIGHT.vowel, g: 'ie' },
  oo: { v: 7, w: WEIGHT.vowel, g: 'oo' },
  ou: { v: 8, w: WEIGHT.vowel, g: 'ou' },
  ow: { v: 8, w: WEIGHT.vowel, g: 'ow' },
  oi: { v: 8, w: WEIGHT.vowel, g: 'oi' },
  oy: { v: 8, w: WEIGHT.vowel, g: 'oy' },
  ai: { v: 10, w: WEIGHT.vowel, g: 'ai' },
  ay: { v: 10, w: WEIGHT.vowel, g: 'ay' },
  aw: { v: 10, w: WEIGHT.vowel, g: 'aw' },
  au: { v: 8, w: WEIGHT.vowel, g: 'au' },
  er: { v: 10, w: WEIGHT.r, g: 'er' },
  ir: { v: 10, w: WEIGHT.r, g: 'ir' },
  ur: { v: 10, w: WEIGHT.r, g: 'ur' },
  ar: { v: 10, w: WEIGHT.vowel, g: 'ar' },
  or: { v: 8, w: WEIGHT.vowel, g: 'or' },
}

function charToken(ch: string, language: Language): PhoneToken | null {
  switch (ch) {
    case 'a':
      return { v: 10, w: WEIGHT.vowel, g: ch }
    case 'e':
      return { v: 10, w: WEIGHT.vowel, g: ch }
    case 'i':
      return { v: 9, w: WEIGHT.vowel, g: ch }
    case 'o':
      return { v: 8, w: WEIGHT.vowel, g: ch }
    case 'u':
      return { v: 7, w: WEIGHT.vowel, g: ch }
    case 'b':
    case 'm':
    case 'p':
    case 'f':
    case 'v':
      return { v: 5, w: ch === 'm' ? WEIGHT.nasal : ch === 'f' || ch === 'v' ? WEIGHT.fricative : WEIGHT.stop, g: ch }
    case 'l':
      return { v: 10, w: WEIGHT.l, g: ch }
    case 'r':
      return { v: 10, w: WEIGHT.r, g: ch }
    case 'w':
    case 'q':
      return { v: 7, w: WEIGHT.glide, g: ch }
    case 'j':
      return { v: 9, w: WEIGHT.fricative, g: ch }
    case 'c':
      return language === 'id'
        ? { v: 9, w: WEIGHT.fricative, g: ch }
        : { v: 10, w: WEIGHT.stop, g: ch }
    case 'd':
    case 'g':
    case 'k':
    case 't':
    case 'n':
    case 's':
    case 'z':
    case 'x':
      return { v: 10, w: ch === 'n' ? WEIGHT.nasal : ch === 's' || ch === 'z' || ch === 'x' ? WEIGHT.fricative : WEIGHT.stop, g: ch }
    case 'y':
      return { v: 9, w: WEIGHT.glide, g: ch }
    case 'h':
      return { v: 10, w: WEIGHT.h, g: ch }
    default:
      return null
  }
}

function wordToTokens(word: string, language: Language): PhoneToken[] {
  const cleaned = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const digraphs = language === 'id' ? DIGRAPHS_ID : DIGRAPHS_EN
  const out: PhoneToken[] = []
  let i = 0

  while (i < cleaned.length) {
    const three = cleaned.slice(i, i + 3)
    const two = cleaned.slice(i, i + 2)
    const mapped = digraphs[three] ?? digraphs[two]
    if (mapped) {
      out.push({ ...mapped })
      i += digraphs[three] ? 3 : 2
      continue
    }
    const token = charToken(cleaned[i] ?? '', language)
    if (token) out.push(token)
    i += 1
  }

  return out.length > 0 ? out : [{ v: 10, w: WEIGHT.vowel, g: word || 'a' }]
}

function inheritNeutral(tokens: PhoneToken[]): PhoneToken[] {
  const out = tokens.map((token) => ({ ...token }))
  for (let i = 0; i < out.length; i++) {
    const token = out[i]
    if (!token) continue
    const lead = LEAD_INHERIT.has(token.g)
    const hold = HOLD_INHERIT.has(token.g)
    if (!lead && !hold) continue
    const next = out.slice(i + 1).find((item) => VOWEL_IDS.has(item.v))
    const prev = [...out.slice(0, i)].reverse().find((item) => VOWEL_IDS.has(item.v))
    const vowel = lead ? next ?? prev : prev ?? next
    if (vowel) token.v = vowel.v
  }
  return out
}

export function transcriptToTokens(text: string, language: Language): PhoneToken[] {
  const parts = text
    .trim()
    .split(/(\s+|[.,!?;:]+)/)
    .filter((p) => p.length > 0)

  const tokens: PhoneToken[] = []
  for (const part of parts) {
    if (/^\s+$/.test(part) || /^[.,!?;:]+$/.test(part)) {
      tokens.push({ v: 0, w: WEIGHT.space, g: ' ' })
    } else {
      tokens.push(...inheritNeutral(wordToTokens(part, language)))
    }
  }
  return tokens
}

export function stretchTokens(tokens: PhoneToken[], nFrames: number): number[] {
  return stretchTokensToSpeech(
    tokens,
    nFrames,
    new Array(nFrames).fill(true),
  ).ids
}

export function stretchTokensToSpeech(
  tokens: PhoneToken[],
  nFrames: number,
  speech: boolean[],
): { ids: number[]; letters: string[] } {
  const ids = new Array<number>(nFrames).fill(0)
  const letters = new Array<string>(nFrames).fill('')
  if (tokens.length === 0 || nFrames === 0) return { ids, letters }

  const spoken: number[] = []
  for (let i = 0; i < nFrames; i++) {
    if (speech[i]) spoken.push(i)
  }
  const slots = spoken.length > 8 ? spoken : Array.from({ length: nFrames }, (_, i) => i)
  const total = tokens.reduce((sum, t) => sum + t.w, 0) || 1
  let acc = 0

  for (const token of tokens) {
    const start = Math.floor((acc / total) * slots.length)
    acc += token.w
    const end = Math.max(start + 1, Math.floor((acc / total) * slots.length))
    for (let k = start; k < end && k < slots.length; k++) {
      const frame = slots[k]!
      ids[frame] = token.v
      letters[frame] = token.g
    }
  }

  return { ids, letters }
}

export function makeSpeechMask(rms: number[], thresh: number, pad = 3): boolean[] {
  const n = rms.length
  const raw = rms.map((value) => value >= thresh * 0.72)
  const out = raw.slice()

  for (let i = 0; i < n; i++) {
    if (!raw[i]) continue
    const a = Math.max(0, i - pad)
    const b = Math.min(n, i + pad + 1)
    for (let k = a; k < b; k++) out[k] = true
  }

  let i = 0
  while (i < n) {
    if (out[i]) {
      i += 1
      continue
    }
    let j = i + 1
    while (j < n && !out[j]) j++
    if (i > 0 && j < n && j - i <= 6) {
      for (let k = i; k < j; k++) out[k] = true
    }
    i = j
  }

  return out
}
