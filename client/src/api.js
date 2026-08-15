let store = null;

export function setAuthStore(s) {
  store = s;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function doFetch(path, opts = {}) {
  const { access, refresh } = store ? store.getTokens() : {};
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new ApiError((body && body.error) || 'Something went wrong. Please try again.', res.status);
  }
  return body;
}

export async function api(path, opts = {}) {
  try {
    return await doFetch(path, opts);
  } catch (err) {
    if (err.status === 401 && store && store.getTokens().refresh) {
      const ok = await store.refresh();
      if (ok) return doFetch(path, opts);
    }
    throw err;
  }
}

export function absoluteUrl(path) {
  return `${window.location.origin}${path}`;
}