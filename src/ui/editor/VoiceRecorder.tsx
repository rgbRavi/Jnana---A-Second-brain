import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Called with the finished recording once the user stops. */
  onRecorded: (blob: Blob) => void
  /** Notifies the parent when recording starts/stops (so it can block saving). */
  onRecordingChange?: (recording: boolean) => void
  className?: string
  disabled?: boolean
}

function fmtElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${`${s}`.padStart(2, '0')}`
}

/**
 * Mic capture button. Click to start (requests mic permission), click again to
 * stop; the recorded clip is handed to `onRecorded` as a Blob. Uses the browser
 * MediaRecorder API (WebView2 is Chromium-based) and produces webm/opus.
 * Microphone permission is requested lazily on first use; denial / no-device
 * surfaces a clear message instead of failing silently.
 */
export function VoiceRecorder({ onRecorded, onRecordingChange, className, disabled }: Props) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  const setRecordingState = (value: boolean) => {
    setRecording(value)
    onRecordingChange?.(value)
  }

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => stopTracks, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stopTracks()
        setRecordingState(false)
        setElapsed(0)
        if (blob.size > 0) onRecorded(blob)
      }

      recorder.start()
      recorderRef.current = recorder
      setRecordingState(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    } catch (err) {
      stopTracks()
      setRecordingState(false)
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        alert('Microphone access was blocked. Allow microphone access for Jnana and try again.')
      } else if (name === 'NotFoundError') {
        alert('No microphone was found.')
      } else {
        alert('Could not start recording: ' + String(err))
      }
    }
  }

  const stop = () => {
    // onstop assembles the blob and releases the stream.
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  return (
    <button
      type="button"
      className={className}
      onClick={recording ? stop : start}
      disabled={disabled}
      title={recording ? 'Stop recording' : 'Record audio'}
      style={recording ? { color: 'var(--danger, #e5484d)' } : undefined}
    >
      {recording ? `⏹ ${fmtElapsed(elapsed)}` : '🎙️'}
    </button>
  )
}
