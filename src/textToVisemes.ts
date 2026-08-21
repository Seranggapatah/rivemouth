import type { Language } from './visemes'

type Token = { v: number; w: number }

const WEIGHT = {
  vowel: 2.2,
  r: 1.45,
  l: 1.3,
  nasal: 1.1,
  fricative: 1.15,
  stop: 0.75,
  glide: 0.9,
  h: 0.45,
  space: 1.55,
} as const

const DIGRAPHS_ID: Record<string, Token> = {
  ny: { v: 6, w: WEIGHT.nasal },
  ng: { v: 6, w: WEIGHT.nasal },
  sy: { v: 3, w: WEIGHT.fricative },
  kh: { v: 6, w: WEIGHT.fricative },
  ai: { v: 10, w: WEIGHT.vowel },
  au: { v: 10, w: WEIGHT.vowel },
  oi: { v: 8, w: WEIGHT.vowel },
  ei: { v: 9, w: WEIGHT.vowel },
}

const DIGRAPHS_EN: Record<string, Token> = {
  th: { v: 1, w: WEIGHT.fricative },
  ch: { v: 3, w: WEIGHT.fricative },
  sh: { v: 3, w: WEIGHT.fricative },
  zh: { v: 3, w: WEIGHT.fricative },
  ph: { v: 2, w: WEIGHT.fricative },
  wh: { v: 7, w: WEIGHT.glide },
  qu: { v: 7, w: WEIGHT.glide },
  ng: { v: 6, w: WEIGHT.nasal },
  ck: { v: 6, w: WEIGHT.stop },
  ee: { v: 9, w: WEIGHT.vowel },
  ea: { v: 9, w: WEIGHT.vowel },
  ie: { v: 9, w: WEIGHT.vowel },
  oo: { v: 7, w: WEIGHT.vowel },
  ou: { v: 8, w: WEIGHT.vowel },
  ow: { v: 8, w: WEIGHT.vowel },
  oi: { v: 8, w: WEIGHT.vowel },
  oy: { v: 8, w: WEIGHT.vowel },
  ai: { v: 10, w: WEIGHT.vowel },
  ay: { v: 10, w: WEIGHT.vowel },
  aw: { v: 10, w: WEIGHT.vowel },
  au: { v: 10, w: WEIGHT.vowel },
  er: { v: 11, w: WEIGHT.r },
  ir: { v: 11, w: WEIGHT.r },
  ur: { v: 11, w: WEIGHT.r },
  ar: { v: 10, w: WEIGHT.vowel },
  or: { v: 8, w: WEIGHT.vowel },
}

function charToken(ch: string, language: Language): Token | null {
  switch (ch) {
    case 'a':
      return { v: 10, w: WEIGHT.vowel }
    case 'e':
      return { v: 10, w: WEIGHT.vowel }
    case 'i':
      return { v: 9, w: WEIGHT.vowel }
    case 'o':
      return { v: 8, w: WEIGHT.vowel }
    case 'u':
      return { v: 7, w: WEIGHT.vowel }
    case 'b':
    case 'm':
    case 'p':
      return { v: 5, w: ch === 'm' ? WEIGHT.nasal : WEIGHT.stop }
    case 'f':
    case 'v':
      return { v: 2, w: WEIGHT.fricative }
    case 'l':
      return { v: 4, w: WEIGHT.l }
    case 'r':
      return { v: 11, w: WEIGHT.r }
    case 'w':
    case 'q':
      return { v: 7, w: WEIGHT.glide }
    case 'j':
      return { v: 3, w: WEIGHT.fricative }
    case 'c':
      return language === 'id'
        ? { v: 3, w: WEIGHT.fricative }
        : { v: 6, w: WEIGHT.stop }
    case 'd':
    case 'g':
    case 'k':
    case 't':
      return { v: 6, w: WEIGHT.stop }
    case 'n':
      return { v: 6, w: WEIGHT.nasal }
    case 's':
    case 'z':
    case 'x':
    case 'y':
      return { v: 6, w: ch === 'y' ? WEIGHT.glide : WEIGHT.fricative }
    case 'h':
      return { v: 6, w: WEIGHT.h }
    default:
      return null
  }
}

function wordToTokens(word: string, language: Language): Token[] {
  const cleaned = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const digraphs = language === 'id' ? DIGRAPHS_ID : DIGRAPHS_EN
  const out: Token[] = []
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

  return out.length > 0 ? out : [{ v: 10, w: WEIGHT.vowel }]
}

export function transcriptToTokens(text: string, language: Language): Token[] {
  const parts = text
    .trim()
    .split(/(\s+|[.,!?;:]+)/)
    .filter((p) => p.length > 0)

  const tokens: Token[] = []
  for (const part of parts) {
    if (/^\s+$/.test(part) || /^[.,!?;:]+$/.test(part)) {
      tokens.push({ v: 0, w: WEIGHT.space })
    } else {
      tokens.push(...wordToTokens(part, language))
    }
  }
  return tokens
}

export function stretchTokens(tokens: Token[], nFrames: number): number[] {
  const frames = new Array<number>(nFrames).fill(0)
  if (tokens.length === 0 || nFrames === 0) return frames

  const total = tokens.reduce((sum, t) => sum + t.w, 0) || 1
  let acc = 0
  for (const token of tokens) {
    const start = Math.floor((acc / total) * nFrames)
    acc += token.w
    const end = Math.max(start + 1, Math.floor((acc / total) * nFrames))
    for (let i = start; i < end && i < nFrames; i++) frames[i] = token.v
  }
  return frames
}
