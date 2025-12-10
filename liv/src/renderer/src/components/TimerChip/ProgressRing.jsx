import styles from './TimerChip.module.scss'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Circular progress ring SVG component
 * @param {number} progress - Progress value from 0 to 1
 * @param {React.ReactNode} children - Content to display in center
 */
export default function ProgressRing({ progress = 0, children }) {
  const size = 28
  const stroke = 3
  const radius = (size - stroke) / 2
  const circum = 2 * Math.PI * radius
  const offset = circum * (1 - clamp(progress, 0, 1))

  return (
    <div className={styles.progressRing}>
      <svg
        className={styles.ringSvg}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--base)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circum}
          strokeDashoffset={offset}
          fill="none"
        />
      </svg>
      <div className={styles.ringContent}>
        {children}
      </div>
    </div>
  )
}
