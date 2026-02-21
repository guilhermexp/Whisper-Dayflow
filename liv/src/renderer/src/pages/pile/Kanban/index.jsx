import styles from "./Kanban.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import { CrossIcon, PlusIcon, RefreshIcon, SearchIcon, EditIcon, TrashIcon } from "renderer/icons"

const CheckIcon = (props) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
import { useEffect, useMemo, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { usePilesContext } from "renderer/context/PilesContext"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { tipcClient } from "renderer/lib/tipc-client"
import Navigation from "../Navigation"

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]

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
  const day = date.getDay() // sun=0
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

// --- Card Modal (Create / Edit) ---

function CardModal({ mode, initialData, columnId, onSave, onCancel }) {
  const [title, setTitle] = useState(initialData?.title || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [bulletsText, setBulletsText] = useState((initialData?.bullets || []).join("\n"))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    const bullets = bulletsText.split("\n").map((b) => b.trim()).filter(Boolean)
    onSave({ title: title.trim(), description: description.trim() || undefined, bullets: bullets.length > 0 ? bullets : undefined })
  }

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>
          {mode === "create" ? "Novo Card" : "Editar Card"}
        </h3>
        <form onSubmit={handleSubmit}>
          <label className={styles.modalLabel}>
            Titulo
            <input
              className={styles.modalInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titulo do card"
              autoFocus
            />
          </label>
          <label className={styles.modalLabel}>
            Descricao
            <input
              className={styles.modalInput}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descricao (opcional)"
            />
          </label>
          <label className={styles.modalLabel}>
            Bullets (1 por linha)
            <textarea
              className={styles.modalTextarea}
              value={bulletsText}
              onChange={(e) => setBulletsText(e.target.value)}
              placeholder="Um item por linha"
              rows={3}
            />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalBtnCancel} onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalBtnSave} disabled={!title.trim()}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Kanban Card ---

function KanbanCard({ card, columnColor, onEdit, onDelete, onToggleDone, onDragStart }) {
  const isDone = card.status === "done"

  return (
    <div
      className={`${styles.card} ${isDone ? styles.cardDone : ""}`}
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id)
        e.dataTransfer.effectAllowed = "move"
        onDragStart?.(card.id)
      }}
    >
      <h3 className={styles.cardTitle}>{card.title}</h3>
      {card.bullets?.length > 0 && (
        <ul className={styles.cardBullets}>
          {card.bullets.map((bullet, idx) => (
            <li key={idx}>{bullet}</li>
          ))}
        </ul>
      )}
      {card.description && <p className={styles.cardDescription}>{card.description}</p>}
      <div className={styles.cardFooter}>
        <div className={styles.tag} style={{ "--tag-color": columnColor }}>
          <span className={styles.tagIcon} style={{ borderColor: columnColor }} />
          <span className={styles.tagLabel}>{Math.round((card.confidence || 0) * 100)}% confianca</span>
        </div>
        <div className={styles.cardActions}>
          <button
            className={`${styles.cardActionBtn} ${isDone ? styles.cardActionBtnActive : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleDone(card.id, isDone ? "open" : "done") }}
            title={isDone ? "Reabrir" : "Concluir"}
          >
            <CheckIcon style={{ width: 14, height: 14 }} />
          </button>
          <button
            className={styles.cardActionBtn}
            onClick={(e) => { e.stopPropagation(); onEdit(card) }}
            title="Editar"
          >
            <EditIcon style={{ width: 14, height: 14 }} />
          </button>
          <button
            className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`}
            onClick={(e) => { e.stopPropagation(); onDelete(card.id) }}
            title="Excluir"
          >
            <TrashIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Kanban Column ---

function KanbanColumn({ column, onCreateCard, onEditCard, onDeleteCard, onToggleDone, onDragStart, onDrop }) {
  const [dragOver, setDragOver] = useState(false)

  const getColumnIcon = (icon, color) => {
    switch (icon) {
      case "lightbulb":
        return (
          <svg
            className={styles.columnIconSvg}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
          >
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.9V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.1A7 7 0 0 1 12 2z" />
          </svg>
        )
      case "circle":
        return <span className={styles.columnIconCircle} style={{ borderColor: color }} />
      case "target":
        return (
          <svg
            className={styles.columnIconSvg}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`${styles.column} ${dragOver ? styles.columnDropTarget : ""}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const cardId = e.dataTransfer.getData("text/plain")
        if (cardId) onDrop(cardId, column.id)
      }}
    >
      <div className={styles.columnHeader}>
        <div className={styles.columnTitleArea}>
          {getColumnIcon(column.icon, column.color)}
          <h2 className={styles.columnTitle}>{column.title}</h2>
          <span className={styles.columnCount}>{column.cards.length}</span>
        </div>
        <div className={styles.columnActions}>
          <button
            className={styles.columnAction}
            title="Novo card"
            onClick={() => onCreateCard(column.id)}
          >
            <PlusIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>
      <div className={styles.cardList}>
        {column.cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            columnColor={column.color}
            onEdit={onEditCard}
            onDelete={onDeleteCard}
            onToggleDone={onToggleDone}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  )
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

function Kanban() {
  const { t } = useTranslation()
  const { currentTheme } = usePilesContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [memoryQuery, setMemoryQuery] = useState("")
  const [selectedWeekKey, setSelectedWeekKey] = useState("")
  const [selectedDayKey, setSelectedDayKey] = useState("all")

  // Modal state
  const [modalMode, setModalMode] = useState(null) // null | "create" | "edit"
  const [modalColumnId, setModalColumnId] = useState(null)
  const [modalCard, setModalCard] = useState(null)

  // Drag state
  const [draggingCardId, setDraggingCardId] = useState(null)

  const themeStyles = useMemo(() => (currentTheme ? `${currentTheme}Theme` : ""), [currentTheme])
  const isMac = window.electron?.isMac
  const osLayoutStyles = isMac ? layoutStyles.macOS : layoutStyles.windows

  const boardQuery = useQuery({
    queryKey: ["autonomous-kanban-board"],
    queryFn: () => tipcClient.getAutonomousKanbanBoard(),
    refetchInterval: 30000,
  })

  const refreshMutation = useMutation({
    mutationFn: () => tipcClient.refreshAutonomousKanban(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autonomous-kanban-board"] })
      queryClient.invalidateQueries({ queryKey: ["autonomous-kanban-memory"] })
    },
  })

  const createCardMutation = useMutation({
    mutationFn: (params) => tipcClient.createKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(["autonomous-kanban-board"], data)
    },
  })

  const updateCardMutation = useMutation({
    mutationFn: (params) => tipcClient.updateKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(["autonomous-kanban-board"], data)
    },
  })

  const deleteCardMutation = useMutation({
    mutationFn: (params) => tipcClient.deleteKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(["autonomous-kanban-board"], data)
    },
  })

  const moveCardMutation = useMutation({
    mutationFn: (params) => tipcClient.moveKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(["autonomous-kanban-board"], data)
    },
  })

  const memoryQueryResult = useQuery({
    queryKey: ["autonomous-kanban-memory", memoryQuery],
    queryFn: () =>
      tipcClient.searchAutonomousKanbanMemory({
        query: memoryQuery,
        maxResults: 6,
      }),
    enabled: memoryQuery.trim().length >= 3,
  })

  // --- CRUD handlers ---

  const handleOpenCreate = useCallback((columnId) => {
    setModalMode("create")
    setModalColumnId(columnId)
    setModalCard(null)
  }, [])

  const handleOpenEdit = useCallback((card) => {
    setModalMode("edit")
    setModalCard(card)
    setModalColumnId(null)
  }, [])

  const handleModalSave = useCallback((data) => {
    if (modalMode === "create" && modalColumnId) {
      createCardMutation.mutate({ columnId: modalColumnId, ...data })
    } else if (modalMode === "edit" && modalCard) {
      updateCardMutation.mutate({ cardId: modalCard.id, updates: data })
    }
    setModalMode(null)
    setModalCard(null)
    setModalColumnId(null)
  }, [modalMode, modalColumnId, modalCard, createCardMutation, updateCardMutation])

  const handleModalCancel = useCallback(() => {
    setModalMode(null)
    setModalCard(null)
    setModalColumnId(null)
  }, [])

  const handleDeleteCard = useCallback((cardId) => {
    if (window.confirm("Excluir este card?")) {
      deleteCardMutation.mutate({ cardId })
    }
  }, [deleteCardMutation])

  const handleToggleDone = useCallback((cardId, newStatus) => {
    updateCardMutation.mutate({ cardId, updates: { status: newStatus } })
  }, [updateCardMutation])

  const handleDrop = useCallback((cardId, toColumnId) => {
    setDraggingCardId(null)
    moveCardMutation.mutate({ cardId, toColumnId })
  }, [moveCardMutation])

  // --- Time-aware board ---

  const timeAwareBoard = useMemo(() => {
    const board = boardQuery.data
    if (!board?.columns) return null

    const fallbackTs = board.generatedAt || Date.now()
    const normalizedColumns = board.columns.map((column) => ({
      ...column,
      cards: (column.cards || []).map((card) => {
        const observedAtTs = toTimestamp(card, fallbackTs)
        const observedDate = new Date(observedAtTs)
        const weekStart = startOfWeekMonday(observedDate)
        const weekKey = toDateKey(weekStart)
        const dayKey = toDateKey(observedDate)
        return {
          ...card,
          observedAtTs,
          weekKey,
          dayKey,
        }
      }),
    }))

    const allCards = normalizedColumns.flatMap((c) => c.cards)

    const weekKeys = Array.from(new Set(allCards.map((card) => card.weekKey))).sort((a, b) =>
      a > b ? -1 : 1,
    )

    const weeks = weekKeys.map((key) => ({
      key,
      label: buildWeekLabel(key),
    }))

    return {
      ...board,
      columns: normalizedColumns,
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
      const latest = timeAwareBoard.weeks[0]?.key || ""
      setSelectedWeekKey(latest)
      setSelectedDayKey("all")
    }
  }, [timeAwareBoard, selectedWeekKey])

  const daysOfSelectedWeek = useMemo(() => {
    if (!selectedWeekKey) return []

    const weekStart = new Date(`${selectedWeekKey}T00:00:00`)
    const cards = timeAwareBoard?.columns?.flatMap((c) => c.cards) || []

    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + idx)
      const key = toDateKey(date)
      const count = cards.filter((card) => card.weekKey === selectedWeekKey && card.dayKey === key).length
      return {
        key,
        label: DAY_LABELS[idx],
        count,
      }
    })
  }, [selectedWeekKey, timeAwareBoard])

  useEffect(() => {
    if (selectedDayKey === "all") return
    if (!daysOfSelectedWeek.some((d) => d.key === selectedDayKey)) {
      setSelectedDayKey("all")
    }
  }, [daysOfSelectedWeek, selectedDayKey])

  const filteredColumns = useMemo(() => {
    const columns = timeAwareBoard?.columns || []
    if (!selectedWeekKey) return columns

    return columns.map((column) => ({
      ...column,
      cards: (column.cards || []).filter((card) => {
        const inWeek = card.weekKey === selectedWeekKey
        const inDay = selectedDayKey === "all" || card.dayKey === selectedDayKey
        return inWeek && inDay
      }),
    }))
  }, [timeAwareBoard, selectedWeekKey, selectedDayKey])

  const filteredCardCount = useMemo(
    () => filteredColumns.reduce((acc, column) => acc + column.cards.length, 0),
    [filteredColumns],
  )

  const handleClose = () => navigate(-1)

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osLayoutStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>
              <span>Kanban Autonomo</span>
            </h1>
            <div className={styles.headerActions}>
              <button
                className={styles.headerBtnIcon}
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                title="Atualizar analise"
              >
                <RefreshIcon style={{ width: 16, height: 16 }} />
                <span>{refreshMutation.isPending ? "Atualizando" : "Atualizar"}</span>
              </button>
              <button className={styles.headerBtnIcon}>
                <SearchIcon style={{ width: 16, height: 16 }} />
                <span>Memoria</span>
              </button>
            </div>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

        <div className={styles.mainContent}>
          <div className={styles.topFilters}>
            <input
              className={styles.searchInput}
              placeholder="Buscar contexto na memoria do agente (minimo 3 caracteres)..."
              value={memoryQuery}
              onChange={(e) => setMemoryQuery(e.target.value)}
            />

            {timeAwareBoard?.weeks?.length > 0 && (
              <>
                <WeekSelector
                  weeks={timeAwareBoard.weeks}
                  selectedWeekKey={selectedWeekKey}
                  onSelectWeek={(weekKey) => {
                    setSelectedWeekKey(weekKey)
                    setSelectedDayKey("all")
                  }}
                />
                <DaySelector
                  days={daysOfSelectedWeek}
                  selectedDayKey={selectedDayKey}
                  onSelectDay={setSelectedDayKey}
                />
              </>
            )}

            {memoryQueryResult.data?.length > 0 && (
              <div className={styles.searchResults}>
                {memoryQueryResult.data.map((item) => (
                  <div key={item.id} className={styles.searchResultItem}>
                    <strong>{item.filePath}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {boardQuery.isLoading ? (
            <div className={styles.loadingState}>Carregando analise autonoma...</div>
          ) : (
            <>
              <div className={styles.boardWrap}>
                <div className={styles.board}>
                  {filteredColumns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      onCreateCard={handleOpenCreate}
                      onEditCard={handleOpenEdit}
                      onDeleteCard={handleDeleteCard}
                      onToggleDone={handleToggleDone}
                      onDragStart={setDraggingCardId}
                      onDrop={handleDrop}
                    />
                  ))}
                </div>
              </div>
              <div className={styles.boardStats}>
                <span>Runs analisadas: {timeAwareBoard?.stats?.runsAnalyzed ?? 0}</span>
                <span>Cards no recorte: {filteredCardCount}</span>
                <span>
                  Ultima atualizacao: {timeAwareBoard?.generatedAt ? new Date(timeAwareBoard.generatedAt).toLocaleString() : "-"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {modalMode && (
        <CardModal
          mode={modalMode}
          initialData={modalMode === "edit" ? modalCard : null}
          columnId={modalColumnId}
          onSave={handleModalSave}
          onCancel={handleModalCancel}
        />
      )}

      <Navigation />
    </div>
  )
}

export default Kanban
export const Component = Kanban
