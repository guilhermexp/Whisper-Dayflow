import fs from "fs"
import path from "path"
import crypto from "crypto"
import { configStore, recordingsFolder } from "../config"
import { logger } from "../logger"
import type {
  AutoJournalActivity,
  AutoJournalRun,
  AutonomousProfileBoard,
  AutonomousProfileCard,
  AutonomousProfileWidget,
  AutonomousProfileWidgetId,
} from "../../shared/types"
import {
  initializeAutonomousMemory,
  writeAutonomousMemory,
  getAutonomousMemoryPaths,
} from "./autonomous-memory-service"

const AUTO_AGENT_DIR = path.join(recordingsFolder, "auto-agent")
const PROFILE_BOARD_FILE = path.join(AUTO_AGENT_DIR, "profile-board.json")
const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")

const AVAILABLE_WIDGETS: AutonomousProfileWidget[] = [
  {
    id: "work_time_daily",
    title: "Tempo de trabalho por dia",
    description: "Mede carga diária de atividades e blocos produtivos.",
  },
  {
    id: "parallelism",
    title: "Multitarefa e contexto",
    description: "Monitora quantas coisas você toca ao mesmo tempo.",
  },
  {
    id: "engagement_topics",
    title: "Temas de maior engajamento",
    description: "Detecta assuntos recorrentes com maior tração.",
  },
  {
    id: "meeting_suggestions",
    title: "Reuniões sugeridas",
    description: "Identifica alinhamentos que podem destravar pendências.",
  },
  {
    id: "top_projects",
    title: "Projetos mais ativos",
    description: "Ranqueia frentes com maior concentração de tempo.",
  },
  {
    id: "top_people",
    title: "Pessoas com mais interação",
    description: "Infere contatos recorrentes a partir do diário de atividades.",
  },
  {
    id: "business_opportunities",
    title: "Oportunidades de negócio",
    description: "Aponta sinais comerciais e de produto para priorização.",
  },
  {
    id: "focus_risks",
    title: "Riscos de foco e energia",
    description: "Mostra distrações e quedas de ritmo com sugestões práticas.",
  },
]

const DEFAULT_WIDGETS: AutonomousProfileWidgetId[] = AVAILABLE_WIDGETS.map(
  (widget) => widget.id,
)

const PROJECT_STOP_WORDS = new Set([
  "ajuste",
  "analise",
  "analises",
  "atividade",
  "atividades",
  "base",
  "check",
  "daily",
  "deploy",
  "depois",
  "detalhe",
  "dia",
  "email",
  "execucao",
  "follow",
  "followup",
  "geral",
  "hoje",
  "issue",
  "item",
  "itens",
  "nota",
  "proxima",
  "review",
  "revisao",
  "run",
  "sessao",
  "setup",
  "status",
  "task",
  "tarefas",
  "tempo",
  "teste",
  "update",
  "work",
])

const PERSON_STOP_WORDS = new Set([
  "A",
  "Ao",
  "As",
  "Com",
  "Da",
  "Das",
  "De",
  "Do",
  "Dos",
  "E",
  "Ela",
  "Ele",
  "Em",
  "Essa",
  "Esse",
  "Esta",
  "Eu",
  "Foi",
  "Hoje",
  "Na",
  "Nas",
  "No",
  "Nos",
  "O",
  "Os",
  "Para",
  "Por",
  "Que",
  "Seu",
  "Sua",
  "The",
  "Um",
  "Uma",
  "You",
])

let running = false
let lastGeneratedAt: number | null = null

const nowIso = () => new Date().toISOString()

const hashId = (value: string) =>
  crypto.createHash("sha1").update(value).digest("hex").slice(0, 12)

const clampConfidence = (value: number) =>
  Math.max(0.35, Math.min(0.99, value))

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const formatMinutes = (minutes: number) =>
  `${Math.max(0, Math.round(minutes))}min`

const formatRatioPercent = (ratio: number) =>
  `${(Math.max(0, ratio) * 100).toFixed(1)}%`

const parseRun = (value: string): AutoJournalRun | null => {
  try {
    const parsed = JSON.parse(value) as AutoJournalRun
    if (!parsed || parsed.status !== "success" || !parsed.summary) return null
    return parsed
  } catch {
    return null
  }
}

const loadRuns = (limit = 240): AutoJournalRun[] => {
  if (!fs.existsSync(RUNS_DIR)) return []

  return fs
    .readdirSync(RUNS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => Number(b.replace(".json", "")) - Number(a.replace(".json", "")))
    .slice(0, limit)
    .map((name) => parseRun(fs.readFileSync(path.join(RUNS_DIR, name), "utf8")))
    .filter((item): item is AutoJournalRun => Boolean(item))
}

const getEnabledWidgets = (): AutonomousProfileWidgetId[] => {
  const configured = configStore.get().profileWidgetsEnabled || DEFAULT_WIDGETS
  const allowed = new Set(AVAILABLE_WIDGETS.map((widget) => widget.id))
  const valid = configured.filter((id): id is AutonomousProfileWidgetId =>
    allowed.has(id),
  )
  return valid.length > 0 ? valid : DEFAULT_WIDGETS
}

const pushCard = (
  cards: AutonomousProfileCard[],
  card: Omit<AutonomousProfileCard, "id" | "createdAt" | "updatedAt">,
) => {
  cards.push({
    ...card,
    id: `${card.widgetId}-${hashId(`${card.title}-${card.observedAt || Date.now()}`)}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
}

const matchAny = (text: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(text))

const computeRatios = (activities: AutoJournalActivity[]) => {
  const total = Math.max(1, activities.length)
  const work = activities.filter((activity) => activity.category === "Work").length
  const distraction = activities.filter(
    (activity) => activity.category === "Distraction",
  ).length
  const idle = activities.filter((activity) => activity.category === "Idle").length

  return {
    workRatio: work / total,
    distractionRatio: distraction / total,
    idleRatio: idle / total,
  }
}

const extractProjects = (activities: AutoJournalActivity[]) => {
  const projectMap = new Map<string, { name: string; count: number }>()
  for (const activity of activities) {
    const tokens = normalizeText(activity.title)
      .split(" ")
      .filter((token) => token.length >= 4 && !PROJECT_STOP_WORDS.has(token))
      .slice(0, 3)

    if (tokens.length === 0) continue
    const key = tokens.join(" ")
    const prev = projectMap.get(key)
    if (prev) {
      prev.count += 1
    } else {
      projectMap.set(key, {
        name: tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" "),
        count: 1,
      })
    }
  }

  return Array.from(projectMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

const extractPeople = (activities: AutoJournalActivity[]) => {
  const personRegex = /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{2,})\b/g
  const peopleMap = new Map<string, number>()

  for (const activity of activities) {
    const joined = `${activity.title} ${activity.summary}`
    const matches = joined.match(personRegex) || []
    for (const candidate of matches) {
      if (PERSON_STOP_WORDS.has(candidate)) continue
      peopleMap.set(candidate, (peopleMap.get(candidate) || 0) + 1)
    }
  }

  return Array.from(peopleMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))
}

const getCategoryMinutesByDay = (activities: AutoJournalActivity[]) => {
  const byDay = new Map<string, { total: number; work: number }>()
  for (const activity of activities) {
    const start = activity.startTs || activity.endTs
    const end = activity.endTs || start
    const durationMin = Math.max(0, (end - start) / (1000 * 60))
    const dateKey = new Date(end).toISOString().slice(0, 10)
    const prev = byDay.get(dateKey) || { total: 0, work: 0 }
    prev.total += durationMin
    if (activity.category === "Work") prev.work += durationMin
    byDay.set(dateKey, prev)
  }
  return byDay
}

const buildCards = (
  runs: AutoJournalRun[],
  enabledWidgets: AutonomousProfileWidgetId[],
): AutonomousProfileCard[] => {
  const cards: AutonomousProfileCard[] = []
  const enabledSet = new Set(enabledWidgets)
  const activities = runs.flatMap((run) => run.summary?.activities || [])
  const latestRunAt = runs[0]?.finishedAt ?? Date.now()
  const runIds = runs.slice(0, 10).map((run) => run.id)

  if (activities.length === 0) {
    pushCard(cards, {
      widgetId: "work_time_daily",
      kind: "wellbeing",
      title: "Ainda sem dados suficientes",
      summary:
        "O agente precisa de mais execuções do auto-journal para montar widgets confiáveis.",
      actions: [
        "Mantenha o auto-journal ativo por alguns dias",
        "Grave sessões reais de trabalho e rotina pessoal",
      ],
      confidence: 0.38,
      impact: "medium",
      sourceRunIds: runIds,
      observedAt: latestRunAt,
    })
    return cards
  }

  const { workRatio, distractionRatio, idleRatio } = computeRatios(activities)
  const averageContextSwitches =
    runs.reduce(
      (acc, run) => acc + Math.max(0, (run.summary?.activities?.length || 0) - 1),
      0,
    ) / Math.max(1, runs.length)
  const averageParallelActivities =
    runs.reduce((acc, run) => acc + (run.summary?.activities?.length || 0), 0) /
    Math.max(1, runs.length)

  if (enabledSet.has("work_time_daily")) {
    const dayEntries = Array.from(getCategoryMinutesByDay(activities).entries())
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .slice(0, 7)
    const avgDailyWorkMinutes =
      dayEntries.reduce((acc, [, day]) => acc + day.work, 0) /
      Math.max(1, dayEntries.length)
    pushCard(cards, {
      widgetId: "work_time_daily",
      kind: "strength",
      title: "Carga diária de trabalho",
      summary: `Média de ${formatMinutes(avgDailyWorkMinutes)} por dia focado em atividades de trabalho no período recente.`,
      actions: [
        "Manter metas diárias por bloco para preservar constância",
        "Revisar dias abaixo da média para entender gargalos",
      ],
      confidence: clampConfidence(0.58 + workRatio * 0.35),
      impact: "high",
      sourceRunIds: runIds,
      observedAt: latestRunAt,
    })
  }

  if (enabledSet.has("parallelism")) {
    pushCard(cards, {
      widgetId: "parallelism",
      kind: averageContextSwitches >= 2.2 ? "risk" : "strength",
      title: "Paralelismo e troca de contexto",
      summary: `Você está tocando em média ${averageParallelActivities.toFixed(1)} frentes por run, com ${averageContextSwitches.toFixed(1)} trocas de contexto.`,
      actions: [
        "Agrupar tarefas similares para reduzir fricção cognitiva",
        "Usar blocos fechados por objetivo antes de alternar de frente",
      ],
      confidence: clampConfidence(0.52 + Math.min(0.35, averageContextSwitches / 6)),
      impact: averageContextSwitches >= 2.2 ? "high" : "medium",
      sourceRunIds: runIds,
      observedAt: latestRunAt,
    })
  }

  if (enabledSet.has("engagement_topics")) {
    const topicMap = new Map<string, number>()
    for (const activity of activities) {
      const key = normalizeText(activity.title).split(" ").slice(0, 5).join(" ")
      if (!key) continue
      topicMap.set(key, (topicMap.get(key) || 0) + 1)
    }
    const topTopics = Array.from(topicMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    if (topTopics.length > 0) {
      const topicList = topTopics
        .map(([topic]) => topic.charAt(0).toUpperCase() + topic.slice(1))
        .join(", ")
      pushCard(cards, {
        widgetId: "engagement_topics",
        kind: "strength",
        title: "Temas de maior engajamento",
        summary: `Os temas com maior recorrência foram: ${topicList}.`,
        actions: [
          "Transformar os temas mais recorrentes em objetivos semanais",
          "Separar backlog de melhorias por tema dominante",
        ],
        confidence: clampConfidence(0.55 + Math.min(0.3, topTopics[0][1] * 0.05)),
        impact: "medium",
        sourceRunIds: runIds,
        observedAt: latestRunAt,
      })
    }
  }

  if (enabledSet.has("meeting_suggestions")) {
    const meetingPatterns = [
      /meet|meeting|reuniao|alinhamento|call|zoom|google meet|sync/i,
    ]
    const meetingActivities = activities.filter((activity) =>
      matchAny(`${activity.title} ${activity.summary}`, meetingPatterns),
    )

    if (meetingActivities.length > 0) {
      const latestMeeting = meetingActivities
        .slice()
        .sort((a, b) => (b.endTs || 0) - (a.endTs || 0))[0]
      pushCard(cards, {
        widgetId: "meeting_suggestions",
        kind: "meeting",
        title: "Reuniões sugeridas para destravar",
        summary:
          "Seu padrão mostra necessidade de alinhamentos curtos e frequentes para remover bloqueios.",
        actions: [
          "Agendar 1:1 semanal de prioridades e impedimentos",
          "Criar review de 20min para pendências com dependência externa",
        ],
        confidence: clampConfidence(
          0.56 + Math.min(0.3, meetingActivities.length * 0.04),
        ),
        impact: "medium",
        sourceRunIds: runIds,
        observedAt: latestMeeting?.endTs || latestRunAt,
      })
    }
  }

  if (enabledSet.has("top_projects")) {
    const topProjects = extractProjects(activities)
    if (topProjects.length > 0) {
      pushCard(cards, {
        widgetId: "top_projects",
        kind: "opportunity",
        title: "Projetos com maior esforço",
        summary: topProjects
          .slice(0, 3)
          .map((item) => `${item.name} (${item.count})`)
          .join(" | "),
        actions: [
          "Definir prioridade explícita para os 2 projetos principais",
          "Delegar ou adiar itens fora da trilha principal",
        ],
        confidence: clampConfidence(0.55 + Math.min(0.3, topProjects[0].count * 0.05)),
        impact: "high",
        sourceRunIds: runIds,
        observedAt: latestRunAt,
      })
    }
  }

  if (enabledSet.has("top_people")) {
    const topPeople = extractPeople(activities)
    if (topPeople.length > 0) {
      pushCard(cards, {
        widgetId: "top_people",
        kind: "meeting",
        title: "Pessoas com maior interação",
        summary: topPeople
          .slice(0, 4)
          .map((person) => `${person.name} (${person.count})`)
          .join(" | "),
        actions: [
          "Consolidar alinhamentos com os contatos mais frequentes",
          "Criar rotina de follow-up para decisões pendentes",
        ],
        confidence: clampConfidence(0.52 + Math.min(0.28, topPeople[0].count * 0.04)),
        impact: "medium",
        sourceRunIds: runIds,
        observedAt: latestRunAt,
      })
    }
  }

  if (enabledSet.has("business_opportunities")) {
    const businessSignals = [
      /cliente|proposal|proposta|venda|sales|partnership|parceria|produto|feature|lancamento|pitch/i,
    ]
    const businessRelated = activities.filter((activity) =>
      matchAny(`${activity.title} ${activity.summary}`, businessSignals),
    )

    if (businessRelated.length > 0) {
      pushCard(cards, {
        widgetId: "business_opportunities",
        kind: "business",
        title: "Sinais de oportunidade de negócio",
        summary:
          "Existe recorrência de temas comerciais/produto; vale consolidar oportunidades em pipeline.",
        actions: [
          "Criar lista semanal de oportunidades com valor estimado",
          "Separar bloco fixo para follow-up comercial e parcerias",
        ],
        confidence: clampConfidence(
          0.54 + Math.min(0.32, businessRelated.length * 0.04),
        ),
        impact: "high",
        sourceRunIds: runIds,
        observedAt: latestRunAt,
      })
    }
  }

  if (enabledSet.has("focus_risks")) {
    pushCard(cards, {
      widgetId: "focus_risks",
      kind: distractionRatio >= 0.2 || idleRatio >= 0.18 ? "risk" : "wellbeing",
      title: "Riscos de foco e energia",
      summary: `Distração ${formatRatioPercent(distractionRatio)} | Idle ${formatRatioPercent(idleRatio)} | Work ${formatRatioPercent(workRatio)}.`,
      actions: [
        "Criar blocos de foco de 45min com pausa curta planejada",
        "Definir regra de captura rápida para interrupções recorrentes",
      ],
      confidence: clampConfidence(
        0.5 + Math.min(0.4, distractionRatio + idleRatio + workRatio * 0.2),
      ),
      impact: distractionRatio >= 0.2 ? "high" : "medium",
      sourceRunIds: runIds,
      observedAt: latestRunAt,
    })
  }

  if (cards.length < 3) {
    pushCard(cards, {
      widgetId: enabledWidgets[0] || "work_time_daily",
      kind: "wellbeing",
      title: "Revisão semanal recomendada",
      summary:
        "Ainda há poucos sinais fortes; manter coleta e revisar os widgets ativos semanalmente.",
      actions: [
        "Revisar o que avançou, travou e foi adiado",
        "Definir 3 prioridades objetivas para a próxima semana",
      ],
      confidence: 0.58,
      impact: "medium",
      sourceRunIds: runIds,
      observedAt: latestRunAt,
    })
  }

  return cards.slice(0, 24)
}

const persistBoard = (board: AutonomousProfileBoard) => {
  fs.mkdirSync(AUTO_AGENT_DIR, { recursive: true })
  fs.writeFileSync(PROFILE_BOARD_FILE, JSON.stringify(board, null, 2), "utf8")
}

const loadPersistedBoard = (): AutonomousProfileBoard | null => {
  if (!fs.existsSync(PROFILE_BOARD_FILE)) return null
  try {
    return JSON.parse(
      fs.readFileSync(PROFILE_BOARD_FILE, "utf8"),
    ) as AutonomousProfileBoard
  } catch {
    return null
  }
}

export async function refreshAutonomousProfile(): Promise<AutonomousProfileBoard> {
  if (running) {
    const persisted = loadPersistedBoard()
    if (persisted) return persisted
  }

  running = true
  try {
    await initializeAutonomousMemory()
    const enabledWidgets = getEnabledWidgets()
    const runs = loadRuns(240)
    const activities = runs.flatMap((run) => run.summary?.activities || [])
    const cards = buildCards(runs, enabledWidgets)
    const ratios = computeRatios(activities)
    const averageContextSwitches =
      runs.reduce(
        (acc, run) => acc + Math.max(0, (run.summary?.activities?.length || 0) - 1),
        0,
      ) / Math.max(1, runs.length)

    const board: AutonomousProfileBoard = {
      generatedAt: Date.now(),
      availableWidgets: AVAILABLE_WIDGETS,
      enabledWidgets,
      cards,
      stats: {
        runsAnalyzed: runs.length,
        cardsGenerated: cards.length,
        lastRunAt: runs[0]?.finishedAt ?? null,
        workRatio: ratios.workRatio,
        distractionRatio: ratios.distractionRatio,
        idleRatio: ratios.idleRatio,
        averageContextSwitches,
      },
    }

    persistBoard(board)
    lastGeneratedAt = board.generatedAt

    await writeAutonomousMemory(
      `Perfil autônomo atualizado com ${cards.length} widgets/cards e ${runs.length} runs analisadas.`,
    )

    if (cards.length > 0) {
      await writeAutonomousMemory(`Insight durável de perfil: ${cards[0].title}.`, {
        persistent: true,
        section: "Profile Signals",
      })
    }

    return board
  } finally {
    running = false
  }
}

export async function getAutonomousProfileBoard(): Promise<AutonomousProfileBoard> {
  const persisted = loadPersistedBoard()
  if (
    persisted &&
    Array.isArray(persisted.cards) &&
    Array.isArray(persisted.availableWidgets) &&
    Array.isArray(persisted.enabledWidgets)
  ) {
    return persisted
  }
  return refreshAutonomousProfile()
}

export function getAutonomousProfileStatus() {
  const memoryPaths = getAutonomousMemoryPaths()
  return {
    running,
    lastGeneratedAt,
    boardPath: PROFILE_BOARD_FILE,
    memoryPaths,
  }
}
