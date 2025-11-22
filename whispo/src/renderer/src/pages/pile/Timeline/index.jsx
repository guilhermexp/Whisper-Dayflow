import styles from "./Timeline.module.scss"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { tipcClient } from "renderer/lib/tipc-client"
import { ChevronLeftIcon, ChevronRightIcon, EditIcon, CrossIcon } from "renderer/icons"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"

function Timeline() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [selectedActivityId, setSelectedActivityId] = useState(null)

  // Query runs
  const runsQuery = useQuery({
    queryKey: ["auto-journal-runs"],
    queryFn: async () => tipcClient.listAutoJournalRuns({ limit: 100 }),
  })

  const runs = runsQuery.data || []

  // Filter runs for selected date and flatten activities
  const dayActivities = useMemo(() => {
    const startOfDay = selectedDate.startOf("day").valueOf()
    const endOfDay = selectedDate.endOf("day").valueOf()

    const activities = []
    runs.forEach((run) => {
      if (run.status === "success" && run.summary?.activities) {
        run.summary.activities.forEach((act, idx) => {
          // Check if activity falls within selected day
          if (act.startTs >= startOfDay && act.startTs <= endOfDay) {
            activities.push({
              ...act,
              id: `${run.id}-${idx}`,
              runId: run.id,
            })
          }
        })
      }
    })

    // Sort by start time
    return activities.sort((a, b) => a.startTs - b.startTs)
  }, [runs, selectedDate])

  // Selected activity
  const selectedActivity = useMemo(() => {
    if (!selectedActivityId) return dayActivities[0] || null
    return dayActivities.find((a) => a.id === selectedActivityId) || null
  }, [selectedActivityId, dayActivities])

  // Navigation
  const goToPreviousDay = () => {
    setSelectedDate(selectedDate.subtract(1, "day"))
    setSelectedActivityId(null)
  }

  const goToNextDay = () => {
    setSelectedDate(selectedDate.add(1, "day"))
    setSelectedActivityId(null)
  }

  // Generate timeline hours (4 AM to 10 PM)
  const timelineHours = useMemo(() => {
    const hours = []
    for (let h = 4; h <= 22; h++) {
      hours.push(h)
    }
    return hours
  }, [])

  // Calculate activity position on timeline
  const getActivityStyle = (activity) => {
    const startHour = dayjs(activity.startTs).hour()
    const startMinute = dayjs(activity.startTs).minute()
    const endHour = dayjs(activity.endTs).hour()
    const endMinute = dayjs(activity.endTs).minute()

    const startOffset = (startHour - 4) * 60 + startMinute
    const endOffset = (endHour - 4) * 60 + endMinute
    const duration = endOffset - startOffset

    const totalMinutes = 18 * 60 // 4 AM to 10 PM
    const top = (startOffset / totalMinutes) * 100
    const height = Math.max((duration / totalMinutes) * 100, 1)

    return {
      top: `${top}%`,
      height: `${height}%`,
    }
  }

  // Category colors
  const getCategoryColor = (category) => {
    switch (category) {
      case "Work":
        return "#3b82f6"
      case "Personal":
        return "#0ea5e9"
      case "Distraction":
        return "#f97316"
      case "Idle":
        return "#94a3b8"
      default:
        return "#3b82f6"
    }
  }

  return (
    <div className={styles.container}>
      {/* Left Panel - Timeline */}
      <div className={styles.timelinePanel}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.dateNav}>
            <h1 className={styles.dateTitle}>
              {selectedDate.format("ddd, MMM D")}
            </h1>
            <div className={styles.navButtons}>
              <button onClick={goToPreviousDay} className={styles.navBtn}>
                <ChevronLeftIcon />
              </button>
              <button onClick={goToNextDay} className={styles.navBtn}>
                <ChevronRightIcon />
              </button>
            </div>
            <button
              onClick={() => navigate(-1)}
              className={styles.backBtn}
              title="Voltar"
            >
              <CrossIcon />
            </button>
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: "#3b82f6" }}
              />
              <span>{t("timeline.work")}</span>
            </div>
            <div className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: "#0ea5e9" }}
              />
              <span>{t("timeline.personal")}</span>
            </div>
            <div className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: "#f97316" }}
              />
              <span>{t("timeline.distraction")}</span>
            </div>
            <div className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: "#94a3b8" }}
              />
              <span>{t("timeline.idle")}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className={styles.timeline}>
          {/* Hour markers */}
          <div className={styles.hourMarkers}>
            {timelineHours.map((hour) => (
              <div key={hour} className={styles.hourMarker}>
                <span className={styles.hourLabel}>
                  {hour === 0
                    ? "12:00 AM"
                    : hour < 12
                      ? `${hour}:00 AM`
                      : hour === 12
                        ? "12:00 PM"
                        : `${hour - 12}:00 PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Activity bars */}
          <div className={styles.activityBars}>
            {dayActivities.map((activity) => (
              <div
                key={activity.id}
                className={`${styles.activityBar} ${selectedActivity?.id === activity.id ? styles.selected : ""}`}
                style={{
                  ...getActivityStyle(activity),
                  background: getCategoryColor(activity.category),
                }}
                onClick={() => setSelectedActivityId(activity.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Activity Details */}
      <div className={styles.detailPanel}>
        {selectedActivity ? (
          <div className={styles.activityCard}>
            {/* Card Header */}
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{selectedActivity.title}</h2>
              <div className={styles.cardMeta}>
                <span className={styles.timeRange}>
                  {dayjs(selectedActivity.startTs).format("h:mm A")} -{" "}
                  {dayjs(selectedActivity.endTs).format("h:mm A")}
                </span>
                {selectedActivity.category && (
                  <span
                    className={styles.categoryBadge}
                    style={{
                      background: `${getCategoryColor(selectedActivity.category)}20`,
                      color: getCategoryColor(selectedActivity.category),
                    }}
                  >
                    {selectedActivity.category}
                  </span>
                )}
                <button className={styles.editBtn}>
                  <EditIcon />
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className={styles.cardSection}>
              <h3 className={styles.sectionLabel}>{t("timeline.summary")}</h3>
              <p className={styles.sectionText}>{selectedActivity.summary}</p>
            </div>

            {/* Detailed Summary */}
            {selectedActivity.detailedSummary &&
              selectedActivity.detailedSummary.length > 0 && (
                <div className={styles.cardSection}>
                  <h3 className={styles.sectionLabel}>{t("timeline.detailedSummary")}</h3>
                  <div className={styles.detailedList}>
                    {selectedActivity.detailedSummary.map((detail, idx) => (
                      <div key={idx} className={styles.detailedItem}>
                        <span className={styles.detailedTime}>
                          {dayjs(detail.startTs).format("HH:mm")} -{" "}
                          {dayjs(detail.endTs).format("HH:mm")}
                        </span>
                        <span className={styles.detailedDesc}>
                          {detail.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Rate */}
            <div className={styles.rateSection}>
              <span>{t("timeline.rateThis")}</span>
              <div className={styles.rateButtons}>
                <button className={styles.rateBtn}>👍</button>
                <button className={styles.rateBtn}>👎</button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>{t("timeline.noActivities")}</p>
            <p>{t("timeline.generateToSee")}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const Component = Timeline
export default Timeline
