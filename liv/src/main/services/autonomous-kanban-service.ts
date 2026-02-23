import fs from "fs"
import path from "path"
import crypto from "crypto"
import { recordingsFolder, dataFolder } from "../config"
import { logger } from "../logger"
import type {
  AutoJournalRun,
  AutonomousKanbanBoard,
  AutonomousKanbanCard,
  AutonomousKanbanColumn,
  KanbanWorkspace,
} from "../../shared/types"
import {
  initializeAutonomousMemory,
  writeAutonomousMemory,
  searchAutonomousMemory,
  getAutonomousMemoryPaths,
  buildAutonomousPromptContext,
} from "./autonomous-memory-service"
import { loadKanbanAutomationConfig } from "./automation-workspace-config"

const AUTO_AGENT_DIR = path.join(recordingsFolder, "auto-agent")
const BOARD_FILE = path.join(AUTO_AGENT_DIR, "kanban-board.json")
const WORKSPACE_FILE = path.join(AUTO_AGENT_DIR, "kanban-workspace.json")
const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")

const AUTO_ANALYSIS_ID = "auto-analysis"

let inFlightRefresh: Promise<KanbanWorkspace> | null = null
let lastGeneratedAt: number | null = null

const hashId = (value: string) => crypto.createHash("sha1").update(value).digest("hex").slice(0, 12)

const nowIso = () => new Date().toISOString()

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const titleKey = (title: string) => {
  const stopWords = new Set([
    "de", "da", "do", "e", "o", "a", "em", "para", "com", "na", "no", "the", "and", "to", "for", "on", "in", "of",
  ])

  const tokens = normalizeText(title)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token))

  return tokens.slice(0, 8).join(" ")
}

const toRun = (value: string): AutoJournalRun | null => {
  try {
    const parsed = JSON.parse(value) as AutoJournalRun
    if (!parsed || parsed.status !== "success" || !parsed.summary) return null
    return parsed
  } catch {
    return null
  }
}

const loadRuns = (limit = 200): AutoJournalRun[] => {
  if (!fs.existsSync(RUNS_DIR)) return []

  const files = fs
    .readdirSync(RUNS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => Number(b.replace(".json", "")) - Number(a.replace(".json", "")))
    .slice(0, limit)

  const runs = files
    .map((file) => toRun(fs.readFileSync(path.join(RUNS_DIR, file), "utf8")))
    .filter((item): item is AutoJournalRun => Boolean(item))

  return runs
}

const safeRegex = (pattern: string): RegExp | null => {
  try {
    return new RegExp(pattern, "i")
  } catch {
    return null
  }
}

const parsePendingSignal = (text: string, patterns: string[]) => {
  const compiled = patterns
    .map((pattern) => safeRegex(pattern))
    .filter((value): value is RegExp => Boolean(value))
  return compiled.some((pattern) => pattern.test(text))
}

const buildPendingCards = (
  runs: AutoJournalRun[],
  config: ReturnType<typeof loadKanbanAutomationConfig>,
): AutonomousKanbanCard[] => {
  const map = new Map<string, { title: string; mentions: number; lastSeen: number; runIds: string[]; summaries: string[] }>()
  const pendingPatterns = [
    ...config.pendingPatterns,
    config.pendingIntentPattern,
  ]
  const highlightMatches = new Set(
    config.highlightDoLaterValues.map((item) => item.toLowerCase().trim()),
  )

  for (const run of runs) {
    const activities = run.summary?.activities || []
    for (const activity of activities) {
      const highlight = (run.summary?.highlight || "").toLowerCase().trim()
      const signal =
        parsePendingSignal(`${activity.title} ${activity.summary}`, pendingPatterns) ||
        highlightMatches.has(highlight)
      if (!signal) continue

      const key = titleKey(activity.title)
      if (!key) continue

      const prev = map.get(key)
      if (prev) {
        prev.mentions += 1
        prev.lastSeen = Math.max(prev.lastSeen, activity.endTs || run.finishedAt)
        prev.runIds.push(run.id)
        prev.summaries.push(activity.summary)
      } else {
        map.set(key, {
          title: activity.title,
          mentions: 1,
          lastSeen: activity.endTs || run.finishedAt,
          runIds: [run.id],
          summaries: [activity.summary],
        })
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, config.limits.pendingCards)
    .map((item) => ({
      id: `pending-${hashId(item.title + item.lastSeen)}`,
      title: item.title,
      lane: "pending",
      description: item.summaries[0] || null,
      bullets: [
        `Mencionado ${item.mentions}x no período recente`,
        `Última detecção: ${new Date(item.lastSeen).toLocaleString()}`,
      ],
      confidence: Math.min(0.98, 0.45 + item.mentions * 0.12),
      status: "open" as const,
      sourceRunIds: Array.from(new Set(item.runIds)).slice(0, 6),
      observedAt: item.lastSeen,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }))
}

const buildSuggestionCards = (
  runs: AutoJournalRun[],
  config: ReturnType<typeof loadKanbanAutomationConfig>,
): AutonomousKanbanCard[] => {
  const activities = runs.flatMap((run) => run.summary?.activities || [])
  if (activities.length === 0) return []

  const distractionCount = activities.filter((a) => a.category === "Distraction").length
  const idleCount = activities.filter((a) => a.category === "Idle").length
  const workCount = activities.filter((a) => a.category === "Work").length
  const personalCount = activities.filter((a) => a.category === "Personal").length

  const total = activities.length
  const distractionRatio = distractionCount / total
  const idleRatio = idleCount / total
  const contextSwitches = runs.reduce((acc, run) => acc + Math.max(0, (run.summary?.activities?.length || 0) - 1), 0)
  const averageSwitches = contextSwitches / Math.max(1, runs.length)

  const cards: AutonomousKanbanCard[] = []

  if (distractionRatio >= config.thresholds.distractionRatio) {
    cards.push({
      id: `suggest-${hashId("reduce-distraction")}`,
      title: "Reduzir blocos de distração com foco protegido",
      lane: "suggestions",
      description: "A janela recente mostra recorrência de distrações durante blocos produtivos.",
      bullets: [
        `Distração em ${(distractionRatio * 100).toFixed(1)}% das atividades`,
        "Criar blocos de foco de 45min com bloqueio de notificações",
      ],
      confidence: 0.86,
      status: "open",
      sourceRunIds: runs.slice(0, 6).map((run) => run.id),
      observedAt: runs[0]?.finishedAt ?? Date.now(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  if (averageSwitches >= config.thresholds.averageContextSwitches) {
    cards.push({
      id: `suggest-${hashId("context-switch")}`,
      title: "Diminuir troca de contexto por sessão",
      lane: "suggestions",
      description: "Muitas transições curtas indicam fragmentação de atenção.",
      bullets: [
        `Média de ${averageSwitches.toFixed(1)} trocas de contexto por run`,
        "Agrupar tarefas similares no mesmo período",
      ],
      confidence: 0.82,
      status: "open",
      sourceRunIds: runs.slice(0, 6).map((run) => run.id),
      observedAt: runs[0]?.finishedAt ?? Date.now(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  if (idleRatio >= config.thresholds.idleRatio && workCount > 0) {
    cards.push({
      id: `suggest-${hashId("idle-balance")}`,
      title: "Revisar pausas para manter ritmo estável",
      lane: "suggestions",
      description: "Há blocos ociosos frequentes entre tarefas importantes.",
      bullets: [
        `Idle em ${(idleRatio * 100).toFixed(1)}% das atividades`,
        "Usar pausas curtas planejadas entre blocos de execução",
      ],
      confidence: 0.68,
      status: "open",
      sourceRunIds: runs.slice(0, 6).map((run) => run.id),
      observedAt: runs[0]?.finishedAt ?? Date.now(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  if (cards.length === 0) {
    cards.push({
      id: `suggest-${hashId("stable-routine")}`,
      title: "Rotina estável no período monitorado",
      lane: "suggestions",
      description: "Nenhum desvio forte detectado. Seguir com revisão semanal.",
      bullets: [
        `Work ${workCount} | Personal ${personalCount} | Distração ${distractionCount}`,
        "Manter checkpoint diário para validar tendência",
      ],
      confidence: 0.61,
      status: "open",
      sourceRunIds: runs.slice(0, 6).map((run) => run.id),
      observedAt: runs[0]?.finishedAt ?? Date.now(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  return cards.slice(0, config.limits.suggestionCards)
}

const buildAutomationCards = (
  runs: AutoJournalRun[],
  config: ReturnType<typeof loadKanbanAutomationConfig>,
): AutonomousKanbanCard[] => {
  const patternMap = new Map<string, { title: string; count: number; runIds: string[]; lastSeen: number }>()

  for (const run of runs) {
    for (const activity of run.summary?.activities || []) {
      const key = titleKey(activity.title)
      if (!key) continue
      const prev = patternMap.get(key)
      if (prev) {
        prev.count += 1
        prev.runIds.push(run.id)
        prev.lastSeen = Math.max(prev.lastSeen, activity.endTs)
      } else {
        patternMap.set(key, {
          title: activity.title,
          count: 1,
          runIds: [run.id],
          lastSeen: activity.endTs,
        })
      }
    }
  }

  const repetitive = Array.from(patternMap.values())
    .filter((item) => item.count >= config.thresholds.repetitiveActivityCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, config.limits.automationCards)

  const cards = repetitive.map((item) => {
    const normalized = normalizeText(item.title)
    let automationIdea = "Criar pipeline para atualizar checklist e registrar progresso automaticamente"

    for (const rule of config.automationIdeaRules) {
      const pattern = safeRegex(rule.match)
      if (pattern?.test(normalized)) {
        automationIdea = rule.idea
        break
      }
    }

    return {
      id: `automation-${hashId(item.title + item.count)}`,
      title: `Automatizar: ${item.title}`,
      lane: "automations",
      description: automationIdea,
      bullets: [
        `Padrão repetido ${item.count}x`,
        `Última ocorrência: ${new Date(item.lastSeen).toLocaleString()}`,
      ],
      confidence: Math.min(0.97, 0.55 + item.count * 0.08),
      status: "open" as const,
      sourceRunIds: Array.from(new Set(item.runIds)).slice(0, 8),
      observedAt: item.lastSeen,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } satisfies AutonomousKanbanCard
  })

  return cards.slice(0, config.limits.automationCards)
}

const buildColumns = (cards: AutonomousKanbanCard[]): AutonomousKanbanColumn[] => {
  const byLane = (lane: string) =>
    cards.filter((card) => card.lane === lane).sort((a, b) => b.confidence - a.confidence)

  return [
    {
      id: "pending",
      title: "Pendentes",
      icon: "target",
      color: "#f97316",
      cards: byLane("pending"),
    },
    {
      id: "suggestions",
      title: "Sugestões",
      icon: "lightbulb",
      color: "#fbbf24",
      cards: byLane("suggestions"),
    },
    {
      id: "automations",
      title: "Automações",
      icon: "circle",
      color: "#22c55e",
      cards: byLane("automations"),
    },
  ]
}

// ---------------------------------------------------------------------------
// Workspace persistence
// ---------------------------------------------------------------------------

const persistWorkspace = (ws: KanbanWorkspace) => {
  fs.mkdirSync(AUTO_AGENT_DIR, { recursive: true })
  ws.updatedAt = nowIso()
  fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(ws, null, 2), "utf8")
}

const loadWorkspace = (): KanbanWorkspace | null => {
  if (!fs.existsSync(WORKSPACE_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(WORKSPACE_FILE, "utf8")) as KanbanWorkspace
  } catch {
    return null
  }
}

/** Migrate old kanban-board.json into workspace format */
const migrateIfNeeded = (): KanbanWorkspace | null => {
  if (fs.existsSync(WORKSPACE_FILE)) return loadWorkspace()

  // Check for old board file
  if (!fs.existsSync(BOARD_FILE)) return null

  try {
    const oldBoard = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8")) as Record<string, unknown>
    const board: AutonomousKanbanBoard = {
      id: AUTO_ANALYSIS_ID,
      name: "Analise Autonoma",
      description: "Board gerado automaticamente a partir das runs do auto-journal",
      icon: "target",
      color: "#f97316",
      createdBy: "system",
      generatedAt: (oldBoard.generatedAt as number) || Date.now(),
      columns: (oldBoard.columns as AutonomousKanbanColumn[]) || [],
      stats: (oldBoard.stats as AutonomousKanbanBoard["stats"]) || {
        runsAnalyzed: 0,
        cardsGenerated: 0,
        lastRunAt: null,
      },
    }

    const ws: KanbanWorkspace = {
      version: 2,
      boards: [board],
      updatedAt: nowIso(),
    }

    persistWorkspace(ws)
    logger.info("[KanbanService] Migrated kanban-board.json → kanban-workspace.json")
    return ws
  } catch (err) {
    logger.error("[KanbanService] Migration failed:", err)
    return null
  }
}

const emptyWorkspace = (): KanbanWorkspace => ({
  version: 2,
  boards: [],
  updatedAt: nowIso(),
})

const findBoard = (ws: KanbanWorkspace, boardId: string): AutonomousKanbanBoard | undefined =>
  ws.boards.find((b) => b.id === boardId)

const findCardAcrossBoards = (ws: KanbanWorkspace, cardId: string, boardId?: string) => {
  const searchBoards = boardId ? ws.boards.filter((b) => b.id === boardId) : ws.boards
  for (const board of searchBoards) {
    for (const column of board.columns) {
      const idx = column.cards.findIndex((c) => c.id === cardId)
      if (idx !== -1) return { board, column, idx }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Workspace-level CRUD
// ---------------------------------------------------------------------------

async function loadAndMutateWorkspace(
  mutator: (ws: KanbanWorkspace) => void,
): Promise<KanbanWorkspace> {
  let ws = loadWorkspace() || migrateIfNeeded()
  if (!ws) {
    ws = emptyWorkspace()
  }
  mutator(ws)
  persistWorkspace(ws)
  return ws
}

// ---------------------------------------------------------------------------
// Board refresh (auto-analysis only)
// ---------------------------------------------------------------------------

export async function refreshAutonomousKanban(): Promise<KanbanWorkspace> {
  if (inFlightRefresh) {
    return inFlightRefresh
  }

  const doRefresh = async (): Promise<KanbanWorkspace> => {
    try {
      // Preserve manually created cards from auto-analysis board
      const ws = loadWorkspace() || migrateIfNeeded() || emptyWorkspace()
      const existingBoard = findBoard(ws, AUTO_ANALYSIS_ID)
      const manualCards: AutonomousKanbanCard[] = []
      if (existingBoard) {
        for (const column of existingBoard.columns) {
          for (const card of column.cards) {
            if (card.id.startsWith("manual-")) {
              manualCards.push(card)
            }
          }
        }
      }

      await initializeAutonomousMemory()
      const config = loadKanbanAutomationConfig()
      const runs = loadRuns(config.limits.runsWindow)

      const pending = buildPendingCards(runs, config)
      const suggestions = buildSuggestionCards(runs, config)
      const automations = buildAutomationCards(runs, config)

      const cards = [...pending, ...suggestions, ...automations]

      const board: AutonomousKanbanBoard = {
        id: AUTO_ANALYSIS_ID,
        name: "Analise Autonoma",
        description: "Board gerado automaticamente a partir das runs do auto-journal",
        icon: "target",
        color: "#f97316",
        createdBy: "system",
        generatedAt: Date.now(),
        columns: buildColumns(cards),
        stats: {
          runsAnalyzed: runs.length,
          cardsGenerated: cards.length + manualCards.length,
          lastRunAt: runs[0]?.finishedAt ?? null,
        },
      }

      // Re-insert manual cards into their respective columns
      for (const manual of manualCards) {
        const column = board.columns.find((c) => c.id === manual.lane)
        if (column) {
          column.cards.unshift(manual)
        } else {
          const pendingCol = board.columns.find((c) => c.id === "pending")
          if (pendingCol) pendingCol.cards.unshift(manual)
        }
      }

      // Update or insert the auto-analysis board in workspace
      const boardIdx = ws.boards.findIndex((b) => b.id === AUTO_ANALYSIS_ID)
      if (boardIdx >= 0) {
        ws.boards[boardIdx] = board
      } else {
        ws.boards.unshift(board)
      }

      persistWorkspace(ws)
      lastGeneratedAt = board.generatedAt

      const summaryLine = `Kanban autônomo atualizado com ${cards.length} cards (${pending.length} pendentes, ${suggestions.length} sugestões, ${automations.length} automações).`
      await writeAutonomousMemory(summaryLine)

      if (automations.length > 0) {
        await writeAutonomousMemory(
          `Padrão durável detectado: ${automations[0].title}.`,
          { persistent: true, section: "Stable Patterns" },
        )
      }

      // Write summary to nanobot workspace for agent context
      try {
        const nanobotMemoryDir = path.join(dataFolder, "nanobot-workspace", "memory")
        if (fs.existsSync(nanobotMemoryDir)) {
          const summaryPath = path.join(nanobotMemoryDir, "KANBAN_SUMMARY.md")
          const lines = [`# Kanban Summary (${new Date().toISOString()})`, ""]
          for (const b of ws.boards) {
            lines.push(`## Board: ${b.name} (${b.id})`)
            for (const col of b.columns) {
              lines.push(`### ${col.title} (${col.cards.length})`)
              for (const card of col.cards.slice(0, 10)) {
                lines.push(`- [${card.status}] ${card.title}`)
              }
            }
            lines.push("")
          }
          fs.writeFileSync(summaryPath, lines.join("\n"), "utf-8")
        }
      } catch {
        // Nanobot workspace may not exist yet
      }

      return ws
    } finally {
      inFlightRefresh = null
    }
  }

  inFlightRefresh = doRefresh()
  return inFlightRefresh
}

// ---------------------------------------------------------------------------
// Public getters
// ---------------------------------------------------------------------------

export async function getKanbanWorkspace(): Promise<KanbanWorkspace> {
  const ws = loadWorkspace() || migrateIfNeeded()
  if (ws) return ws
  return refreshAutonomousKanban()
}

/** Backward-compat: return just the auto-analysis board */
export async function getAutonomousKanbanBoard(): Promise<AutonomousKanbanBoard> {
  const ws = await getKanbanWorkspace()
  const board = findBoard(ws, AUTO_ANALYSIS_ID)
  if (board) return board

  // No auto-analysis board yet — trigger refresh
  const refreshed = await refreshAutonomousKanban()
  return findBoard(refreshed, AUTO_ANALYSIS_ID)!
}

// ---------------------------------------------------------------------------
// Board CRUD
// ---------------------------------------------------------------------------

const DEFAULT_COLUMNS: Omit<AutonomousKanbanColumn, "cards">[] = [
  { id: "todo", title: "A Fazer", icon: "target", color: "#f97316" },
  { id: "doing", title: "Em Andamento", icon: "circle", color: "#3b82f6" },
  { id: "done", title: "Concluido", icon: "lightbulb", color: "#22c55e" },
]

export async function createKanbanBoard(data: {
  name: string
  description?: string
  icon?: string
  color?: string
  columns?: Array<{ id?: string; title: string; color?: string; icon?: string }>
  createdBy?: "agent" | "user" | "system"
}): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const boardId = hashId(data.name + Date.now())
    const columnsInput = data.columns && data.columns.length > 0 ? data.columns : DEFAULT_COLUMNS

    const columns: AutonomousKanbanColumn[] = columnsInput.map((col) => ({
      id: col.id || hashId(col.title + Date.now() + Math.random()),
      title: col.title,
      icon: col.icon || "circle",
      color: col.color || "#6b7280",
      cards: [],
    }))

    const board: AutonomousKanbanBoard = {
      id: boardId,
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      createdBy: data.createdBy || "user",
      generatedAt: Date.now(),
      columns,
      stats: { runsAnalyzed: 0, cardsGenerated: 0, lastRunAt: null },
    }

    ws.boards.push(board)
  })
}

export async function updateKanbanBoard(
  boardId: string,
  updates: { name?: string; description?: string; icon?: string; color?: string },
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const board = findBoard(ws, boardId)
    if (!board) throw new Error(`Board "${boardId}" not found`)
    if (updates.name !== undefined) board.name = updates.name
    if (updates.description !== undefined) board.description = updates.description
    if (updates.icon !== undefined) board.icon = updates.icon
    if (updates.color !== undefined) board.color = updates.color
  })
}

export async function deleteKanbanBoard(boardId: string): Promise<KanbanWorkspace> {
  if (boardId === AUTO_ANALYSIS_ID) {
    throw new Error("Cannot delete the auto-analysis board")
  }
  return loadAndMutateWorkspace((ws) => {
    const idx = ws.boards.findIndex((b) => b.id === boardId)
    if (idx < 0) throw new Error(`Board "${boardId}" not found`)
    ws.boards.splice(idx, 1)
  })
}

// ---------------------------------------------------------------------------
// Column CRUD
// ---------------------------------------------------------------------------

export async function createKanbanColumn(
  boardId: string,
  data: { title: string; color?: string; icon?: string },
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const board = findBoard(ws, boardId)
    if (!board) throw new Error(`Board "${boardId}" not found`)

    const column: AutonomousKanbanColumn = {
      id: hashId(data.title + Date.now()),
      title: data.title,
      icon: data.icon || "circle",
      color: data.color || "#6b7280",
      cards: [],
    }

    board.columns.push(column)
  })
}

export async function deleteKanbanColumn(
  boardId: string,
  columnId: string,
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const board = findBoard(ws, boardId)
    if (!board) throw new Error(`Board "${boardId}" not found`)

    const idx = board.columns.findIndex((c) => c.id === columnId)
    if (idx < 0) throw new Error(`Column "${columnId}" not found in board "${boardId}"`)

    board.columns.splice(idx, 1)
  })
}

// ---------------------------------------------------------------------------
// Card CRUD (workspace-scoped)
// ---------------------------------------------------------------------------

export async function createKanbanCard(
  columnId: string,
  data: { title: string; description?: string; bullets?: string[] },
  boardId: string = AUTO_ANALYSIS_ID,
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const board = findBoard(ws, boardId)
    if (!board) throw new Error(`Board "${boardId}" not found`)

    const column = board.columns.find((c) => c.id === columnId)
    if (!column) throw new Error(`Column "${columnId}" not found in board "${boardId}"`)

    const card: AutonomousKanbanCard = {
      id: `manual-${hashId(data.title + Date.now())}`,
      title: data.title,
      lane: column.id,
      description: data.description || null,
      bullets: data.bullets || [],
      confidence: 1.0,
      status: "open",
      sourceRunIds: [],
      observedAt: Date.now(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }

    column.cards.unshift(card)
  })
}

export async function updateKanbanCard(
  cardId: string,
  updates: {
    title?: string
    description?: string
    bullets?: string[]
    status?: "open" | "done"
    lane?: string
  },
  boardId?: string,
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const found = findCardAcrossBoards(ws, cardId, boardId)
    if (!found) throw new Error(`Card "${cardId}" not found`)

    const card = found.column.cards[found.idx]

    if (updates.title !== undefined) card.title = updates.title
    if (updates.description !== undefined) card.description = updates.description || null
    if (updates.bullets !== undefined) card.bullets = updates.bullets
    if (updates.status !== undefined) card.status = updates.status
    card.updatedAt = nowIso()

    // Move to different column if lane changed
    if (updates.lane && updates.lane !== found.column.id) {
      const targetColumn = found.board.columns.find((c) => c.id === updates.lane)
      if (targetColumn) {
        found.column.cards.splice(found.idx, 1)
        card.lane = updates.lane
        targetColumn.cards.unshift(card)
      }
    }
  })
}

export async function deleteKanbanCard(
  cardId: string,
  boardId?: string,
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const found = findCardAcrossBoards(ws, cardId, boardId)
    if (!found) throw new Error(`Card "${cardId}" not found`)
    found.column.cards.splice(found.idx, 1)
  })
}

export async function moveKanbanCard(
  cardId: string,
  toColumnId: string,
  position?: number,
  boardId?: string,
): Promise<KanbanWorkspace> {
  return loadAndMutateWorkspace((ws) => {
    const found = findCardAcrossBoards(ws, cardId, boardId)
    if (!found) throw new Error(`Card "${cardId}" not found`)

    const targetColumn = found.board.columns.find((c) => c.id === toColumnId)
    if (!targetColumn) throw new Error(`Column "${toColumnId}" not found`)

    const [card] = found.column.cards.splice(found.idx, 1)
    card.lane = targetColumn.id
    card.updatedAt = nowIso()

    const insertAt = position !== undefined ? Math.min(position, targetColumn.cards.length) : 0
    targetColumn.cards.splice(insertAt, 0, card)
  })
}

// ---------------------------------------------------------------------------
// Memory & status
// ---------------------------------------------------------------------------

export async function searchAutonomousKanbanMemory(query: string, maxResults = 6) {
  return searchAutonomousMemory(query, maxResults)
}

export async function getAutonomousPromptContext(query: string, maxResults = 4) {
  return buildAutonomousPromptContext(query, maxResults)
}

export function getAutonomousKanbanStatus() {
  const memoryPaths = getAutonomousMemoryPaths()
  return {
    running: inFlightRefresh !== null,
    lastGeneratedAt,
    boardPath: WORKSPACE_FILE,
    memoryPaths,
  }
}
