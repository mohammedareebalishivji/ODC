# O.D.C — On-Demand Crew

A multi-sided marketplace web app that connects restaurants/bars/hotels with freelance chefs and waiters for single-shift, on-demand hiring. Web MVP only — native apps are a future phase.

> Post a shift → we ping nearby available workers → they accept or counter → you lock in the right person → the request auto-expires in 12 hours if nobody accepts. Every completed shift has a platform service fee (default 10%).

## Stack

- **Frontend:** React 18 + Vite (SPA), hash-based routing, PWA-ready (manifest, service worker, web push). Fully responsive — works one-handed on a phone browser.
- **Backend:** Node.js + Express, SQLite (`node:sqlite`, zero native deps), JWT access + refresh tokens, bcrypt password hashing, TOTP 2FA, OTP via simulated SMS, role-based access control.
- Clean REST API under `/api` (plus a separate, private admin path) so native apps can plug in later without a rewrite.

## Run it

Requires Node.js ≥ 22.5 (uses the built-in `node:sqlite` module).

```bash
# Terminal 1 — API server (port 4000)
cd server
npm install
npm start

# Terminal 2 — web dev server (port 5173, proxies /api)
cd client
npm install
npm run dev
```

Production mode: `npm run build` in `client`, then the Express server serves the SPA + API together on :4000.

Demo data seeds automatically on first run. In **development**, OTP codes are returned in the API response and printed to logs (production uses a real SMS provider).

## Demo accounts (seeded)

| Role    | Email                 | Phone           | Password   |
|---------|-----------------------|-----------------|------------|
| Manager | priya@tamdrum.in      | +91 00000 00001 | Bistro!2026 |
| Chef    | arjun@chef.in         | +91 00000 00002 | Bistro!2026 |
| Chef    | lena@chef.in          | +91 00000 00003 | Bistro!2026 |
| Waiter  | ravi@waiter.in        | +91 00000 00004 | Bistro!2026 |

Chef Arjun is seeded with `Tandoor`, `North Indian`, `BBQ/Grill` specialties and marked **Free Now**, so posting a Tandoor shift as Priya immediately triggers his notification.

## Super Admin (hidden path)

The admin dashboard is deliberately **not discoverable from the public app**:

- No role at signup, no links, no menu entries.
- Lives only at a private, unlisted URL and a non-guessable API path:
  - Web: `http://localhost:4000/tail/z7k9x2/admin/home`
  - API: `/tail/z7k9x2/admin/*` (any other URL returns the public app or 404)
- `robots.txt` disallows `/tail/` and the app ships `noindex`.
- Admin accounts are never self-signed-up — created only inside the backend.
- **Mandatory 2FA (TOTP)** on every admin sign-in, no exceptions.
- Rate-limited with longer lockouts + audit-logged failures (Slack/email alerting is a production plugin point).
- Same generic login error whether or not the account/path exists.

### First-run admin credentials

On a fresh database the server prints these to the console, including the current 2FA code (dev convenience) and the TOTP secret for adding to your authenticator app:

```
[admin] Email:     admin@odc-internal.com
[admin] Password:  OdcAdmin!2026
[admin] TOTP:      <secret — import into Google Authenticator>
[admin] Code now:  <6-digit rolling code>
```

Override in production with env vars `ODC_ADMIN_EMAIL`, `ODC_ADMIN_PASSWORD` (and disable `ODC_ADMIN_PROVISION`). The admin UI + API are in the same bundle for the MVP; running the dashboard as a separate deployed app on a private subdomain is the next hardening step.

### Test accounts

Ready-made **test accounts for every app role** (manager, chef, waiter) are auto-seeded in dev — verified badge on, workers available, with pre-seeded shifts/ratings so dashboards look alive. See [`TEST_ACCOUNTS.md`](TEST_ACCOUNTS.md) for full credentials and quick-login curl commands.

## What's in the MVP

- **Roles:** Manager, Chef, Waiter (public signup + OTP verify) and Super Admin (hidden, 2FA).
- **Manager:** post shifts (role, chef specialty with illustrated tags, date, time, pay range via steppers, location + GPS), review live responses, lock in an accept or counter-offer, rate workers, shift history.
- **Worker:** specialty multi-select (chefs) / languages & experience (waiters), Free Now toggle, browse nearby matching shifts, accept or counter-offer, track status, read fee math up front, rate managers, earnings view.
- **Matching:** role + specialty (for chefs) + optional geo-radius; web-push + in-app notifications.
- **Auto-expiry:** a server job closes open shifts exactly 12 hours after posting; the UI shows a live "closes in 4h 12m" banner and amber/green urgency pills.
- **Platform fee:** stored config (default 10%), editable by Super Admin (applies to future matches and re-computes existing estimates), per-shift fee records, revenue reporting, fee-change history. Fee math is shown to both sides before confirmation ("Worker receives ₹X · O.D.C fee ₹Y").
- **Super Admin dashboard:** live stats (users, roles, fill rate, avg time-to-match, top specialties/locations, revenue), account verify/suspend/ban, full shift table with fee records, earnings + fee config, announcements broadcast, audit log (logins, failed logins, resets, admin actions).

## Key security choices

- bcrypt (12 rounds) passwords, never stored in plain text; strong-password rules enforced with a plain-language meter.
- OTP signup + password reset: 10-minute expiry, 5-attempt cap, rate-limited resends, neutral reset message (no account enumeration).
- Short-lived JWT access tokens (2h) + rotating refresh tokens (30d), invalidated on logout/password change; per-device session list with remote sign-out.
- RBAC enforced server-side on every route; role-specific endpoints reject other roles with 403.
- Input sanitization/validation server-side on every route.
- Admin 2FA (TOTP) mandatory; separated, rate-limited login with audit trail.
- HTTPS/TLS is required in any staging/production deploy (not included in local dev).

## Phase 2 (not in this build)

In-app payments/escrow (enabling live fee settlement), WebSocket chat, native iOS/Android apps, real SMS via Twilio, automated ID verification, per-role/city fee variants.

## Layout

```
server/   Express API + SQLite + jobs + seed   (src/routes/*, src/jobs.js)
client/   React PWA                            (src/pages/{manager,worker,admin}, src/ui.jsx)
```