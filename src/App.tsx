import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Papa from 'papaparse'
import * as XLSX from 'xlsx'

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

type VisualStyle = 'AUTO' | 'BRUT' | 'CONT' | 'SCRB' | 'CLST'

type ControlKey =
  | 'density'
  | 'shapeMix'
  | 'rotation'
  | 'reactivity'
  | 'scale'
  | 'glitch'
  | 'trails'
  | 'palette'

type Controls = Record<ControlKey, number>

type DataProfile = {
  name: string
  rows: number
  columns: string[]
  numericAverage: number
  seed: number
}

type AudioProfile = {
  name: string
  url: string
  duration: number
}

const DEFAULT_CONTROLS: Controls = {
  density: 0.5,
  shapeMix: 0.5,
  rotation: 1,
  reactivity: 1,
  scale: 1,
  glitch: 0,
  trails: 0,
  palette: 0,
}

const controlLabels: Array<[ControlKey, string, number, number, number]> = [
  ['density', 'DENSITY', 0, 1, 0.01],
  ['shapeMix', 'SHAPE MIX', 0, 1, 0.01],
  ['rotation', 'ROTATION', 0, 2, 0.01],
  ['reactivity', 'REACTIVITY', 0, 2, 0.01],
  ['scale', 'SCALE', 0.2, 2, 0.01],
  ['glitch', 'GLITCH', 0, 1, 0.01],
  ['trails', 'TRAILS', 0, 1, 0.01],
  ['palette', 'PALETTE', 0, 1, 0.01],
]

const sampleRows: Record<string, unknown>[] = [
  { subject: 'PG-46', bass: 0.28, mid: 0.62, treb: 0.76, level: 0.42 },
  { subject: 'PG-47', bass: 0.71, mid: 0.34, treb: 0.22, level: 0.68 },
  { subject: 'PG-48', bass: 0.46, mid: 0.81, treb: 0.54, level: 0.36 },
]

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function formatId(seed: number) {
  return seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 8)
}

function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function readFileBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function summarizeRows(name: string, rows: Record<string, unknown>[]): DataProfile {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const numbers = rows.flatMap((row) =>
    Object.values(row)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
  )
  const numericAverage = numbers.length
    ? numbers.reduce((total, value) => total + value, 0) / numbers.length
    : rows.length / Math.max(columns.length, 1)
  const seed = hashString(`${name}:${rows.length}:${columns.join('|')}:${numericAverage.toFixed(3)}`)
  return { name, rows: rows.length, columns, numericAverage, seed }
}

async function parseDataset(file: File): Promise<DataProfile> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
    const buffer = await readFileBuffer(file)
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })
    return summarizeRows(file.name, rows.length ? rows : sampleRows)
  }

  const text = await readFileText(file)
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  })
  return summarizeRows(file.name, result.data.length ? result.data : sampleRows)
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel__head">{number} / {title}</div>
      <div className="panel__body">{children}</div>
    </section>
  )
}

function DropZone({ label, accept, onFile }: { label: string; accept: string; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <button
      className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      {label}
      <input
        ref={inputRef}
        accept={accept}
        hidden
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
        }}
      />
    </button>
  )
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const [dataset, setDataset] = useState<DataProfile | null>(null)
  const [audio, setAudio] = useState<AudioProfile | null>(null)
  const [status, setStatus] = useState('AWAITING DATA')
  const [message, setMessage] = useState('Drop CSV / XLS and audio to seed a deterministic identity.')
  const [style, setStyle] = useState<VisualStyle>('AUTO')
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const [isRecording, setIsRecording] = useState(false)

  const identitySeed = useMemo(() => hashString(`${dataset?.seed ?? 'grid'}:${audio?.name ?? 'signal'}:${style}`), [audio, dataset, style])
  const identityId = formatId(identitySeed)
  const displayRows = dataset?.rows ?? sampleRows.length
  const subject = dataset?.columns[0]?.slice(0, 8).toUpperCase() || 'PG-46'

  const handleDataset = useCallback(async (file: File) => {
    setStatus('PARSING DATA')
    try {
      const profile = await parseDataset(file)
      setDataset(profile)
      setStatus('DATA LOCKED')
      setMessage(`${profile.rows} rows × ${profile.columns.length || 1} fields mapped into GRID/SIGNAL.`)
    } catch (error) {
      setStatus('DATA ERROR')
      setMessage(error instanceof Error ? error.message : 'Unable to parse dataset.')
    }
  }, [])

  const handleAudio = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    setAudio((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return { name: file.name, url, duration: 0 }
    })
    setStatus('AUDIO ARMED')
    setMessage('Audio loaded. Press play or start recording to drive the identity.')
  }, [])

  const ensureAudioGraph = useCallback(async () => {
    const audioElement = audioRef.current
    if (!audioElement || sourceRef.current) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    const source = context.createMediaElementSource(audioElement)
    source.connect(analyser)
    analyser.connect(context.destination)
    sourceRef.current = source
    analyserRef.current = analyser
    audioContextRef.current = context
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    let animationId = 0
    const frequencies = new Uint8Array(512)
    const points = Array.from({ length: 42 }, (_, index) => ({
      angle: (Math.PI * 2 * index) / 42,
      distance: 40 + (index % 7) * 11,
      jitter: (index % 5) / 5,
    }))

    const draw = (time: number) => {
      const width = canvas.clientWidth * window.devicePixelRatio
      const height = canvas.clientHeight * window.devicePixelRatio
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      const random = seededRandom(identitySeed)
      analyserRef.current?.getByteFrequencyData(frequencies)
      const bass = frequencies.slice(0, 12).reduce((total, value) => total + value, 0) / (12 * 255) || 0
      const mid = frequencies.slice(12, 96).reduce((total, value) => total + value, 0) / (84 * 255) || 0
      const treble = frequencies.slice(96, 220).reduce((total, value) => total + value, 0) / (124 * 255) || 0
      const level = (bass + mid + treble) / 3
      const activity = Math.max(level, dataset ? Math.min(dataset.numericAverage / 100, 1) : 0.22)

      context.save()
      context.scale(window.devicePixelRatio, window.devicePixelRatio)
      const cssWidth = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      context.fillStyle = controls.palette > 0.5 ? '#101010' : '#ffe83b'
      context.globalAlpha = controls.trails ? 0.18 + controls.trails * 0.4 : 1
      context.fillRect(0, 0, cssWidth, cssHeight)
      context.globalAlpha = 1

      context.strokeStyle = controls.palette > 0.5 ? '#ffe83b' : '#ffffff'
      context.lineWidth = 2
      context.setLineDash([2, 9])
      for (let x = -cssHeight; x < cssWidth + cssHeight; x += 24) {
        context.beginPath()
        context.moveTo(x + ((time / 35) % 24), cssHeight)
        context.lineTo(x + cssHeight + ((time / 35) % 24), 0)
        context.stroke()
      }
      context.setLineDash([])

      context.strokeStyle = '#050505'
      context.lineWidth = 4
      context.strokeRect(18, 18, cssWidth - 36, cssHeight - 36)
      context.strokeStyle = '#ff3b1f'
      context.lineWidth = 3
      context.strokeRect(28, 36, cssWidth - 56, cssHeight - 68)

      const centerX = cssWidth / 2
      const centerY = cssHeight / 2 + 10
      const bodyScale = (52 + activity * 48 * controls.reactivity) * controls.scale
      const spin = time * 0.00045 * controls.rotation
      const wobble = Math.sin(time * 0.003) * controls.shapeMix * 18

      context.fillStyle = controls.palette > 0.5 ? '#ffe83b' : '#050505'
      context.strokeStyle = controls.palette > 0.5 ? '#ffe83b' : '#ffffff'
      context.lineCap = 'round'
      context.lineJoin = 'round'

      points.slice(0, Math.floor(18 + controls.density * 24)).forEach((point, index) => {
        const radius = (point.distance + activity * 130 + random() * 80) * controls.scale
        const angle = point.angle + spin + Math.sin(time * 0.001 + index) * point.jitter
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius * 0.7
        context.beginPath()
        context.moveTo(centerX + Math.cos(angle + 1) * bodyScale * 0.3, centerY + Math.sin(angle + 1) * bodyScale * 0.2)
        for (let bend = 0; bend < 4; bend += 1) {
          context.quadraticCurveTo(
            centerX + (random() - 0.5) * radius,
            centerY + (random() - 0.5) * radius,
            x + Math.sin(time * 0.002 + bend) * wobble,
            y + Math.cos(time * 0.002 + bend) * wobble,
          )
        }
        context.globalAlpha = 0.35 + activity * 0.45
        context.stroke()
      })
      context.globalAlpha = 1

      context.save()
      context.translate(centerX, centerY)
      context.rotate(spin * 0.5)
      context.fillRect(-bodyScale * 0.45, -bodyScale * 0.1, bodyScale * 0.9, bodyScale * 0.92)
      context.beginPath()
      context.arc(0, -bodyScale * 0.62, bodyScale * 0.35, 0, Math.PI * 2)
      context.fill()
      context.lineWidth = bodyScale * 0.16
      ;[
        [-0.55, 0.05, -0.98, 0.55],
        [0.55, 0.05, 0.98, 0.38],
        [-0.26, 0.78, -0.38, 1.45],
        [0.24, 0.78, 0.34, 1.38],
      ].forEach(([x1, y1, x2, y2]) => {
        context.beginPath()
        context.moveTo(x1 * bodyScale, y1 * bodyScale)
        context.lineTo(x2 * bodyScale + (random() - 0.5) * controls.glitch * 36, y2 * bodyScale)
        context.strokeStyle = controls.palette > 0.5 ? '#ffe83b' : '#050505'
        context.stroke()
      })
      context.restore()

      context.fillStyle = '#050505'
      context.fillRect(28, cssHeight - 58, cssWidth - 56, 38)
      context.fillStyle = controls.palette > 0.5 ? '#ffe83b' : '#ffffff'
      context.font = '700 16px "Courier Prime", "Courier New", monospace'
      context.fillText(`BASS ${Math.round(bass * 999).toString().padStart(3, '0')}`, 40, cssHeight - 32)
      context.fillText(`MID ${Math.round(mid * 999).toString().padStart(3, '0')}`, 175, cssHeight - 32)
      context.fillText(`TREB ${Math.round(treble * 999).toString().padStart(3, '0')}`, 315, cssHeight - 32)
      context.fillText(`LVL ${Math.round(activity * 999).toString().padStart(3, '0')}`, 475, cssHeight - 32)
      context.fillText(`ROWS ${displayRows.toString().padStart(4, '0')}`, 625, cssHeight - 32)
      context.fillText(`STYL ${style}`, 795, cssHeight - 32)
      context.restore()

      animationId = requestAnimationFrame(draw)
    }

    animationId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationId)
  }, [controls, dataset, displayRows, identitySeed, style])

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    await ensureAudioGraph()
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume()

    const canvasStream = canvas.captureStream(30)
    const audioElement = audioRef.current
    const audioStream = audioElement && 'captureStream' in audioElement
      ? (audioElement as HTMLAudioElement & { captureStream: () => MediaStream }).captureStream()
      : null
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(audioStream ? audioStream.getAudioTracks() : []),
    ])
    chunksRef.current = []
    const recorderOptions = MediaRecorder.isTypeSupported('video/webm') ? { mimeType: 'video/webm' } : undefined
    const recorder = new MediaRecorder(stream, recorderOptions)
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `grid-signal-${identityId}.webm`
      anchor.click()
      URL.revokeObjectURL(url)
    }
    recorder.start()
    recorderRef.current = recorder
    setIsRecording(true)
    setStatus('RECORDING')
    audioElement?.play()
  }, [ensureAudioGraph, identityId])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setIsRecording(false)
    setStatus('EXPORT READY')
  }, [])

  const randomize = () => {
    const random = seededRandom(Date.now())
    setControls((current) =>
      Object.fromEntries(Object.keys(current).map((key) => [key, Number(random().toFixed(2))])) as Controls,
    )
  }

  const invert = () => setControls((current) => ({ ...current, palette: current.palette > 0.5 ? 0 : 1 }))

  return (
    <main className="shell">
      <header className="hero">
        <div className="hero__copy">
          <p className="eyebrow">GRID / SIGNAL</p>
          <h1>GRID / SIGNAL</h1>
          <p>
            Upload an open dataset (.csv / .xls / .xlsx) → it seeds a one-of-one brutalist identity. Drop in audio → the identity moves with the track. Record clips in-browser or screen-record long sets.
          </p>
        </div>
        <aside className="status-card">
          <span>STATUS</span>
          <strong>{status}</strong>
          <span>ID/{dataset || audio ? identityId : '—'}</span>
          <small>{message}</small>
        </aside>
      </header>

      <div className="workspace">
        <div className="stack">
          <Section number="01" title="DATASET">
            <DropZone label={dataset ? dataset.name : 'DROP CSV / XLS'} accept=".csv,.xls,.xlsx" onFile={handleDataset} />
          </Section>

          <Section number="02" title="AUDIO">
            <DropZone label={audio ? audio.name : 'DROP TRACK (UP TO 5H)'} accept="audio/*" onFile={handleAudio} />
            {audio && (
              <audio
                ref={audioRef}
                className="audio"
                controls
                src={audio.url}
                onPlay={ensureAudioGraph}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration
                  setAudio((current) => (current ? { ...current, duration } : current))
                }}
              />
            )}
          </Section>

          <Section number="03" title="EXPORT">
            <p className="muted">
              In-browser clip export records the canvas + mixed audio to WebM. Best for ≤ 5 min Insta / Shorts. For full 5h sets use a screen recorder (OBS, macOS ⌘⇧5) — the visual runs in real time and stays in sync.
            </p>
            <button className="outline-button" disabled={!audio && !dataset} type="button" onClick={isRecording ? stopRecording : startRecording}>
              ● {isRecording ? 'STOP RECORDING' : 'START RECORDING'}
            </button>
          </Section>

          <Section number="04" title="CONTROLS">
            <div className="control-block">
              <label>STYLE</label>
              <div className="style-grid">
                {(['AUTO', 'BRUT', 'CONT', 'SCRB', 'CLST'] as VisualStyle[]).map((option) => (
                  <button className={option === style ? 'selected' : ''} key={option} type="button" onClick={() => setStyle(option)}>
                    {option}
                  </button>
                ))}
              </div>
              <div className="strip-label">RIBN — RIBBON WAVES</div>
              {controlLabels.map(([key, label, min, max, step]) => (
                <label className="range-row" key={key}>
                  <span>{label}</span>
                  <output>{controls[key].toFixed(2)}</output>
                  <input
                    max={max}
                    min={min}
                    step={step}
                    type="range"
                    value={controls[key]}
                    onChange={(event) => setControls((current) => ({ ...current, [key]: Number(event.target.value) }))}
                  />
                </label>
              ))}
              <div className="button-row">
                <button type="button" onClick={invert}>INVERT</button>
                <button type="button" onClick={randomize}>RANDOMIZE</button>
              </div>
              <button className="reset" type="button" onClick={() => setControls(DEFAULT_CONTROLS)}>RESET</button>
            </div>
          </Section>
        </div>

        <section className="stage" aria-label="Generated visual identity">
          <div className="stage__bar">
            <span>SUBJECT {subject}</span>
            <span>ID/{identityId}</span>
          </div>
          <canvas ref={canvasRef} />
        </section>
      </div>

      <footer>
        <span>GRID/SIGNAL · V0.1</span>
        <span>Each dataset × track combination produces a deterministic, unique identity.</span>
      </footer>
    </main>
  )
}

export default App
