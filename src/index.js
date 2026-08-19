'use strict'

/**
 * dsh-plugin-scheduled-items — Host half
 *
 * Durable cron-driven prompts. Each item carries a title, a prompt, and a
 * croner expression; an enabled item spawns a fresh agent session and
 * submits the prompt on schedule (or on demand). The store is durable
 * through the host `storageDomain` service (domain `scheduled_items`), the
 * schedule runs on croner, and an HTTP API under `/scheduled-items/api`
 * serves the management pages in the web client.
 *
 * Zero `@deepseek-ai/dsh-*` imports: every harness capability is reached
 * through `ctx.*` runtime services (`storageDomain`, `workspaceRegistry`,
 * `agents`, `agentDefaultModel`, `webServer`). The only runtime
 * dependencies are plain npm packages (croner, zod).
 */

const { randomUUID } = require('node:crypto')
const { Cron } = require('croner')
const { z } = require('zod')

/** Durable shape of one scheduled item. */
const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  cron: z.string(),
  enabled: z.boolean(),
  workspaceId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRunAt: z.string().optional(),
  lastRunError: z.string().optional(),
})

/** The scheduled-items domain: one `items` table keyed by item id. */
const domainSpec = {
  name: 'scheduled_items',
  version: 1,
  tables: { items: { valueSchema: itemSchema } },
}

/** Maximum request body the item API accepts (create/update payloads). */
const MAX_BODY_BYTES = 64 * 1024

/** Validate a cron expression eagerly so bad input fails at write time. */
function validateCron(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new Error('cron expression must not be empty')
  }
  try {
    // Constructing parses the expression; a malformed one throws. `paused`
    // keeps the validation-only job from arming a real timer, and stop()
    // releases it, so a probe never keeps the event loop alive.
    const probe = new Cron(expression, { paused: true }, () => {})
    probe.stop()
  } catch (error) {
    throw new Error(`invalid cron expression '${expression}': ${String((error && error.message) || error)}`)
  }
}

/** Build one fresh item record from validated input. */
function buildRecord(input) {
  if (!input || typeof input.title !== 'string' || typeof input.prompt !== 'string'
    || typeof input.cron !== 'string' || typeof input.enabled !== 'boolean') {
    throw new Error('input must provide title, prompt, cron, and enabled')
  }
  validateCron(input.cron)
  const now = new Date().toISOString()
  const id = `item-${randomUUID()}`
  return {
    id,
    title: input.title,
    prompt: input.prompt,
    cron: input.cron,
    enabled: input.enabled,
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    createdAt: now,
    updatedAt: now,
  }
}

module.exports = {
  name: 'scheduled-items',
  inject: ['storageDomain', 'agents', 'agentDefaultModel', 'webServer', 'workspaceRegistry', 'sessionTitle'],

  // Exposed for the offline test suite only (test/*.test.mjs); Cordis
  // ignores unknown export properties.
  __test: { itemSchema, domainSpec, validateCron, buildRecord },

  /**
   * Mount the store, the croner schedule, and the HTTP API.
   * @param ctx - harness context carrying the injected services.
   * @param rawConfig - plugin config (`{ cwd?: string }`); validated by Cordis
   *   when present, otherwise defaulted here.
   */
  apply(ctx, rawConfig) {
    const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
    const defaultCwd = config.cwd || process.cwd()

    let table
    const jobs = new Map()

    const requireTable = () => {
      if (!table) throw new Error('scheduled items are not started yet')
      return table
    }

    const sendJson = (res, status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(payload))
    }

    const readJsonBody = async (req) => {
      const chunks = []
      let received = 0
      for await (const chunk of req) {
        received += chunk.length
        if (received > MAX_BODY_BYTES) throw new Error('request body too large')
        chunks.push(chunk)
      }
      if (chunks.length === 0) return {}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }

    /**
     * Execute one item: spawn a fresh agent session and submit the prompt.
     * A bound workspace supplies the session cwd and gets the session
     * attached, so the run appears under the workspace in the sidebar.
     * @param record - the stored item.
     * @returns the updated record with last-run metadata.
     */
    async function execute(record) {
      const startedAt = new Date().toISOString()
      try {
        const sessionId = `session-${randomUUID()}`
        const selection = ctx.agentDefaultModel.currentSelection()
        const workspace = record.workspaceId === undefined
          ? undefined
          : ctx.workspaceRegistry.get(record.workspaceId)
        if (record.workspaceId !== undefined && workspace === undefined) {
          throw new Error(`workspace '${record.workspaceId}' not found`)
        }
        const handle = await ctx.agents.create({
          sessionId,
          meta: { cwd: workspace ? workspace.path : defaultCwd },
          agentOptions: { provider: selection.provider, model: selection.model },
          // Without a preset mount the fresh session runs with NO tools, so
          // the model can only answer verbally ("I cannot run shell
          // commands"). Resolve the deployment's default agent preset and
          // mount it in setup, exactly like the web gateway does when it
          // creates a session — this brings in bash/files/web and every
          // other tool the preset composes.
          setup: async (agentCtx) => {
            const presets = ctx.get('agentPresets')
            if (!presets || typeof presets.resolve !== 'function' || typeof presets.mount !== 'function') {
              return
            }
            const resolved = await presets.resolve(undefined)
            if (resolved && resolved.id) {
              await presets.mount(agentCtx, resolved.id)
            }
          },
        })
        if (workspace !== undefined) {
          await workspace.attachSession(sessionId)
        }
        // Set the session title to the item's title. Append directly to the
        // session log with a 'user' source, which pins the title and prevents
        // automatic title generation from overwriting it.
        try {
          handle.agent.session.append('session/title', {
            title: record.title,
            messageSeqs: [],
            source: { kind: 'user' },
          })
        } catch {
          // A failed append is non-fatal; the session still runs with a
          // fallback title derived from the first prompt.
        }
        const message = {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: record.prompt }],
          source: { kind: 'plugin', plugin: 'scheduled-items' },
        }
        handle.agent.followup(message)
        return { ...record, lastRunAt: startedAt, lastRunError: undefined }
      } catch (error) {
        return { ...record, lastRunAt: startedAt, lastRunError: String((error && error.message) || error) }
      }
    }

    /** Schedule one enabled item, or stop an existing job when disabled. */
    function rescheduleOne(id, record) {
      const existing = jobs.get(id)
      if (existing) {
        existing.stop()
        jobs.delete(id)
      }
      if (!record.enabled) return
      const job = new Cron(record.cron, () => {
        const current = requireTable().get(id)
        if (current !== undefined) runNow(id).catch(() => {})
      })
      jobs.set(id, job)
    }

    /** Rebuild the croner job table from the stored items. */
    function rescheduleAll() {
      for (const job of jobs.values()) job.stop()
      jobs.clear()
      for (const [id, record] of requireTable().entries()) rescheduleOne(id, record)
    }

    /** List every item in insertion order. */
    function list() {
      return [...requireTable().entries()].map(([, record]) => record)
    }

    /** Create one item, schedule it when enabled, and persist it. */
    async function create(input) {
      if (!input || typeof input.title !== 'string' || typeof input.prompt !== 'string'
        || typeof input.cron !== 'string' || typeof input.enabled !== 'boolean') {
        throw new Error('input must provide title, prompt, cron, and enabled')
      }
      validateCron(input.cron)
      const now = new Date().toISOString()
      const id = `item-${randomUUID()}`
      const record = {
        id,
        title: input.title,
        prompt: input.prompt,
        cron: input.cron,
        enabled: input.enabled,
        ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
        createdAt: now,
        updatedAt: now,
      }
      await requireTable().put(id, record)
      rescheduleOne(id, record)
      return record
    }

    /** Update one item and reschedule its job when schedule or state changed. */
    async function update(id, patch) {
      const current = requireTable().get(id)
      if (current === undefined) throw new Error(`scheduled item '${id}' not found`)
      if (patch.cron !== undefined && patch.cron !== current.cron) validateCron(patch.cron)
      const next = {
        ...current,
        ...patch,
        id: current.id,
        updatedAt: new Date().toISOString(),
      }
      await requireTable().put(id, next)
      rescheduleOne(id, next)
      return next
    }

    /** Remove one item and stop its job. */
    async function remove(id) {
      const current = requireTable().get(id)
      if (current === undefined) throw new Error(`scheduled item '${id}' not found`)
      const existing = jobs.get(id)
      if (existing) {
        existing.stop()
        jobs.delete(id)
      }
      await requireTable().delete(id)
    }

    /** Execute one item immediately, recording the attempt on the record. */
    async function runNow(id) {
      const current = requireTable().get(id)
      if (current === undefined) throw new Error(`scheduled item '${id}' not found`)
      const updated = await execute(current)
      await requireTable().put(id, updated)
      return updated
    }

    // ── lifecycle: open the domain and reschedule every enabled item ─────────
    ;(async () => {
      const domain = await ctx.storageDomain.open(domainSpec)
      ctx.effect(() => () => {
        for (const job of jobs.values()) job.stop()
        jobs.clear()
        domain.close().catch(() => {})
      }, 'scheduled-items: domain close')
      table = domain.table('items')
      rescheduleAll()
    })()

    // ── HTTP API under the registered prefix ─────────────────────────────────
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/scheduled-items/api',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://dsh.local')
          const apiPath = url.pathname.replace(/\/+$/, '')
          if (req.method === 'GET' && apiPath.endsWith('/scheduled-items/api/workspaces')) {
            // Workspace options for the client form, served over HTTP so the
            // client half never depends on renderer-bound props hooks.
            const registry = ctx.get('workspaceRegistry')
            const workspaces = registry && typeof registry.list === 'function'
              ? registry.list().map((workspace) => ({ id: workspace.id, title: workspace.title }))
              : []
            sendJson(res, 200, { workspaces })
            return
          }
          if (req.method === 'GET' && apiPath.endsWith('/scheduled-items/api')) {
            sendJson(res, 200, { items: list() })
            return
          }
          if (req.method === 'POST' && apiPath.endsWith('/scheduled-items/api')) {
            const item = await create(await readJsonBody(req))
            sendJson(res, 201, { item })
            return
          }
          if (req.method === 'PATCH' && apiPath.endsWith('/scheduled-items/api')) {
            const body = await readJsonBody(req)
            if (typeof body.id !== 'string') {
              sendJson(res, 400, { error: 'body must provide id' })
              return
            }
            const { id, ...patch } = body
            const item = await update(id, patch)
            sendJson(res, 200, { item })
            return
          }
          if (req.method === 'DELETE' && apiPath.endsWith('/scheduled-items/api')) {
            const body = await readJsonBody(req)
            if (typeof body.id !== 'string') {
              sendJson(res, 400, { error: 'body must provide id' })
              return
            }
            await remove(body.id)
            sendJson(res, 200, { removed: true })
            return
          }
          if (req.method === 'POST' && apiPath.endsWith('/scheduled-items/api/run')) {
            const body = await readJsonBody(req)
            if (typeof body.id !== 'string') {
              sendJson(res, 400, { error: 'body must provide id' })
              return
            }
            const item = await runNow(body.id)
            sendJson(res, 200, { item })
            return
          }
          sendJson(res, 404, { error: 'not found' })
        } catch (error) {
          sendJson(res, 400, { error: String((error && error.message) || error) })
        }
      },
    }), 'scheduled-items: api route')
  },
}
