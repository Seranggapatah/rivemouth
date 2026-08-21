import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeVoice } from './analyze'
import { MouthPreview } from './MouthPreview'
import mouthRiv from './assets/mouth.riv?url'
import {
  applyViseme,
  applyVisemeToRive,
  bindNumberProperty,
  createRive,
  ARTBOARD_NAME,
  NUMBER_PROPERTY,
  VIEW_MODEL_NAME,
  type RiveNumberBinding,
  type RiveSession,
} from './riveBind'
import {
  visemeAt,
  visemeLabel,
  VISEMES,
  type Language,
  type Timeline,
} from './visemes'
import './App.css'

type Status = { kind: 'idle' } | { kind: 'busy'; message: string; ratio: number } | { kind: 'error'; message: string }

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}

export default function App() {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [language, setLanguage] = useState<Language>('id')
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [current, setCurrent] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [binding, setBinding] = useState<RiveNumberBinding | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)
  const [vmStatus, setVmStatus] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sessionRef = useRef<RiveSession | null>(null)
  const bindingRef = useRef<RiveNumberBinding | null>(null)
  const timelineRef = useRef<Timeline | null>(null)
  const currentRef = useRef(0)
  const rafRef = useRef<number>(0)
  const loopRef = useRef<() => void>(() => {})

  useEffect(() => {
    currentRef.current = current
  }, [current])

  useEffect(() => {
    bindingRef.current = binding
    applyViseme(binding, current)
  }, [binding, current])

  useEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const pushViseme = useCallback((value: number) => {
    setCurrent(value)
    applyViseme(bindingRef.current, value)
    applyVisemeToRive(sessionRef.current?.rive, value)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    sessionRef.current?.destroy()
    sessionRef.current = null

    const session = createRive(
      canvas,
      mouthRiv,
      (ready) => {
        if (cancelled) return
        try {
          const found = bindNumberProperty(ready)
          setBinding(found.binding)
          setVmStatus(found.dump)
          setBindError(found.binding?.prop ? null : found.dump)
          applyViseme(found.binding, currentRef.current)
          applyVisemeToRive(ready, currentRef.current)
        } catch (error) {
          setBindError(error instanceof Error ? error.message : 'Gagal bind View Model')
        }
      },
      (message) => {
        if (!cancelled) setBindError(message)
      },
    )
    sessionRef.current = session

    return () => {
      cancelled = true
      sessionRef.current?.destroy()
      sessionRef.current = null
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      try {
        sessionRef.current?.rive.resizeDrawingSurfaceToCanvas()
      } catch {
        // Ignore resize after cleanup
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    loopRef.current = () => {
      const audio = audioRef.current
      const clip = timelineRef.current
      if (!audio || !clip) return
      const t = audio.currentTime
      setTime(t)
      pushViseme(visemeAt(clip.frames, clip.fps, t))
      if (!audio.paused && !audio.ended) {
        rafRef.current = requestAnimationFrame(() => loopRef.current())
      } else {
        setPlaying(false)
      }
    }
  }, [pushViseme])

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  function onPickAudio(file: File | null) {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioFile(file)
    setAudioUrl(file ? URL.createObjectURL(file) : null)
    setTimeline(null)
    setTime(0)
    setPlaying(false)
    pushViseme(0)
  }

  async function convert() {
    if (!audioFile) return
    setStatus({ kind: 'busy', message: 'Membaca audio…', ratio: 0.05 })
    try {
      const result = await analyzeVoice(audioFile, transcript, language, (ratio) => {
        setStatus({
          kind: 'busy',
          message: ratio < 0.9 ? 'Menghitung bentuk mulut…' : 'Merapikan timeline…',
          ratio,
        })
      })
      setTimeline(result)
      setTime(0)
      pushViseme(result.frames[0] ?? 0)
      if (audioRef.current) audioRef.current.currentTime = 0
      setStatus({ kind: 'idle' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memproses audio'
      setStatus({ kind: 'error', message })
    }
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !timeline) return
    if (audio.paused) {
      void audio.play()
      setPlaying(true)
      rafRef.current = requestAnimationFrame(() => loopRef.current())
    } else {
      audio.pause()
      setPlaying(false)
      cancelAnimationFrame(rafRef.current)
    }
  }

  function seek(next: number) {
    const audio = audioRef.current
    const clip = timeline
    if (!audio || !clip) return
    audio.currentTime = next
    setTime(next)
    pushViseme(visemeAt(clip.frames, clip.fps, next))
  }

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1400)
  }

  function downloadJson() {
    if (!timeline) return
    const payload = {
      fps: timeline.fps,
      duration: timeline.duration,
      mapping: Object.fromEntries(VISEMES.map((v) => [v.id, v.label])),
      frames: timeline.frames,
      keyframes: timeline.keyframes,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(audioFile?.name ?? 'visemes').replace(/\.[^.]+$/, '')}.visemes.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const snippet = timeline
    ? `const visemes = ${JSON.stringify(timeline.frames)};
const fps = ${timeline.fps};
function visemeAt(t) {
  const i = Math.min(visemes.length - 1, Math.max(0, Math.floor(t * fps)));
  return visemes[i];
}
const vm = rive.viewModelByName("${VIEW_MODEL_NAME}");
const vmi = vm.defaultInstance() ?? vm.instance();
rive.bindViewModelInstance(vmi);
const mouth = vmi.number("${NUMBER_PROPERTY}");
// Di loop playback:
// mouth.value = visemeAt(audio.currentTime);`
    : ''

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">Lipsinc</p>
          <h1>Voice MP3 jadi angka mulut Rive</h1>
        </div>
        <p className="lede">
          Upload suara, dapatkan angka 0–11, lalu tulis ke{' '}
          <code>{VIEW_MODEL_NAME}.{NUMBER_PROPERTY}</code> di <code>mouth.riv</code>.
        </p>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>1. Audio</h2>
          <label
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) onPickAudio(file)
            }}
          >
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/*,.mp3,.wav,.m4a"
              onChange={(e) => onPickAudio(e.target.files?.[0] ?? null)}
            />
            <span>{audioFile ? audioFile.name : 'Pilih atau drop file MP3'}</span>
          </label>

          <label className="field">
            <span>Teks yang diucapkan (opsional, lebih akurat)</span>
            <textarea
              rows={4}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Contoh: halo semuanya, selamat datang"
            />
          </label>

          <div className="row">
            <label className="seg">
              <span>Bahasa</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            </label>
            <button type="button" className="primary" disabled={!audioFile || status.kind === 'busy'} onClick={() => void convert()}>
              Ubah jadi angka
            </button>
          </div>

          {status.kind === 'busy' ? (
            <div className="progress">
              <div className="bar" style={{ width: `${Math.round(status.ratio * 100)}%` }} />
              <span>{status.message}</span>
            </div>
          ) : null}
          {status.kind === 'error' ? <p className="error">{status.message}</p> : null}

          <h2>2. Rive</h2>
          {binding?.prop ? (
            <p className="hint ok">
              mouth.riv · {ARTBOARD_NAME} / {VIEW_MODEL_NAME}.{NUMBER_PROPERTY}
              {vmStatus ? ` · ${vmStatus}` : ''}
            </p>
          ) : (
            <p className="error">{bindError ?? `Memuat mouth.riv…`}</p>
          )}
        </section>

        <section className="stage">
          <div className="preview-row">
            <div className="rive-wrap">
              <canvas ref={canvasRef} width={420} height={420} />
            </div>
            <div className="now">
              <p className="now-label">numberProperty</p>
              <p className="now-number">{current}</p>
              <p className="now-name">{visemeLabel(current)}</p>
              <p className="now-time">{timeline ? formatTime(time) : '00:00.00'}</p>
              <MouthPreview viseme={current} />
            </div>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
          />

          <div className="transport">
            <button type="button" className="primary" disabled={!timeline} onClick={togglePlay}>
              {playing ? 'Pause' : 'Play + kirim ke Rive'}
            </button>
            <input
              type="range"
              min={0}
              max={timeline?.duration ?? 0}
              step={0.01}
              value={time}
              disabled={!timeline}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </div>

          {timeline ? <TimelineBar timeline={timeline} time={time} onSeek={seek} /> : null}

          {timeline ? (
            <div className="export">
              <button type="button" onClick={downloadJson}>
                Unduh JSON
              </button>
              <button type="button" onClick={() => void copyText('keys', JSON.stringify(timeline.keyframes))}>
                {copied === 'keys' ? 'Tersalin' : 'Salin keyframes'}
              </button>
              <button type="button" onClick={() => void copyText('code', snippet)}>
                {copied === 'code' ? 'Tersalin' : 'Salin kode Rive'}
              </button>
              <p className="hint">
                {timeline.keyframes.length} perubahan mulut · {timeline.frames.length} frame / {timeline.fps} fps
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel legend">
          <h2>State 0–11</h2>
          <p className="hint">Klik untuk tes ke View Model <code>numberProperty</code>.</p>
          <ol>
            {VISEMES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === current ? 'active' : ''}
                  onClick={() => pushViseme(item.id)}
                >
                  <b>{item.id}</b>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}

function TimelineBar({
  timeline,
  time,
  onSeek,
}: {
  timeline: Timeline
  time: number
  onSeek: (t: number) => void
}) {
  const width = 640

  return (
    <svg
      className="timeline"
      viewBox={`0 0 ${width} 36`}
      role="slider"
      aria-label="Timeline viseme"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = (e.clientX - rect.left) / rect.width
        onSeek(ratio * timeline.duration)
      }}
    >
      {timeline.keyframes.map((key, i) => {
        const next = timeline.keyframes[i + 1]?.t ?? timeline.duration
        const x = (key.t / timeline.duration) * width
        const w = Math.max(1, ((next - key.t) / timeline.duration) * width)
        const shade = 18 + (key.v / 11) * 28
        return (
          <rect
            key={`${key.t}-${key.v}`}
            x={x}
            y={8}
            width={w}
            height={20}
            fill={`hsl(228 18% ${shade}%)`}
          />
        )
      })}
      <rect
        x={(time / Math.max(timeline.duration, 0.01)) * width}
        y={4}
        width={2}
        height={28}
        fill="#d7e0ff"
      />
    </svg>
  )
}
