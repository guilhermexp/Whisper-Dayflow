import { useState, useEffect, useMemo, useCallback, useLayoutEffect } from 'react'
import { Play, Pause, Clock3, X } from 'lucide-react'
import { useLocalStorage } from 'renderer/hooks/useLocalStorage'
import { addSession } from 'renderer/utils/timer-history'
import { tipcClient } from 'renderer/lib/tipc-client'
import './styles.scss'

// Force transparent background on mount
const useTransparentBackground = () => {
  useLayoutEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
  }, [])
}

const STORAGE_KEY = 'liv_timer_state_v1'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

interface TimerState {
  mode: 'idle' | 'ready' | 'running' | 'paused' | 'edit'
  label: string
  totalMs: number
  remainingMs: number
  startedAt: number | null
}

const initialState: TimerState = {
  mode: 'idle',
  label: '',
  totalMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  startedAt: null,
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60

  if (m >= 60) {
    const h = Math.floor(m / 60)
    const mm = String(m % 60).padStart(2, '0')
    return `${h}:${mm}:${String(s).padStart(2, '0')}`
  }
  if (m >= 1) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

function ProgressRing({ progress = 0, children }: { progress: number; children: React.ReactNode }) {
  const size = 32
  const stroke = 3
  const radius = (size - stroke) / 2
  const circum = 2 * Math.PI * radius
  const offset = circum * (1 - clamp(progress, 0, 1))

  return (
    <div className="progress-ring">
      <svg className="ring-svg" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#4d88ff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circum}
          strokeDashoffset={offset}
          fill="none"
        />
      </svg>
      <div className="ring-content">{children}</div>
    </div>
  )
}

export function Component() {
  useTransparentBackground()
  const [state, setState] = useLocalStorage<TimerState>(STORAGE_KEY, initialState)

  const pauseFocusPipeline = useCallback(async () => {
    try {
      await tipcClient.pauseFocusSession({ reason: 'paused' })
    } catch (error) {
      console.error('[timer-float] failed to pause focus session', error)
    }
  }, [])

  const resumeFocusPipeline = useCallback(async (label: string, expectedDurationMs: number) => {
    try {
      await tipcClient.resumeFocusSession({ label, expectedDurationMs })
    } catch (error) {
      console.error('[timer-float] failed to resume focus session', error)
    }
  }, [])

  const stopFocusPipeline = useCallback(async (reason: 'finished' | 'cancelled' | 'paused') => {
    try {
      await tipcClient.stopFocusSession({ reason })
    } catch (error) {
      console.error('[timer-float] failed to stop focus session', error)
    }
  }, [])

  // Close window when not running/paused
  useEffect(() => {
    if (state.mode !== 'running' && state.mode !== 'paused') {
      window.electron?.ipcRenderer?.send('hide-timer-window')
    }
  }, [state.mode])

  // Local tick counter to trigger re-renders every second so the display
  // updates even when no cross-window storage events are received.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (state.mode !== 'running') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [state.mode])

  const derivedRemainingMs = useMemo(() => {
    if (state.mode !== 'running' || !state.startedAt) return state.remainingMs
    const elapsed = Date.now() - state.startedAt
    return clamp(state.totalMs - elapsed, 0, state.totalMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.startedAt, state.totalMs, state.remainingMs, tick])

  // Detect timer completion independently of main window
  useEffect(() => {
    if (state.mode === 'running' && derivedRemainingMs <= 0) {
      setState((prev) => {
        if (prev.startedAt) {
          try {
            const elapsed = prev.totalMs
            if (elapsed > 15000) {
              addSession({
                project: 'Standalone',
                label: prev.label,
                start: new Date(prev.startedAt).toISOString(),
                end: new Date().toISOString(),
                durationMs: elapsed,
              })
            }
          } catch {}
        }
        return { ...prev, mode: 'ready', remainingMs: prev.totalMs, startedAt: null }
      })
      stopFocusPipeline('finished')
    }
  }, [state.mode, derivedRemainingMs, setState, stopFocusPipeline])

  const progress = useMemo(() => {
    if (state.mode === 'running' || state.mode === 'paused') {
      return 1 - derivedRemainingMs / state.totalMs
    }
    return 0
  }, [state.mode, derivedRemainingMs, state.totalMs])

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, mode: 'paused' }))
    pauseFocusPipeline()
  }, [setState, pauseFocusPipeline])

  const resume = useCallback(() => {
    setState((prev) => {
      const now = Date.now()
      const alreadyElapsed = prev.totalMs - prev.remainingMs
      const startAt = now - alreadyElapsed
      return { ...prev, mode: 'running', startedAt: startAt }
    })
    resumeFocusPipeline(state.label, derivedRemainingMs)
  }, [setState, state.label, derivedRemainingMs, resumeFocusPipeline])

  const reset = useCallback(() => {
    setState((prev) => {
      // Save partial session if >15s
      if ((prev.mode === 'running' || prev.mode === 'paused') && prev.startedAt) {
        try {
          const now = Date.now()
          const elapsed =
            prev.mode === 'running' ? now - prev.startedAt : prev.totalMs - prev.remainingMs
          if (elapsed > 15000) {
            addSession({
              project: 'Standalone',
              label: prev.label,
              start: new Date(prev.startedAt).toISOString(),
              end: new Date(now).toISOString(),
              durationMs: elapsed,
            })
          }
        } catch {}
      }
      return {
        ...prev,
        mode: 'ready',
        remainingMs: prev.totalMs,
        startedAt: null,
      }
    })
    stopFocusPipeline('cancelled')
  }, [setState, stopFocusPipeline])

  // Only render when running or paused
  if (state.mode !== 'running' && state.mode !== 'paused') {
    return null
  }

  return (
    <div className="timer-float-container">
      <div className="timer-float-chip">
        {/* Progress ring */}
        <ProgressRing progress={progress}>
          <span className="ring-minutes">{Math.max(0, Math.round(derivedRemainingMs / 60000))}</span>
        </ProgressRing>

        {/* Clock icon */}
        <Clock3 className="clock-icon" />

        {/* Time display */}
        <span className="time-display">{formatTime(derivedRemainingMs)}</span>

        {/* Label if exists */}
        {state.label && <span className="timer-label">{state.label}</span>}

        {/* Divider */}
        <div className="divider" />

        {/* Play/Pause */}
        {state.mode === 'running' && (
          <button onClick={pause} className="control-button" title="Pausar">
            <Pause />
          </button>
        )}
        {state.mode === 'paused' && (
          <button onClick={resume} className="control-button" title="Continuar">
            <Play />
          </button>
        )}

        {/* Reset */}
        <button onClick={reset} className="control-button reset" title="Resetar">
          <X />
        </button>
      </div>
    </div>
  )
}
