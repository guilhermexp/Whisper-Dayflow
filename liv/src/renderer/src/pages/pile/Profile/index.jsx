import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Tabs from "@radix-ui/react-tabs"
import { CrossIcon, RefreshIcon } from "renderer/icons"
import { usePilesContext } from "renderer/context/PilesContext"
import { tipcClient } from "renderer/lib/tipc-client"
import { useConfigQuery, useSaveConfigMutation } from "renderer/lib/query-client"
import layoutStyles from "../PileLayout.module.scss"
import Navigation from "../Navigation"
import styles from "./Profile.module.scss"

// ===================== Helpers (Overview) =====================

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]

const KIND_META = {
  strength: { label: "Forca", color: "#34d399" },
  risk: { label: "Risco", color: "#fb7185" },
  opportunity: { label: "Oportunidade", color: "#f59e0b" },
  meeting: { label: "Reunioes", color: "#60a5fa" },
  business: { label: "Negocio", color: "#a78bfa" },
  wellbeing: { label: "Energia", color: "#22d3ee" },
}

const IMPACT_LABEL = { low: "Impacto baixo", medium: "Impacto medio", high: "Impacto alto" }

const toTimestamp = (card, fallbackTs) => {
  if (typeof card?.observedAt === "number" && Number.isFinite(card.observedAt)) return card.observedAt
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const buildWeekLabel = (weekStartKey) => {
  const start = new Date(`${weekStartKey}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${start.toLocaleDateString("pt-BR")} - ${end.toLocaleDateString("pt-BR")}`
}

const PRINCIPLE_CATEGORIES = [
  { value: "time", label: "Tempo" },
  { value: "health", label: "Saude" },
  { value: "work", label: "Trabalho" },
  { value: "social", label: "Social" },
  { value: "general", label: "Geral" },
]

const DEFAULT_COLORS = ["#60a5fa", "#34d399", "#fb7185", "#a78bfa", "#f59e0b", "#22d3ee", "#e879f9", "#f97316"]

const generateId = () => Math.random().toString(36).slice(2, 14)

// ===================== Overview Sub-Components =====================

function WeekSelector({ weeks, selectedWeekKey, onSelectWeek }) {
  return (
    <div className={styles.weekSelector}>
      {weeks.map((week) => (
        <button key={week.key} className={`${styles.weekBtn} ${selectedWeekKey === week.key ? styles.weekBtnActive : ""}`} onClick={() => onSelectWeek(week.key)}>
          {week.label}
        </button>
      ))}
    </div>
  )
}

function DaySelector({ days, selectedDayKey, onSelectDay }) {
  return (
    <div className={styles.daySelector}>
      <button className={`${styles.dayBtn} ${selectedDayKey === "all" ? styles.dayBtnActive : ""}`} onClick={() => onSelectDay("all")}>Semana</button>
      {days.map((day) => (
        <button key={day.key} className={`${styles.dayBtn} ${selectedDayKey === day.key ? styles.dayBtnActive : ""}`} onClick={() => onSelectDay(day.key)}>
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
        <span className={styles.kindBadge} style={{ "--badge-color": kindMeta.color }}>{kindMeta.label}</span>
        <span className={styles.impactBadge}>{IMPACT_LABEL[card.impact] || "Impacto"}</span>
      </div>
      <h3 className={styles.cardTitle}>{card.title}</h3>
      <p className={styles.cardSummary}>{card.summary}</p>
      <ul className={styles.actionList}>
        {(card.actions || []).map((action, index) => (<li key={`${card.id}-${index}`}>{action}</li>))}
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
          <button key={widget.id} className={`${styles.widgetChip} ${active ? styles.widgetChipActive : ""}`} title={widget.description} onClick={() => onToggle(widget.id)}>
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
      <header className={styles.sectionHeader}><h2>{title}</h2><span>{cards.length}</span></header>
      <div className={styles.cardGrid}>{cards.map((card) => (<ProfileCard key={card.id} card={card} />))}</div>
    </section>
  )
}

// ===================== Alignment Ring SVG =====================

function AlignmentRing({ score, size = 90 }) {
  const radius = (size - 10) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference
  const color = score >= 70 ? "#34d399" : score >= 40 ? "#f59e0b" : "#fb7185"
  return (
    <div className={styles.scoreRing}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.8s ease", transform: "rotate(-90deg)", transformOrigin: "center" }} />
      </svg>
      <span className={styles.scoreNumber} style={{ color }}>{score}%</span>
    </div>
  )
}

// ===================== OverviewTab =====================

function OverviewTab({ boardQuery, configQuery, saveConfigMutation, lifeAnalysis }) {
  const queryClient = useQueryClient()
  const [selectedWeekKey, setSelectedWeekKey] = useState("")
  const [selectedDayKey, setSelectedDayKey] = useState("all")

  const refreshMutation = useMutation({
    mutationFn: () => tipcClient.refreshAutonomousProfile(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["autonomous-profile-board"] }),
  })

  const effectiveEnabledWidgets = useMemo(
    () => configQuery.data?.profileWidgetsEnabled || boardQuery.data?.enabledWidgets || [],
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
      return { ...card, observedAtTs, weekKey: toDateKey(weekStart), dayKey: toDateKey(observedDate) }
    })
    const weekKeys = Array.from(new Set(cards.map((c) => c.weekKey))).sort((a, b) => (a > b ? -1 : 1))
    const weeks = weekKeys.map((key) => ({ key, label: buildWeekLabel(key) }))
    return { ...board, cards, weeks }
  }, [boardQuery.data])

  useEffect(() => {
    if (!timeAwareBoard?.weeks?.length) { setSelectedWeekKey(""); setSelectedDayKey("all"); return }
    if (!selectedWeekKey || !timeAwareBoard.weeks.some((w) => w.key === selectedWeekKey)) { setSelectedWeekKey(timeAwareBoard.weeks[0].key); setSelectedDayKey("all") }
  }, [timeAwareBoard, selectedWeekKey])

  const daysOfSelectedWeek = useMemo(() => {
    if (!selectedWeekKey) return []
    const weekStart = new Date(`${selectedWeekKey}T00:00:00`)
    const cards = timeAwareBoard?.cards || []
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(weekStart); date.setDate(weekStart.getDate() + idx)
      const key = toDateKey(date)
      return { key, label: DAY_LABELS[idx], count: cards.filter((c) => c.weekKey === selectedWeekKey && c.dayKey === key).length }
    })
  }, [selectedWeekKey, timeAwareBoard])

  const filteredCards = useMemo(() => {
    const cards = timeAwareBoard?.cards || []
    if (!selectedWeekKey) return cards
    return cards.filter((c) => c.weekKey === selectedWeekKey && (selectedDayKey === "all" || c.dayKey === selectedDayKey))
  }, [timeAwareBoard, selectedWeekKey, selectedDayKey])

  const sections = useMemo(() => {
    const byKind = (kind) => filteredCards.filter((c) => c.kind === kind)
    return [
      { key: "strength", title: "Pontos Fortes", cards: byKind("strength") },
      { key: "risk", title: "Riscos e Alertas", cards: byKind("risk") },
      { key: "opportunity", title: "Oportunidades de Automacao", cards: byKind("opportunity") },
      { key: "business", title: "Sugestoes de Negocio", cards: byKind("business") },
      { key: "meeting", title: "Reunioes Recomendadas", cards: byKind("meeting") },
      { key: "wellbeing", title: "Ritmo e Energia", cards: byKind("wellbeing") },
    ]
  }, [filteredCards])

  const toggleWidget = async (widgetId) => {
    const cfg = configQuery.data || (await tipcClient.getConfig())
    const current = cfg.profileWidgetsEnabled || boardQuery.data?.enabledWidgets || []
    const next = current.includes(widgetId) ? current.filter((i) => i !== widgetId) : [...current, widgetId]
    if (!next.length) return
    await saveConfigMutation.mutateAsync({ config: { ...cfg, profileWidgetsEnabled: next } })
    await refreshMutation.mutateAsync()
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.overviewControlPanel}>
        <div className={styles.overviewHeaderTopRow}>
          {lifeAnalysis && (
            <div className={styles.overviewScoreCluster}>
              <AlignmentRing score={lifeAnalysis.alignmentScore} size={74} />
              <span className={styles.overviewScoreLabel}>Score de Alinhamento</span>
            </div>
          )}
          <button className={`${styles.headerBtnIcon} ${styles.overviewRefreshBtn}`} onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshIcon style={{ width: 14, height: 14 }} />
            <span>{refreshMutation.isPending ? "Atualizando..." : "Atualizar Insights"}</span>
          </button>
        </div>

        {timeAwareBoard?.weeks?.length > 0 && (
          <div className={styles.filters}>
            <WidgetToggleBar availableWidgets={timeAwareBoard.availableWidgets || []} enabledWidgets={effectiveEnabledWidgets} onToggle={toggleWidget} />
            <WeekSelector weeks={timeAwareBoard.weeks} selectedWeekKey={selectedWeekKey} onSelectWeek={(k) => { setSelectedWeekKey(k); setSelectedDayKey("all") }} />
            <DaySelector days={daysOfSelectedWeek} selectedDayKey={selectedDayKey} onSelectDay={setSelectedDayKey} />
          </div>
        )}
      </div>

      {boardQuery.isLoading ? (
        <div className={styles.loadingState}>Gerando perfil autonomo...</div>
      ) : (
        <>
          <div className={styles.contentScroll}>
            {sections.map((s) => (<InsightSection key={s.key} title={s.title} cards={s.cards} />))}
            {!filteredCards.length && <div className={styles.emptyState}>Nenhum insight no recorte selecionado.</div>}
          </div>
          <footer className={styles.statsBar}>
            <span>Runs: {timeAwareBoard?.stats?.runsAnalyzed ?? 0}</span>
            <span>Cards: {filteredCards.length}</span>
            <span>Foco: {((timeAwareBoard?.stats?.workRatio || 0) * 100).toFixed(0)}%</span>
            <span>Distracao: {((timeAwareBoard?.stats?.distractionRatio || 0) * 100).toFixed(0)}%</span>
          </footer>
        </>
      )}
    </div>
  )
}

// ===================== MyLifeTab =====================

function CollapsibleSection({ title, emoji, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.sectionAccordion}>
      <button className={styles.sectionAccordionHeader} onClick={() => setOpen(!open)}>
        <span>{emoji} {title}</span>
        <span className={styles.sectionCount}>{count != null ? count : ""}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>&#9660;</span>
      </button>
      {open && <div className={styles.sectionAccordionContent}>{children}</div>}
    </div>
  )
}

function MyLifeTab({ lifeContext, saveContext }) {
  const [local, setLocal] = useState(null)
  const ctx = local || lifeContext

  useEffect(() => { if (lifeContext) setLocal({ ...lifeContext }) }, [lifeContext])

  const persist = useCallback((updated) => {
    setLocal(updated)
    saveContext(updated)
  }, [saveContext])

  if (!ctx) return <div className={styles.loadingState}>Carregando...</div>

  const updateMission = (val) => persist({ ...ctx, mission: val })

  // Dimensions
  const addDimension = () => {
    const newDim = {
      id: generateId(), name: "Nova Dimensao", icon: "🎯",
      color: DEFAULT_COLORS[ctx.dimensions.length % DEFAULT_COLORS.length],
      targetPercent: 10, description: "", keywords: [], createdAt: Date.now(),
    }
    persist({ ...ctx, dimensions: [...ctx.dimensions, newDim] })
  }

  const updateDimension = (id, patch) => {
    persist({ ...ctx, dimensions: ctx.dimensions.map((d) => d.id === id ? { ...d, ...patch } : d) })
  }

  const deleteDimension = (id) => {
    if (!confirm("Remover esta dimensao?")) return
    persist({ ...ctx, dimensions: ctx.dimensions.filter((d) => d.id !== id) })
  }

  // Goals
  const addGoal = () => {
    const newGoal = {
      id: generateId(), title: "", description: "",
      dimensionId: ctx.dimensions[0]?.id || "", deadline: null,
      priority: 5, keyResults: [], status: "active", createdAt: Date.now(), updatedAt: Date.now(),
    }
    persist({ ...ctx, goals: [...ctx.goals, newGoal] })
  }

  const updateGoal = (id, patch) => {
    persist({ ...ctx, goals: ctx.goals.map((g) => g.id === id ? { ...g, ...patch, updatedAt: Date.now() } : g) })
  }

  const deleteGoal = (id) => {
    if (!confirm("Remover esta meta?")) return
    persist({ ...ctx, goals: ctx.goals.filter((g) => g.id !== id) })
  }

  // Principles
  const addPrinciple = () => {
    const newP = { id: generateId(), text: "", category: "general", active: true, createdAt: Date.now() }
    persist({ ...ctx, principles: [...ctx.principles, newP] })
  }

  const updatePrinciple = (id, patch) => {
    persist({ ...ctx, principles: ctx.principles.map((p) => p.id === id ? { ...p, ...patch } : p) })
  }

  const deletePrinciple = (id) => {
    persist({ ...ctx, principles: ctx.principles.filter((p) => p.id !== id) })
  }

  // Wisdom
  const addWisdom = () => {
    const text = prompt("Adicionar sabedoria:")
    if (!text?.trim()) return
    tipcClient.addWisdomEntry({ text: text.trim(), source: "manual" })
      .then(() => tipcClient.getLifeContext())
      .then((updated) => setLocal(updated))
  }

  const deleteWisdom = (id) => {
    tipcClient.deleteWisdomEntry({ entryId: id })
      .then(() => tipcClient.getLifeContext())
      .then((updated) => setLocal(updated))
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.mylifeContainer}>
        {/* Mission */}
        <CollapsibleSection title="Missao" emoji="🎯" defaultOpen={true}>
          <textarea
            className={styles.missionInput}
            placeholder="Qual e o proposito da sua vida em uma frase?"
            value={ctx.mission}
            onChange={(e) => setLocal({ ...ctx, mission: e.target.value })}
            onBlur={() => persist(ctx)}
            rows={2}
          />
        </CollapsibleSection>

        {/* Dimensions */}
        <CollapsibleSection title="Dimensoes" emoji="📊" count={ctx.dimensions.length} defaultOpen={true}>
          <div className={styles.dimensionList}>
            {ctx.dimensions.map((dim) => (
              <div key={dim.id} className={styles.dimensionCard}>
                <div className={styles.dimCardTop}>
                  <input className={styles.emojiInput} value={dim.icon} onChange={(e) => updateDimension(dim.id, { icon: e.target.value })} maxLength={2} />
                  <input className={styles.dimNameInput} value={dim.name} onChange={(e) => updateDimension(dim.id, { name: e.target.value })} placeholder="Nome" />
                  <input type="color" className={styles.colorSwatch} value={dim.color} onChange={(e) => updateDimension(dim.id, { color: e.target.value })} />
                  <button className={styles.deleteBtn} onClick={() => deleteDimension(dim.id)} title="Remover">x</button>
                </div>
                <div className={styles.dimSliderRow}>
                  <span className={styles.dimSliderLabel}>Meta: {dim.targetPercent}%</span>
                  <input type="range" min="0" max="100" value={dim.targetPercent} className={styles.percentSlider} onChange={(e) => updateDimension(dim.id, { targetPercent: parseInt(e.target.value, 10) })} />
                </div>
                <input className={styles.dimDescInput} value={dim.description} onChange={(e) => updateDimension(dim.id, { description: e.target.value })} placeholder="Como sucesso se parece nessa area" />
                <input className={styles.dimKeywordsInput} value={(dim.keywords || []).join(", ")} onChange={(e) => updateDimension(dim.id, { keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} placeholder="Keywords (separadas por virgula)" />
              </div>
            ))}
            <button className={styles.addButton} onClick={addDimension}>+ Adicionar Dimensao</button>
          </div>
        </CollapsibleSection>

        {/* Goals */}
        <CollapsibleSection title="Metas" emoji="🎯" count={ctx.goals.length}>
          <div className={styles.goalList}>
            {ctx.goals.map((goal) => (
              <div key={goal.id} className={styles.goalCard}>
                <div className={styles.goalHeader}>
                  <input className={styles.goalTitleInput} value={goal.title} onChange={(e) => updateGoal(goal.id, { title: e.target.value })} placeholder="Titulo da meta" />
                  <select className={styles.goalStatus} value={goal.status} onChange={(e) => updateGoal(goal.id, { status: e.target.value })}>
                    <option value="active">Ativa</option>
                    <option value="paused">Pausada</option>
                    <option value="completed">Concluida</option>
                  </select>
                  <button className={styles.deleteBtn} onClick={() => deleteGoal(goal.id)}>x</button>
                </div>
                <textarea className={styles.goalDescInput} value={goal.description} onChange={(e) => updateGoal(goal.id, { description: e.target.value })} placeholder="Descricao" rows={2} />
                <div className={styles.goalMetaRow}>
                  <label>
                    Dimensao:
                    <select value={goal.dimensionId} onChange={(e) => updateGoal(goal.id, { dimensionId: e.target.value })}>
                      {ctx.dimensions.map((d) => (<option key={d.id} value={d.id}>{d.icon} {d.name}</option>))}
                    </select>
                  </label>
                  <label>
                    Prioridade:
                    <input type="number" min="1" max="10" value={goal.priority} onChange={(e) => updateGoal(goal.id, { priority: parseInt(e.target.value, 10) || 5 })} className={styles.priorityInput} />
                  </label>
                  <label>
                    Deadline:
                    <input type="date" value={goal.deadline ? new Date(goal.deadline).toISOString().split("T")[0] : ""} onChange={(e) => updateGoal(goal.id, { deadline: e.target.value ? new Date(e.target.value).getTime() : null })} />
                  </label>
                </div>
                <div className={styles.keyResultsSection}>
                  <span className={styles.keyResultsLabel}>Key Results:</span>
                  {(goal.keyResults || []).map((kr, i) => (
                    <div key={i} className={styles.keyResultRow}>
                      <input value={kr} onChange={(e) => { const updated = [...goal.keyResults]; updated[i] = e.target.value; updateGoal(goal.id, { keyResults: updated }) }} />
                      <button className={styles.deleteBtn} onClick={() => { const updated = goal.keyResults.filter((_, j) => j !== i); updateGoal(goal.id, { keyResults: updated }) }}>x</button>
                    </div>
                  ))}
                  <button className={styles.addButtonSmall} onClick={() => updateGoal(goal.id, { keyResults: [...(goal.keyResults || []), ""] })}>+ Key Result</button>
                </div>
              </div>
            ))}
            <button className={styles.addButton} onClick={addGoal}>+ Adicionar Meta</button>
          </div>
        </CollapsibleSection>

        {/* Principles */}
        <CollapsibleSection title="Principios" emoji="⚖️" count={ctx.principles.length}>
          <div className={styles.principleList}>
            {ctx.principles.map((p) => (
              <div key={p.id} className={styles.principleRow}>
                <input className={styles.principleTextInput} value={p.text} onChange={(e) => updatePrinciple(p.id, { text: e.target.value })} placeholder="Principio (ex: Nunca trabalhar apos 20h)" />
                <select value={p.category} onChange={(e) => updatePrinciple(p.id, { category: e.target.value })}>
                  {PRINCIPLE_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
                <button className={`${styles.toggleBtn} ${p.active ? styles.toggleActive : ""}`} onClick={() => updatePrinciple(p.id, { active: !p.active })}>
                  {p.active ? "Ativo" : "Inativo"}
                </button>
                <button className={styles.deleteBtn} onClick={() => deletePrinciple(p.id)}>x</button>
              </div>
            ))}
            <button className={styles.addButton} onClick={addPrinciple}>+ Adicionar Principio</button>
          </div>
        </CollapsibleSection>

        {/* Wisdom */}
        <CollapsibleSection title="Sabedoria" emoji="💡" count={ctx.wisdom.length}>
          <div className={styles.wisdomList}>
            {ctx.wisdom.map((w) => (
              <div key={w.id} className={styles.wisdomEntry}>
                <p className={styles.wisdomText}>{w.text}</p>
                <div className={styles.wisdomMeta}>
                  <span className={`${styles.sourceBadge} ${w.source === "auto" ? styles.sourceBadgeAuto : ""}`}>{w.source}</span>
                  <span>{new Date(w.createdAt).toLocaleDateString("pt-BR")}</span>
                  <button className={styles.deleteBtn} onClick={() => deleteWisdom(w.id)}>x</button>
                </div>
              </div>
            ))}
            <button className={styles.addButton} onClick={addWisdom}>+ Adicionar Sabedoria</button>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}

// ===================== RealityCheckTab =====================

function RealityCheckTab({ lifeContext, lifeAnalysis, refreshAnalysis, isRefreshing }) {
  const [windowDays, setWindowDays] = useState(14)

  if (!lifeAnalysis) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.emptyState}>
          <p>Defina suas dimensoes na aba MyLife e clique Refresh para gerar a analise.</p>
          <button className={styles.headerBtnIcon} onClick={() => refreshAnalysis(windowDays)} disabled={isRefreshing}>
            <RefreshIcon style={{ width: 14, height: 14 }} />
            <span>{isRefreshing ? "Gerando..." : "Gerar Analise"}</span>
          </button>
        </div>
      </div>
    )
  }

  const dims = lifeContext?.dimensions || []

  return (
    <div className={styles.tabContent}>
      <div className={styles.realityContainer}>
        <div className={styles.realityTopBar}>
          <button className={styles.headerBtnIcon} onClick={() => refreshAnalysis(windowDays)} disabled={isRefreshing}>
            <RefreshIcon style={{ width: 14, height: 14 }} />
            <span>{isRefreshing ? "Gerando..." : "Refresh"}</span>
          </button>
          <div className={styles.windowSelector}>
            {[7, 14, 30].map((d) => (
              <button key={d} className={`${styles.windowBtn} ${windowDays === d ? styles.windowBtnActive : ""}`} onClick={() => { setWindowDays(d); refreshAnalysis(d) }}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Alignment Score Ring */}
        <div className={styles.alignmentHeader}>
          <AlignmentRing score={lifeAnalysis.alignmentScore} size={110} />
          <span className={styles.alignmentLabel}>Score de Alinhamento</span>
        </div>

        {/* Dimension Bars */}
        <section className={styles.realitySection}>
          <h3 className={styles.realitySectionTitle}>Dimensoes</h3>
          <div className={styles.dimensionBarsSection}>
            {lifeAnalysis.dimensionScores.map((score) => {
              const dim = dims.find((d) => d.id === score.dimensionId)
              const gapAbs = Math.abs(score.gap)
              const gapColor = gapAbs <= 5 ? "#34d399" : gapAbs <= 15 ? "#f59e0b" : "#fb7185"
              return (
                <div key={score.dimensionId} className={styles.dimensionRow}>
                  <span className={styles.dimRowLabel}>{dim?.icon || "?"} {dim?.name || "?"}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${Math.min(100, score.actualPercent)}%`, backgroundColor: dim?.color || "#60a5fa" }} />
                    <div className={styles.barTarget} style={{ left: `${Math.min(100, score.targetPercent)}%` }} />
                  </div>
                  <span className={styles.dimRowPercent}>{score.actualPercent}%/{score.targetPercent}%</span>
                  <span className={styles.gapBadge} style={{ "--gap-color": gapColor }}>
                    {gapAbs <= 5 ? "ok" : score.gap > 0 ? `+${score.gap}` : score.gap}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Goals Progress */}
        {lifeAnalysis.goalProgress.length > 0 && (
          <section className={styles.realitySection}>
            <h3 className={styles.realitySectionTitle}>Metas</h3>
            {lifeAnalysis.goalProgress.map((gp) => {
              const goal = lifeContext?.goals?.find((g) => g.id === gp.goalId)
              const statusColor = gp.status === "on-track" ? "#34d399" : gp.status === "at-risk" ? "#f59e0b" : "#fb7185"
              return (
                <div key={gp.goalId} className={styles.goalRow}>
                  <span className={styles.goalRowTitle}>{goal?.title || gp.goalId}</span>
                  <span className={styles.velocityBadge}>{gp.velocityPerWeek.toFixed(1)}/sem</span>
                  <span className={styles.statusBadge} style={{ "--status-color": statusColor }}>{gp.status}</span>
                  <span className={styles.goalRowCount}>{gp.matchedActivities.length} ativ</span>
                </div>
              )
            })}
          </section>
        )}

        {/* Principle Violations */}
        {lifeAnalysis.principleViolations.length > 0 && (
          <section className={styles.realitySection}>
            <h3 className={styles.realitySectionTitle}>Principios Violados</h3>
            {lifeAnalysis.principleViolations.map((pv) => {
              const principle = lifeContext?.principles?.find((p) => p.id === pv.principleId)
              return (
                <div key={pv.principleId} className={styles.violationRow}>
                  <span className={styles.violationText}>{principle?.text || pv.principleId}</span>
                  <span className={styles.violationCount}>{pv.violations.length} violacoes</span>
                </div>
              )
            })}
          </section>
        )}

        {/* Weekly Letter / Synthesis */}
        <section className={styles.realitySection}>
          <h3 className={styles.realitySectionTitle}>Carta Semanal</h3>
          <div className={styles.synthesisBox}>
            {lifeAnalysis.synthesis.split("\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* Suggestions */}
        {lifeAnalysis.suggestions.length > 0 && (
          <section className={styles.realitySection}>
            <h3 className={styles.realitySectionTitle}>Sugestoes</h3>
            <ul className={styles.suggestionsList}>
              {lifeAnalysis.suggestions.map((s, i) => (<li key={i}>{s}</li>))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

// ===================== Main Profile =====================

function Profile() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTheme } = usePilesContext()
  const [activeTab, setActiveTab] = useState("overview")

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

  const lifeContextQuery = useQuery({
    queryKey: ["life-context"],
    queryFn: () => tipcClient.getLifeContext(),
  })

  const lifeAnalysisQuery = useQuery({
    queryKey: ["life-analysis"],
    queryFn: () => tipcClient.getLifeAnalysis(),
  })

  const saveLifeContextMutation = useMutation({
    mutationFn: (context) => tipcClient.saveLifeContext({ context }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["life-context"] }),
  })

  const refreshAnalysisMutation = useMutation({
    mutationFn: (windowDays) => tipcClient.refreshLifeAnalysis({ windowDays }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["life-analysis"] }),
  })

  const handleClose = () => navigate(-1)

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        <header className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.title}>Life OS</h1>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </header>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className={styles.tabsRoot}>
          <Tabs.List className={styles.tabsList}>
            <Tabs.Trigger value="overview" className={styles.tabTrigger}>Overview</Tabs.Trigger>
            <Tabs.Trigger value="mylife" className={styles.tabTrigger}>MyLife</Tabs.Trigger>
            <Tabs.Trigger value="reality" className={styles.tabTrigger}>Reality Check</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="overview" className={styles.tabPanel}>
            <OverviewTab
              boardQuery={boardQuery}
              configQuery={configQuery}
              saveConfigMutation={saveConfigMutation}
              lifeAnalysis={lifeAnalysisQuery.data}
            />
          </Tabs.Content>

          <Tabs.Content value="mylife" className={styles.tabPanel}>
            <MyLifeTab
              lifeContext={lifeContextQuery.data}
              saveContext={(ctx) => saveLifeContextMutation.mutate(ctx)}
            />
          </Tabs.Content>

          <Tabs.Content value="reality" className={styles.tabPanel}>
            <RealityCheckTab
              lifeContext={lifeContextQuery.data}
              lifeAnalysis={lifeAnalysisQuery.data}
              refreshAnalysis={(days) => refreshAnalysisMutation.mutate(days)}
              isRefreshing={refreshAnalysisMutation.isPending}
            />
          </Tabs.Content>
        </Tabs.Root>
      </div>
      <Navigation />
    </div>
  )
}

export const Component = Profile
export default Profile
