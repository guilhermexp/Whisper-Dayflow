import fs from "fs"
import path from "path"
import crypto from "crypto"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore, recordingsFolder } from "../config"
import { logWithContext } from "../logger"
import {
  getKey,
  getOpenrouterKey,
  getGeminiKey,
  getGroqKey,
  getCustomKey,
} from "../pile-utils/store"
import settings from "electron-settings"
import type {
  AutoJournalActivity,
  AutoJournalRun,
  DimensionScore,
  GoalProgress,
  LifeAnalysis,
  LifeContext,
  LifeDimension,
  LifeGoal,
  LifePrinciple,
  PrincipleViolation,
  WisdomEntry,
} from "../../shared/types"
import { writeAutonomousMemory } from "./autonomous-memory-service"

const log = logWithContext("LifeOS")

const AUTO_AGENT_DIR = path.join(recordingsFolder, "auto-agent")
const LIFE_CONTEXT_FILE = path.join(AUTO_AGENT_DIR, "life-context.json")
const LIFE_ANALYSIS_FILE = path.join(AUTO_AGENT_DIR, "life-analysis.json")
const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")

const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
const DEFAULT_CHAT_MODEL = "gpt-5.2"
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.2"

const hashId = (value: string) =>
  crypto.createHash("sha1").update(value).digest("hex").slice(0, 12)

const normalizePileProvider = (provider?: string) => {
  const supported = new Set(["openai", "openrouter", "ollama", "gemini", "groq", "custom"])
  if (provider === "subscription") return "openai"
  if (!provider || !supported.has(provider)) return "openai"
  return provider
}

const DEFAULT_DIMENSIONS: LifeDimension[] = [
  {
    id: hashId("carreira"),
    name: "Carreira",
    icon: "🏢",
    color: "#60a5fa",
    targetPercent: 35,
    description: "Trabalho, projetos profissionais, desenvolvimento de carreira",
    keywords: ["work", "trabalho", "projeto", "code", "dev", "meeting", "deploy", "client", "cliente"],
    createdAt: Date.now(),
  },
  {
    id: hashId("saude"),
    name: "Saude",
    icon: "💪",
    color: "#34d399",
    targetPercent: 20,
    description: "Exercicio, alimentacao, sono, bem-estar fisico",
    keywords: ["exercise", "gym", "academia", "correr", "saude", "health", "sleep", "dormir"],
    createdAt: Date.now(),
  },
  {
    id: hashId("relacionamentos"),
    name: "Relacionamentos",
    icon: "❤️",
    color: "#fb7185",
    targetPercent: 15,
    description: "Familia, amigos, comunidade, networking",
    keywords: ["familia", "amigo", "friend", "social", "call", "conversa", "jantar"],
    createdAt: Date.now(),
  },
  {
    id: hashId("aprendizado"),
    name: "Aprendizado",
    icon: "📚",
    color: "#a78bfa",
    targetPercent: 15,
    description: "Estudo, leitura, cursos, novas habilidades",
    keywords: ["study", "estudo", "curso", "leitura", "read", "book", "learn", "tutorial"],
    createdAt: Date.now(),
  },
  {
    id: hashId("criativo"),
    name: "Criativo",
    icon: "🎨",
    color: "#f59e0b",
    targetPercent: 10,
    description: "Arte, escrita, musica, projetos pessoais criativos",
    keywords: ["design", "arte", "escrita", "musica", "creative", "side project", "hobby"],
    createdAt: Date.now(),
  },
  {
    id: hashId("financeiro"),
    name: "Financeiro",
    icon: "💰",
    color: "#22d3ee",
    targetPercent: 5,
    description: "Investimentos, planejamento financeiro, receita",
    keywords: ["finance", "investimento", "dinheiro", "receita", "budget", "money", "revenue"],
    createdAt: Date.now(),
  },
]

function getDefaultLifeContext(): LifeContext {
  return {
    mission: "",
    dimensions: DEFAULT_DIMENSIONS,
    goals: [],
    principles: [],
    wisdom: [],
    updatedAt: Date.now(),
  }
}

function loadLifeContext(): LifeContext | null {
  if (!fs.existsSync(LIFE_CONTEXT_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(LIFE_CONTEXT_FILE, "utf8")) as LifeContext
  } catch {
    return null
  }
}

function saveLifeContext(context: LifeContext): void {
  fs.mkdirSync(AUTO_AGENT_DIR, { recursive: true })
  fs.writeFileSync(LIFE_CONTEXT_FILE, JSON.stringify(context, null, 2), "utf8")
}

function loadLifeAnalysis(): LifeAnalysis | null {
  if (!fs.existsSync(LIFE_ANALYSIS_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(LIFE_ANALYSIS_FILE, "utf8")) as LifeAnalysis
  } catch {
    return null
  }
}

function persistLifeAnalysis(analysis: LifeAnalysis): void {
  fs.mkdirSync(AUTO_AGENT_DIR, { recursive: true })
  fs.writeFileSync(LIFE_ANALYSIS_FILE, JSON.stringify(analysis, null, 2), "utf8")
}

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

// ===================== Classification =====================

function classifyActivityToDimension(
  activity: AutoJournalActivity,
  dimensions: LifeDimension[],
): string | null {
  if (activity.category === "Idle" || activity.category === "Distraction") return null

  const text = `${activity.title} ${activity.summary}`.toLowerCase()

  for (const dim of dimensions) {
    for (const kw of dim.keywords) {
      if (text.includes(kw.toLowerCase())) return dim.id
    }
  }

  // Fallback by category
  if (activity.category === "Work") {
    const careerDim = dimensions.find((d) =>
      d.keywords.some((k) => ["work", "trabalho", "projeto"].includes(k.toLowerCase())),
    )
    if (careerDim) return careerDim.id
  }

  return null
}

// ===================== Scoring =====================

function computeDimensionScores(
  activityMap: Map<string, AutoJournalActivity[]>,
  dimensions: LifeDimension[],
  totalClassified: number,
  prevScores?: DimensionScore[],
): DimensionScore[] {
  const prevMap = new Map<string, DimensionScore>()
  if (prevScores) {
    for (const s of prevScores) prevMap.set(s.dimensionId, s)
  }

  return dimensions.map((dim) => {
    const matched = activityMap.get(dim.id) || []
    const actualPercent = totalClassified > 0
      ? Math.round((matched.length / totalClassified) * 100)
      : 0
    const gap = actualPercent - dim.targetPercent

    let trend: "improving" | "stable" | "declining" = "stable"
    const prev = prevMap.get(dim.id)
    if (prev) {
      const prevGap = Math.abs(prev.gap)
      const currGap = Math.abs(gap)
      if (currGap < prevGap - 3) trend = "improving"
      else if (currGap > prevGap + 3) trend = "declining"
    }

    return {
      dimensionId: dim.id,
      actualPercent,
      targetPercent: dim.targetPercent,
      gap,
      trend,
      matchedActivities: matched.length,
    }
  })
}

function computeGoalProgress(
  goals: LifeGoal[],
  activityMap: Map<string, AutoJournalActivity[]>,
  runs: AutoJournalRun[],
  windowDays: number,
): GoalProgress[] {
  return goals
    .filter((g) => g.status === "active")
    .map((goal) => {
      const dimActivities = activityMap.get(goal.dimensionId) || []
      const goalKeywords = [
        ...goal.title.toLowerCase().split(/\s+/),
        ...goal.description.toLowerCase().split(/\s+/),
      ].filter((w) => w.length > 3)

      const matched: GoalProgress["matchedActivities"] = []
      for (const activity of dimActivities) {
        const actText = `${activity.title} ${activity.summary}`.toLowerCase()
        const hasMatch = goalKeywords.some((kw) => actText.includes(kw))
        if (hasMatch) {
          const run = runs.find((r) =>
            r.summary?.activities?.some(
              (a) => a.startTs === activity.startTs && a.endTs === activity.endTs,
            ),
          )
          matched.push({
            runId: run?.id || "unknown",
            activityTitle: activity.title,
            ts: activity.endTs || activity.startTs,
          })
        }
      }

      const velocityPerWeek = windowDays > 0
        ? (matched.length / windowDays) * 7
        : 0

      let status: GoalProgress["status"] = "stalled"
      if (velocityPerWeek >= 2) status = "on-track"
      else if (velocityPerWeek >= 0.5) status = "at-risk"

      return { goalId: goal.id, matchedActivities: matched, velocityPerWeek, status }
    })
}

function detectPrincipleViolations(
  principles: LifePrinciple[],
  activities: AutoJournalActivity[],
): PrincipleViolation[] {
  return principles
    .filter((p) => p.active)
    .map((principle) => {
      const violations: PrincipleViolation["violations"] = []
      const text = principle.text.toLowerCase()

      // Time-based: "nao trabalhar apos XXh" or "never work after XX"
      const timeMatch = text.match(/(?:apos|after|depois)\s*(?:das?)?\s*(\d{1,2})\s*(?:h|pm|:)/i)
      if (timeMatch) {
        const hour = parseInt(timeMatch[1], 10)
        const limitHour = hour <= 12 && text.includes("pm") ? hour + 12 : hour
        for (const a of activities) {
          if (a.category !== "Work") continue
          const endDate = new Date(a.endTs || a.startTs)
          if (endDate.getHours() >= limitHour) {
            violations.push({
              description: `Trabalho detectado as ${endDate.getHours()}:${String(endDate.getMinutes()).padStart(2, "0")}`,
              ts: a.endTs || a.startTs,
              activityTitle: a.title,
            })
          }
        }
      }

      // Frequency: "X vezes por semana"
      const freqMatch = text.match(/(\d+)\s*(?:vezes|times)\s*(?:por|per)\s*(?:semana|week)/i)
      if (freqMatch) {
        const target = parseInt(freqMatch[1], 10)
        const keywords = text
          .replace(freqMatch[0], "")
          .split(/\s+/)
          .filter((w) => w.length > 3)
        const matchCount = activities.filter((a) => {
          const aText = `${a.title} ${a.summary}`.toLowerCase()
          return keywords.some((kw) => aText.includes(kw))
        }).length
        if (matchCount < target) {
          violations.push({
            description: `Encontrado ${matchCount}x, meta era ${target}x/semana`,
            ts: Date.now(),
            activityTitle: "Frequencia insuficiente",
          })
        }
      }

      return { principleId: principle.id, violations }
    })
    .filter((pv) => pv.violations.length > 0)
}

function computeAlignmentScore(scores: DimensionScore[]): number {
  if (scores.length === 0) return 50
  const avgAbsGap = scores.reduce((acc, s) => acc + Math.abs(s.gap), 0) / scores.length
  return Math.max(0, Math.min(100, Math.round(100 - avgAbsGap)))
}

// ===================== LLM Synthesis =====================

const stripMarkdownCodeFences = (text: string) => {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()
  return trimmed
}

const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === "{") { depth += 1; continue }
    if (char === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

async function generateLifeSynthesis(
  context: LifeContext,
  alignmentScore: number,
  dimensionScores: DimensionScore[],
  goalProgress: GoalProgress[],
  principleViolations: PrincipleViolation[],
  recentActivities: AutoJournalActivity[],
): Promise<{ synthesis: string; suggestions: string[] }> {
  const dimSummary = dimensionScores
    .map((s) => {
      const dim = context.dimensions.find((d) => d.id === s.dimensionId)
      const status = Math.abs(s.gap) <= 5 ? "alinhado" : s.gap > 0 ? "acima" : "abaixo"
      return `- ${dim?.icon || "?"} ${dim?.name || s.dimensionId}: Meta ${s.targetPercent}% vs Real ${s.actualPercent}% (${status})`
    })
    .join("\n")

  const goalSummary = goalProgress
    .map((g) => {
      const goal = context.goals.find((gl) => gl.id === g.goalId)
      return `- "${goal?.title || g.goalId}": ${g.matchedActivities.length} atividades, ${g.velocityPerWeek.toFixed(1)}/sem, ${g.status}`
    })
    .join("\n") || "Nenhuma meta ativa"

  const violationSummary = principleViolations
    .map((pv) => {
      const p = context.principles.find((pr) => pr.id === pv.principleId)
      return `- "${p?.text || pv.principleId}": ${pv.violations.length} violacoes`
    })
    .join("\n") || "Nenhuma violacao detectada"

  const last20 = recentActivities
    .slice(0, 20)
    .map((a) => `- [${a.category || "?"}] ${a.title}`)
    .join("\n")

  const prompt = `Voce e um mentor sabio escrevendo uma carta semanal.

MISSAO: "${context.mission || "(nao definida)"}"

DIMENSOES (meta vs real):
${dimSummary}

SCORE GERAL: ${alignmentScore}%

METAS:
${goalSummary}

PRINCIPIOS VIOLADOS:
${violationSummary}

ATIVIDADES RECENTES:
${last20}

Escreva 3-4 paragrafos em PT-BR:
1. Reconheca o que funciona bem
2. Aponte desalinhamentos com honestidade
3. Encoraje e direcione

Retorne APENAS um JSON valido: { "synthesis": "...", "suggestions": ["...", "...", "..."] }
Nao use markdown fences ou texto extra.`

  try {
    const config = configStore.get()
    const pileAIProvider = (await settings.get("pileAIProvider")) as string | undefined
    const provider = normalizePileProvider(pileAIProvider)

    let rawResponse: string

    if (provider === "gemini") {
      const geminiApiKey = (await getGeminiKey()) || config.geminiApiKey
      if (!geminiApiKey) throw new Error("Gemini API key required")
      const gai = new GoogleGenerativeAI(geminiApiKey)
      const candidates = Array.from(
        new Set([config.geminiModel || DEFAULT_GEMINI_MODEL, ...FALLBACK_GEMINI_MODELS]),
      )
      let lastError: unknown = null
      rawResponse = ""
      for (const model of candidates) {
        try {
          const gModel = gai.getGenerativeModel({ model })
          const result = await gModel.generateContent([prompt], {
            baseUrl: config.geminiBaseUrl,
          })
          rawResponse = result.response.text()
          break
        } catch (error) {
          lastError = error
        }
      }
      if (!rawResponse && lastError) throw lastError
    } else {
      let apiKey: string | null = null
      let effectiveProvider = provider

      if (effectiveProvider === "openai") {
        apiKey = await getKey()
        if (!apiKey) {
          const orKey = await getOpenrouterKey()
          if (orKey) { apiKey = orKey; effectiveProvider = "openrouter" }
        }
      } else if (effectiveProvider === "openrouter") {
        apiKey = await getOpenrouterKey()
      } else if (effectiveProvider === "groq") {
        apiKey = (await getGroqKey()) || config.groqApiKey || null
      } else if (effectiveProvider === "custom") {
        apiKey = (await getCustomKey()) || config.customEnhancementApiKey || null
      }

      if (!apiKey) throw new Error(`${effectiveProvider} API key required for Life OS synthesis`)

      const settingsBaseUrl = (await settings.get("baseUrl")) as string | undefined
      const baseUrl =
        effectiveProvider === "custom"
          ? config.customEnhancementBaseUrl || "https://api.example.com/v1"
          : effectiveProvider === "openrouter"
            ? config.openrouterBaseUrl || "https://openrouter.ai/api/v1"
            : effectiveProvider === "groq"
              ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
              : settingsBaseUrl || "https://api.openai.com/v1"

      const settingsModel = (await settings.get("model")) as string | undefined
      const settingsORModel = (await settings.get("openrouterModel")) as string | undefined
      const model =
        effectiveProvider === "custom"
          ? config.customEnhancementModel || DEFAULT_CHAT_MODEL
          : effectiveProvider === "openrouter"
            ? settingsORModel || DEFAULT_OPENROUTER_MODEL
            : effectiveProvider === "groq"
              ? config.groqModel || "llama-3.1-70b-versatile"
              : settingsModel || DEFAULT_CHAT_MODEL

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          ...(effectiveProvider === "openai" || effectiveProvider === "groq"
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(model.startsWith("gpt-4o") || model.startsWith("gpt-5") || model.startsWith("o1") || model.startsWith("o3")
            ? { max_completion_tokens: 1500 }
            : { max_tokens: 1500 }),
          messages: [
            { role: "system", content: "Return only valid JSON with keys synthesis and suggestions. No markdown fences." },
            { role: "user", content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`LLM synthesis failed (${response.status}): ${text.slice(0, 300)}`)
      }

      const data = await response.json()
      rawResponse = data.choices?.[0]?.message?.content || ""
    }

    // Parse JSON from response
    const cleaned = stripMarkdownCodeFences(rawResponse)
    let parsed: any = null
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const embedded = extractFirstJsonObject(cleaned)
      if (embedded) parsed = JSON.parse(embedded)
    }

    if (parsed?.synthesis) {
      return {
        synthesis: parsed.synthesis,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      }
    }

    return { synthesis: rawResponse.slice(0, 2000), suggestions: [] }
  } catch (error) {
    log.error("LLM synthesis failed, returning quantitative data only", error)
    return {
      synthesis: `Score de alinhamento: ${alignmentScore}%. Analise quantitativa disponivel — configure um provedor de IA para receber a carta semanal completa.`,
      suggestions: ["Configure um provedor de IA nas configuracoes para receber sugestoes personalizadas"],
    }
  }
}

// ===================== Public API =====================

export async function getLifeContext(): Promise<LifeContext> {
  return loadLifeContext() || getDefaultLifeContext()
}

export async function updateLifeContext(context: LifeContext): Promise<LifeContext> {
  const validated: LifeContext = {
    mission: typeof context.mission === "string" ? context.mission : "",
    dimensions: Array.isArray(context.dimensions) ? context.dimensions : DEFAULT_DIMENSIONS,
    goals: Array.isArray(context.goals) ? context.goals : [],
    principles: Array.isArray(context.principles) ? context.principles : [],
    wisdom: Array.isArray(context.wisdom) ? context.wisdom : [],
    updatedAt: Date.now(),
  }
  saveLifeContext(validated)
  return validated
}

export async function getLifeAnalysis(): Promise<LifeAnalysis | null> {
  return loadLifeAnalysis()
}

export async function addWisdomEntry(entry: {
  text: string
  source: "manual" | "auto"
  sourceRunId?: string
}): Promise<WisdomEntry> {
  const context = await getLifeContext()
  const wisdom: WisdomEntry = {
    id: hashId(`${entry.text}-${Date.now()}`),
    text: entry.text,
    source: entry.source,
    sourceRunId: entry.sourceRunId,
    createdAt: Date.now(),
  }
  context.wisdom.push(wisdom)
  context.updatedAt = Date.now()
  saveLifeContext(context)
  return wisdom
}

export async function deleteWisdomEntry(entryId: string): Promise<void> {
  const context = await getLifeContext()
  context.wisdom = context.wisdom.filter((w) => w.id !== entryId)
  context.updatedAt = Date.now()
  saveLifeContext(context)
}

export async function refreshLifeAnalysis(windowDays = 14): Promise<LifeAnalysis> {
  const context = await getLifeContext()

  if (!context.dimensions.length) {
    const empty: LifeAnalysis = {
      generatedAt: Date.now(),
      windowDays,
      alignmentScore: 50,
      dimensionScores: [],
      goalProgress: [],
      principleViolations: [],
      synthesis: "Defina suas dimensoes de vida na aba MyLife para receber analises.",
      suggestions: [],
    }
    persistLifeAnalysis(empty)
    return empty
  }

  const runs = loadRuns(240)
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - windowMs
  const windowRuns = runs.filter((r) => r.finishedAt >= cutoff)
  const allActivities = windowRuns.flatMap((r) => r.summary?.activities || [])

  // Map activities to dimensions
  const activityMap = new Map<string, AutoJournalActivity[]>()
  let totalClassified = 0
  for (const activity of allActivities) {
    const dimId = classifyActivityToDimension(activity, context.dimensions)
    if (dimId) {
      const existing = activityMap.get(dimId) || []
      existing.push(activity)
      activityMap.set(dimId, existing)
      totalClassified++
    }
  }

  // Load previous analysis for trend comparison
  const prevAnalysis = loadLifeAnalysis()

  const dimensionScores = computeDimensionScores(
    activityMap,
    context.dimensions,
    totalClassified,
    prevAnalysis?.dimensionScores,
  )

  const goalProgress = computeGoalProgress(
    context.goals,
    activityMap,
    windowRuns,
    windowDays,
  )

  const principleViolations = detectPrincipleViolations(
    context.principles,
    allActivities,
  )

  const alignmentScore = computeAlignmentScore(dimensionScores)

  const { synthesis, suggestions } = await generateLifeSynthesis(
    context,
    alignmentScore,
    dimensionScores,
    goalProgress,
    principleViolations,
    allActivities,
  )

  const analysis: LifeAnalysis = {
    generatedAt: Date.now(),
    windowDays,
    alignmentScore,
    dimensionScores,
    goalProgress,
    principleViolations,
    synthesis,
    suggestions,
  }

  persistLifeAnalysis(analysis)

  await writeAutonomousMemory(
    `Life OS analysis: alignment ${alignmentScore}%, ${dimensionScores.length} dimensoes, ${goalProgress.length} metas tracked.`,
  ).catch(() => {})

  return analysis
}
