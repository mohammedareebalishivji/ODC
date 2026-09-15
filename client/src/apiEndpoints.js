import { api } from './api';

/**
 * Typed-ish wrappers for the escrow, chat, dispute and KYC endpoints added
 * alongside the Stitch screens. Kept separate from api.js so the low-level
 * fetch/refresh plumbing there stays untouched.
 */

const json = (body) => ({ method: 'POST', body: JSON.stringify(body) });

export const payments = {
  summary: () => api('/api/payments/summary'),
  transactions: (limit = 50) => api(`/api/payments/transactions?limit=${limit}`),
  escrow: () => api('/api/payments/escrow'),
  addMethod: (body) => api('/api/payments/methods', json(body)),
  withdraw: (body) => api('/api/payments/withdraw', json(body)),
  release: (holdId) => api(`/api/payments/escrow/${holdId}/release`, { method: 'POST' }),
};

export const chat = {
  list: () => api('/api/chat'),
  openForShift: (shiftId) => api(`/api/chat/shift/${shiftId}`, { method: 'POST' }),
  messages: (id) => api(`/api/chat/${id}/messages`),
  send: (id, body) => api(`/api/chat/${id}/messages`, json({ body })),
};

export const disputes = {
  mine: () => api('/api/disputes'),
  raise: (body) => api('/api/disputes', json(body)),
  adminQueue: () => api('/api/disputes/admin/queue'),
  resolve: (id, body) => api(`/api/disputes/admin/${id}/resolve`, json(body)),
};

export const kyc = {
  mine: () => api('/api/kyc'),
  submit: (body) => api('/api/kyc', json(body)),
  adminQueue: () => api('/api/kyc/admin/queue'),
  adminFile: (id) => api(`/api/kyc/admin/${id}/file`),
  review: (id, body) => api(`/api/kyc/admin/${id}/review`, json(body)),
};

/** ₹ formatting used across every money surface in the designs. */
export function inr(amount, { decimals = 0 } = {}) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
