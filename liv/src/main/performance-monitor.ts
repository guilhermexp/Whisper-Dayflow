/**
 * Performance monitoring module for Liv
 *
 * Provides high-resolution timing utilities to measure application startup
 * and identify performance bottlenecks. Tracks startup phases and logs
 * timing information for analysis.
 *
 * Usage:
 * - markPhase('init-started') at the start of each phase
 * - markPhase('init-complete') when the phase completes
 * - getStartupReport() to get a summary of all timings
 */

import { logger } from "./logger"

interface PerformanceMark {
  name: string
  timestamp: number
}

interface PerformanceMeasure {
  name: string
  duration: number
  startTime: number
  endTime: number
}

// Store performance marks
const marks: Map<string, PerformanceMark> = new Map()

// Store completed measurements
const measures: PerformanceMeasure[] = []

// App start time (as close to process start as possible)
const appStartTime = performance.now()

/**
 * Mark a specific point in the startup sequence
 * @param name - Descriptive name for this phase (e.g., 'app-ready', 'window-shown')
 */
export const markPhase = (name: string): void => {
  const timestamp = performance.now()
  marks.set(name, { name, timestamp })

  const relativeTime = (timestamp - appStartTime).toFixed(2)
  logger.info(`[Perf] ${name}: ${relativeTime}ms`)
}

/**
 * Measure the duration between two marks
 * @param name - Name for this measurement
 * @param startMark - Name of the start mark
 * @param endMark - Name of the end mark (defaults to 'now')
 * @returns Duration in milliseconds, or null if marks not found
 */
export const measure = (
  name: string,
  startMark: string,
  endMark?: string,
): number | null => {
  const start = marks.get(startMark)
  if (!start) {
    logger.warn(`[Perf] Cannot measure: start mark '${startMark}' not found`)
    return null
  }

  const endTime = endMark ? marks.get(endMark)?.timestamp : performance.now()
  if (!endTime) {
    logger.warn(`[Perf] Cannot measure: end mark '${endMark}' not found`)
    return null
  }

  const duration = endTime - start.timestamp

  measures.push({
    name,
    duration,
    startTime: start.timestamp,
    endTime,
  })

  logger.info(`[Perf] ${name}: ${duration.toFixed(2)}ms`)
  return duration
}

/**
 * Get the time elapsed since app start
 * @returns Milliseconds since app started
 */
export const getElapsedTime = (): number => {
  return performance.now() - appStartTime
}

/**
 * Get the time elapsed since a specific mark
 * @param markName - Name of the mark to measure from
 * @returns Milliseconds since the mark, or null if mark not found
 */
export const getTimeSinceMark = (markName: string): number | null => {
  const mark = marks.get(markName)
  if (!mark) {
    return null
  }
  return performance.now() - mark.timestamp
}

/**
 * Get a complete startup performance report
 * @returns Object containing all marks and measurements
 */
export const getStartupReport = (): {
  totalTime: number
  marks: PerformanceMark[]
  measures: PerformanceMeasure[]
} => {
  return {
    totalTime: getElapsedTime(),
    marks: Array.from(marks.values()),
    measures: [...measures],
  }
}

/**
 * Log a summary of startup performance to the console and log file
 */
export const logStartupSummary = (): void => {
  const report = getStartupReport()

  logger.info("=================================")
  logger.info("STARTUP PERFORMANCE SUMMARY")
  logger.info(`Total startup time: ${report.totalTime.toFixed(2)}ms`)
  logger.info("=================================")

  if (report.marks.length > 0) {
    logger.info("Performance marks:")
    report.marks.forEach((mark) => {
      const relativeTime = (mark.timestamp - appStartTime).toFixed(2)
      logger.info(`  ${mark.name}: ${relativeTime}ms`)
    })
  }

  if (report.measures.length > 0) {
    logger.info("Measurements:")
    report.measures.forEach((m) => {
      logger.info(`  ${m.name}: ${m.duration.toFixed(2)}ms`)
    })
  }

  logger.info("=================================")
}

/**
 * Clear all performance marks and measurements
 * Useful for testing or resetting between measurements
 */
export const clearPerformanceData = (): void => {
  marks.clear()
  measures.length = 0
  logger.debug("[Perf] Performance data cleared")
}

/**
 * Helper to create a scoped performance tracker
 * Automatically marks start and measures duration when disposed
 *
 * @example
 * const tracker = createPhaseTracker('heavy-operation')
 * // ... do work ...
 * tracker.end() // logs duration
 */
export const createPhaseTracker = (
  phaseName: string,
): { end: () => number } => {
  const startMarkName = `${phaseName}-start`
  markPhase(startMarkName)

  return {
    end: () => {
      const endMarkName = `${phaseName}-end`
      markPhase(endMarkName)
      const duration = measure(phaseName, startMarkName, endMarkName)
      return duration ?? 0
    },
  }
}

// Log the performance monitor initialization
logger.debug("[Perf] Performance monitor initialized")

// Mark app start
markPhase("app-start")
