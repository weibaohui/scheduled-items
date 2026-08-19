/**
 * Offline test suite for the Host half's pure logic: record schema, domain
 * spec, cron validation, and record building. Requires no harness services.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { __test } = require('../src/index.js')

const { itemSchema, domainSpec, validateCron, buildRecord } = __test

test('item schema accepts a complete record', () => {
  const record = {
    id: 'item-1',
    title: 'Morning brief',
    prompt: 'Summarize the day ahead.',
    cron: '0 9 * * *',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  }
  assert.equal(itemSchema.safeParse(record).success, true)
})

test('item schema accepts an optional workspaceId and last-run metadata', () => {
  const record = {
    id: 'item-2',
    title: 'Evening recap',
    prompt: 'Recap the day.',
    cron: '0 18 * * *',
    enabled: false,
    workspaceId: 'ws-1',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    lastRunAt: '2026-08-18T18:00:00.000Z',
    lastRunError: 'boom',
  }
  const parsed = itemSchema.safeParse(record)
  assert.equal(parsed.success, true)
  assert.equal(parsed.data.workspaceId, 'ws-1')
  assert.equal(parsed.data.lastRunError, 'boom')
})

test('item schema rejects a record missing required fields', () => {
  const broken = {
    id: 'item-3',
    title: 'no cron',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  }
  assert.equal(itemSchema.safeParse(broken).success, false)
})

test('domain spec declares the items table under the scheduled_items unit', () => {
  assert.equal(domainSpec.name, 'scheduled_items')
  assert.equal(domainSpec.version, 1)
  assert.equal(typeof domainSpec.tables.items.valueSchema, 'object')
  assert.equal(domainSpec.tables.items.valueSchema, itemSchema)
})

test('validateCron accepts a valid expression', () => {
  assert.doesNotThrow(() => validateCron('0 9 * * *'))
  assert.doesNotThrow(() => validateCron('*/5 * * * * *'))
})

test('validateCron rejects an empty expression', () => {
  assert.throws(() => validateCron(''), /must not be empty/)
})

test('validateCron rejects a malformed expression', () => {
  assert.throws(() => validateCron('not a cron'), /invalid cron expression/)
})

test('buildRecord creates a stamped record from valid input', () => {
  const record = buildRecord({ title: 'T', prompt: 'P', cron: '0 9 * * *', enabled: true })
  assert.match(record.id, /^item-/)
  assert.equal(record.title, 'T')
  assert.equal(record.prompt, 'P')
  assert.equal(record.cron, '0 9 * * *')
  assert.equal(record.enabled, true)
  assert.equal(record.workspaceId, undefined)
  assert.ok(record.createdAt)
  assert.ok(record.updatedAt)
})

test('buildRecord carries an optional workspaceId', () => {
  const record = buildRecord({
    title: 'T', prompt: 'P', cron: '0 9 * * *', enabled: true, workspaceId: 'ws-9',
  })
  assert.equal(record.workspaceId, 'ws-9')
})

test('buildRecord rejects missing required fields', () => {
  assert.throws(() => buildRecord({ title: 'T' }), /must provide/)
})

test('buildRecord rejects an invalid cron before stamping', () => {
  assert.throws(() => buildRecord({ title: 'T', prompt: 'P', cron: 'nope', enabled: true }), /invalid cron/)
})
