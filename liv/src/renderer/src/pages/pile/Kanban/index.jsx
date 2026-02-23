import styles from "./Kanban.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import { CrossIcon, PlusIcon, RefreshIcon, EditIcon, TrashIcon } from "renderer/icons"

const CheckIcon = (props) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
import { useMemo, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { usePilesContext } from "renderer/context/PilesContext"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { tipcClient } from "renderer/lib/tipc-client"
import Navigation from "../Navigation"

// --- Card Modal (Create / Edit) ---

function CardModal({ mode, initialData, onSave, onCancel }) {
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

// --- Board Modal (Create / Edit board) ---

function BoardModal({ mode, initialData, onSave, onCancel }) {
  const [name, setName] = useState(initialData?.name || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [color, setColor] = useState(initialData?.color || "#3b82f6")

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>
          {mode === "create" ? "Novo Board" : "Editar Board"}
        </h3>
        <form onSubmit={handleSubmit}>
          <label className={styles.modalLabel}>
            Nome
            <input
              className={styles.modalInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do board"
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
            Cor
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: "var(--secondary)" }}>{color}</span>
            </div>
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalBtnCancel} onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalBtnSave} disabled={!name.trim()}>
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
          <span className={styles.tagLabel}>{Math.round((card.confidence || 0) * 100)}%</span>
        </div>
        <div className={styles.cardActions}>
          <button
            className={`${styles.cardActionBtn} ${isDone ? styles.cardActionBtnActive : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleDone(card.id, isDone ? "open" : "done") }}
            title={isDone ? "Reabrir" : "Concluir"}
          >
            <CheckIcon style={{ width: 13, height: 13 }} />
          </button>
          <button
            className={styles.cardActionBtn}
            onClick={(e) => { e.stopPropagation(); onEdit(card) }}
            title="Editar"
          >
            <EditIcon style={{ width: 13, height: 13 }} />
          </button>
          <button
            className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`}
            onClick={(e) => { e.stopPropagation(); onDelete(card.id) }}
            title="Excluir"
          >
            <TrashIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Kanban Column ---

function KanbanColumn({ column, boardId, onCreateCard, onEditCard, onDeleteCard, onToggleDone, onDragStart, onDrop }) {
  const [dragOver, setDragOver] = useState(false)

  const getColumnIcon = (icon, color) => {
    switch (icon) {
      case "lightbulb":
        return (
          <svg className={styles.columnIconSvg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.9V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.1A7 7 0 0 1 12 2z" />
          </svg>
        )
      case "circle":
        return <span className={styles.columnIconCircle} style={{ borderColor: color }} />
      case "target":
        return (
          <svg className={styles.columnIconSvg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )
      default:
        return <span className={styles.columnIconCircle} style={{ borderColor: color }} />
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
            onClick={() => onCreateCard(boardId, column.id)}
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
      <div className={styles.cardList}>
        {column.cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            columnColor={column.color}
            onEdit={(c) => onEditCard(boardId, c)}
            onDelete={(cId) => onDeleteCard(boardId, cId)}
            onToggleDone={(cId, status) => onToggleDone(boardId, cId, status)}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  )
}

// --- Board Panel ---

function BoardPanel({ board, onCreateCard, onEditCard, onDeleteCard, onToggleDone, onDrop, onEditBoard, onDeleteBoard, onAddColumn }) {
  const [draggingCardId, setDraggingCardId] = useState(null)
  const totalCards = board.columns.reduce((sum, col) => sum + col.cards.length, 0)

  return (
    <div className={styles.boardPanel}>
      <div className={styles.boardPanelHeader}>
        <div className={styles.boardAccent} style={{ background: board.color || "#6b7280" }} />
        <div className={styles.boardPanelTitleRow}>
          <h2 className={styles.boardPanelName}>{board.name}</h2>
          <span className={styles.boardPanelCardCount}>{totalCards} cards</span>
          {board.createdBy === "system" && (
            <span className={styles.systemBadge}>system</span>
          )}
          <div className={styles.boardPanelActions}>
            <button
              className={styles.boardPanelActionBtn}
              onClick={() => onEditBoard(board)}
              title="Editar board"
            >
              <EditIcon style={{ width: 13, height: 13 }} />
            </button>
            {board.id !== "auto-analysis" && (
              <button
                className={`${styles.boardPanelActionBtn} ${styles.boardPanelActionBtnDanger}`}
                onClick={() => onDeleteBoard(board.id)}
                title="Excluir board"
              >
                <TrashIcon style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>
        </div>
        {board.description && (
          <p className={styles.boardPanelDesc}>{board.description}</p>
        )}
      </div>
      <div className={styles.boardPanelBody}>
        {board.columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            boardId={board.id}
            onCreateCard={onCreateCard}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onToggleDone={onToggleDone}
            onDragStart={setDraggingCardId}
            onDrop={(cardId, colId) => onDrop(board.id, cardId, colId)}
          />
        ))}
      </div>
      <div className={styles.boardPanelFooter}>
        <button className={styles.addColumnBtn} onClick={() => onAddColumn(board.id)}>
          <PlusIcon style={{ width: 14, height: 14 }} />
          <span>Coluna</span>
        </button>
      </div>
    </div>
  )
}

// --- Main Kanban Page ---

function Kanban() {
  const { currentTheme } = usePilesContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Card modal state
  const [cardModalMode, setCardModalMode] = useState(null) // null | "create" | "edit"
  const [cardModalBoardId, setCardModalBoardId] = useState(null)
  const [cardModalColumnId, setCardModalColumnId] = useState(null)
  const [cardModalCard, setCardModalCard] = useState(null)

  // Board modal state
  const [boardModalMode, setBoardModalMode] = useState(null) // null | "create" | "edit"
  const [boardModalData, setBoardModalData] = useState(null)

  const themeStyles = useMemo(() => (currentTheme ? `${currentTheme}Theme` : ""), [currentTheme])
  const isMac = window.electron?.isMac
  const osLayoutStyles = isMac ? layoutStyles.macOS : layoutStyles.windows

  const QUERY_KEY = ["kanban-workspace"]

  const workspaceQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => tipcClient.getKanbanWorkspace(),
    refetchInterval: 30000,
  })

  const refreshMutation = useMutation({
    mutationFn: () => tipcClient.refreshAutonomousKanban(),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const createBoardMutation = useMutation({
    mutationFn: (params) => tipcClient.createKanbanBoard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const updateBoardMutation = useMutation({
    mutationFn: (params) => tipcClient.updateKanbanBoard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const deleteBoardMutation = useMutation({
    mutationFn: (params) => tipcClient.deleteKanbanBoard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const createColumnMutation = useMutation({
    mutationFn: (params) => tipcClient.createKanbanColumn(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const createCardMutation = useMutation({
    mutationFn: (params) => tipcClient.createKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const updateCardMutation = useMutation({
    mutationFn: (params) => tipcClient.updateKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const deleteCardMutation = useMutation({
    mutationFn: (params) => tipcClient.deleteKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  const moveCardMutation = useMutation({
    mutationFn: (params) => tipcClient.moveKanbanCard(params),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  // --- Card CRUD handlers ---

  const handleOpenCreateCard = useCallback((boardId, columnId) => {
    setCardModalMode("create")
    setCardModalBoardId(boardId)
    setCardModalColumnId(columnId)
    setCardModalCard(null)
  }, [])

  const handleOpenEditCard = useCallback((boardId, card) => {
    setCardModalMode("edit")
    setCardModalBoardId(boardId)
    setCardModalCard(card)
    setCardModalColumnId(null)
  }, [])

  const handleCardModalSave = useCallback((data) => {
    if (cardModalMode === "create" && cardModalColumnId) {
      createCardMutation.mutate({ boardId: cardModalBoardId, columnId: cardModalColumnId, ...data })
    } else if (cardModalMode === "edit" && cardModalCard) {
      updateCardMutation.mutate({ boardId: cardModalBoardId, cardId: cardModalCard.id, updates: data })
    }
    setCardModalMode(null)
    setCardModalCard(null)
    setCardModalColumnId(null)
    setCardModalBoardId(null)
  }, [cardModalMode, cardModalColumnId, cardModalBoardId, cardModalCard, createCardMutation, updateCardMutation])

  const handleCardModalCancel = useCallback(() => {
    setCardModalMode(null)
    setCardModalCard(null)
    setCardModalColumnId(null)
    setCardModalBoardId(null)
  }, [])

  const handleDeleteCard = useCallback((boardId, cardId) => {
    if (window.confirm("Excluir este card?")) {
      deleteCardMutation.mutate({ boardId, cardId })
    }
  }, [deleteCardMutation])

  const handleToggleDone = useCallback((boardId, cardId, newStatus) => {
    updateCardMutation.mutate({ boardId, cardId, updates: { status: newStatus } })
  }, [updateCardMutation])

  const handleDrop = useCallback((boardId, cardId, toColumnId) => {
    moveCardMutation.mutate({ boardId, cardId, toColumnId })
  }, [moveCardMutation])

  // --- Board CRUD handlers ---

  const handleOpenCreateBoard = useCallback(() => {
    setBoardModalMode("create")
    setBoardModalData(null)
  }, [])

  const handleOpenEditBoard = useCallback((board) => {
    setBoardModalMode("edit")
    setBoardModalData(board)
  }, [])

  const handleBoardModalSave = useCallback((data) => {
    if (boardModalMode === "create") {
      createBoardMutation.mutate(data)
    } else if (boardModalMode === "edit" && boardModalData) {
      updateBoardMutation.mutate({ boardId: boardModalData.id, updates: data })
    }
    setBoardModalMode(null)
    setBoardModalData(null)
  }, [boardModalMode, boardModalData, createBoardMutation, updateBoardMutation])

  const handleBoardModalCancel = useCallback(() => {
    setBoardModalMode(null)
    setBoardModalData(null)
  }, [])

  const handleDeleteBoard = useCallback((boardId) => {
    if (window.confirm("Excluir este board? Todos os cards serao perdidos.")) {
      deleteBoardMutation.mutate({ boardId })
    }
  }, [deleteBoardMutation])

  const handleAddColumn = useCallback((boardId) => {
    const title = window.prompt("Nome da nova coluna:")
    if (title?.trim()) {
      createColumnMutation.mutate({ boardId, title: title.trim() })
    }
  }, [createColumnMutation])

  const handleClose = () => navigate(-1)

  const boards = workspaceQuery.data?.boards || []
  const totalCards = boards.reduce((sum, b) => sum + b.columns.reduce((s, c) => s + c.cards.length, 0), 0)

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osLayoutStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>
              <span>Workspace</span>
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
              <button className={styles.headerBtnIcon} onClick={handleOpenCreateBoard}>
                <PlusIcon style={{ width: 16, height: 16 }} />
                <span>Novo Board</span>
              </button>
            </div>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

        <div className={styles.mainContent}>
          {workspaceQuery.isLoading ? (
            <div className={styles.loadingState}>Carregando workspace...</div>
          ) : (
            <>
              <div className={styles.boardStrip}>
                {boards.map((board) => (
                  <BoardPanel
                    key={board.id}
                    board={board}
                    onCreateCard={handleOpenCreateCard}
                    onEditCard={handleOpenEditCard}
                    onDeleteCard={handleDeleteCard}
                    onToggleDone={handleToggleDone}
                    onDrop={handleDrop}
                    onEditBoard={handleOpenEditBoard}
                    onDeleteBoard={handleDeleteBoard}
                    onAddColumn={handleAddColumn}
                  />
                ))}
                <div className={styles.newBoardCard} onClick={handleOpenCreateBoard}>
                  <PlusIcon style={{ width: 20, height: 20 }} />
                  <span>Novo Board</span>
                </div>
              </div>
              <div className={styles.boardStats}>
                <span>Boards: {boards.length}</span>
                <span>Total cards: {totalCards}</span>
                <span>
                  Ultima atualizacao: {workspaceQuery.data?.updatedAt ? new Date(workspaceQuery.data.updatedAt).toLocaleString() : "-"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {cardModalMode && (
        <CardModal
          mode={cardModalMode}
          initialData={cardModalMode === "edit" ? cardModalCard : null}
          onSave={handleCardModalSave}
          onCancel={handleCardModalCancel}
        />
      )}

      {boardModalMode && (
        <BoardModal
          mode={boardModalMode}
          initialData={boardModalMode === "edit" ? boardModalData : null}
          onSave={handleBoardModalSave}
          onCancel={handleBoardModalCancel}
        />
      )}

      <Navigation />
    </div>
  )
}

export default Kanban
export const Component = Kanban
