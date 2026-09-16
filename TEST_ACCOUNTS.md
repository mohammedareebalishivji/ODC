# Test Accounts (O.D.C.)

> **These exist on a local database only.** The demo seed refuses to run against
> anything that is not localhost, because every account here shares a password
> that is published in this file. Nothing below will let anyone into a deployed
> environment — and nothing below should ever be created in one.

Created automatically (idempotent) on every development boot via `npm run dev` /
`./start.sh`. If you have changed the passwords locally, re-seed with
`npm run seed-demo`.

Seeding a hosted database is possible but deliberately awkward, and you should
not do it:

```bash
cd server && ODC_ALLOW_REMOTE_DEMO_SEED=yes npm run seed-demo
```

## App accounts

All share the password **`Test@1234`**.

| Role    | Name                  | Email                 | Phone          | Seeded activity                                                      |
| ------- | --------------------- | --------------------- | -------------- | -------------------------------------------------------------------- |
| Manager | Test Manager          | testmanager@odc.in    | +91 99990 00001 | 2 open shifts (1 chef, 1 waiter) + 1 matched chef shift w/ 5★ rating |
| Chef    | Test Chef             | testchef@odc.in       | +91 99990 00002 | 5★ rating, 1 completed shift (₹135 earned), live open chef shift     |
| Waiter  | Test Waiter           | testwaiter@odc.in     | +91 99990 00003 | Availability on, live open waiter shift                              |
| Manager | Test Manager 2        | testmanager2@odc.in   | +91 99990 00007 | Extra manager account                                                |
| Chef    | Test Chef 2           | testchef2@odc.in      | +91 99990 00008 | Bakery/Pastry, Continental, South Indian                             |
| Waiter  | Test Waiter 2         | testwaiter2@odc.in    | +91 99990 00009 | Extra waiter account                                                 |
| Super Admin | Test Super Admin  | testsuperadmin@odc.in | +91 99990 00004 | Full admin access                                                    |

All are **verified** (badge on). Workers log in as **available** by default.

The test super admin's fallback code is fixed at `000000` so the test suite stays
deterministic. That is safe only because this account cannot be created outside
localhost — see `TEST_ADMIN_CODE` in `server/src/security.js`.

## The real admin account

**Not documented here, by design.** The first-run admin is created on *any*
fresh database, hosted ones included, so publishing its credentials would
publish production access.

Its email, password, TOTP secret and fallback code are **printed to the server
console at first boot** — read them there and put them straight into a password
manager. They are not shown again.

Override them per environment with `ODC_ADMIN_EMAIL` and `ODC_ADMIN_PASSWORD`.

Each admin gets its **own** randomly generated fallback code. It is stored on
the account, so changing it from the admin "My account" screen sticks. An
authenticator TOTP code works anywhere the fallback code does.

## Demo accounts (original)

Localhost only, as above. All share the password **`Bistro!2026`**.

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

# Test super admin
curl -s -X POST localhost:4000/tail/z7k9x2/admin/login -H 'Content-Type: application/json' \
  -d '{"email":"testsuperadmin@odc.in","password":"Test@1234","code":"000000"}'
```
