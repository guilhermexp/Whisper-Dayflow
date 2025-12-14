import { useEffect, useMemo, useRef } from 'react'
import { Play, Pause, Clock3, Plus, X } from 'lucide-react'
import { useLocalStorage } from 'renderer/hooks/useLocalStorage'
import { useToastsContext } from 'renderer/context/ToastsContext'
import { addSession } from 'renderer/utils/timer-history'
import { tipcClient } from 'renderer/lib/tipc-client'
import ProgressRing from './ProgressRing'
import EditInline from './EditInline'
import styles from './TimerChip.module.scss'

const STORAGE_KEY = 'liv_timer_state_v1'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

const initialState = {
  mode: 'idle', // idle | ready | running | paused | edit
  label: '',
  totalMs: 25 * 60 * 1000, // 25 minutes default
  remainingMs: 25 * 60 * 1000,
  startedAt: null,
}

/**
 * Format milliseconds to display string
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time (e.g., "5m 30s" or "1:25:30")
 */
function formatTime(ms) {
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

/**
 * TimerChip - Pomodoro-style timer component
 * Displays in the header with glass morphism design
 */
export default function TimerChip() {
  const [state, setState] = useLocalStorage(STORAGE_KEY, initialState)
  const { addNotification } = useToastsContext()
  const rafRef = useRef(null)

  // Timer loop using requestAnimationFrame
  useEffect(() => {
    if (state.mode !== 'running') return

    const tick = () => {
      setState((prev) => {
        if (prev.mode !== 'running') return prev

        const now = Date.now()
        const elapsed = now - (prev.startedAt || now)
        const remainingMs = clamp(prev.totalMs - elapsed, 0, prev.totalMs)

        // Timer finished!
        if (remainingMs <= 0) {
          // Play notification sound
          try {
            const audio = new Audio('/sounds/notification.wav')
            audio.play().catch(() => {
              // Fallback: system notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Timer Finalizado', {
                  body: prev.label || 'Seu timer terminou!',
                })
              }
            })
          } catch {
            // Silent fail
          }

          // Show toast notification
          addNotification({
            id: `timer-done-${Date.now()}`,
            type: 'success',
            message: prev.label || 'Timer finalizado!',
            dismissTime: 5000,
          })

          // Save session to history
          try {
            addSession({
              project: 'Standalone',
              label: prev.label,
              start: new Date(prev.startedAt || now).toISOString(),
              end: new Date(now).toISOString(),
              durationMs: prev.totalMs,
            })
          } catch {
            // Silent fail
          }

          return {
            ...prev,
            mode: 'ready',
            remainingMs: prev.totalMs,
            startedAt: null,
          }
        }

        return { ...prev, remainingMs }
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [state.mode, setState, addNotification])

  // Show/hide floating window based on timer state
  useEffect(() => {
    if (state.mode === 'running') {
      // Show floating window when timer starts
      tipcClient.showTimerWindow().catch(() => {})
    } else if (state.mode !== 'paused') {
      // Hide floating window when timer stops (but not when paused)
      tipcClient.hideTimerWindow().catch(() => {})
    }
  }, [state.mode])

  // Calculate progress (0 to 1)
  const progress = useMemo(() => {
    if (state.mode === 'running' || state.mode === 'paused') {
      return 1 - state.remainingMs / state.totalMs
    }
    return 0
  }, [state.mode, state.remainingMs, state.totalMs])

  const minutesValue = Math.max(1, Math.round(state.totalMs / 60000))

  // Actions
  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setState((prev) => ({
      ...prev,
      mode: 'running',
      startedAt: Date.now(),
      remainingMs: prev.totalMs,
    }))
  }

  const pause = () => setState((prev) => ({ ...prev, mode: 'paused' }))

  const resume = () => {
    setState((prev) => {
      const now = Date.now()
      const alreadyElapsed = prev.totalMs - prev.remainingMs
      const startAt = now - alreadyElapsed
      return { ...prev, mode: 'running', startedAt: startAt }
    })
  }

  const reset = () => {
    setState((prev) => {
      // Save partial session if >15s elapsed
      if ((prev.mode === 'running' || prev.mode === 'paused') && prev.startedAt) {
        try {
          const now = Date.now()
          const elapsed =
            prev.mode === 'running'
              ? now - prev.startedAt
              : prev.totalMs - prev.remainingMs
          if (elapsed > 15000) {
            addSession({
              project: 'Standalone',
              label: prev.label,
              start: new Date(prev.startedAt).toISOString(),
              end: new Date(now).toISOString(),
              durationMs: elapsed,
            })
          }
        } catch {
          // Silent fail
        }
      }
      return {
        ...prev,
        mode: 'ready',
        remainingMs: prev.totalMs,
        startedAt: null,
      }
    })
  }

  const clear = () => {
    setState(initialState)
  }

  const setDuration = (m, l) => {
    const mm = clamp(Number.isFinite(m) ? Math.round(m) : 25, 1, 12 * 60)
    const ms = mm * 60 * 1000
    setState((prev) => ({
      ...prev,
      mode: 'ready',
      label: l,
      totalMs: ms,
      remainingMs: ms,
    }))
  }

  return (
    <div className={styles.container}>
      {/* Left button: + (create) or X (cancel/clear) */}
      {state.mode === 'idle' ? (
        <button
          onClick={() => setState((s) => ({ ...s, mode: 'ready' }))}
          className={styles.iconButton}
          title="Criar timer"
        >
          <Plus />
        </button>
      ) : (
        <button
          onClick={() =>
            state.mode === 'running' || state.mode === 'paused' ? reset() : clear()
          }
          className={styles.iconButton}
          title={
            state.mode === 'running' || state.mode === 'paused'
              ? 'Resetar timer'
              : 'Limpar timer'
          }
        >
          <X />
        </button>
      )}

      {/* Progress ring badge (when running/paused) */}
      {(state.mode === 'running' || state.mode === 'paused') && (
        <div className={styles.progressRingWrapper}>
          <ProgressRing progress={progress}>
            <span>{Math.max(0, Math.round(state.remainingMs / 60000))}</span>
          </ProgressRing>
          <button onClick={reset} className={styles.ringReset} title="Resetar timer">
            <X />
          </button>
        </div>
      )}

      {/* Main pill */}
      <div className={styles.chip}>
        <Clock3 className={styles.clockIcon} />

        {state.mode === 'idle' && <span className={styles.idleLabel}>Timer</span>}

        {state.mode !== 'idle' && (
          <>
            {/* Ready or paused: click to edit */}
            {(state.mode === 'ready' || state.mode === 'paused') && (
              <button
                onClick={() => setState((s) => ({ ...s, mode: 'edit' }))}
                className={styles.durationButton}
                title="Editar duração"
              >
                {Math.round(state.totalMs / 60000)} min
              </button>
            )}

            {/* Running: show remaining time */}
            {state.mode === 'running' && (
              <span className={styles.timeDisplay}>{formatTime(state.remainingMs)}</span>
            )}

            {/* Edit mode: inline inputs */}
            {state.mode === 'edit' && (
              <EditInline
                minutes={minutesValue}
                label={state.label}
                onConfirm={setDuration}
                onCancel={() => setState((s) => ({ ...s, mode: 'ready' }))}
              />
            )}

            {/* Divider */}
            {state.mode !== 'edit' && <div className={styles.divider} />}

            {/* Play/Pause buttons */}
            {state.mode === 'ready' && (
              <button onClick={start} className={styles.playButton} title="Iniciar">
                <Play />
              </button>
            )}
            {state.mode === 'running' && (
              <button onClick={pause} className={styles.playButton} title="Pausar">
                <Pause />
              </button>
            )}
            {state.mode === 'paused' && (
              <button onClick={resume} className={styles.playButton} title="Continuar">
                <Play />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
