import fs from "fs"
import path from "path"
import { dataFolder } from "../config"
import { logger } from "../logger"

const LOG_PREFIX = "[AutomationWorkspace]"

const WORKSPACE_DIR = path.join(dataFolder, "nanobot-workspace")
const AUTOMATION_DIR = path.join(WORKSPACE_DIR, "automation")
const KANBAN_RULES_FILE = path.join(AUTOMATION_DIR, "kanban-rules.json")
const PROFILE_RULES_FILE = path.join(AUTOMATION_DIR, "profile-rules.json")
const README_FILE = path.join(AUTOMATION_DIR, "README.md")

export type KanbanAutomationConfig = {
  pendingPatterns: string[]
  pendingIntentPattern: string
  highlightDoLaterValues: string[]
  thresholds: {
    distractionRatio: number
    idleRatio: number
    averageContextSwitches: number
    repetitiveActivityCount: number
  }
  limits: {
    pendingCards: number
    suggestionCards: number
    automationCards: number
    runsWindow: number
  }
  automationIdeaRules: Array<{
    match: string
    idea: string
  }>
}

export type ProfileAutomationConfig = {
  thresholds: {
    highContextSwitches: number
    highDistractionRatio: number
    highIdleRatio: number
  }
  limits: {
    minimumCards: number
    runsWindow: number
  }
  patterns: {
    meeting: string[]
    business: string[]
  }
}

const DEFAULT_KANBAN_CONFIG: KanbanAutomationConfig = {
  pendingPatterns: [
    "\\b(preciso|pendente|falta|lembrar|revisar|finalizar|terminar|enviar|agendar|resolver|ajustar|corrigir|follow\\s?up|need to|todo|to do|remember to)\\b",
  ],
  pendingIntentPattern:
    "\\b(vou|devo)\\b.{0,40}\\b(fazer|revisar|enviar|agendar|ajustar|resolver)\\b",
  highlightDoLaterValues: ["Do later"],
  thresholds: {
    distractionRatio: 0.22,
    idleRatio: 0.2,
    averageContextSwitches: 2.3,
    repetitiveActivityCount: 3,
  },
  limits: {
    pendingCards: 20,
    suggestionCards: 8,
    automationCards: 10,
    runsWindow: 240,
  },
  automationIdeaRules: [
    {
      match: "email|inbox|gmail",
      idea: "Rodar triagem automática de e-mails e criar tarefas de follow-up",
    },
    {
      match: "zoom|meet|meeting|reuniao",
      idea: "Gerar resumo pós-reunião com próximos passos e responsáveis",
    },
    {
      match: "deploy|ci|build|release",
      idea: "Executar checklist de release automático com validações",
    },
    {
      match: "pesquisa|research|study|analise",
      idea: "Salvar insights da pesquisa e criar tarefas de execução",
    },
  ],
}

const DEFAULT_PROFILE_CONFIG: ProfileAutomationConfig = {
  thresholds: {
    highContextSwitches: 2.2,
    highDistractionRatio: 0.2,
    highIdleRatio: 0.18,
  },
  limits: {
    minimumCards: 3,
    runsWindow: 240,
  },
  patterns: {
    meeting: ["meet|meeting|reuniao|alinhamento|call|zoom|google meet|sync"],
    business: [
      "cliente|proposal|proposta|venda|sales|partnership|parceria|produto|feature|lancamento|pitch",
    ],
  },
}

const README_CONTENT = `# Automation Workspace

These files control autonomous heuristics used by Liv for Kanban/Profile generation.
They are intentionally editable by the agent at runtime.

Files:
- kanban-rules.json
- profile-rules.json
- ../jobs.json (cron jobs used by nanobot gateway)

Guidelines:
- Keep regex values as plain strings (without surrounding / /).
- After edits, trigger Kanban/Profile refresh to apply changes.
`

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
  } catch (error) {
    logger.warn(`${LOG_PREFIX} Failed to parse ${filePath}:`, error)
    return null
  }
}

function mergeKanbanConfig(input: unknown): KanbanAutomationConfig {
  if (!isObject(input)) return DEFAULT_KANBAN_CONFIG

  const pendingPatterns = Array.isArray(input.pendingPatterns)
    ? input.pendingPatterns.filter((item): item is string => typeof item === "string")
    : DEFAULT_KANBAN_CONFIG.pendingPatterns

  const pendingIntentPattern =
    typeof input.pendingIntentPattern === "string"
      ? input.pendingIntentPattern
      : DEFAULT_KANBAN_CONFIG.pendingIntentPattern

  const highlightDoLaterValues = Array.isArray(input.highlightDoLaterValues)
    ? input.highlightDoLaterValues.filter(
        (item): item is string => typeof item === "string",
      )
    : DEFAULT_KANBAN_CONFIG.highlightDoLaterValues

  const thresholdsInput = isObject(input.thresholds) ? input.thresholds : {}
  const limitsInput = isObject(input.limits) ? input.limits : {}

  const automationIdeaRules = Array.isArray(input.automationIdeaRules)
    ? input.automationIdeaRules
        .filter(
          (item): item is { match: string; idea: string } =>
            isObject(item) &&
            typeof item.match === "string" &&
            typeof item.idea === "string",
        )
        .slice(0, 24)
    : DEFAULT_KANBAN_CONFIG.automationIdeaRules

  return {
    pendingPatterns:
      pendingPatterns.length > 0
        ? pendingPatterns
        : DEFAULT_KANBAN_CONFIG.pendingPatterns,
    pendingIntentPattern,
    highlightDoLaterValues:
      highlightDoLaterValues.length > 0
        ? highlightDoLaterValues
        : DEFAULT_KANBAN_CONFIG.highlightDoLaterValues,
    thresholds: {
      distractionRatio:
        typeof thresholdsInput.distractionRatio === "number"
          ? thresholdsInput.distractionRatio
          : DEFAULT_KANBAN_CONFIG.thresholds.distractionRatio,
      idleRatio:
        typeof thresholdsInput.idleRatio === "number"
          ? thresholdsInput.idleRatio
          : DEFAULT_KANBAN_CONFIG.thresholds.idleRatio,
      averageContextSwitches:
        typeof thresholdsInput.averageContextSwitches === "number"
          ? thresholdsInput.averageContextSwitches
          : DEFAULT_KANBAN_CONFIG.thresholds.averageContextSwitches,
      repetitiveActivityCount:
        typeof thresholdsInput.repetitiveActivityCount === "number"
          ? Math.max(1, Math.floor(thresholdsInput.repetitiveActivityCount))
          : DEFAULT_KANBAN_CONFIG.thresholds.repetitiveActivityCount,
    },
    limits: {
      pendingCards:
        typeof limitsInput.pendingCards === "number"
          ? Math.max(1, Math.floor(limitsInput.pendingCards))
          : DEFAULT_KANBAN_CONFIG.limits.pendingCards,
      suggestionCards:
        typeof limitsInput.suggestionCards === "number"
          ? Math.max(1, Math.floor(limitsInput.suggestionCards))
          : DEFAULT_KANBAN_CONFIG.limits.suggestionCards,
      automationCards:
        typeof limitsInput.automationCards === "number"
          ? Math.max(1, Math.floor(limitsInput.automationCards))
          : DEFAULT_KANBAN_CONFIG.limits.automationCards,
      runsWindow:
        typeof limitsInput.runsWindow === "number"
          ? Math.max(10, Math.floor(limitsInput.runsWindow))
          : DEFAULT_KANBAN_CONFIG.limits.runsWindow,
    },
    automationIdeaRules:
      automationIdeaRules.length > 0
        ? automationIdeaRules
        : DEFAULT_KANBAN_CONFIG.automationIdeaRules,
  }
}

function mergeProfileConfig(input: unknown): ProfileAutomationConfig {
  if (!isObject(input)) return DEFAULT_PROFILE_CONFIG

  const thresholdsInput = isObject(input.thresholds) ? input.thresholds : {}
  const limitsInput = isObject(input.limits) ? input.limits : {}
  const patternsInput = isObject(input.patterns) ? input.patterns : {}

  const meetingPatterns = Array.isArray(patternsInput.meeting)
    ? patternsInput.meeting.filter((item): item is string => typeof item === "string")
    : DEFAULT_PROFILE_CONFIG.patterns.meeting
  const businessPatterns = Array.isArray(patternsInput.business)
    ? patternsInput.business.filter((item): item is string => typeof item === "string")
    : DEFAULT_PROFILE_CONFIG.patterns.business

  return {
    thresholds: {
      highContextSwitches:
        typeof thresholdsInput.highContextSwitches === "number"
          ? thresholdsInput.highContextSwitches
          : DEFAULT_PROFILE_CONFIG.thresholds.highContextSwitches,
      highDistractionRatio:
        typeof thresholdsInput.highDistractionRatio === "number"
          ? thresholdsInput.highDistractionRatio
          : DEFAULT_PROFILE_CONFIG.thresholds.highDistractionRatio,
      highIdleRatio:
        typeof thresholdsInput.highIdleRatio === "number"
          ? thresholdsInput.highIdleRatio
          : DEFAULT_PROFILE_CONFIG.thresholds.highIdleRatio,
    },
    limits: {
      minimumCards:
        typeof limitsInput.minimumCards === "number"
          ? Math.max(1, Math.floor(limitsInput.minimumCards))
          : DEFAULT_PROFILE_CONFIG.limits.minimumCards,
      runsWindow:
        typeof limitsInput.runsWindow === "number"
          ? Math.max(10, Math.floor(limitsInput.runsWindow))
          : DEFAULT_PROFILE_CONFIG.limits.runsWindow,
    },
    patterns: {
      meeting:
        meetingPatterns.length > 0
          ? meetingPatterns
          : DEFAULT_PROFILE_CONFIG.patterns.meeting,
      business:
        businessPatterns.length > 0
          ? businessPatterns
          : DEFAULT_PROFILE_CONFIG.patterns.business,
    },
  }
}

export function ensureAutomationWorkspaceFiles(): void {
  try {
    fs.mkdirSync(AUTOMATION_DIR, { recursive: true })

    if (!fs.existsSync(KANBAN_RULES_FILE)) {
      fs.writeFileSync(
        KANBAN_RULES_FILE,
        JSON.stringify(DEFAULT_KANBAN_CONFIG, null, 2),
        "utf8",
      )
    }
    if (!fs.existsSync(PROFILE_RULES_FILE)) {
      fs.writeFileSync(
        PROFILE_RULES_FILE,
        JSON.stringify(DEFAULT_PROFILE_CONFIG, null, 2),
        "utf8",
      )
    }
    if (!fs.existsSync(README_FILE)) {
      fs.writeFileSync(README_FILE, README_CONTENT, "utf8")
    }
  } catch (error) {
    logger.warn(`${LOG_PREFIX} Failed to ensure workspace automation files:`, error)
  }
}

export function loadKanbanAutomationConfig(): KanbanAutomationConfig {
  ensureAutomationWorkspaceFiles()
  const parsed = readJsonFile<unknown>(KANBAN_RULES_FILE)
  return mergeKanbanConfig(parsed)
}

export function loadProfileAutomationConfig(): ProfileAutomationConfig {
  ensureAutomationWorkspaceFiles()
  const parsed = readJsonFile<unknown>(PROFILE_RULES_FILE)
  return mergeProfileConfig(parsed)
}

export function getAutomationWorkspacePaths() {
  return {
    workspaceDir: WORKSPACE_DIR,
    automationDir: AUTOMATION_DIR,
    kanbanRulesPath: KANBAN_RULES_FILE,
    profileRulesPath: PROFILE_RULES_FILE,
    readmePath: README_FILE,
    cronJobsPath: path.join(WORKSPACE_DIR, "jobs.json"),
  }
}
