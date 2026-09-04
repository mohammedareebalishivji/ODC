# ODC Feature Roadmap

## What ODC Has Now (Functional)

| Layer | Features |
|-------|----------|
| **Auth** | Signup → OTP verify → Login (email/phone) → 2FA (PIN + TOTP) → forgot/reset password |
| **Profiles** | Manager (biz name/type/address/license), Chef (specialties/experience/certs), Waiter (languages/ID) |
| **Shifts** | Post → browse (filtered by role/specialty/location) → respond (accept/counter) → match → auto-expire (12h) |
| **Payments** | Fee calculation (platform %), fee records, admin can adjust rate |
| **Ratings** | 1-5 stars + comment after matched shift, displayed in profiles |
| **Notifications** | In-app notifications + web push (VAPID) |
| **Admin** | Dashboard stats, user CRUD (verify/suspend/ban), fee management, announcements, audit logs |
| **Security** | Rate limiting, JWT + refresh rotation, TOTP, PIN, session management, delete account |
| **Database** | PostgreSQL 14 (migrated from SQLite), async pg.Pool, parameterized queries, race-safe seeding |
| **Frontend UI** | Tailwind CSS v4 + shadcn/ui (15 components), Lucide icons, responsive design, admin dashboard |

---

## Recently Completed

### Database Migration (SQLite → PostgreSQL)
- [x] Full server refactor: async `main()`, `initDatabase()`, `db.run/get/all/exec` → `pg.Pool`
- [x] All routes, auth, middleware, notify, jobs, seed migrated to `$1, $2...` parameterized queries
- [x] Type cast fixes: `COUNT(*)::int`, `AVG()::float` across source files
- [x] Race-safe seeding with `ON CONFLICT DO NOTHING`
- [x] 4 real bugs fixed: `.map(clean)`, `megaMinutes()` dead code, `fullUser()` snake_case, `push-subscribe` non-existent column
- [x] 84 tests passing with `--test-concurrency=1`

### Frontend Modernization (shadcn/ui + Tailwind CSS)
- [x] Tailwind CSS v4 installed with `@tailwindcss/vite` plugin, custom theme in `index.css`
- [x] 15 shadcn/ui components created: button, card, input, badge, dialog, label, separator, switch, tabs, avatar, scroll-area, progress + barrel index + `cn()` utility
- [x] All 19 pages migrated to shadcn/ui: Landing, Login, Signup, SignupForm, VerifyOtp, ForgotPassword, ResetPassword, AppShell, Home, Profile, Notifications, History, ShiftDetail, PostShift, Manage, Browse, MyWork, AdminLogin, AdminHome
- [x] Old `ui.jsx` reduced to utility functions only (toast, timeLeft, useNow, fmtMoney, etc.)
- [x] Clean build: 436KB JS, 39KB CSS, zero warnings

---

## Tier 1: Core Marketplace Gaps (Break-or-Make)

| # | Feature | Why It Matters |
|---|---------|----------------|
| 1 | **Messaging/chat** between matched manager ↔ worker | After match, contact info is shared but there's no in-app communication. Workers need to coordinate arrival, venue details, etc. |
| 2 | **Shift cancel/withdraw** flow | Manager can't cancel an open shift. Worker can't back out of a matched shift. No penalty or notification system for this. |
| 3 | **Shift completion confirmation** | No "I arrived" or "Shift done" button. No way to confirm the shift actually happened before rating. |
| 4 | **Payment processing** (Stripe/Razorpay) | Fees are calculated but never collected. No actual money movement. |
| 5 | **Document upload** (real files) | License, certs, IDs are stored as text strings. No actual file storage/verification workflow. |
| 6 | **Worker profile view** | Managers can't browse worker profiles. No way to see ratings, experience, specialties before accepting. |
| 7 | **Real-time updates** (WebSocket/SSE) | Everything is polling-based. Workers don't see new shifts instantly. Managers don't see responses in real-time. |

## Tier 2: UX/Client Gaps

| # | Feature | Current State |
|---|---------|---------------|
| 8 | **Search/filter on Browse** | No search bar, no sort (by pay/distance/date), no filter chips |
| 9 | **Map view** for shifts | Lat/lng stored but never shown on a map |
| 10 | **Availability calendar** | Toggle exists but no weekly schedule (e.g., "free Mon/Wed/Fri") |
| 11 | **Worker listing for managers** | Managers can't browse available workers by rating/location |
| 12 | **Image/photo upload** | Only base64 text for photos. No camera/file picker UI. |
| 13 | **Client-side form validation UX** | Server validates but no inline error states, field-level validation messages |
| 14 | **Loading/skeleton states** | Some pages have them, some don't |
| 15 | **Empty state illustrations** | Generic text, no visual empty states |
| 16 | **Pull-to-refresh** on mobile | No mobile-specific UX |
| 17 | **PWA support** (manifest, service worker) | No offline support, no install prompt |
| 18 | **Dark mode** | No theme support |

## Tier 3: Business Logic Gaps

| # | Feature | Why |
|---|---------|-----|
| 19 | **Recurring/repeating shifts** | Managers post the same shift weekly. No template/repeat feature. |
| 20 | **Shift templates** | Save common shifts as templates (e.g., "Saturday dinner rush") |
| 21 | **Worker verification workflow** | Admin sees uploaded docs but no approve/reject flow for documents |
| 22 | **Manager verification** | License files stored but never reviewed |
| 23 | **Payout/settlement tracking** | Fee records exist but no "mark as paid" or payout history UI |
| 24 | **Earnings dashboard** for workers | `workerStats()` exists in API but no dedicated earnings page |
| 25 | **Shift history with filters** | History page exists but unclear what it shows — need date/status filters |
| 26 | **Rating display on browse** | Workers don't see manager ratings when browsing shifts |

## Tier 4: Admin/Operations Gaps

| # | Feature | What's Missing |
|---|---------|----------------|
| 27 | **Admin user detail view** | Can only see table row, no profile drill-down |
| 28 | **Admin shift detail view** | Can only see table row, no shift drill-down |
| 29 | **Analytics/charts** | Just raw numbers, no trend graphs or time-series |
| 30 | **CSV/PDF export** | No export for shifts, users, revenue |
| 31 | **Report generation** | No weekly/monthly automated reports |
| 32 | **Content moderation** | No flagging/reporting for inappropriate users or reviews |

## Tier 5: Infrastructure/DevOps

| # | Feature | Status |
|---|---------|--------|
| 33 | **Docker setup** | None |
| 34 | **CI/CD pipeline** | None |
| 35 | **Environment config** (.env.example) | Minimal |
| 36 | **Production HTTPS** | Not configured |
| 37 | **Backup strategy** | None documented |
| 38 | **API documentation** (OpenAPI/Swagger) | None |
| 39 | **Error logging** (Sentry, etc.) | `console.log` only |
| 40 | **Monitoring/health checks** | Only basic `/health` endpoint |
| 41 | **Rate limiting docs** | Undocumented limits |
| 42 | **Client tests** | None (only server has tests) |

## Tier 6: Growth/Competitive Features

| # | Feature | Impact |
|---|---------|--------|
| 43 | **Referral system** | Invite friends, earn credits |
| 44 | **Promo codes/discounts** | First-shift discount, loyalty pricing |
| 45 | **In-app help/support** | FAQ, chat support, report issue |
| 46 | **Multi-language** (i18n) | Hindi, Tamil, etc. for Indian market |
| 47 | **SMS notifications** | Fallback when push isn't available |
| 48 | **Email notifications** | Shift confirmations, receipts |
| 49 | **Onboarding walkthrough** | First-time user tutorial |
| 50 | **Analytics for managers** | "Your best-performing shifts", "Avg fill time" |
| 51 | **Geofencing** | Auto-match workers within X km radius |
| 52 | **Shift swap marketplace** | Workers can offer to swap matched shifts |
| 53 | **Shift history/rating browsing** | "See how this manager treats workers" |
| 54 | **Seasonal/event pricing** | Dynamic pricing for holidays, festivals |
| 55 | **Corporate accounts** | Multiple managers under one business |

---

## Recommended Priority Order

### Phase 1 — Make it Usable (Tier 1)

- [ ] 1. Messaging/chat
- [ ] 2. Shift cancel/withdraw flow
- [ ] 3. Shift completion confirmation
- [ ] 4. Document upload (real files)
- [ ] 5. Worker profile view
- [ ] 6. Real-time updates (SSE)

### Phase 2 — Make it Good (Tier 2 + 3)

- [ ] 7. Search/filter + map view on Browse
- [ ] 8. Availability calendar
- [ ] 9. Earnings dashboard
- [ ] 10. Recurring shifts + templates
- [ ] 11. PWA + mobile UX
- [ ] 12. Client-side validation

### Phase 3 — Make it Scalable (Tier 4 + 5)

- [ ] 13. Docker + CI/CD
- [ ] 14. Admin detail views + charts
- [ ] 15. API documentation
- [ ] 16. Error logging + monitoring
- [ ] 17. Export/reporting

### Phase 4 — Make it Grow (Tier 6)

- [ ] 18. Referral + promo system
- [ ] 19. i18n + SMS
- [ ] 20. Geofencing + dynamic pricing
