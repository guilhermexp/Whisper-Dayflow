import styles from "./VideoRecordings.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
  RefreshIcon,
  DiscIcon,
  FolderIcon,
  ClockIcon,
  DownloadIcon,
  GaugeIcon,
} from "renderer/icons"
import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tipcClient } from "renderer/lib/tipc-client"
import { usePilesContext } from "renderer/context/PilesContext"
import Navigation from "../Navigation"

function formatDate(ts) {
  if (!ts) return "-"
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
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
  return `${min}m ${sec}s`
}

function VideoRecordings() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTheme } = usePilesContext()

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
  })

  const stopMutation = useMutation({
    mutationFn: () => tipcClient.stopScreenSessionRecording(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screen-session-recording-status"] })
      queryClient.invalidateQueries({ queryKey: ["screen-session-recordings"] })
      queryClient.invalidateQueries({ queryKey: ["auto-journal-runs"] })
    },
  })

  const openFolderMutation = useMutation({
    mutationFn: () => tipcClient.openScreenSessionRecordingsDir(),
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
  })

  const running = statusQuery.data?.running ?? false
  const sessions = sessionsQuery.data || []

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>

      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>Gravações de Vídeo</h1>

            <div className={styles.headerActions}>
              <button
                className={styles.headerBtnIcon}
                onClick={() => sessionsQuery.refetch()}
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

            <button
              className={styles.close}
              onClick={() => navigate(-1)}
              aria-label="Close"
            >
              <CrossIcon />
            </button>
          </div>
        </div>

        <div className={styles.mainContent}>
          <div className={styles.statusStrip}>
            <div>
              <strong>Status:</strong> {running ? "gravando" : "inativo"}
            </div>
            <div>
              <strong>Frames capturados:</strong> {statusQuery.data?.capturedFrames ?? 0}
            </div>
            <div>
              <strong>Próxima captura:</strong> {formatDate(statusQuery.data?.nextCaptureAt)}
            </div>
          </div>

          <div className={styles.list}>
            {sessions.length === 0 ? (
              <div className={styles.empty}>Nenhuma sessão de vídeo encontrada ainda.</div>
            ) : (
              sessions.map((session) => {
                const videoUrl = session.videoPath
                  ? `file://${session.videoPath}`
                  : null
                return (
                  <article key={session.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitle}>Sessão {session.id.slice(-8)}</div>
                      <span className={styles.badge}>{session.status}</span>
                    </div>

                    <div className={styles.meta}>
                      <span><ClockIcon /> Início: {formatDate(session.startedAt)}</span>
                      <span><ClockIcon /> Fim: {formatDate(session.endedAt)}</span>
                      <span>Duração: {formatDuration(session.startedAt, session.endedAt)}</span>
                      <span>Frames: {session.capturedFrames}</span>
                      <span>Intervalo: {session.intervalSeconds}s</span>
                    </div>

                    <div className={styles.paths}>
                      <div><strong>Pasta de frames:</strong> {session.framesDir}</div>
                      <div><strong>Amostras:</strong> {session.samplesPath}</div>
                      <div><strong>Vídeo:</strong> {session.videoPath || "(ainda não gerado)"}</div>
                    </div>

                    <div className={styles.cardActions}>
                      <button
                        className={styles.analyzeBtn}
                        onClick={() => analyzeSessionMutation.mutate(session)}
                        disabled={analyzeSessionMutation.isPending}
                      >
                        <GaugeIcon />
                        <span>Analisar sessão</span>
                      </button>
                    </div>

                    {videoUrl ? (
                      <video className={styles.video} src={videoUrl} controls preload="metadata" />
                    ) : (
                      <div className={styles.noVideo}>
                        MP4 indisponível para esta sessão. Verifique logs do ffmpeg.
                      </div>
                    )}

                    {session.videoPath && (
                      <a className={styles.download} href={videoUrl} download>
                        <DownloadIcon /> Baixar vídeo
                      </a>
                    )}
                  </article>
                )
              })
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
