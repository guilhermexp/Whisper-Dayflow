import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CrossIcon, RefreshIcon } from "renderer/icons"
import { usePilesContext } from "renderer/context/PilesContext"
import { tipcClient } from "renderer/lib/tipc-client"
import { useConfigQuery, useSaveConfigMutation } from "renderer/lib/query-client"
import layoutStyles from "../PileLayout.module.scss"
import Navigation from "../Navigation"
import styles from "./Profile.module.scss"

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]

const KIND_META = {
  strength: { label: "Forca", color: "#34d399" },
  risk: { label: "Risco", color: "#fb7185" },
  opportunity: { label: "Oportunidade", color: "#f59e0b" },
  meeting: { label: "Reunioes", color: "#60a5fa" },
  business: { label: "Negocio", color: "#a78bfa" },
  wellbeing: { label: "Energia", color: "#22d3ee" },
}

const IMPACT_LABEL = {
  low: "Impacto baixo",
  medium: "Impacto medio",
  high: "Impacto alto",
}

const toTimestamp = (card, fallbackTs) => {
  if (typeof card?.observedAt === "number" && Number.isFinite(card.observedAt)) {
    return card.observedAt
  }
  const fromUpdated = Date.parse(card?.updatedAt || "")
  if (Number.isFinite(fromUpdated)) return fromUpdated
  const fromCreated = Date.parse(card?.createdAt || "")
  if (Number.isFinite(fromCreated)) return fromCreated
  return fallbackTs
}

const startOfWeekMonday = (dateInput) => {
  const date = new Date(dateInput)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(date)
  start.setDate(date.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

const toDateKey = (dateInput) => {
  const date = new Date(dateInput)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const buildWeekLabel = (weekStartKey) => {
  const start = new Date(`${weekStartKey}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${start.toLocaleDateString("pt-BR")} - ${end.toLocaleDateString("pt-BR")}`
}

function WeekSelector({ weeks, selectedWeekKey, onSelectWeek }) {
  return (
    <div className={styles.weekSelector}>
      {weeks.map((week) => (
        <button
          key={week.key}
          className={`${styles.weekBtn} ${selectedWeekKey === week.key ? styles.weekBtnActive : ""}`}
          onClick={() => onSelectWeek(week.key)}
        >
          {week.label}
        </button>
      ))}
    </div>
  )
}

function DaySelector({ days, selectedDayKey, onSelectDay }) {
  return (
    <div className={styles.daySelector}>
      <button
        className={`${styles.dayBtn} ${selectedDayKey === "all" ? styles.dayBtnActive : ""}`}
        onClick={() => onSelectDay("all")}
      >
        Semana
      </button>
      {days.map((day) => (
        <button
          key={day.key}
          className={`${styles.dayBtn} ${selectedDayKey === day.key ? styles.dayBtnActive : ""}`}
          onClick={() => onSelectDay(day.key)}
        >
          {day.label} ({day.count})
        </button>
      ))}
    </div>
  )
}

function ProfileCard({ card }) {
  const kindMeta = KIND_META[card.kind] || { label: "Insight", color: "#94a3b8" }
  const confidence = Math.round((card.confidence || 0) * 100)

  return (
    <article className={styles.card}>
      <div className={styles.cardBadges}>
        <span className={styles.kindBadge} style={{ "--badge-color": kindMeta.color }}>
          {kindMeta.label}
        </span>
        <span className={styles.impactBadge}>{IMPACT_LABEL[card.impact] || "Impacto"}</span>
      </div>

      <h3 className={styles.cardTitle}>{card.title}</h3>
      <p className={styles.cardSummary}>{card.summary}</p>

      <ul className={styles.actionList}>
        {(card.actions || []).map((action, index) => (
          <li key={`${card.id}-${index}`}>{action}</li>
        ))}
      </ul>

      <footer className={styles.cardFooter}>
        <span>{confidence}% confianca</span>
        <span>{new Date(card.observedAtTs).toLocaleDateString("pt-BR")}</span>
      </footer>
    </article>
  )
}

function WidgetToggleBar({ availableWidgets, enabledWidgets, onToggle }) {
  return (
    <div className={styles.widgetBar}>
      {availableWidgets.map((widget) => {
        const active = enabledWidgets.includes(widget.id)
        return (
          <button
            key={widget.id}
            className={`${styles.widgetChip} ${active ? styles.widgetChipActive : ""}`}
            title={widget.description}
            onClick={() => onToggle(widget.id)}
          >
            {widget.title}
          </button>
        )
      })}
    </div>
  )
}

function InsightSection({ title, cards }) {
  if (!cards.length) return null
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2>{title}</h2>
        <span>{cards.length}</span>
      </header>
      <div className={styles.cardGrid}>
        {cards.map((card) => (
          <ProfileCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}

function Profile() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTheme } = usePilesContext()
  const [selectedWeekKey, setSelectedWeekKey] = useState("")
  const [selectedDayKey, setSelectedDayKey] = useState("all")

  const themeStyles = useMemo(() => (currentTheme ? `${currentTheme}Theme` : ""), [currentTheme])
  const isMac = window.electron?.isMac ?? false
  const osStyles = isMac ? layoutStyles.macOS : layoutStyles.windows

  const boardQuery = useQuery({
    queryKey: ["autonomous-profile-board"],
    queryFn: () => tipcClient.getAutonomousProfileBoard(),
    refetchInterval: 30000,
  })
  const configQuery = useConfigQuery()
  const saveConfigMutation = useSaveConfigMutation()

  const refreshMutation = useMutation({
    mutationFn: () => tipcClient.refreshAutonomousProfile(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autonomous-profile-board"] })
    },
  })

  const effectiveEnabledWidgets = useMemo(
    () =>
      configQuery.data?.profileWidgetsEnabled ||
      boardQuery.data?.enabledWidgets ||
      [],
    [configQuery.data, boardQuery.data],
  )

  const timeAwareBoard = useMemo(() => {
    const board = boardQuery.data
    if (!board?.cards) return null

    const fallbackTs = board.generatedAt || Date.now()
    const cards = board.cards.map((card) => {
      const observedAtTs = toTimestamp(card, fallbackTs)
      const observedDate = new Date(observedAtTs)
      const weekStart = startOfWeekMonday(observedDate)
      return {
        ...card,
        observedAtTs,
        weekKey: toDateKey(weekStart),
        dayKey: toDateKey(observedDate),
      }
    })

    const weekKeys = Array.from(new Set(cards.map((card) => card.weekKey))).sort((a, b) =>
      a > b ? -1 : 1,
    )
    const weeks = weekKeys.map((key) => ({ key, label: buildWeekLabel(key) }))

    return {
      ...board,
      cards,
      weeks,
    }
  }, [boardQuery.data])

  useEffect(() => {
    if (!timeAwareBoard?.weeks?.length) {
      setSelectedWeekKey("")
      setSelectedDayKey("all")
      return
    }

    if (!selectedWeekKey || !timeAwareBoard.weeks.some((week) => week.key === selectedWeekKey)) {
      setSelectedWeekKey(timeAwareBoard.weeks[0].key)
      setSelectedDayKey("all")
    }
  }, [timeAwareBoard, selectedWeekKey])

  const daysOfSelectedWeek = useMemo(() => {
    if (!selectedWeekKey) return []
    const weekStart = new Date(`${selectedWeekKey}T00:00:00`)
    const cards = timeAwareBoard?.cards || []
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + idx)
      const key = toDateKey(date)
      const count = cards.filter((card) => card.weekKey === selectedWeekKey && card.dayKey === key).length
      return { key, label: DAY_LABELS[idx], count }
    })
  }, [selectedWeekKey, timeAwareBoard])

  const filteredCards = useMemo(() => {
    const cards = timeAwareBoard?.cards || []
    if (!selectedWeekKey) return cards
    return cards.filter((card) => {
      const inWeek = card.weekKey === selectedWeekKey
      const inDay = selectedDayKey === "all" || card.dayKey === selectedDayKey
      return inWeek && inDay
    })
  }, [timeAwareBoard, selectedWeekKey, selectedDayKey])

  const sections = useMemo(() => {
    const byKind = (kind) => filteredCards.filter((card) => card.kind === kind)
    return [
      { key: "strength", title: "Pontos Fortes", cards: byKind("strength") },
      { key: "risk", title: "Riscos e Alertas", cards: byKind("risk") },
      { key: "opportunity", title: "Oportunidades de Automacao", cards: byKind("opportunity") },
      { key: "business", title: "Sugestoes de Negocio", cards: byKind("business") },
      { key: "meeting", title: "Reunioes Recomendadas", cards: byKind("meeting") },
      { key: "wellbeing", title: "Ritmo e Energia", cards: byKind("wellbeing") },
    ]
  }, [filteredCards])

  const handleClose = () => navigate(-1)

  const toggleWidget = async (widgetId) => {
    const cfg = configQuery.data || (await tipcClient.getConfig())
    const current = cfg.profileWidgetsEnabled || boardQuery.data?.enabledWidgets || []
    const next = current.includes(widgetId)
      ? current.filter((item) => item !== widgetId)
      : [...current, widgetId]

    if (next.length === 0) return

    await saveConfigMutation.mutateAsync({
      config: {
        ...cfg,
        profileWidgetsEnabled: next,
      },
    })

    await refreshMutation.mutateAsync()
    queryClient.invalidateQueries({ queryKey: ["autonomous-profile-board"] })
  }

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        <header className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.title}>Perfil Autonomo</h1>
            <div className={styles.headerActions}>
              <button
                className={styles.headerBtnIcon}
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                <RefreshIcon style={{ width: 16, height: 16 }} />
                <span>{refreshMutation.isPending ? "Atualizando" : "Atualizar"}</span>
              </button>
            </div>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </header>

        <main className={styles.mainContent}>
          {timeAwareBoard?.weeks?.length > 0 && (
            <div className={styles.filters}>
              <WidgetToggleBar
                availableWidgets={timeAwareBoard.availableWidgets || []}
                enabledWidgets={effectiveEnabledWidgets}
                onToggle={toggleWidget}
              />
              <WeekSelector
                weeks={timeAwareBoard.weeks}
                selectedWeekKey={selectedWeekKey}
                onSelectWeek={(weekKey) => {
                  setSelectedWeekKey(weekKey)
                  setSelectedDayKey("all")
                }}
              />
              <DaySelector days={daysOfSelectedWeek} selectedDayKey={selectedDayKey} onSelectDay={setSelectedDayKey} />
            </div>
          )}

          {boardQuery.isLoading ? (
            <div className={styles.loadingState}>Gerando perfil autonomo...</div>
          ) : (
            <>
              <div className={styles.contentScroll}>
                {sections.map((section) => (
                  <InsightSection key={section.key} title={section.title} cards={section.cards} />
                ))}
                {!filteredCards.length && (
                  <div className={styles.emptyState}>Nenhum insight no recorte selecionado.</div>
                )}
              </div>
              <footer className={styles.statsBar}>
                <span>Runs analisadas: {timeAwareBoard?.stats?.runsAnalyzed ?? 0}</span>
                <span>Cards: {filteredCards.length}</span>
                <span>Widgets ativos: {effectiveEnabledWidgets.length}</span>
                <span>Foco: {((timeAwareBoard?.stats?.workRatio || 0) * 100).toFixed(0)}%</span>
                <span>Distração: {((timeAwareBoard?.stats?.distractionRatio || 0) * 100).toFixed(0)}%</span>
                <span>Troca de contexto: {(timeAwareBoard?.stats?.averageContextSwitches || 0).toFixed(1)}</span>
              </footer>
            </>
          )}
        </main>
      </div>
      <Navigation />
    </div>
  )
}

export const Component = Profile
export default Profile
