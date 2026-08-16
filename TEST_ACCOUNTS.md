# Test Accounts (O.D.C.)

All accounts below share one password: **`Test@1234`**

Created automatically (idempotent) on every development boot via `npm run dev` / `./start.sh`. If you've changed the passwords in the DB, delete `server/data/odc.db` and restart to re-seed.

## App accounts

| Role    | Name                  | Email                 | Phone          | Seeded activity                                                                 |
| ------- | --------------------- | --------------------- | -------------- | ------------------------------------------------------------------------------- |
| Manager | Test Manager          | testmanager@odc.in    | +91 99990 00001 | 2 open shifts (1 chef, 1 waiter) + 1 matched chef shift w/ 5★ rating            |
| Chef    | Test Chef             | testchef@odc.in       | +91 99990 00002 | 5★ rating, 1 completed shift (₹135 earned), live open chef shift                |
| Waiter  | Test Waiter           | testwaiter@odc.in     | +91 99990 00003 | Availability on, live open waiter shift                                         |
| Super Admin | Test Super Admin  | testsuperadmin@odc.in | —              | Full admin access; permanent code **000000** |

All four are **verified** (badge on). Workers log in as **available** by default.

**Super admin login** uses the private admin path: `POST /tail/z7k9x2/admin/login` with `{ email, password, code }`. The **permanent code never changes** (deterministic per account); TOTP codes from an authenticator app also work. Printed at boot:

```
[test-superadmin] Email: testsuperadmin@odc.in
[test-superadmin] Password: Test@1234
[test-superadmin] Permanent code: 000000 (never changes)
```

## Admin

| Role  | Email                     | Password        | Permanent 6-digit code |
| ----- | ------------------------- | --------------- | ---------------------- |
| Admin | admin@odc-internal.com    | OdcAdmin!2026   | **000000**             |

- The **permanent code never changes** unless you change it from the admin "My account" screen (then the new one sticks).
- An authenticator TOTP code also works if you set one up.
- Printed at every server boot:
```
[admin] Permanent code: 804397 (never changes)
```
- Oversized admin credentials are configurable via env vars `ODC_ADMIN_EMAIL`, `ODC_ADMIN_PASSWORD`.

## Demo accounts (original)

All password: **`Bistro!2026`**

| Role    | Email              | Phone          |
| ------- | ------------------ | -------------- |
| Manager | priya@tamdrum.in   | +91 00000 00001 |
| Chef    | arjun@chef.in      | +91 00000 00002 |
| Chef    | lena@chef.in       | +91 00000 00003 |
| Waiter  | ravi@waiter.in     | +91 00000 00004 |

## Quick login script

```bash
# Manager
curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"testmanager@odc.in","password":"Test@1234"}'

# Chef
curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"testchef@odc.in","password":"Test@1234"}'

# Waiter
curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"testwaiter@odc.in","password":"Test@1234"}'

# Super admin (use the permanent code — it never changes)
curl -s -X POST localhost:4000/tail/z7k9x2/admin/login -H 'Content-Type: application/json' \
  -d '{"email":"testsuperadmin@odc.in","password":"Test@1234","code":"000000"}'
```