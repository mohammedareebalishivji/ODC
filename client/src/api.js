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
  const tokens = (store && store.getTokens()) || {};
  const access = tokens.accessToken || tokens.access;
  try { window.__log && window.__log('doFetch', path, 'access=' + (access ? 'YES' : 'NULL')); } catch {}
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
    if (res.status === 401) {
      const tokensNow = (store && store.getTokens()) || {};
      const currentAccess = tokensNow.accessToken || tokensNow.access;
      if (!currentAccess) {
        store && store.forceLogout && store.forceLogout();
      }
    }
    throw new ApiError((body && body.error) || 'Something went wrong. Please try again.', res.status);
  }
  return body;
}

export async function api(path, opts = {}) {
  try {
    return await doFetch(path, opts);
  } catch (err) {
    const tokens = (store && store.getTokens()) || {};
    const refresh = tokens.refreshToken || tokens.refresh;
    if (err.status === 401 && refresh) {
      const ok = await store.refresh();
      if (ok) return doFetch(path, opts);
      store && store.forceLogout && store.forceLogout();
    }
    throw err;
  }
}

export function absoluteUrl(path) {
  return `${window.location.origin}${path}`;
}