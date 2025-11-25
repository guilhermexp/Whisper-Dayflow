import fs from "fs"
import path from "path"
import matter from "gray-matter"
import type { AutoJournalActivity } from "../../shared/types"

export const buildNewPostPath = (pilePath: string, timestamp = new Date()) => {
  const yearFolder = String(timestamp.getFullYear())
  const fileName = [
    String(timestamp.getFullYear()).slice(-2),
    String(timestamp.getMonth() + 1).padStart(2, "0"),
    String(timestamp.getDate()).padStart(2, "0"),
    "-",
    String(timestamp.getHours()).padStart(2, "0"),
    String(timestamp.getMinutes()).padStart(2, "0"),
    String(timestamp.getSeconds()).padStart(2, "0"),
  ].join("")

  const monthShort = (date: Date) =>
    date.toLocaleString("default", { month: "short" })

  const relDir = path.join(yearFolder, monthShort(timestamp))
  const absDir = path.join(pilePath, relDir)
  const absPath = path.join(absDir, `${fileName}.md`)
  const relPath = path.join(relDir, `${fileName}.md`)
  return { absDir, absPath, relPath }
}

type SaveParams = {
  pilePath: string
  summary: string
  activities: AutoJournalActivity[]
  windowStartTs?: number
  windowEndTs?: number
  highlight?: "Highlight" | "Do later" | "New idea" | null
}

/**
 * Persist an auto-journal summary as a new post in the target pile.
 * Shared between the IPC handler and the scheduler auto-save path.
 */
export async function saveAutoJournalEntry(params: SaveParams) {
  const {
    pilePath,
    summary,
    activities,
    windowStartTs,
    windowEndTs,
    highlight,
  } = params

  if (!pilePath || !fs.existsSync(pilePath)) {
    throw new Error(`Invalid pile path: ${pilePath || "<empty>"}`)
  }

  const timestamp = new Date()
  const { absDir, absPath, relPath } = buildNewPostPath(pilePath, timestamp)
  await fs.promises.mkdir(absDir, { recursive: true })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const contentLines: string[] = []
  contentLines.push(summary)

  activities.forEach((act) => {
    const timeRange =
      act.startTs && act.endTs
        ? `${formatTime(act.startTs)} - ${formatTime(act.endTs)}`
        : ""

    contentLines.push("")
    contentLines.push(`${act.title}`)
    if (timeRange) {
      contentLines.push(`${timeRange}`)
    }
    contentLines.push("")
    contentLines.push(act.summary)
  })

  const content = contentLines.join("\n").trim()
  const nowIso = timestamp.toISOString()

  const mainTitle =
    activities.length === 1 && activities[0].title
      ? activities[0].title
      : activities.length > 0
        ? `${activities[0].title}${activities.length > 1 ? ` (+${activities.length - 1} more)` : ""}`
        : `Auto Journal ${nowIso.slice(0, 10)}`

  const data = {
    title: mainTitle,
    createdAt: nowIso,
    updatedAt: nowIso,
    isAI: true,
    isReply: false,
    tags: ["auto-journal"],
    replies: [],
    attachments: [],
    highlight: highlight ?? null,
    windowStartTs: windowStartTs ?? null,
    windowEndTs: windowEndTs ?? null,
  }

  const markdown = matter.stringify(content, data)
  await fs.promises.writeFile(absPath, markdown, "utf-8")

  return {
    path: absPath,
    relativePath: relPath,
  }
}
