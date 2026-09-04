import { verifyJwt } from './security.js';
import { db } from './db.js';

export function authGuard(roles = null) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyJwt(token) : null;
    if (!payload || !payload.sub) {
      res.status(401).json({ error: 'Please log in again.' });
      return;
    }
    db.get(`SELECT * FROM users WHERE id = $1`, payload.sub)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'Account not found.' });
          return;
        }
        if (user.role === 'admin' && !payload.admin) {
          res.status(401).json({ error: 'Please log in again.' });
          return;
        }
        if (roles && !roles.includes(user.role)) {
          res.status(403).json({ error: 'You do not have permission to do that.' });
          return;
        }
        if (user.banned) {
          res.status(403).json({ error: 'This account has been banned.' });
          return;
        }
        if (user.suspended && roles && roles.includes('admin')) {
          res.status(403).json({ error: 'Account suspended.' });
          return;
        }
        req.user = user;
        req.tokenPayload = payload;
        next();
      })
      .catch(next);
  };
}

export function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message });
}

export function bodyGuard(req, res, next) {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Invalid request body.' });
    return;
  }
  next();
}
