import styles from "./VideoRecordings.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
  RefreshIcon,
  DiscIcon,
  FolderIcon,
  DownloadIcon,
  GaugeIcon,
} from "renderer/icons"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tipcClient } from "renderer/lib/tipc-client"
import { usePilesContext } from "renderer/context/PilesContext"
import Navigation from "../Navigation"

const FILTERS = [
  { id: "all", label: "All tasks" },
  { id: "work", label: "Core tasks" },
  { id: "personal", label: "Personal tasks" },
  { id: "distraction", label: "Distractions" },
  { id: "idle", label: "Idle time" },
]
const TIMELINE_VERTICAL_OFFSET = 24

function floorToHour(ts) {
  const d = new Date(ts)
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

function ceilToHour(ts) {
  const d = new Date(ts)
  if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) {
    d.setHours(d.getHours() + 1)
  }
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

function formatDate(ts) {
  if (!ts) return "-"
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatClock(ts) {
  if (!ts) return "--:--"
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "-"
  const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min < 60) return `${min}m ${sec}s`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m`
}

function normalizeCategory(category) {
  const value = (category || "").toLowerCase()
  if (value.includes("work")) return "work"
  if (value.includes("personal")) return "personal"
  if (value.includes("distraction")) return "distraction"
  if (value.includes("idle")) return "idle"
  return "work"
}

function resolveSessionRun(session, runs) {
  if (!session?.startedAt || !runs?.length) return null
  const sessionEnd = session.endedAt || Date.now()
  const withSummary = runs.filter((run) => run?.summary)
  if (withSummary.length === 0) return null

  const overlapping = withSummary.find((run) => {
    const start = run.summary.windowStartTs || 0
    const end = run.summary.windowEndTs || 0
    return start <= sessionEnd && end >= session.startedAt
  })
  if (overlapping) return overlapping

  return withSummary
    .slice()
    .sort((a, b) => {
      const aDiff = Math.abs((a.summary.windowEndTs || 0) - sessionEnd)
      const bDiff = Math.abs((b.summary.windowEndTs || 0) - sessionEnd)
      return aDiff - bDiff
    })[0]
}

function buildMetrics(summary) {
  const activities = summary?.activities || []
  if (activities.length === 0) {
    return { focusPct: 0, distractionPct: 0 }
  }

  let total = 0
  let focus = 0
  let distraction = 0

  activities.forEach((activity) => {
    const duration = Math.max(0, (activity.endTs || 0) - (activity.startTs || 0))
    total += duration
    const category = normalizeCategory(activity.category)
    if (category === "work" || category === "personal") focus += duration
    if (category === "distraction") distraction += duration
  })

  if (total <= 0) return { focusPct: 0, distractionPct: 0 }
  return {
    focusPct: Math.round((focus / total) * 100),
    distractionPct: Math.round((distraction / total) * 100),
  }
}

function buildTicks(startTs, endTs, stepMinutes = 30) {
  const ticks = []
  const stepMs = stepMinutes * 60 * 1000
  for (let ts = startTs; ts <= endTs; ts += stepMs) {
    ticks.push({
      ts,
      major: new Date(ts).getMinutes() === 0,
    })
  }
  return ticks
}

function getSessionTitle(session, run) {
  const firstActivity = run?.summary?.activities?.[0]
  if (firstActivity?.title) return firstActivity.title
  return `Sessão ${session.id.slice(-6)}`
}

function getSessionCategory(run) {
  const firstActivity = run?.summary?.activities?.[0]
  return normalizeCategory(firstActivity?.category)
}

function VideoRecordings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTheme } = usePilesContext()
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [activeFilter, setActiveFilter] = useState("all")

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme],
  )

  const osStyles = useMemo(() => {
    const isMac = window.electron?.isMac
    return isMac ? layoutStyles.macOS : layoutStyles.windows
  }, [])

  const statusQuery = useQuery({
    queryKey: ["screen-session-recording-status"],
    queryFn: () => tipcClient.getScreenSessionRecordingStatus(),
    refetchInterval: 4000,
  })

  const sessionsQuery = useQuery({
    queryKey: ["screen-session-recordings"],
    queryFn: () => tipcClient.listScreenSessionRecordings({ limit: 100 }),
    staleTime: 30_000,
  })

  const runsQuery = useQuery({
    queryKey: ["auto-journal-runs"],
    queryFn: () => tipcClient.listAutoJournalRuns({ limit: 120 }),
    staleTime: 30_000,
  })

  const startMutation = useMutation({
    mutationFn: () =>
      tipcClient.startScreenSessionRecording({
        intervalSeconds: statusQuery.data?.intervalSeconds ?? 5,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screen-session-recording-status"] })
      queryClient.invalidateQueries({ queryKey: ["screen-session-recordings"] })
    },
    onError: (err) => console.error("[VideoRecordings] start failed:", err),
  })

  const stopMutation = useMutation({
    mutationFn: () => tipcClient.stopScreenSessionRecording(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screen-session-recording-status"] })
      queryClient.invalidateQueries({ queryKey: ["screen-session-recordings"] })
      queryClient.invalidateQueries({ queryKey: ["auto-journal-runs"] })
    },
    onError: (err) => console.error("[VideoRecordings] stop failed:", err),
  })

  const openFolderMutation = useMutation({
    mutationFn: () => tipcClient.openScreenSessionRecordingsDir(),
    onError: (err) => console.error("[VideoRecordings] open folder failed:", err),
  })

  const analyzeSessionMutation = useMutation({
    mutationFn: (session) =>
      tipcClient.runAutoJournalForRange({
        windowStartTs: session.startedAt,
        windowEndTs: session.endedAt || Date.now(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-journal-runs"] })
    },
    onError: (err) => console.error("[VideoRecordings] analyze failed:", err),
  })

  const running = statusQuery.data?.running ?? false
  const sessions = sessionsQuery.data || []
  const runs = runsQuery.data || []

  const sessionsWithRun = useMemo(
    () =>
      sessions
        .map((session) => ({
          session,
          run: resolveSessionRun(session, runs),
        }))
        .sort((a, b) => a.session.startedAt - b.session.startedAt),
    [sessions, runs],
  )

  const filteredSessions = useMemo(() => {
    if (activeFilter === "all") return sessionsWithRun
    return sessionsWithRun.filter(({ run }) => {
      const activities = run?.summary?.activities || []
      return activities.some((activity) => normalizeCategory(activity.category) === activeFilter)
    })
  }, [activeFilter, sessionsWithRun])

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedSessionId(null)
      return
    }
    setSelectedSessionId((prev) => {
      const stillExists = filteredSessions.some((item) => item.session.id === prev)
      return stillExists ? prev : filteredSessions[0].session.id
    })
  }, [filteredSessions])

  const selected = useMemo(() => {
    if (!selectedSessionId) return filteredSessions[0] || null
    return (
      filteredSessions.find(({ session }) => session.id === selectedSessionId) ||
      filteredSessions[0] ||
      null
    )
  }, [selectedSessionId, filteredSessions])

  const timelineBounds = useMemo(() => {
    const source = filteredSessions.length ? filteredSessions : sessionsWithRun
    if (!source.length) {
      const now = Date.now()
      return {
        startTs: floorToHour(now - 2 * 60 * 60 * 1000),
        endTs: ceilToHour(now),
      }
    }
    const minTs = source.reduce((min, item) => Math.min(min, item.session.startedAt || Date.now()), Infinity)
    const maxTs = source.reduce((max, item) => Math.max(max, item.session.endedAt || Date.now()), -Infinity)
    return {
      startTs: floorToHour(minTs),
      endTs: ceilToHour(maxTs + 15 * 60 * 1000),
    }
  }, [filteredSessions, sessionsWithRun])

  const rangeMs = Math.max(60 * 60 * 1000, timelineBounds.endTs - timelineBounds.startTs)
  const rangeMinutes = rangeMs / 60000
  const timelineHeight = Math.max(680, Math.round(rangeMinutes * 1.8))
  const timelineCanvasHeight = timelineHeight + TIMELINE_VERTICAL_OFFSET * 2

  const ticks = useMemo(
    () => buildTicks(timelineBounds.startTs, timelineBounds.endTs, 30),
    [timelineBounds.startTs, timelineBounds.endTs],
  )

  const positionedBlocks = useMemo(() => {
    return filteredSessions.map(({ session, run }) => {
      const start = session.startedAt || timelineBounds.startTs
      const end = session.endedAt || start + 30 * 1000
      const top = ((start - timelineBounds.startTs) / rangeMs) * timelineHeight
      const height = Math.max(64, ((end - start) / rangeMs) * timelineHeight)
      const category = getSessionCategory(run)

      return {
        session,
        run,
        top: TIMELINE_VERTICAL_OFFSET + top,
        height,
        category,
        title: getSessionTitle(session, run),
      }
    })
  }, [filteredSessions, timelineBounds.startTs, rangeMs, timelineHeight])

  const selectedSession = selected?.session || null
  const selectedRun = selected?.run || null
  const selectedSummary = selectedRun?.summary || null
  const videoUrl = selectedSession?.videoPath ? `file://${selectedSession.videoPath}` : null
  const metrics = buildMetrics(selectedSummary)

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>

      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>{t("autoJournal.videoPipelineTitle")}</h1>

            <div className={styles.headerActions}>
              <button
                className={styles.headerBtnIcon}
                onClick={() => {
                  sessionsQuery.refetch()
                  runsQuery.refetch()
                }}
                title="Atualizar"
              >
                <RefreshIcon />
              </button>

              <button
                className={styles.headerBtnIcon}
                onClick={() => openFolderMutation.mutate()}
                title="Abrir pasta das gravações"
              >
                <FolderIcon />
              </button>

              {running ? (
                <button
                  className={`${styles.headerBtnIcon} ${styles.stopBtn}`}
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                  title="Parar gravação"
                >
                  <DiscIcon />
                  <span>Parar</span>
                </button>
              ) : (
                <button
                  className={`${styles.headerBtnIcon} ${styles.startBtn}`}
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  title="Iniciar gravação"
                >
                  <DiscIcon />
                  <span>Gravar</span>
                </button>
              )}
            </div>

            <button className={styles.close} onClick={() => navigate(-1)} aria-label="Close">
              <CrossIcon />
            </button>
          </div>
        </div>

        <div className={styles.mainContent}>
          <div className={styles.leftPanel}>
            <div className={styles.filterBar}>
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  className={`${styles.filterChip} ${activeFilter === filter.id ? styles.filterChipActive : ""}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className={styles.timelineViewport}>
              <div className={styles.timelineCanvas} style={{ height: `${timelineCanvasHeight}px` }}>
                {ticks.map((tick) => {
                  const top = ((tick.ts - timelineBounds.startTs) / rangeMs) * timelineHeight
                  return (
                    <div
                      key={tick.ts}
                      className={`${styles.tickRow} ${tick.major ? styles.tickMajor : styles.tickMinor}`}
                      style={{ top: `${TIMELINE_VERTICAL_OFFSET + top}px` }}
                    >
                      <div className={styles.tickLabel}>{formatClock(tick.ts)}</div>
                      <div className={styles.tickLine} />
                    </div>
                  )
                })}

                <div
                  className={styles.axisLine}
                  style={{
                    top: `${TIMELINE_VERTICAL_OFFSET}px`,
                    bottom: `${TIMELINE_VERTICAL_OFFSET}px`,
                  }}
                />

                {positionedBlocks.map((block) => {
                  const isSelected = block.session.id === selectedSession?.id
                  const activities = block.run?.summary?.activities || []
                  return (
                    <button
                      key={block.session.id}
                      className={`${styles.timelineBlock} ${isSelected ? styles.timelineBlockActive : ""}`}
                      data-category={block.category}
                      style={{
                        top: `${block.top}px`,
                        height: `${block.height}px`,
                      }}
                      onClick={() => setSelectedSessionId(block.session.id)}
                    >
                      <div className={styles.blockTitle}>{block.title}</div>
                      <div className={styles.blockSub}>
                        {formatClock(block.session.startedAt)} to {formatClock(block.session.endedAt)}
                      </div>
                      <div className={styles.blockMeta}>
                        <span>{formatDuration(block.session.startedAt, block.session.endedAt)}</span>
                        <span>Frames: {block.session.capturedFrames || 0}</span>
                      </div>
                      {activities[0]?.summary && (
                        <div className={styles.blockSummary}>{activities[0].summary}</div>
                      )}
                    </button>
                  )
                })}

                {positionedBlocks.length === 0 && (
                  <div className={styles.empty}>Nenhuma sessão para este filtro.</div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.rightPanel}>
            {!selectedSession ? (
              <div className={styles.empty}>Selecione uma sessão para ver os detalhes.</div>
            ) : (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <h2 className={styles.detailTitle}>{getSessionTitle(selectedSession, selectedRun)}</h2>
                    <div className={styles.detailSub}>
                      {formatClock(selectedSession.startedAt)} to {formatClock(selectedSession.endedAt)}
                    </div>
                  </div>
                  <button
                    className={styles.analyzeBtn}
                    onClick={() => analyzeSessionMutation.mutate(selectedSession)}
                    disabled={analyzeSessionMutation.isPending}
                  >
                    <GaugeIcon />
                    <span>{analyzeSessionMutation.isPending ? "Analisando..." : "Analisar sessão"}</span>
                  </button>
                </div>

                {videoUrl ? (
                  <video className={styles.video} src={videoUrl} controls preload="metadata" />
                ) : (
                  <div className={styles.noVideo}>MP4 indisponível para esta sessão.</div>
                )}

                <div className={styles.summaryBlock}>
                  <div className={styles.summaryTitle}>Summary</div>
                  <div className={styles.summaryText}>
                    {selectedSummary?.summary ||
                      "Sem resumo ainda. Rode a análise da sessão para gerar cards e timeline."}
                  </div>
                </div>

                <div className={styles.metricsRow}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Focus meter</div>
                    <div className={styles.metricValue}>{metrics.focusPct}%</div>
                    <div className={styles.metricBar}>
                      <span style={{ width: `${metrics.focusPct}%` }} />
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Distractions</div>
                    <div className={styles.metricValue}>{metrics.distractionPct}%</div>
                    <div className={styles.metricBar}>
                      <span style={{ width: `${metrics.distractionPct}%` }} />
                    </div>
                  </div>
                </div>

                <div className={styles.detailFooter}>
                  <span>{formatDate(selectedSession.startedAt)}</span>
                  <span>Intervalo: {selectedSession.intervalSeconds}s</span>
                  <span>Frames: {selectedSession.capturedFrames || 0}</span>
                  {videoUrl && (
                    <a className={styles.download} href={videoUrl} download>
                      <DownloadIcon /> Baixar vídeo
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Navigation />
    </div>
  )
}

export default VideoRecordings
export const Component = VideoRecordings
