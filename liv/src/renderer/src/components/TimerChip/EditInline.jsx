import { useState, useRef, useEffect } from 'react'
import styles from './TimerChip.module.scss'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Inline edit component for timer duration and label
 * @param {number} minutes - Initial minutes value
 * @param {string} label - Initial label value
 * @param {Function} onConfirm - Callback when confirmed (minutes, label)
 * @param {Function} onCancel - Callback when cancelled
 */
export default function EditInline({ minutes, label, onConfirm, onCancel }) {
  const [m, setM] = useState(minutes)
  const [text, setText] = useState(label || '')
  const minRef = useRef(null)

  useEffect(() => {
    minRef.current?.focus()
  }, [])

  const commit = () => {
    const mm = clamp(parseInt(m, 10) || minutes || 25, 1, 12 * 60)
    onConfirm(mm, text.trim())
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className={styles.editInline}>
      <input
        ref={minRef}
        type="number"
        min={1}
        max={720}
        value={m}
        onChange={(e) => setM(e.target.value)}
        onKeyDown={handleKeyDown}
        className={styles.editInput}
        placeholder="min"
      />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className={styles.editInputLabel}
        placeholder="Lembrete..."
      />
      <button onClick={commit} className={styles.editOk}>
        OK
      </button>
    </div>
  )
}
