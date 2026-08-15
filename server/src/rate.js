const buckets = new Map();

function prune() {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now - b.resetAt > 0) buckets.delete(k);
  }
  if (buckets.size > 5000) {
    for (const k of buckets.keys()) buckets.delete(k);
  }
}

setInterval(prune, 60_000).unref();

export function rateLimit({ key = (req) => req.ip, windowMs = 60_000, max = 60, lockoutMs = 0 }) {
  return (req, res, next) => {
    prune();
    const k = `${req.path}:${key(req)}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || now > b.resetAt) {
      b = { count: 0, lockUntil: 0, resetAt: now + windowMs };
      buckets.set(k, b);
    }
    if (now < b.lockUntil) {
      res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
      return;
    }
    b.count += 1;
    if (b.count > max) {
      if (lockoutMs) b.lockUntil = now + lockoutMs;
      res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
      return;
    }
    next();
  };
}

export function loginLimiter(keyFor) {
  return rateLimit({
    key: (req) => (keyFor ? keyFor(req) : req.ip) + ':auth',
    windowMs: 15 * 60_000,
    max: 8,
    lockoutMs: 15 * 60_000,
  });
}