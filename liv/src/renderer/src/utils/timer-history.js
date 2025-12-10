/**
 * Timer History Utility
 * Persists timer sessions to localStorage for analytics
 */

const HISTORY_KEY = 'liv_timer_history_v1'

/**
 * Load all timer sessions from localStorage
 * @returns {Array} List of session objects
 */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/**
 * Save timer sessions to localStorage
 * @param {Array} list - List of session objects
 */
export function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('Failed to save timer history:', err)
  }
}

/**
 * Add a new session to history
 * @param {Object} session - Session data
 * @param {string} session.project - Project name
 * @param {string} session.label - Timer label/reminder
 * @param {string} session.start - ISO timestamp of start
 * @param {string} session.end - ISO timestamp of end
 * @param {number} session.durationMs - Duration in milliseconds
 * @returns {Object|null} The created session or null if too short
 */
export function addSession({ project, label, start, end, durationMs }) {
  if (!start || !end) return null

  const d = Math.max(0, durationMs ?? (new Date(end) - new Date(start)))

  // Ignore sessions shorter than 15 seconds
  if (d < 15 * 1000) return null

  const entry = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    project: project || 'Standalone',
    label: label || '',
    start,
    end,
    durationMs: d,
  }

  const list = loadHistory()
  list.push(entry)
  saveHistory(list)

  return entry
}

/**
 * Clear all timer history
 */
export function clearHistory() {
  saveHistory([])
}

/**
 * Group sessions by project
 * @param {Array} list - List of sessions
 * @returns {Object} Sessions grouped by project name
 */
export function groupByProject(list) {
  return list.reduce((acc, session) => {
    const key = session.project || 'Standalone'
    if (!acc[key]) acc[key] = []
    acc[key].push(session)
    return acc
  }, {})
}

/**
 * Group sessions by day
 * @param {Array} list - List of sessions
 * @returns {Object} Sessions grouped by date (YYYY-MM-DD)
 */
export function groupByDay(list) {
  return list.reduce((acc, session) => {
    const day = session.start.split('T')[0]
    if (!acc[day]) acc[day] = []
    acc[day].push(session)
    return acc
  }, {})
}

/**
 * Sum total duration of sessions
 * @param {Array} list - List of sessions
 * @returns {number} Total duration in milliseconds
 */
export function sumDuration(list) {
  return list.reduce((sum, s) => sum + (s.durationMs || 0), 0)
}

/**
 * Convert milliseconds to human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted string (e.g., "1h 25m")
 */
export function humanize(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

/**
 * Filter sessions by a specific day
 * @param {Array} list - List of sessions
 * @param {Date} date - Target date
 * @returns {Array} Filtered sessions
 */
export function filterByDay(list, date) {
  const targetDay = date.toISOString().split('T')[0]
  return list.filter((s) => s.start.startsWith(targetDay))
}

/**
 * Filter sessions by week (starting from date)
 * @param {Array} list - List of sessions
 * @param {Date} date - Any date within the target week
 * @returns {Array} Filtered sessions
 */
export function filterByWeek(list, date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday as first day
  const weekStart = new Date(d.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  return list.filter((s) => {
    const sessionDate = new Date(s.start)
    return sessionDate >= weekStart && sessionDate < weekEnd
  })
}

/**
 * Get sessions from the last N days
 * @param {Array} list - List of sessions
 * @param {number} days - Number of days to look back
 * @returns {Array} Filtered sessions
 */
export function filterLastDays(list, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return list.filter((s) => new Date(s.start).getTime() >= cutoff)
}
