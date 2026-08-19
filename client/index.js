'use strict'

/**
 * dsh-plugin-scheduled-items — Client half
 *
 * Registers a `settings.section` management page and a `sidebar.footer.action`
 * button opening the same surface as a full-page overlay. Both render over
 * one component-local store; data arrives from the Host half through plain
 * `fetch` on `/scheduled-items/api` (the bundle runs in the real page, not a
 * sandbox). Workspace options are fetched from the Host's
 * `/scheduled-items/api/workspaces` route.
 *
 * Components are zero-argument closures — they never read renderer-bound
 * props hooks — so the bundle works in any harness client runtime that
 * serves the `slots` service. UI text is localized through the harness
 * `locale` service (namespace `settings.scheduledItems`) when present,
 * falling back to raw keys otherwise.
 *
 * This file is the dynamic-plugin source of truth; `client/bundle.js` is
 * the static-install artifact regenerated from it via `npm run build:client`.
 */

const LOCALE_NS = 'settings.scheduledItems'

const ZH = {
  nav: '定时事项',
  title: '定时事项',
  intro: '按 cron 定时器把提示词交给全新的 agent 会话执行——也可以立即执行。',
  loading: '正在加载定时事项…',
  error: '无法连接定时事项服务。',
  empty: '还没有定时事项，先创建一个吧。',
  retry: '重试',
  newItem: '新建定时事项',
  editItem: '编辑定时事项',
  save: '保存',
  saving: '保存中…',
  cancel: '取消',
  delete: '删除',
  running: '执行中…',
  runNow: '立即执行',
  lastRun: '上次执行',
  neverRun: '从未执行',
  failed: '失败',
  cronLabel: 'cron 定时器',
  cronHint: 'croner 表达式，例如 "0 9 * * *" 表示每天 09:00。',
  titleLabel: '标题',
  titlePlaceholder: '例如：晨会纪要',
  promptLabel: '提示词',
  promptPlaceholder: '该事项执行时，让 agent 做什么？',
  enabledLabel: '启用',
  enabledHint: '停用的事项保留数据，但不会定时触发。',
  invalidForm: '标题、提示词和 cron 定时器都是必填项。',
  deleteConfirm: '确定删除这个定时事项？',
  close: '关闭',
  workspace: '工作区',
  workspaceLabel: '工作区',
  workspaceNone: '不绑定工作区（默认目录）',
  workspaceHint: '执行时会在此工作区下新建会话，并显示在工作区分组中。',
}

const EN = {
  nav: 'Scheduled items',
  title: 'Scheduled items',
  intro: 'Prompt a fresh agent session on a cron schedule — or run it right now.',
  loading: 'Loading scheduled items…',
  error: 'Could not reach the scheduled-items service.',
  empty: 'No scheduled items yet. Create your first one below.',
  retry: 'Retry',
  newItem: 'New scheduled item',
  editItem: 'Edit scheduled item',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  delete: 'Delete',
  running: 'Running…',
  runNow: 'Run now',
  lastRun: 'Last run',
  neverRun: 'Never',
  failed: 'failed',
  cronLabel: 'Cron schedule',
  cronHint: 'croner expression, e.g. "0 9 * * *" for 09:00 daily.',
  titleLabel: 'Title',
  titlePlaceholder: 'e.g. Morning standup notes',
  promptLabel: 'Prompt',
  promptPlaceholder: 'What should the agent do when this item runs?',
  enabledLabel: 'Enabled',
  enabledHint: 'Disabled items keep their data but never fire on schedule.',
  invalidForm: 'Title, prompt, and cron schedule are required.',
  deleteConfirm: 'Delete this scheduled item?',
  close: 'Close',
  workspace: 'Workspace',
  workspaceLabel: 'Workspace',
  workspaceNone: 'No workspace (default directory)',
  workspaceHint: 'Executions spawn a session in this workspace and appear under it in the sidebar.',
}

const LOCALE_DICT = { zh: ZH, en: EN }

const API = '/scheduled-items/api'

const styles = {
  _head: null,
  insert(css) {
    if (typeof document === 'undefined') return
    if (!this._head) {
      const style = document.createElement('style')
      style.setAttribute('data-plugin', 'dsh-plugin-scheduled-items')
      document.head.appendChild(style)
      this._head = style
    }
    this._head.textContent = css
  },
}

styles.insert(`
/*
 * Theme-aware styles for dsh-plugin-scheduled-items.
 *
 * Every color comes from the harness theme tokens (Theme.listTokens). Tokens
 * that do not exist there (button-primary-fill / interactive-bg-hover /
 * label-tertiary / bg-layer-3 / label-dimmed / font-mono / etc.) are derived
 * from real tokens through CSS color-mix(), so buttons follow light/dark
 * switching automatically without any local fallback palette.
 *
 * Buttons by role:
 *   .si-btn            — secondary / outline / ghost, all uses color-mix
 *   .si-btn-primary    — "新建定时任务" / "保存" / form submit; brand accent
 *   .si-btn-danger     — "删除"; error-state tint
 *   .si-pageClose      — header close "✕"; ghost with hover overlay
 *   .si-form input, select, textarea — surface-2 surface, label-primary text
 *
 * Hover / active overlays are always color-mixed from the base token, so
 * they stay consistent in light, dark, and any custom theme.
 */
.si-root{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary)}
.si-title{font-size:20px;font-weight:600;margin:0}
.si-intro{font-size:13px;color:var(--dsw-alias-label-secondary);margin:0}
.si-muted{font-size:13px;color:var(--dsw-alias-label-secondary);margin:0}
.si-error{font-size:13px;color:var(--dsw-alias-state-error-primary);display:flex;align-items:center;gap:8px;margin:0}
.si-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.si-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);transition:border-color .16s,background .16s}
.si-row:hover{border-color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.si-rowMain{display:flex;flex-direction:column;gap:3px;min-width:0}
.si-rowTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.si-rowCron{font-size:12px;color:var(--dsw-alias-label-secondary);font-feature-settings:"tnum" 1}
.si-rowMeta{font-size:12px;color:var(--dsw-alias-label-secondary)}
.si-rowActions{display:flex;gap:8px;flex-shrink:0}

/* Base button: secondary outline. Hover overlay mixes from label-primary so
   light/dark themes both produce a visible but subtle state change. */
.si-btn{font-size:13px;padding:5px 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background .16s,border-color .16s,color .16s}
.si-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,var(--dsw-alias-border-l2))}
.si-btn:active:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}
.si-btn:disabled{opacity:.5;cursor:default}

/* Primary button: the only color pair we can guarantee has contrast in any
   theme is foreground text ('label-primary') vs. background surface
   ('bg-base'). 'brand-primary' is theme-dependent — in some themes it is
   itself very light, which would collapse button foreground and background
   to the same color and make the label invisible. So the primary button is
   a solid 'label-primary' fill with 'bg-base' text — guaranteed readable
   in light, dark, and any custom theme. */
.si-btn-primary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.si-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-bg-base) 14%,var(--dsw-alias-label-primary));border-color:transparent}
.si-btn-primary:active:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-bg-base) 24%,var(--dsw-alias-label-primary))}

/* Danger button: error-state tint for text + a derived hover surface. */
.si-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 32%,var(--dsw-alias-border-l2))}
.si-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.si-btn-danger:active:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 20%,transparent)}

.si-form{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.si-formTitle{font-size:15px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
.si-field{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.si-field input,.si-field textarea,.si-field select{padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;transition:border-color .16s,background .16s}
.si-field input:focus,.si-field textarea:focus,.si-field select:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.si-field textarea{resize:vertical;min-height:72px}
.si-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}
.si-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.si-formActions{display:flex;gap:8px}
.si-page{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1)}
.si-pageHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex-shrink:0}
.si-pageTitle{font-size:17px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
.si-pageClose{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .16s,color .16s}
.si-pageClose:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}
.si-pageBody{flex:1;overflow:auto;padding:24px 20px;display:flex;justify-content:center}

/* Sidebar footer trigger: renders inside the sidebar footer Slot, so it must
   read as a sidebar row, not a surface card. The base text follows
   label-primary; hover lifts the background with a theme-derived overlay and
   swaps the text color so it remains readable on either light or dark theme. */
.si-sidebarTrigger{display:flex;align-items:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;text-align:left;cursor:pointer;transition:background .16s,border-color .16s,color .16s}
.si-sidebarTrigger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}
.si-sidebarTrigger:active:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}
.si-sidebarTrigger:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}
.si-sidebarTriggerIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1}
`)

async function readJson(response) {
  const payload = await response.json()
  if (!response.ok) throw new Error((payload && payload.error) || `HTTP ${response.status}`)
  return payload
}

function lastRunText(t, item) {
  if (!item.lastRunAt) return t('neverRun')
  const time = new Date(item.lastRunAt).toLocaleString()
  return item.lastRunError === undefined ? time : `${time} (${t('failed')}: ${item.lastRunError})`
}

module.exports = {
  name: 'scheduled-items-client',
  // Only `slots` is a resolvable service in the static bundle environment;
  // `locale` is resolved dynamically below so the plugin never waits on a
  // service name the web module loader does not serve.
  inject: ['slots'],

  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const locale = ctx.get('locale')
    const t = locale ? locale.bind(LOCALE_NS) : (key) => key
    if (locale) {
      ctx.effect(() => locale.register(LOCALE_NS, LOCALE_DICT))
    }

    const emptyForm = () => ({ editingId: null, title: '', prompt: '', cron: '', enabled: true })

    /**
     * The management surface. Component-local state, zero renderer-bound
     * props hooks: everything (list, form, workspace options, actions) is
     * reached through the apply closure, so the bundle renders in any client
     * runtime that serves `slots`.
     */
    function ScheduledItemsPanel() {
      const [items, setItems] = React.useState([])
      const [loading, setLoading] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [form, setForm] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [runningId, setRunningId] = React.useState(null)
      const [workspaces, setWorkspaces] = React.useState([])

      const load = async () => {
        setLoading(true)
        setError(null)
        try {
          const payload = await readJson(await fetch(API))
          setItems(payload.items || [])
        } catch (err) {
          setError(String((err && err.message) || err))
        }
        setLoading(false)
      }

      React.useEffect(() => {
        void load()
        // Workspace options are optional; failure never blocks the page.
        fetch(`${API}/workspaces`)
          .then((response) => readJson(response))
          .then((payload) => { setWorkspaces(payload.workspaces || []) })
          .catch(() => {})
      }, [])

      const saveForm = async () => {
        if (!form || saving) return
        setSaving(true)
        setError(null)
        try {
          const payload = {
            title: form.title,
            prompt: form.prompt,
            cron: form.cron,
            enabled: form.enabled,
            ...(form.workspaceId === undefined ? {} : { workspaceId: form.workspaceId }),
          }
          const response = form.editingId === null
            ? await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            : await fetch(API, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: form.editingId, ...payload }) })
          await readJson(response)
          setForm(null)
          await load()
        } catch (err) {
          setError(String((err && err.message) || err))
        }
        setSaving(false)
      }

      const remove = async (id) => {
        try {
          const response = await fetch(API, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
          await readJson(response)
          await load()
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }

      const runNow = async (id) => {
        setRunningId(id)
        try {
          const response = await fetch(`${API}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
          await readJson(response)
          await load()
        } catch (err) {
          setError(String((err && err.message) || err))
        }
        setRunningId(null)
      }

      const workspaceOptions = workspaces.map((workspace) => ({
        id: workspace.id,
        title: workspace.title,
      }))
      const workspaceTitle = (id) => {
        const option = workspaceOptions.find((o) => o.id === id)
        return option ? option.title : id
      }
      const rowMeta = (item) => {
        const parts = []
        if (item.workspaceId !== undefined) {
          parts.push(`${t('workspace')}: ${workspaceTitle(item.workspaceId)}`)
        }
        if (!item.enabled) parts.push(`${t('enabledLabel')}: ✕`)
        parts.push(`${t('lastRun')}: ${lastRunText(t, item)}`)
        return parts.join(' · ')
      }
      const disabled = loading || saving

      return React.createElement('div', { className: 'si-root' },
        error && React.createElement('p', { className: 'si-error', role: 'alert' },
          error,
          React.createElement('button', { type: 'button', className: 'si-btn', onClick: () => void load() }, t('retry'))
        ),
        loading && React.createElement('p', { className: 'si-muted' }, t('loading')),
        !loading && items.length === 0 && !error && React.createElement('p', { className: 'si-muted' }, t('empty')),
        React.createElement('ul', { className: 'si-list' },
          items.map((item) =>
            React.createElement('li', { key: item.id, className: 'si-row' },
              React.createElement('div', { className: 'si-rowMain' },
                React.createElement('span', { className: 'si-rowTitle' }, item.title),
                React.createElement('span', { className: 'si-rowCron' }, item.cron),
                React.createElement('span', { className: 'si-rowMeta' }, rowMeta(item))
              ),
              React.createElement('div', { className: 'si-rowActions' },
                React.createElement('button', {
                  type: 'button',
                  className: 'si-btn',
                  disabled: runningId === item.id,
                  onClick: () => void runNow(item.id),
                }, runningId === item.id ? t('running') : t('runNow')),
                React.createElement('button', {
                  type: 'button',
                  className: 'si-btn',
                  onClick: () => setForm({
                    editingId: item.id,
                    title: item.title,
                    prompt: item.prompt,
                    cron: item.cron,
                    enabled: item.enabled,
                    ...(item.workspaceId === undefined ? {} : { workspaceId: item.workspaceId }),
                  }),
                }, t('editItem')),
                React.createElement('button', {
                  type: 'button',
                  className: 'si-btn si-btn-danger',
                  onClick: () => { if (window.confirm(t('deleteConfirm'))) void remove(item.id) },
                }, t('delete'))
              )
            )
          )
        ),
        form === null
          ? React.createElement('button', { type: 'button', className: 'si-btn si-btn-primary', onClick: () => setForm(emptyForm()) }, t('newItem'))
          : React.createElement('form', {
            className: 'si-form',
            onSubmit: (event) => {
              event.preventDefault()
              if (!form.title.trim() || !form.prompt.trim() || !form.cron.trim()) {
                window.alert(t('invalidForm'))
                return
              }
              void saveForm()
            },
          },
            React.createElement('h3', { className: 'si-formTitle' }, form.editingId === null ? t('newItem') : t('editItem')),
            React.createElement('label', { className: 'si-field' },
              React.createElement('span', null, t('titleLabel')),
              React.createElement('input', {
                value: form.title,
                disabled,
                placeholder: t('titlePlaceholder'),
                onChange: (e) => setForm({ ...form, title: e.target.value }),
              })
            ),
            React.createElement('label', { className: 'si-field' },
              React.createElement('span', null, t('promptLabel')),
              React.createElement('textarea', {
                value: form.prompt,
                disabled,
                rows: 4,
                placeholder: t('promptPlaceholder'),
                onChange: (e) => setForm({ ...form, prompt: e.target.value }),
              })
            ),
            React.createElement('label', { className: 'si-field' },
              React.createElement('span', null, t('cronLabel')),
              React.createElement('input', {
                value: form.cron,
                disabled,
                placeholder: '0 9 * * *',
                onChange: (e) => setForm({ ...form, cron: e.target.value }),
              }),
              React.createElement('small', { className: 'si-hint' }, t('cronHint'))
            ),
            workspaceOptions.length > 0 && React.createElement('label', { className: 'si-field' },
              React.createElement('span', null, t('workspaceLabel')),
              React.createElement('select', {
                value: form.workspaceId || '',
                disabled,
                onChange: (e) => setForm({ ...form, workspaceId: e.target.value === '' ? undefined : e.target.value }),
              },
                React.createElement('option', { value: '' }, t('workspaceNone')),
                workspaceOptions.map((option) =>
                  React.createElement('option', { key: option.id, value: option.id }, option.title))
              ),
              React.createElement('small', { className: 'si-hint' }, t('workspaceHint'))
            ),
            React.createElement('label', { className: 'si-checkbox' },
              React.createElement('input', {
                type: 'checkbox',
                checked: form.enabled,
                disabled,
                onChange: (e) => setForm({ ...form, enabled: e.target.checked }),
              }),
              React.createElement('span', null, t('enabledLabel')),
              React.createElement('small', { className: 'si-hint' }, t('enabledHint'))
            ),
            React.createElement('div', { className: 'si-formActions' },
              React.createElement('button', { type: 'submit', className: 'si-btn si-btn-primary', disabled }, saving ? t('saving') : t('save')),
              React.createElement('button', { type: 'button', className: 'si-btn', disabled, onClick: () => setForm(null) }, t('cancel'))
            )
          )
      )
    }

    /** Full-page management overlay. */
    function ScheduledItemsPage() {
      const [open, setOpen] = React.useState(false)
      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          className: 'si-sidebarTrigger',
          'aria-label': t('nav'),
          onClick: () => setOpen(true),
        },
          React.createElement('span', { className: 'si-sidebarTriggerIcon', 'aria-hidden': 'true' }, '⏱'),
          React.createElement('span', null, t('nav'))
        ),
        open && React.createElement('div', { className: 'si-page', role: 'dialog', 'aria-modal': 'true' },
          React.createElement('div', { className: 'si-pageHeader' },
            React.createElement('h2', { className: 'si-pageTitle' }, t('title')),
            React.createElement('button', { type: 'button', className: 'si-pageClose', 'aria-label': t('close'), onClick: () => setOpen(false) }, '✕')
          ),
          React.createElement('div', { className: 'si-pageBody' },
            React.createElement(ScheduledItemsPanel, null)
          )
        )
      )
    }

    // Settings page.
    slots.inject('settings.section', () => slots.register(
      {
        name: 'settings.section',
        id: 'scheduled-items',
        order: 30,
        label: () => t('nav'),
        locale: LOCALE_NS,
      },
      () => React.createElement(ScheduledItemsPanel, null)
    ))

    // Sidebar footer action: full-page management overlay.
    slots.inject('sidebar.footer.action', () => slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'scheduled-items',
        order: 30,
        locale: LOCALE_NS,
      },
      () => React.createElement(ScheduledItemsPage, null)
    ))
  },
}
