'use strict'

/**
 * dsh-tasks — cron model <-> expression helpers (pure, no DOM / React).
 *
 * The structured cron picker edits a small model and emits a five-field cron
 * string (as consumed by croner): `minute hour day-of-month month day-of-week`.
 * Anything the model can't represent round-trips through mode `custom` with the
 * raw expression preserved, so opening an exotic schedule never loses data.
 */

/** Weekday chips in UI order (Monday → Sunday). Cron dow: Mon=1 … Sat=6, Sun=0. */
const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0]

/** One-click presets. Each parses back into a structured mode (not custom). */
const CRON_PRESETS = [
  { id: 'hourly', cron: '0 * * * *' },
  { id: 'min30', cron: '*/30 * * * *' },
  { id: 'daily9', cron: '0 9 * * *' },
  { id: 'weekday830', cron: '30 8 * * 1-5' },
  { id: 'mon10', cron: '0 10 * * 1' },
]

/** Minute steps offered by the hourly mode (60 = once an hour). */
const HOURLY_STEPS = [60, 30, 15, 10, 5]

const int = (value, min, max) => {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return n >= min && n <= max ? n : null
}

/**
 * Parse a day-of-week field (`*`, `1-5`, `1,3,5`, `0`/`7` for Sunday…) into a
 * sorted array of weekday keys, or null when it is not a plain list/range of
 * weekday numbers (steps, names, etc. — those fall back to custom mode).
 */
function parseDow(field) {
  if (field === '*') return null
  const days = new Set()
  for (const token of field.split(',')) {
    const range = token.match(/^(\d+)-(\d+)$/)
    let lo
    let hi
    if (range) {
      lo = Number(range[1])
      hi = Number(range[2])
      if (lo > hi) return null
    } else {
      lo = hi = Number(token)
    }
    for (let atom = lo; atom <= hi; atom++) {
      if (!Number.isInteger(atom)) return null
      if (atom < 0 || atom > 7) return null
      days.add(atom === 7 ? 0 : atom) // cron also accepts 7 for Sunday
    }
  }
  if (days.size === 0) return null
  return WEEKDAY_KEYS.filter((key) => days.has(key))
}

/**
 * Parse a cron expression into a picker model.
 * model.mode ∈ hourly | daily | weekly | custom.
 */
function parseCron(str) {
  const raw = typeof str === 'string' ? str.trim() : ''
  const custom = { mode: 'custom', raw }
  const fields = raw.split(/\s+/)
  if (fields.length !== 5) return raw ? custom : { mode: 'daily', minute: 0, hour: 9 }
  const [mf, hf, domf, monf, dowf] = fields
  if (domf !== '*' || monf !== '*') return custom

  // Hourly: hour field is `*`. Accept `M * * * *` (once an hour at :M) and
  // `*/N * * * *` for the quick sub-hour steps.
  if (hf === '*' && dowf === '*') {
    const step = mf.match(/^\*\/(\d+)$/)
    if (step) {
      const n = Number(step[1])
      if (HOURLY_STEPS.includes(n)) return { mode: 'hourly', step: n }
      return custom
    }
    const minute = int(mf, 0, 59)
    if (minute !== null) return { mode: 'hourly', step: 60, minute }
    return custom
  }

  // Daily / weekly need a single hour and minute.
  const hour = int(hf, 0, 23)
  const minute = int(mf, 0, 59)
  if (hour === null || minute === null) return custom
  const days = parseDow(dowf)
  if (days === null) {
    return dowf === '*' ? { mode: 'daily', hour, minute } : custom
  }
  return { mode: 'weekly', hour, minute, days }
}

/** Collapse an array of weekday keys (Mon=1 … Sat=6, Sun=0) into cron tokens, e.g. [1..5] → `1-5`. */
function formatDow(days) {
  const week = days.filter((d) => d >= 1 && d <= 6).sort((a, b) => a - b)
  const tokens = []
  let start = null
  let prev = null
  const flush = () => {
    if (start === null) return
    tokens.push(start === prev ? String(start) : `${start}-${prev}`)
    start = null
  }
  for (const d of week) {
    if (start === null) { start = d; prev = d }
    else if (d === prev + 1) { prev = d }
    else { flush(); start = d; prev = d }
  }
  flush()
  if (days.includes(0)) tokens.push('0') // Sunday: croner accepts 0 (and 7); keep 0 standalone
  return tokens.join(',')
}

/** Build a cron expression from a picker model. */
function buildCron(model) {
  if (!model || model.mode === 'custom') return (model?.raw || '').trim()
  const minute = model.minute ?? 0
  if (model.mode === 'hourly') {
    return model.step && model.step < 60
      ? `*/${model.step} * * * *`
      : `${minute} * * * *`
  }
  const hour = model.hour ?? 9
  if (model.mode === 'daily') return `${minute} ${hour} * * *`
  if (model.mode === 'weekly') {
    const days = (model.days && model.days.length ? model.days : [1])
    return `${minute} ${hour} * * ${formatDow(days)}`
  }
  return ''
}

/* node-test-export-start */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WEEKDAY_KEYS, CRON_PRESETS, HOURLY_STEPS, parseCron, buildCron, parseDow }
}
/* node-test-export-end */
