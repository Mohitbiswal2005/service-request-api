# How to apply this pack

Everything from the review PDF plus the advanced feature set, ready to drop into your
repository. Each file was syntax-checked, linted clean with ESLint, loaded through the full
require graph, and the app was booted as a live Express server before packaging.

**Do not paste all of it in at once.** Go in the order below and run the server after each
step. The review will ask you to explain this code, so read what you paste.

---

## Phase 1 — the fixes that protect your marks

Do these before anything in Phase 2. They are the difference between ~67 and ~96.

| # | Step | Time |
|---|------|------|
| 1 | Copy `.env.example` to your repo root, and add the new keys to your own `.env` | 2 min |
| 2 | `npm install zod helmet cors express-rate-limit swagger-ui-express` | 5 min |
| 3 | Copy the `scripts`, `main`, `description`, `author` blocks from `package.json` | 5 min |
| 4 | `src/utils/` — four new files, nothing else changes yet | 10 min |
| 5 | `src/middleware/errorHandler.js` — the highest-value single change | 15 min |
| 6 | `src/models/User.js` and `src/models/Request.js` | 15 min |
| 7 | `src/validators/` — three new files, closes most of Task 4 | 30 min |
| 8 | `src/controllers/` and `src/routes/` | 30 min |
| 9 | `src/app.js` and `server.js` | 20 min |
| 10 | Import `postman/Service-Request-API.postman_collection.json`, delete the old one | 10 min |

**Do not install `express-mongo-sanitize`.** It is the usual NoSQL-injection recommendation
but it is broken on Express 5, which you are running. It throws
`TypeError: Cannot set property query of #<IncomingMessage> which has only a getter` on every
request. You do not need it: every Zod schema uses `.strict()`, so an operator key like `$gt`
is rejected as an unrecognised key. Good line to have ready for the review.

### Two traps

**`errorHandler.js` now exports two things.** If you are not yet using `src/app.js`, change
`const errorHandler = require(...)` to `const { notFound, errorHandler } = require(...)` and
add `app.use(notFound)` immediately before `app.use(errorHandler)`. Miss this and you get a
confusing "not a function" crash on boot.

**`select: false` on password breaks login until you also apply the new auth controller.**
`User.findOne({ email })` no longer returns the password field; the new controller asks for it
with `.select('+password')`. Apply steps 6 and 8 together.

---

## Phase 2 — the advanced features

These do not raise your assignment mark (the bonus is capped at 10 points and Phase 1 already
hits the cap). They exist to make the repository worth showing to an employer.

| Feature | Files | Explain-it difficulty |
|---------|-------|----------------------|
| Swagger / OpenAPI docs | `src/docs/openapi.js`, wired in `app.js` | Easy |
| Seed script | `scripts/seed.js` | Easy |
| Status history | `models/Request.js` pre-save hook | Easy |
| Soft delete + restore | `models/Request.js` query hooks | Medium |
| Advanced search | weighted text index, `searchMode` param | Medium |
| Audit logging | `models/AuditLog.js`, `services/auditService.js` | Medium |
| Admin role + aggregation | `routes/adminRoutes.js` | Medium |
| Refresh token rotation | `models/RefreshToken.js`, `services/tokenService.js` | **Hard** |
| Docker + compose | `Dockerfile`, `docker-compose.yml` | Medium |
| GitHub Actions CI | `.github/workflows/ci.yml` | Easy |

**Refresh token rotation is the one to be careful with.** It is the most impressive feature
here and the one most likely to be interrogated. If you cannot explain rotation, families and
reuse detection out loud, take it out. A half-understood refresh flow looks worse than none.
The explanations are in Part 3 of the Phase 2 PDF.

---

## Running it

```bash
npm install
cp .env.example .env        # then fill in your own values
npm run seed                # 3 users, 30 requests, one soft-deleted
npm run dev
```

Then open:

- `http://localhost:5000/api-docs` — interactive documentation
- `http://localhost:5000/health` — liveness probe

Seeded logins, all with password `Password123`:

| Email | Role | Data |
|-------|------|------|
| `admin@example.com` | admin | 8 requests, can see everything |
| `alice@example.com` | user | 14 requests, one soft-deleted |
| `bob@example.com` | user | 8 requests |

### With Docker instead

```bash
docker compose up --build
```

Starts MongoDB and the API together. Nothing to install but Docker.

---

## Tests

```bash
npm test
```

56 tests across four files. The first run downloads a MongoDB binary (~100 MB) for
`mongodb-memory-server`, so give it a minute.

**I could not execute these tests when building the pack** — my environment could not reach
the MongoDB download server. They are written, lint-clean and syntax-checked, and the
application code they exercise was booted and verified by hand. Run them yourself before you
commit, and expect to fix one or two small things.

The tests that matter most for marks are the six in `describe('ownership enforcement')` in
`tests/requests.test.js`. They prove the thing the brief cares about most.

---

## Lint

```bash
npm run lint
```

Currently zero errors and zero warnings. Keep it that way — the CI workflow fails the build
otherwise, and a red CI badge on your README is worse than no badge.

---

## Before you submit

1. Clone your own repo into a fresh folder, `npm install`, `npm start`. **Does it boot?**
2. Confirm `.env` and `node_modules` are still not in the repo.
3. Run the whole Postman collection with Runner. Everything should be green.
4. Commit in small logical steps rather than one big one. Reviewers do look at `git log`.
5. Rewrite the README yourself from the skeleton in Part 5 of the first PDF.

---

## What is deliberately not in this pack

**The README.** It is a skeleton in the first PDF rather than a finished file, because a
README written by someone else is obvious to a reader, and the brief explicitly warns about
submitting work you cannot explain. Write it in your own words.
