# O.D.C — User Guide

How to use O.D.C, whether you run a venue, work shifts, or operate the platform.

Developers setting the project up should read [README.md](README.md) instead.

---

## Contents

- [The basics](#the-basics)
- [Getting in](#getting-in)
- [If you run a venue](#if-you-run-a-venue)
- [If you work shifts](#if-you-work-shifts)
- [Money and escrow](#money-and-escrow)
- [When something goes wrong](#when-something-goes-wrong)
- [Verification (KYC)](#verification-kyc)
- [Language, theme and accessibility](#language-theme-and-accessibility)
- [For O.D.C operators](#for-odc-operators)
- [Common questions](#common-questions)

---

## The basics

O.D.C fills single shifts. A venue posts one, nearby verified crew are notified, someone takes it, and the money is held safely until the work is done.

```
Venue posts a shift
        ↓
Nearby matching crew are notified
        ↓
Crew accept, or counter-offer a different rate
        ↓
Venue locks one in  →  the full amount moves into escrow
        ↓
Crew arrive and check in with a 4-digit code
        ↓
Venue marks the shift complete
        ↓
Venue releases payment  →  it lands in the crew member's balance
        ↓
Both sides rate each other
```

A shift nobody accepts closes by itself after **12 hours**.

Two things are worth understanding up front, because they cause most of the confusion:

**The advertised rate is not the take-home rate.** O.D.C's fee (10% by default) comes off the crew member's side. A ₹2,000 shift pays the worker ₹1,800. Every screen shows both numbers before anyone commits — there are no surprises later.

**Money is held, not sent.** When a venue locks someone in, the amount leaves their control immediately and sits in escrow. The crew member can see it is secured, but cannot spend it until the venue approves the finished shift. Neither side can move it during a dispute.

---

## Getting in

### Creating an account

Go to **Register**, pick your role, and fill in the short form.

| Role | Pick this if |
|---|---|
| Chef / Cook | You work kitchen shifts |
| Waiter / Floor | You work service shifts |
| Venue / Banquet | You hire crew |

Chefs should list their specialties (Tandoor, Continental, and so on) — venues search by these, so an empty list means fewer shifts.

You'll get a 6-digit code by SMS to confirm your number. In a development build the code is shown on screen.

### Signing in

The normal way is **passwordless**: enter your mobile number, get a code, and you're in. There's no password to remember or lose.

If you'd rather use a password, **Use password instead** at the bottom of the login screen still works.

The role cards on the login screen only tailor the wording — your actual role comes from your account, so picking the wrong one doesn't grant you anything.

---

## If you run a venue

### Posting a shift

**Post a Shift** and fill in what you need: role, specialty for chefs, date, time window, pay range, and location. Adding your GPS location means nearby crew see it first.

Post it, and everyone matching within range is notified immediately.

Two things to keep in mind:

- The shift closes on its own after 12 hours if nobody takes it. The header shows a live countdown.
- Pay generously enough to be taken seriously. Crew see their take-home figure, not your advertised one.

### The Dispatch Desk

**Dispatch Desk** is where you run live shifts. Your requisitions are on the left; whoever responded is on the right.

Each applicant card shows their rating, verification badge, and the full money split:

```
Requested rate            ₹2,560
Worker receives           ₹2,304
O.D.C platform escrow fee   ₹256
```

Responses come in two kinds:

- **Direct accept** — they'll work at your advertised rate.
- **Counter-offer** — they want a different rate. These are highlighted in amber, because the number changed and you should read it.

**Accept & lock in shift** confirms them. At that moment the full amount moves into escrow, so only press it when you mean it.

### On the day

Open the shift to get the **Confirmed Shift Card**. It has the crew member's contact, the escrow breakdown, a map link, and a reference code.

When they arrive, give them the **4-digit arrival code** (tap *Show arrival code*). They enter it to check in — that's your proof they were on site.

When service is done:

1. **Mark shift complete**
2. **Release payment**

Releasing is the step that actually pays them. Until you do, the money sits in escrow.

---

## If you work shifts

### Finding work

**Shift Marketplace** lists everything open to you — matched on your role, your specialties if you're a chef, and your location.

Each card leads with what you'll actually receive:

```
Worker receives
₹1,665
              Offer ₹1,850
              O.D.C platform escrow fee ₹185
```

Turn on **Free now** in the header so venues know you're available and you get notified about matching shifts.

### Accepting or countering

**Accept & lock in shift** takes it at the advertised rate.

**Counter-offer** proposes a different rate. Drag the slider — your take-home updates live. Stay near the advertised range; offers far outside it are usually declined, and the app won't let you go beyond what the venue can accept.

Either way it goes to the venue, who decides. You'll be notified.

### On the day

Once you're confirmed, the shift opens as a **Confirmed Shift Card**: venue contact, exact pay, map link, and dress code.

When you arrive, ask the floor lead for the **4-digit arrival code** and enter it under *Check-in verification*. Do this — it's the record that you turned up.

After the venue marks the shift complete and releases payment, the money appears in your balance.

---

## Money and escrow

Everything lives under **Payments**.

| | |
|---|---|
| **Available balance** | Yours now. Withdraw any time. |
| **Held in escrow** | Earned but not yet released by the venue. |
| **Transaction history** | Every movement, oldest to newest. |

### Getting paid out

Add a payout method — UPI ID or a bank account — then use the transfer button on the balance card.

O.D.C stores **only the last four digits** of a bank account. The full number is never kept.

### Why escrow

The venue's money is committed the moment they lock you in. They can't quietly withdraw it, and you can see it's secured before you travel. In exchange, you can't draw on it until they confirm the work was done.

If the two of you disagree, neither side can move the money — see below.

---

## When something goes wrong

Raise a dispute from **Payments → Raise a dispute**, or from the confirmed shift.

This **freezes the escrow** immediately. Neither side can release or reclaim it while the dispute is open.

Pick the closest reason — no-show, late arrival, work quality, underpayment, unsafe conditions, or other — and explain what happened. Detail helps; O.D.C is deciding on what you write.

An O.D.C mediator reviews it and either releases the money to the crew member or refunds the venue. Both sides are notified with the reason.

Only one dispute can be open per shift, and a payment that has already been released can't be disputed this way — raise it before approving if something was wrong.

---

## Verification (KYC)

**Verification** is where you upload identity documents: Aadhaar, PAN, FSSAI food-handler certificate, or DigiLocker.

Verified crew get a badge that venues see when choosing between applicants. It measurably helps.

Documents go to an O.D.C reviewer, and you're notified when approved or rejected. Rejections say why — usually an unreadable scan.

**On your Aadhaar number:** O.D.C stores only the last four digits. The full number is never written to the database.

---

## Language, theme and accessibility

**Language** — the **English / हिन्दी** switch in the header changes the whole app instantly, including notifications and payment history. Your choice is remembered.

**Theme** — the sun/moon button toggles light and dark. It follows your device by default.

**Voice guide** — the *Listen* button on the login and registration screens reads the instructions aloud in your chosen language. It uses your device's own voice, so it works offline and costs nothing. It only appears if your device has a voice for that language installed.

The app is built for one-handed phone use, with large tap targets, visible keyboard focus, and text contrast that meets WCAG AA in both themes.

---

## For O.D.C operators

The admin console is at a private path and is not linked from the app. Sign-in requires email, password, and a TOTP code — there is no way around the second factor.

| Section | What it's for |
|---|---|
| **Home** | Live stats — accounts, fill rate, time-to-match, busiest venues |
| **Accounts** | Verify, suspend or ban users |
| **Shifts** | Every shift with its fee record |
| **Revenue & Fee** | Set the platform commission; the calculator previews the split before you save |
| **Treasury** | Platform-wide escrow position — held, frozen, settled, fees earned |
| **Disputes** | Settle frozen escrow: release to the worker or refund the venue |
| **Verification** | Approve or reject KYC documents |
| **Announcements** | Broadcast a message to a role or everyone |
| **Audit log** | Logins, failures, and every admin action |

Two notes on judgement:

**Fee changes apply going forward.** Existing matched shifts keep the rate they were agreed at. Changing it does not rewrite history.

**Dispute decisions move real money and cannot be undone.** Write the mediation note — both parties see it, and it's the only explanation they get.

---

## Common questions

**Why is my take-home less than the posted rate?**
The platform fee comes off the crew side. Every screen shows both figures before you commit.

**Nobody took my shift.**
It closes after 12 hours. Usually the rate is low for the slot, or the specialty is too narrow. Re-post with a wider range.

**I can't see any shifts.**
Check **Free now** is on, that your profile lists the right specialties, and that location permission is granted — matching uses all three.

**The venue hasn't released my payment.**
They must mark the shift complete first, then release. If they've gone quiet, message them in ShiftConnect, then raise a dispute.

**I lost the arrival code.**
The venue can show it again from their copy of the shift. It doesn't change.

**Can I change my number?**
Yes, under Profile → Contact details. It needs a code sent to the new number and your current password.

**I forgot my password.**
You probably don't need it — sign in with your mobile number and a one-time code instead.
