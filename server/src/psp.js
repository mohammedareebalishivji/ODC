import crypto from 'node:crypto';
import { apiError } from './config.js';

/**
 * Payment service provider — Razorpay.
 *
 * Everything that talks to the provider goes through here, so the rest of the
 * app never sees an API key and never has to know which provider is in use.
 *
 * Unconfigured is a supported state, not an error: the app runs, shifts match
 * and the ledger works exactly as before, and only the endpoints that actually
 * move money refuse. That keeps local development and CI free of credentials.
 */

const API = 'https://api.razorpay.com/v1';

export const PSP = 'razorpay';

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

export function isConfigured() {
  return Boolean(KEY_ID && KEY_SECRET);
}

export function webhooksConfigured() {
  return Boolean(WEBHOOK_SECRET);
}

/** Test keys are `rzp_test_*`; live keys are `rzp_live_*`. */
export function isLiveMode() {
  return KEY_ID.startsWith('rzp_live_');
}

/* ------------------------------- money ---------------------------------- */

/**
 * Rupees (as stored in the older REAL columns) to integer paise.
 *
 * Throws rather than rounding silently if the value is not a whole number of
 * paise. A half-paise here would show up later as a reconciliation mismatch
 * against the provider, and the cause would be almost impossible to find from
 * the mismatch alone — so it fails at the point the bad value is introduced.
 */
export function toPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) throw apiError('Amount is not a number.', 500);
  const paise = n * 100;
  const rounded = Math.round(paise);
  if (Math.abs(paise - rounded) > 1e-6) {
    throw apiError(`Amount ${n} is not a whole number of paise.`, 500);
  }
  if (rounded <= 0) throw apiError('Amount must be greater than zero.', 400);
  return rounded;
}

export function fromPaise(paise) {
  return Math.round(Number(paise)) / 100;
}

/* ---------------------------- webhook proof ------------------------------ */

/**
 * Verify a webhook came from the provider.
 *
 * Takes the RAW request body, not a re-serialised object: the signature is
 * over the exact bytes sent, and JSON.stringify of a parsed body will differ
 * in key order or whitespace and fail for reasons that look like an attack.
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  if (!rawBody || !signature) return false;

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length through the error path, so compare lengths first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------ transport -------------------------------- */

function authHeader() {
  return `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`;
}

async function call(method, path, body, { idempotencyKey } = {}) {
  if (!isConfigured()) {
    throw apiError('Payments are not configured on this server.', 503);
  }
  const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
  // Razorpay honours this on payout creation, which is the one call where a
  // network retry could otherwise send the same money twice.
  if (idempotencyKey) headers['X-Payout-Idempotency'] = idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

  if (!res.ok) {
    const detail = parsed?.error?.description || parsed?.raw || res.statusText;
    const err = apiError(`Payment provider rejected the request: ${detail}`, 502);
    err.providerStatus = res.status;
    err.providerCode = parsed?.error?.code;
    throw err;
  }
  return parsed;
}

/* ------------------------------ operations ------------------------------- */

/**
 * An order is the provider's record of "this venue owes this much for this
 * shift". The browser pays against it; we learn the outcome by webhook.
 */
export async function createOrder({ amountPaise, receipt, notes }) {
  return call('POST', '/orders', {
    amount: amountPaise,
    currency: 'INR',
    receipt,
    // Capture automatically on authorisation. A manual capture step would add
    // a window where the venue is charged but the hold is not funded.
    payment_capture: 1,
    notes,
  });
}

export async function fetchPayment(paymentId) {
  return call('GET', `/payments/${encodeURIComponent(paymentId)}`);
}

export async function refundPayment(paymentId, amountPaise) {
  return call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: amountPaise,
  });
}

export function publicConfig() {
  return {
    configured: isConfigured(),
    webhooks: webhooksConfigured(),
    mode: isLiveMode() ? 'live' : 'test',
    // Safe to expose: the key id is what the browser checkout needs. The
    // secret never leaves this module.
    keyId: isConfigured() ? KEY_ID : null,
  };
}
