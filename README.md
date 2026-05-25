# Steamoji Workshop Backend

Production-grade Node.js + Express + MongoDB backend that replaces the Google
Apps Script layer. Drop-in compatible with the existing frontend (`/exec?action=…`)
and also exposes a clean REST API under `/api`.

## Features
- **Express 4** with `helmet`, `compression`, `morgan`, `cors`, `express-rate-limit`
- **MongoDB / Mongoose** with connection pooling (`MONGODB_MAX_POOL=50`) and indexes
- **Cluster mode** (`npm run cluster`) to use all CPU cores
- **Pricing engine**: yearly members FREE, semi-yearly 50% off, others pay full
- **Square payments** (stubbed — returns a mock checkout URL until creds are set)
- **GAS-compatible** `/exec?action=…` endpoints so the existing frontend keeps working
- **Seed script** with realistic example data

## Setup

```bash
cd backend
npm install
cp .env.example .env      # edit values — MONGODB_URI is already set
npm run seed              # optional: clears & inserts example data
npm run dev               # http://localhost:4000
```

For production / real traffic:
```bash
NODE_ENV=production npm run cluster
```

## Endpoints

### GAS compat — drop-in for the old Google Apps Script URL
```
GET  /exec?action=lookup&email=…
GET  /exec?action=getSessions
GET  /exec?action=getRegistrations
GET  /exec?action=getValidation
POST /exec?action=saveSession         (body: session JSON)
POST /exec?action=register            (body: registration JSON)
POST /exec?action=deleteSession       (body: { sessionId })
POST /exec?action=deleteRegistration  (body: { registrationId })
POST /exec?action=updateValidation    (body: member JSON)
POST /exec?action=deleteValidation    (body: { rowIndex })
POST /exec?action=updateRegistration  (body: { id, badgeId, ... })
POST /exec?action=updateAllRegistrationsForUser
POST /exec?action=createPaymentLink   (body: { registrationId })
POST /exec?action=confirmPayment      (body: { registrationId })
```

### Clean REST
```
GET    /api/members
GET    /api/members/lookup?email=…
POST   /api/members
DELETE /api/members/:id

GET    /api/sessions
POST   /api/sessions
DELETE /api/sessions/:id

GET    /api/registrations
POST   /api/registrations
PATCH  /api/registrations/:id
DELETE /api/registrations/:id

POST   /api/payments/:registrationId/checkout
GET    /api/payments/:registrationId/status
```

## Data model + example values

### `members`

Only **approved** members live here. New sign-ups are created in the
separate `pendingmembers` collection (see below) and copied into `members`
when an admin clicks "Approve" on the Approvals page.
```json
{
  "_id": "65f2…",
  "badgeId": "B1001",
  "firstName": "Ava",
  "lastName": "Chen",
  "familyRole": "Child",
  "age": "9",
  "house": "Red",
  "level": "3",
  "school": "Maple Elementary",
  "parent": "Linda Chen",
  "parentEmail": "linda.chen@example.com",
  "phoneNumber": "+1-415-555-0101",
  "membershipType": "yearly",        // yearly | semi-yearly | none
  "approvedAt": "2026-04-19T14:22:00Z",
  "approvedBy": "admin@example.com"
}
```

### `pendingmembers`

Queue of sign-ups waiting for admin review. Approving a row moves it into
`members` and deletes it from this collection. Rejecting flips `status` to
`'rejected'` and stores the reason so the applicant can still see it on
their next lookup.
```json
{
  "_id": "66aa…",
  "firstName": "Liam",
  "lastName": "Garcia",
  "familyRole": "Child",
  "age": "11",
  "school": "Pine Middle",
  "parent": "Maria Garcia",
  "parentEmail": "maria.garcia@example.com",
  "phoneNumber": "+1-415-555-0334",
  "membershipType": "none",
  "status": "pending",               // pending | rejected
  "submittedBy": "",
  "reviewedAt": null,
  "reviewedBy": "",
  "rejectedReason": ""
}
```

### `sessions`
```json
{
  "id": "Sabc123xyz",
  "dt": "2026-04-19T10:00:00Z",
  "topic": "Public Speaking — Intro",
  "capacity": 10,
  "price": 20,
  "currency": "USD",
  "reg": ["REGABC123…"],
  "att": [
    { "badge": "B1002", "seat": "3", "ts": "2026-04-19T09:58:12Z", "out": null }
  ]
}
```

### `registrations`

Registrations store **only** what is specific to the registration event. All
member profile fields (name, badge, email, phone, age, house, level, school,
parent) live on `Member` and are joined in via `$lookup` when the API returns
registrations. This keeps Member as the single source of truth.

Raw document in MongoDB:
```json
{
  "id": "REGAB12CD34",
  "memberId": "65f2abc123…",        // → Member._id
  "sessionId": "Sabc123xyz",
  "sessionDate": "2026-04-19",
  "sessionTime": "10:00",
  "sessionTopic": "Public Speaking — Intro",
  "registeredBy": "admin",
  "registeredDateAndTime": "2026-04-17T14:03:00Z",
  "priceAmount": 10,                // 50% off because the member is semi-yearly
  "currency": "USD",
  "membershipType": "semi-yearly",  // snapshot at time of registration
  "paymentStatus": "pending",       // not_required | pending | paid | failed | refunded
  "paymentProvider": "",
  "paymentId": "",
  "paymentCheckoutUrl": "",
  "paidAt": null
}
```

API response shape (same as before — frontend stays unchanged):
```json
{
  "id": "REGAB12CD34",
  "memberId": "65f2abc123…",
  "sessionId": "Sabc123xyz",
  "sessionDate": "2026-04-19",
  "sessionTime": "10:00",
  "sessionTopic": "Public Speaking — Intro",
  "badgeId": "B1002",
  "firstName": "Noah",
  "lastName": "Patel",
  "parentEmail": "sanjay.patel@example.com",
  "phoneNumber": "+1-415-555-0182",
  "registeredBy": "admin",
  "registeredDateAndTime": "2026-04-17T14:03:00Z",
  "priceAmount": 10,
  "currency": "USD",
  "membershipType": "semi-yearly",
  "paymentStatus": "pending"
}
```

A unique compound index on `(memberId, sessionId)` prevents the same member
from being registered twice for the same session.

## Pricing logic

| Session price | Member type   | Amount due  |
|---------------|---------------|-------------|
| 0             | anyone        | **FREE**    |
| > 0           | yearly        | **FREE**    |
| > 0           | semi-yearly   | price × 0.5 |
| > 0           | none          | price       |

The backend computes this on every `POST /register` and stores `priceAmount`,
`membershipType`, and `paymentStatus` on the registration row.

## Square integration

1. Fill these env vars:
   ```
   SQUARE_ENV=sandbox            # or production
   SQUARE_ACCESS_TOKEN=…
   SQUARE_LOCATION_ID=…
   SQUARE_APPLICATION_ID=…
   CHECKOUT_REDIRECT_URL=https://your-app.com/payment/return
   ```
2. After a paid registration is created, call:
   ```
   POST /api/payments/<registrationId>/checkout
   ```
   It returns `{ checkoutUrl, paymentId }`. Redirect the parent there; Square
   handles the card. On return, call:
   ```
   GET /api/payments/<registrationId>/status
   ```
   It confirms with Square and marks the registration `paid` if successful.

Without creds, `createCheckout` returns a `mock_*` payment id and a mock
redirect URL, so you can test the end-to-end flow locally.

## Tuning for load

- `MONGODB_MAX_POOL=50` — raise for many-QPS workloads.
- `npm run cluster` forks one worker per CPU core and restarts any that crash.
- Put it behind a reverse proxy (nginx, Cloudflare, Vercel Edge, Render) that
  terminates TLS and serves the frontend from its CDN. The backend sets
  `trust proxy` so rate limits and IPs are accurate behind proxies.
- Compression + helmet + strict JSON parsing (1 MB cap) are already on.
- MongoDB indexes exist on `id`, `badgeId`, `parentEmail`, `sessionId`,
  `paymentStatus`, and compound `(parentEmail, firstName, lastName)`.
