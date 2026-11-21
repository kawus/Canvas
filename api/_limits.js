/**
 * Fair-use limits, so nobody can fill the database or run up costs for everyone.
 * Visitors are told apart by a scrambled (hashed) form of their internet address;
 * no addresses are stored, and the counters disappear on their own.
 *
 *   storage:  new data a visitor may add per day (boards, images, My Canvas)
 *   previews: link previews / web images a visitor may fetch per hour, and all
 *             visitors together per day (LIMIT_PREVIEWS_PER_DAY), so the fetcher
 *             can't be used as a free download service
 *   signups:  "send me updates" sign-ups a visitor may make per hour (5)
 *
 * They can be changed with environment variables (LIMIT_STORAGE_MB, LIMIT_PREVIEWS_PER_HOUR, LIMIT_PREVIEWS_PER_DAY).
 */

import { redis, redisConfig, sha256 } from './_redis.js'

const STORAGE_PER_DAY = () => Number(process.env.LIMIT_STORAGE_MB || 100) * 1_000_000
const PREVIEWS_PER_HOUR = () => Number(process.env.LIMIT_PREVIEWS_PER_HOUR || 200)
const PREVIEWS_PER_DAY = () => Number(process.env.LIMIT_PREVIEWS_PER_DAY || 20_000)

/** @param {Request} request */
async function visitor(request) {
  const ip = request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  return (await sha256(`canvas-visitor:${ip}`)).slice(0, 20)
}

/**
 * Add `amount` to this visitor's counter (or everyone's, with `everyone`) for the current window.
 * Returns false once the limit is passed. Without a database, everything is allowed.
 * @param {Request} request @param {string} kind @param {number} amount @param {number} limit @param {number} windowSeconds
 * @param {{ everyone?: boolean, strict?: boolean }} [opts] strict: refuse if the counter itself fails
 */
async function spend(request, kind, amount, limit, windowSeconds, opts = {}) {
  if (!redisConfig() || amount <= 0) return true
  const window = Math.floor(Date.now() / 1000 / windowSeconds)
  const key = `limit:${kind}:${window}:${opts.everyone ? 'all' : await visitor(request)}`
  try {
    const total = Number(await redis(['INCRBY', key, Math.ceil(amount)]))
    if (total === Math.ceil(amount)) await redis(['EXPIRE', key, windowSeconds + 60])
    if (total <= limit) return true
    // refused: don't count it, so smaller saves that still fit go through
    await redis(['DECRBY', key, Math.ceil(amount)])
    return false
  } catch {
    // never block people because the counter itself failed (except where it guards costs)
    return !opts.strict
  }
}

/** New stored data (in bytes) by this visitor today. @param {Request} request @param {number} bytes */
export const allowStorage = (request, bytes) => spend(request, 'store', bytes, STORAGE_PER_DAY(), 86_400)

/** More link previews / web images / map tiles (`amount` of them): this visitor this hour, and everyone today. @param {Request} request @param {number} [amount] */
export const allowPreview = async (request, amount = 1) =>
  (await spend(request, 'preview', amount, PREVIEWS_PER_HOUR(), 3_600, { strict: true })) &&
  spend(request, 'preview-all', amount, PREVIEWS_PER_DAY(), 86_400, { everyone: true, strict: true })

/** One more "send me updates" sign-up this hour. @param {Request} request */
export const allowSignup = (request) => spend(request, 'signup', 1, 5, 3_600)

/** One more like or note on someone's board (60 an hour is plenty for a person). @param {Request} request */
export const allowFeedback = (request) => spend(request, 'feedback', 1, 60, 3_600)

/** One more Pro interest or usage count (the smoke-test numbers), so nobody can flood them. @param {Request} request */
export const allowTally = (request) => spend(request, 'tally', 1, 200, 3_600)

export const tooMuch = () =>
  new Response(JSON.stringify({ error: 'fair-use limit reached, try again later' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '3600' },
  })
