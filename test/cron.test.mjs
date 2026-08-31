/**
 * Offline tests for the structured cron picker's pure model helpers
 * (client/cron.js): parsing expressions into a model and building back.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseCron, buildCron, CRON_PRESETS } = require('../client/cron.js')

test('parse: empty input defaults to daily 09:00', () => {
  assert.deepEqual(parseCron(''), { mode: 'daily', minute: 0, hour: 9 })
})

test('parse: daily schedule', () => {
  assert.deepEqual(parseCron('30 8 * * *'), { mode: 'daily', minute: 30, hour: 8 })
})

test('parse: hourly at a fixed minute', () => {
  assert.deepEqual(parseCron('15 * * * *'), { mode: 'hourly', step: 60, minute: 15 })
})

test('parse: sub-hour steps', () => {
  assert.deepEqual(parseCron('*/30 * * * *'), { mode: 'hourly', step: 30 })
  assert.equal(parseCron('*/7 * * * *').mode, 'custom')
})

test('parse: weekday ranges and lists (Mon-Fri, explicit days)', () => {
  assert.deepEqual(parseCron('0 18 * * 1-5'), { mode: 'weekly', minute: 0, hour: 18, days: [1, 2, 3, 4, 5] })
  assert.deepEqual(parseCron('0 10 * * 1,3,5'), { mode: 'weekly', minute: 0, hour: 10, days: [1, 3, 5] })
})

test('parse: Sunday accepts both 0 and 7 and sorts last in UI order', () => {
  assert.deepEqual(parseCron('0 9 * * 0').days, [0])
  assert.deepEqual(parseCron('0 9 * * 7').days, [0])
  assert.deepEqual(parseCron('0 9 * * 6,0').days, [6, 0])
})

test('parse: anything the model cannot represent falls back to custom and preserves raw', () => {
  for (const cron of ['0 9 1 * *', '0 9 * 1 1', '*/15 9-17 * * *', '0,30 * * * *', 'not a cron']) {
    const model = parseCron(cron)
    assert.equal(model.mode, 'custom', cron)
    assert.equal(model.raw, cron)
  }
})

test('build: hourly modes', () => {
  assert.equal(buildCron({ mode: 'hourly', step: 60, minute: 0 }), '0 * * * *')
  assert.equal(buildCron({ mode: 'hourly', step: 30 }), '*/30 * * * *')
})

test('build: daily and weekly', () => {
  assert.equal(buildCron({ mode: 'daily', hour: 8, minute: 30 }), '30 8 * * *')
  assert.equal(buildCron({ mode: 'weekly', hour: 18, minute: 0, days: [1, 2, 3, 4, 5] }), '0 18 * * 1-5')
  assert.equal(buildCron({ mode: 'weekly', hour: 10, minute: 0, days: [1, 3, 5] }), '0 10 * * 1,3,5')
  assert.equal(buildCron({ mode: 'weekly', hour: 9, minute: 0, days: [6, 0] }), '0 9 * * 6,0')
})

test('build: weekly with no days selected defaults to Monday (never emits empty dow)', () => {
  assert.equal(buildCron({ mode: 'weekly', hour: 9, minute: 0, days: [] }), '0 9 * * 1')
})

test('build: custom echoes the raw expression', () => {
  assert.equal(buildCron({ mode: 'custom', raw: '*/7 * * * *' }), '*/7 * * * *')
})

test('every preset round-trips: parse -> build is the same canonical expression', () => {
  for (const { cron } of CRON_PRESETS) {
    const model = parseCron(cron)
    assert.notEqual(model.mode, 'custom', `preset ${cron} should parse to a structured mode`)
    assert.equal(buildCron(model), cron, `preset ${cron} should round-trip`)
  }
})
