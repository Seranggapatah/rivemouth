import { visemeLabel } from './visemes'

const LIPS: Record<number, string> = {
  0: 'M 38 64 Q 64 70 90 64',
  1: 'M 42 60 Q 64 78 86 60',
  2: 'M 40 62 H 88',
  3: 'M 50 58 Q 64 78 78 58 Q 64 70 50 58',
  4: 'M 40 58 Q 64 84 88 58',
  5: 'M 40 64 Q 64 66 88 64',
  6: 'M 40 60 Q 64 74 88 60',
  7: 'M 56 58 A 8 10 0 1 0 56 78 A 8 10 0 1 0 56 58',
  8: 'M 50 54 A 14 16 0 1 0 50 86 A 14 16 0 1 0 50 54',
  9: 'M 30 62 Q 64 78 98 62',
  10: 'M 34 52 Q 64 96 94 52',
  11: 'M 46 56 Q 64 82 82 56 Q 64 70 46 56',
}

type Props = {
  viseme: number
}

export function MouthPreview({ viseme }: Props) {
  const d = LIPS[viseme] ?? LIPS[0]!
  const open = viseme === 8 || viseme === 10 || viseme === 7

  return (
    <div className="mouth-card">
      <svg viewBox="0 0 128 128" className="mouth-svg" aria-hidden="true">
        <circle cx="64" cy="64" r="52" fill="#1c1e24" />
        <circle cx="46" cy="48" r="4" fill="#d7dde8" />
        <circle cx="82" cy="48" r="4" fill="#d7dde8" />
        {open ? (
          <ellipse cx="64" cy="70" rx={viseme === 10 ? 22 : viseme === 8 ? 14 : 8} ry={viseme === 10 ? 18 : viseme === 8 ? 14 : 10} fill="#2a1218" />
        ) : null}
        <path d={d} fill="none" stroke="#f2c6c2" strokeWidth="5" strokeLinecap="round" />
        {viseme === 1 ? <path d="M 58 66 Q 64 74 70 66" fill="none" stroke="#e8b4ae" strokeWidth="3" /> : null}
        {viseme === 5 ? <path d="M 40 64 Q 64 66 88 64" fill="none" stroke="#c98e8a" strokeWidth="7" strokeLinecap="round" /> : null}
      </svg>
      <div className="mouth-meta">
        <span className="mouth-id">{viseme}</span>
        <span className="mouth-label">{visemeLabel(viseme)}</span>
      </div>
    </div>
  )
}
