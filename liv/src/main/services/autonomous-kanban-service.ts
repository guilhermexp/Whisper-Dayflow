import fs from "fs"
import path from "path"
import crypto from "crypto"
import { recordingsFolder } from "../config"
import { logger } from "../logger"
import type { AutoJournalRun, AutonomousKanbanBoard, AutonomousKanbanCard, AutonomousKanbanColumn } from "../../shared/types"
import {
  initializeAutonomousMemory,
  writeAutonomousMemory,
  searchAutonomousMemory,
  getAutonomousMemoryPaths,
  buildAutonomousPromptContext,
} from "./autonomous-memory-service"

const AUTO_AGENT_DIR = path.join(recordingsFolder, "auto-agent")
const BOARD_FILE = path.join(AUTO_AGENT_DIR, "kanban-board.json")
const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")

let inFlightRefresh: Promise<AutonomousKanbanBoard> | null = null
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

const parsePendingSignal = (text: string) => {
  const patterns = [
    /\b(preciso|pendente|falta|lembrar|revisar|finalizar|terminar|enviar|agendar|resolver|ajustar|corrigir|follow\s?up|need to|todo|to do|remember to)\b/i,
    /\b(vou|devo)\b.{0,40}\b(fazer|revisar|enviar|agendar|ajustar|resolver)\b/i,
  ]

  return patterns.some((pattern) => pattern.test(text))
}

const buildPendingCards = (runs: AutoJournalRun[]): AutonomousKanbanCard[] => {
  const map = new Map<string, { title: string; mentions: number; lastSeen: number; runIds: string[]; summaries: string[] }>()

  for (const run of runs) {
    const activities = run.summary?.activities || []
    for (const activity of activities) {
      const signal = parsePendingSignal(`${activity.title} ${activity.summary}`) || run.summary?.highlight === "Do later"
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
    .slice(0, 20)
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
      status: "open",
      sourceRunIds: Array.from(new Set(item.runIds)).slice(0, 6),
      observedAt: item.lastSeen,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }))
}

const buildSuggestionCards = (runs: AutoJournalRun[]): AutonomousKanbanCard[] => {
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

  if (distractionRatio >= 0.22) {
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

  if (averageSwitches >= 2.3) {
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

  if (idleRatio >= 0.2 && workCount > 0) {
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

  return cards.slice(0, 8)
}

const buildAutomationCards = (runs: AutoJournalRun[]): AutonomousKanbanCard[] => {
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
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const cards = repetitive.map((item) => {
    const normalized = normalizeText(item.title)
    let automationIdea = "Criar pipeline para atualizar checklist e registrar progresso automaticamente"

    if (/email|inbox|gmail/.test(normalized)) {
      automationIdea = "Rodar triagem automática de e-mails e criar tarefas de follow-up"
    } else if (/zoom|meet|meeting|reuniao/.test(normalized)) {
      automationIdea = "Gerar resumo pós-reunião com próximos passos e responsáveis"
    } else if (/deploy|ci|build|release/.test(normalized)) {
      automationIdea = "Executar checklist de release automático com validações"
    } else if (/pesquisa|research|study|analise/.test(normalized)) {
      automationIdea = "Salvar insights da pesquisa e criar tarefas de execução"
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
      status: "open",
      sourceRunIds: Array.from(new Set(item.runIds)).slice(0, 8),
      observedAt: item.lastSeen,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } satisfies AutonomousKanbanCard
  })

  return cards.slice(0, 10)
}

const buildColumns = (cards: AutonomousKanbanCard[]): AutonomousKanbanColumn[] => {
  const byLane = (lane: AutonomousKanbanCard["lane"]) =>
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

const persistBoard = (board: AutonomousKanbanBoard) => {
  fs.mkdirSync(AUTO_AGENT_DIR, { recursive: true })
  fs.writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2), "utf8")
}

const loadPersistedBoard = (): AutonomousKanbanBoard | null => {
  if (!fs.existsSync(BOARD_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(BOARD_FILE, "utf8")) as AutonomousKanbanBoard
  } catch {
    return null
  }
}

export async function refreshAutonomousKanban(): Promise<AutonomousKanbanBoard> {
  if (inFlightRefresh) {
    return inFlightRefresh
  }

  const doRefresh = async (): Promise<AutonomousKanbanBoard> => {
    try {
      await initializeAutonomousMemory()
      const runs = loadRuns(240)

      const pending = buildPendingCards(runs)
      const suggestions = buildSuggestionCards(runs)
      const automations = buildAutomationCards(runs)

      const cards = [...pending, ...suggestions, ...automations]

      const board: AutonomousKanbanBoard = {
        generatedAt: Date.now(),
        columns: buildColumns(cards),
        stats: {
          runsAnalyzed: runs.length,
          cardsGenerated: cards.length,
          lastRunAt: runs[0]?.finishedAt ?? null,
        },
      }

      persistBoard(board)
      lastGeneratedAt = board.generatedAt

      const summaryLine = `Kanban autônomo atualizado com ${cards.length} cards (${pending.length} pendentes, ${suggestions.length} sugestões, ${automations.length} automações).`
      await writeAutonomousMemory(summaryLine)

      if (automations.length > 0) {
        await writeAutonomousMemory(
          `Padrão durável detectado: ${automations[0].title}.`,
          { persistent: true, section: "Stable Patterns" },
        )
      }

      return board
    } finally {
      inFlightRefresh = null
    }
  }

  inFlightRefresh = doRefresh()
  return inFlightRefresh
}

export async function getAutonomousKanbanBoard(): Promise<AutonomousKanbanBoard> {
  const persisted = loadPersistedBoard()
  if (persisted) return persisted
  return refreshAutonomousKanban()
}

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
    boardPath: BOARD_FILE,
    memoryPaths,
  }
}
