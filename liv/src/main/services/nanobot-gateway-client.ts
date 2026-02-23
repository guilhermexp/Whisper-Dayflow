/**
 * Nanobot Gateway Client
 *
 * HTTP + WebSocket client for communicating with the Python nanobot gateway.
 * Used by:
 *   - tipc.ts IPC handlers (request/response)
 *   - Main process WS proxy (streaming to renderer)
 */

import { logger } from "../logger"
import type {
  NanobotMessage,
  NanobotWsInbound,
  NanobotWsOutbound,
} from "../../shared/types"

const LOG_PREFIX = "[NanobotClient]"
const DEFAULT_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

export class NanobotHttpClient {
  constructor(private baseUrl: string) {}

  /** Update base URL (e.g. after port change). */
  setBaseUrl(url: string) {
    this.baseUrl = url
  }

  /** Send a message and get the full response. */
  async sendMessage(
    content: string,
    sessionId = "liv:chat",
  ): Promise<NanobotMessage> {
    const res = await fetch(`${this.baseUrl}/api/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, session_id: sessionId }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gateway error ${res.status}: ${text}`)
    }

    const data = await res.json()
    return {
      content: data.content || "",
      sessionKey: data.session_key || sessionId,
      toolsUsed: data.tools_used || [],
    }
  }

  /** Get gateway health. */
  async health(): Promise<{ status: string; uptime: number; model: string }> {
    const res = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    return res.json()
  }

  /** Get full gateway status. */
  async getStatus(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/api/status`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Status failed: ${res.status}`)
    return res.json()
  }

  /** Get all bootstrap files (AGENTS.md, SOUL.md, USER.md). */
  async getBootstrapFiles(): Promise<Record<string, string>> {
    const res = await fetch(`${this.baseUrl}/api/bootstrap`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`)
    const data = await res.json()
    return data.files || {}
  }

  /** Update a bootstrap file. */
  async updateBootstrapFile(filename: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/bootstrap/${encodeURIComponent(filename)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Bootstrap update failed: ${res.status}`)
  }

  /** Get agent memory (MEMORY.md content). */
  async getMemory(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/memory`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Memory fetch failed: ${res.status}`)
    const data = await res.json()
    return data.content || ""
  }

  /** Reset agent memory. */
  async resetMemory(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/memory`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Memory reset failed: ${res.status}`)
  }

  /** List sessions. */
  async listSessions(): Promise<Array<{ key: string; created_at: string; updated_at: string; path: string }>> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Sessions fetch failed: ${res.status}`)
    const data = await res.json()
    return data.sessions || []
  }

  /** Get a specific session's messages. */
  async getSessionMessages(sessionKey: string): Promise<{
    key: string
    created_at: string
    updated_at: string
    messages: Array<{ role: string; content: string; timestamp: string }>
  }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionKey)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`)
    return res.json()
  }

  /** List cron jobs. */
  async listCronJobs(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Cron jobs fetch failed: ${res.status}`)
    const data = await res.json()
    return data.jobs || []
  }

  /** Add a cron job. */
  async addCronJob(job: {
    name: string
    scheduleType: string
    interval?: number
    expression?: string
    message: string
  }): Promise<{ id: string }> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: job.name,
        schedule_type: job.scheduleType,
        interval: job.interval,
        expression: job.expression,
        message: job.message,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Add cron job failed: ${text}`)
    }
    return res.json()
  }

  /** Remove a cron job. */
  async removeCronJob(jobId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${jobId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Remove cron job failed: ${res.status}`)
  }

  /** Toggle a cron job enabled/disabled. */
  async toggleCronJob(jobId: string): Promise<{ id: string; enabled: boolean }> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${jobId}`, {
      method: "PATCH",
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Toggle cron job failed: ${res.status}`)
    return res.json()
  }

  /** List running subagents. */
  async listSubagents(): Promise<{ agents: Array<{ id: string; done: boolean; cancelled: boolean }>; count: number }> {
    const res = await fetch(`${this.baseUrl}/api/agents`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Subagents fetch failed: ${res.status}`)
    return res.json()
  }

  // --- Composio Integration ---

  /** Get Composio status (API key valid? connected apps). */
  async getComposioStatus(): Promise<{ connected: boolean; apps: string[]; total_connections: number; active_connections: number }> {
    const res = await fetch(`${this.baseUrl}/api/composio/status`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Composio status failed: ${res.status}`)
    return res.json()
  }

  /** List available Composio apps. */
  async getComposioApps(): Promise<Array<{ name: string; display_name: string; description: string; logo: string; categories: string[] }>> {
    const res = await fetch(`${this.baseUrl}/api/composio/apps`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Composio apps failed: ${res.status}`)
    const data = await res.json()
    return data.apps || []
  }

  /** Get actions for a specific app. */
  async getComposioAppActions(appName: string): Promise<Array<{ name: string; display_name: string; description: string }>> {
    const res = await fetch(`${this.baseUrl}/api/composio/apps/${encodeURIComponent(appName)}/actions`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Composio actions failed: ${res.status}`)
    const data = await res.json()
    return data.actions || []
  }

  /** Initiate an OAuth connection for an app. Returns OAuth URL and connectionId. */
  async initiateComposioConnection(appName: string): Promise<{ url: string; connectionId: string }> {
    const res = await fetch(`${this.baseUrl}/api/composio/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_name: appName }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Composio connect failed: ${text}`)
    }
    return res.json()
  }

  /** Check status of a connection (polling after OAuth). */
  async getComposioConnectionStatus(connectionId: string): Promise<{ id: string; status: string; appName: string }> {
    const res = await fetch(`${this.baseUrl}/api/composio/connections/${encodeURIComponent(connectionId)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Composio connection status failed: ${res.status}`)
    return res.json()
  }

  /** List all Composio connections. */
  async listComposioConnections(): Promise<Array<{ id: string; appName: string; status: string }>> {
    const res = await fetch(`${this.baseUrl}/api/composio/connections`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Composio connections failed: ${res.status}`)
    const data = await res.json()
    return data.connections || []
  }

  /** Disconnect (delete) a Composio connection. */
  async disconnectComposioApp(connectionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/composio/connections/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Composio disconnect failed: ${res.status}`)
  }

  /** Register tools for a connected Composio app. */
  async registerComposioTools(appName: string, selectedActions?: string[]): Promise<{ count: number }> {
    const body: Record<string, unknown> = { app_name: appName }
    if (selectedActions) body.selected_actions = selectedActions
    const res = await fetch(`${this.baseUrl}/api/composio/tools/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Composio register tools failed: ${res.status}`)
    return res.json()
  }

  /** Unregister tools for a Composio app. */
  async unregisterComposioTools(appName: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/composio/tools/unregister`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_name: appName }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Composio unregister tools failed: ${res.status}`)
  }

  /** List registered Composio tools grouped by app. */
  async getComposioTools(): Promise<{ tools_by_app: Record<string, string[]>; total: number }> {
    const res = await fetch(`${this.baseUrl}/api/composio/tools`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Composio tools list failed: ${res.status}`)
    return res.json()
  }
}

// ---------------------------------------------------------------------------
// WebSocket Client (used by main process to proxy to renderer)
// ---------------------------------------------------------------------------

export type WsMessageHandler = (msg: NanobotWsOutbound) => void

export class NanobotWsClient {
  private ws: WebSocket | null = null
  private url: string
  private handlers = new Set<WsMessageHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(baseUrl: string) {
    // Convert http:// to ws://
    this.url = baseUrl.replace(/^http/, "ws") + "/ws/chat"
  }

  setUrl(baseUrl: string) {
    this.url = baseUrl.replace(/^http/, "ws") + "/ws/chat"
  }

  /** Register a handler for outbound messages. */
  onMessage(handler: WsMessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** Connect to the gateway WebSocket. */
  connect() {
    if (this.ws) {
      this.disconnect()
    }

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        logger.info(`${LOG_PREFIX} WS connected to ${this.url}`)
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as NanobotWsOutbound
          this.handlers.forEach((h) => h(msg))
        } catch (err) {
          logger.error(`${LOG_PREFIX} WS parse error:`, err)
        }
      }

      this.ws.onclose = () => {
        logger.info(`${LOG_PREFIX} WS disconnected`)
        this.ws = null
      }

      this.ws.onerror = (err) => {
        logger.error(`${LOG_PREFIX} WS error:`, err)
      }
    } catch (err) {
      logger.error(`${LOG_PREFIX} WS connect error:`, err)
    }
  }

  /** Send a message to the gateway. */
  send(msg: NanobotWsInbound) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected")
    }
    this.ws.send(JSON.stringify(msg))
  }

  /** Disconnect from the gateway. */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// ---------------------------------------------------------------------------
// Singleton instances (updated when bridge starts)
// ---------------------------------------------------------------------------

let httpClient: NanobotHttpClient | null = null
let wsClient: NanobotWsClient | null = null

export function initClients(port: number) {
  const baseUrl = `http://127.0.0.1:${port}`
  httpClient = new NanobotHttpClient(baseUrl)
  wsClient = new NanobotWsClient(baseUrl)
  wsClient.connect()
}

export function getHttpClient(): NanobotHttpClient | null {
  return httpClient
}

export function getWsClient(): NanobotWsClient | null {
  return wsClient
}

export function destroyClients() {
  wsClient?.disconnect()
  wsClient = null
  httpClient = null
}
