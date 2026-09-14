import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeVoice } from './analyze'
import { MouthPreview } from './MouthPreview'
import mouthRiv from './assets/mouth.riv?url'
import {
  applyMouth,
  applyMouthToRive,
  bindMouth,
  createRive,
  ARTBOARD_NAME,
  VIEW_MODEL_NAME,
  type RiveMouthBinding,
  type RiveSession,
} from './riveBind'
import {
  REST_POSE,
  TALKING_PROPERTY,
  CARTOON_KEYS,
  CARTOON_VISEMES,
  VISEME_COLOR,
  letterAt,
  nonzeroWeights,
  poseAt,
  rememberPose,
  visemeLabel,
  type Language,
  type MouthPose,
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

function restPose(): MouthPose {
  return { talking: false, primary: 0, weights: { ...REST_POSE.weights } }
}

export default function App() {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [language, setLanguage] = useState<Language>('id')
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [pose, setPose] = useState<MouthPose>(() => restPose())
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [leadMs, setLeadMs] = useState(60)
  const [copied, setCopied] = useState<string | null>(null)
  const [binding, setBinding] = useState<RiveMouthBinding | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)
  const [vmStatus, setVmStatus] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sessionRef = useRef<RiveSession | null>(null)
  const bindingRef = useRef<RiveMouthBinding | null>(null)
  const timelineRef = useRef<Timeline | null>(null)
  const poseRef = useRef<MouthPose>(restPose())
  const leadMsRef = useRef(60)
  const rafRef = useRef<number>(0)
  const loopRef = useRef<() => void>(() => {})

  useEffect(() => {
    poseRef.current = pose
  }, [pose])

  useEffect(() => {
    bindingRef.current = binding
    applyMouth(binding, pose)
  }, [binding, pose])

  useEffect(() => {
    leadMsRef.current = leadMs
  }, [leadMs])

  useEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const pushPose = useCallback((next: MouthPose) => {
    setPose(next)
    applyMouth(bindingRef.current, next)
    applyMouthToRive(sessionRef.current?.rive, next)
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
          const found = bindMouth(ready)
          setBinding(found.binding)
          setVmStatus(found.dump)
          setBindError(found.binding && found.binding.missing.length === 0 ? null : found.dump)
          applyMouth(found.binding, poseRef.current)
          applyMouthToRive(ready, poseRef.current)
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
      const mouthT = t + leadMsRef.current / 1000
      setTime(t)
      pushPose(poseAt(clip.frames, clip.fps, mouthT))
      if (!audio.paused && !audio.ended) {
        rafRef.current = requestAnimationFrame(() => loopRef.current())
      } else {
        setPlaying(false)
        if (audio.ended) pushPose(restPose())
      }
    }
  }, [pushPose])

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
    pushPose(restPose())
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
      pushPose(result.frames[0] ?? restPose())
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
      pushPose({ ...poseAt(timeline.frames, timeline.fps, audio.currentTime + leadMs / 1000), talking: true })
      void audio.play()
      setPlaying(true)
      rafRef.current = requestAnimationFrame(() => loopRef.current())
    } else {
      audio.pause()
      setPlaying(false)
      cancelAnimationFrame(rafRef.current)
      pushPose(restPose())
    }
  }

  function seek(next: number) {
    const audio = audioRef.current
    const clip = timeline
    if (!audio || !clip) return
    audio.currentTime = next
    setTime(next)
    pushPose(poseAt(clip.frames, clip.fps, next + leadMs / 1000))
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
      mapping: Object.fromEntries(CARTOON_VISEMES.filter((item) => item.key).map((item) => [item.key, item.label])),
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
    ? `const frames = ${JSON.stringify(timeline.frames)};
const fps = ${timeline.fps};
function poseAt(t) {
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor(t * fps)));
  return frames[i];
}
const vm = rive.viewModelByName("${VIEW_MODEL_NAME}");
const vmi = vm.defaultInstance() ?? vm.instance();
rive.bindViewModelInstance(vmi);
const talking = vmi.boolean("${TALKING_PROPERTY}");
const visemes = { ${CARTOON_KEYS.map((key) => `${key}: vmi.number("${key}")`).join(', ')} };
function applyPose(pose) {
  talking.value = pose.talking;
  for (const [key, prop] of Object.entries(visemes)) prop.value = pose.weights[key] ?? 0;
}
// Di loop playback:
// const pose = poseAt(audio.currentTime);
// if (pose.talking) { talking.value = true; applyPose(pose); }
// else { applyPose({ talking: false, weights: {} }); }`
    : ''

  const active = nonzeroWeights(pose.weights)
  const bound = Boolean(binding && binding.missing.length === 0)

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">Lipsinc</p>
          <h1>Voice MP3 jadi 5 mulut kartun</h1>
        </div>
        <p className="lede">
          Set <code>{TALKING_PROPERTY}</code> true, lalu blend 5 bentuk kartun: BMP, AE, EE, O, QUW.
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
            <span>Teks yang diucapkan (penting untuk akurat)</span>
            <textarea
              rows={4}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Tulis persis yang diucapkan, contoh: halo semuanya, selamat datang"
            />
          </label>
          {audioFile && !transcript.trim() ? (
            <p className="hint warn">Tanpa teks, mulut hanya ditebak dari audio — biasanya kurang nyambung.</p>
          ) : null}

          <div className="row">
            <label className="seg">
              <span>Bahasa</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            </label>
            <button type="button" className="primary" disabled={!audioFile || status.kind === 'busy'} onClick={() => void convert()}>
              Ubah jadi blend
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
          {bound ? (
            <p className="hint ok">
              mouth.riv · {ARTBOARD_NAME} / {VIEW_MODEL_NAME}.{TALKING_PROPERTY}
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
              <p className={`talking-pill ${pose.talking ? 'on' : ''}`}>
                {TALKING_PROPERTY} {pose.talking ? 'true' : 'false'}
              </p>
              <p className="now-label">huruf / viseme</p>
              <p className="now-number">{letterAt(timeline?.letters ?? [], timeline?.fps ?? 50, time + leadMs / 1000) || visemeLabel(pose.primary)}</p>
              <ul className="now-weights">
                {active.length > 0 ? (
                  active.map((item) => (
                    <li key={item.key}>
                      <span>{item.key}</span>
                      <b>{item.value}</b>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>semua 0</span>
                    <b>0</b>
                  </li>
                )}
              </ul>
              <p className="now-time">{timeline ? formatTime(time) : '00:00.00'}</p>
              <MouthPreview viseme={pose.primary} />
            </div>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            onEnded={() => {
              setPlaying(false)
              pushPose(restPose())
            }}
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

          {timeline ? (
            <label className="lead">
              <span>Lead mulut {leadMs} ms</span>
              <input
                type="range"
                min={-40}
                max={160}
                step={10}
                value={leadMs}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setLeadMs(next)
                  if (timeline) pushPose(poseAt(timeline.frames, timeline.fps, time + next / 1000))
                }}
              />
              <span className="hint">Mundur kalau mulut telat, maju kalau terlalu awal.</span>
            </label>
          ) : null}

          {timeline ? <DebugStrip timeline={timeline} time={time} onSeek={seek} /> : null}
          {timeline ? (
            <p className="hint">
              {timeline.usedTranscript ? 'Mode teks: huruf di-align ke energi suara.' : 'Mode tebakan audio.'}{' '}
              Huruf sekarang: <code>{letterAt(timeline.letters, timeline.fps, time + leadMs / 1000) || '—'}</code>
              {' · '}
              {visemeLabel(pose.primary)}
            </p>
          ) : null}

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
          <h2>5 bentuk kartun</h2>
          <p className="hint">Klik berurutan: pose lama tetap, pose baru dapat value. Klik ketiga: memori lama jadi 0.</p>
          <ol>
            {CARTOON_VISEMES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    item.key
                      ? pose.weights[item.key] > 0
                        ? 'active'
                        : ''
                      : pose.talking
                        ? ''
                        : 'active'
                  }
                  onClick={() => pushPose(item.id === 0 ? restPose() : rememberPose(pose, item.id, 100))}
                >
                  <b>{item.key ?? '—'}</b>
                  <span>{item.hint || item.label}</span>
                  <em>{item.key ? pose.weights[item.key] : pose.talking ? 1 : 0}</em>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}

function DebugStrip({
  timeline,
  time,
  onSeek,
}: {
  timeline: Timeline
  time: number
  onSeek: (t: number) => void
}) {
  const width = 640
  const duration = Math.max(timeline.duration, 0.01)
  const peak = Math.max(...timeline.rms, 0.001)
  const bars = 180
  const rmsBars = new Array(bars).fill(0).map((_, i) => {
    const start = Math.floor((i / bars) * timeline.rms.length)
    const end = Math.max(start + 1, Math.floor(((i + 1) / bars) * timeline.rms.length))
    let max = 0
    for (let k = start; k < end; k++) max = Math.max(max, timeline.rms[k] ?? 0)
    return max
  })
  const speechRuns: { x: number; w: number }[] = []
  let runStart = -1
  timeline.speech.forEach((spoken, i) => {
    if (spoken && runStart < 0) runStart = i
    if ((!spoken || i === timeline.speech.length - 1) && runStart >= 0) {
      const end = spoken && i === timeline.speech.length - 1 ? i + 1 : i
      speechRuns.push({
        x: (runStart / Math.max(timeline.speech.length, 1)) * width,
        w: ((end - runStart) / Math.max(timeline.speech.length, 1)) * width,
      })
      runStart = -1
    }
  })

  function seekFromEvent(e: { currentTarget: SVGSVGElement; clientX: number }) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    onSeek(ratio * timeline.duration)
  }

  const letterMarks: { x: number; g: string }[] = []
  let prev = ''
  timeline.letters.forEach((letter, i) => {
    if (!letter || letter === prev || letter === ' ') return
    prev = letter
    letterMarks.push({ x: (i / Math.max(timeline.letters.length, 1)) * width, g: letter })
  })

  return (
    <svg
      className="timeline debug-strip"
      viewBox={`0 0 ${width} 78`}
      role="slider"
      aria-label="Debug timeline viseme"
      onClick={seekFromEvent}
    >
      {speechRuns.map((run, i) => (
        <rect key={`s-${i}`} x={run.x} y={0} width={Math.max(run.w, 1)} height={78} fill="#1b2438" />
      ))}
      {rmsBars.map((value, i) => {
        const x = (i / bars) * width
        const h = Math.max(1, (value / peak) * 28)
        return <rect key={`r-${i}`} x={x} y={34 - h} width={Math.max(width / bars, 1)} height={h} fill="#4a5570" />
      })}
      {timeline.keyframes.map((key, i) => {
        const next = timeline.keyframes[i + 1]?.t ?? timeline.duration
        const x = (key.t / duration) * width
        const w = Math.max(1, ((next - key.t) / duration) * width)
        return (
          <rect
            key={`${key.t}-${key.v}-${i}`}
            x={x}
            y={40}
            width={w}
            height={22}
            fill={VISEME_COLOR[key.v] ?? '#2a2d36'}
          />
        )
      })}
      {letterMarks.map((mark, i) => (
        <text key={`${mark.g}-${i}`} x={mark.x + 2} y={74} fill="#c9d0de" fontSize="8">
          {mark.g}
        </text>
      ))}
      <rect
        x={(time / duration) * width}
        y={0}
        width={2}
        height={78}
        fill="#d7e0ff"
      />
    </svg>
  )
}
