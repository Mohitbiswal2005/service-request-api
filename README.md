# Service Request Management API

A RESTful backend for managing service requests. Users register, log in, and create
and manage their own requests. Every request is scoped to its owner, so no user can
read or modify anything belonging to another user.

Built with Node.js, Express 5, MongoDB, Mongoose and JWT.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Data models](#data-models)
- [Authentication flow](#authentication-flow)
- [Authorization and ownership](#authorization-and-ownership)
- [Response format](#response-format)
- [API documentation](#api-documentation)
- [Filtering, search, pagination and sorting](#filtering-search-pagination-and-sorting)
- [Error handling](#error-handling)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Bonus features](#bonus-features)

---

## Tech stack

| Purpose | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 5 |
| Database | MongoDB (Atlas or local) |
| ODM | Mongoose 9 |
| Auth | JSON Web Tokens + rotating refresh tokens |
| Password hashing | bcryptjs |
| Request validation | Zod |
| Security | helmet, cors, express-rate-limit |
| API docs | swagger-ui-express (OpenAPI 3.0.3) |
| Tests | Jest + Supertest + mongodb-memory-server |
| Linting | ESLint 9 |

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/service-request-api.git
cd service-request-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then open `.env` and fill in your own values. Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For `MONGO_URI`, either use a free MongoDB Atlas cluster or a local instance:

```
mongodb://localhost:27017/service-request-api
```

### 4. Seed sample data (optional)

```bash
npm run seed
```

This creates three users and thirty requests so filtering, search and pagination all
have something to work with. One request is soft deleted so the restore endpoint has
something to restore.

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `Password123` | admin |
| `alice@example.com` | `Password123` | user |
| `bob@example.com` | `Password123` | user |

### 5. Start the server

```bash
npm run dev     # development, with auto-reload
npm start       # production
```

The server listens on `http://localhost:5000` by default.

- Interactive documentation: `http://localhost:5000/api-docs`
- Health check: `http://localhost:5000/health`

### Running with Docker instead

```bash
docker compose up --build
```

This starts MongoDB and the API together. Nothing needs to be installed except Docker.

---

## Environment variables

An `.env.example` file is committed. The real `.env` is git-ignored and must never be
committed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `5000` | Port the server listens on |
| `NODE_ENV` | no | `development` | Suppresses internal error details when set to `production` |
| `MONGO_URI` | **yes** | — | MongoDB connection string |
| `JWT_SECRET` | **yes** | — | Secret used to sign access tokens |
| `JWT_EXPIRES_IN` | no | `15m` | Access token lifetime |
| `REFRESH_TOKEN_DAYS` | no | `7` | Refresh token lifetime in days |

`server.js` checks for `MONGO_URI` and `JWT_SECRET` on boot and exits immediately if
either is missing, rather than failing later with a confusing error.

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with nodemon auto-reload |
| `npm run seed` | Wipe and repopulate the database with sample data |
| `npm test` | Run the Jest test suite |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint and fix what it can |
| `npm run docker:up` | Build and start the Docker stack |

---

## Data models

### User

| Field | Type | Notes |
|---|---|---|
| `name` | String | Required, 2–50 characters |
| `email` | String | Required, unique, lowercased, format validated |
| `password` | String | Required, minimum 8 characters, `select: false` |
| `role` | String | `user` or `admin`, defaults to `user` |
| `createdAt` | Date | Defaults to now |

The password is hashed with bcrypt in a `pre('save')` hook, so it is never stored in
plain text and the controller never has to remember to hash it. `select: false` means
the hash is excluded from every query result unless explicitly requested with
`.select('+password')`, which only the login controller does.

Email is stored lowercased so `Bob@example.com` and `bob@example.com` cannot become two
separate accounts.

### Request

| Field | Type | Notes |
|---|---|---|
| `requestId` | String | Required, unique, immutable, generated server side |
| `title` | String | Required, 3–120 characters |
| `description` | String | Required, 10–2000 characters |
| `category` | String | Required. `Technical`, `Billing`, `Hardware`, `Network`, `General` |
| `priority` | String | `Low`, `Medium`, `High`. Defaults to `Medium` |
| `status` | String | `Pending`, `In Progress`, `Completed`, `Cancelled`. Defaults to `Pending` |
| `createdBy` | ObjectId | Reference to User. Required and immutable |
| `statusHistory` | Array | Appended automatically on every status change |
| `isDeleted` | Boolean | Soft delete flag, defaults to `false` |
| `deletedAt` | Date | Set when soft deleted |
| `deletedBy` | ObjectId | Reference to the user who deleted it |
| `createdAt` | Date | Managed by Mongoose `timestamps` |
| `updatedAt` | Date | Managed by Mongoose `timestamps` |

`requestId` has the shape `REQ-<base36 timestamp>-<6 random hex>`, for example
`REQ-MTMMJEIQ-FAFF46`. Using a timestamp alone would collide if two requests were
created in the same millisecond, and it would be trivially guessable. The random suffix
fixes both.

Both `requestId` and `createdBy` are marked `immutable`, so even a bug in a controller
cannot rewrite the business key or transfer ownership.

### Indexes

```js
{ createdBy: 1, isDeleted: 1, createdAt: -1 }             // the default list query
{ createdBy: 1, isDeleted: 1, status: 1, priority: 1 }    // filtered list queries
{ title: 'text', description: 'text' }                    // weighted full-text search
```

The text index weights `title` at 5 and `description` at 1, so a match in the title
ranks above a match in the description.

### Supporting models

- **RefreshToken** — stores refresh tokens hashed with SHA-256, plus a `family` id, an
  expiry, and a revocation timestamp. A TTL index on `expiresAt` lets MongoDB delete
  expired documents automatically, so no cleanup job is needed.
- **AuditLog** — an append-only record of who did what, when, from which IP.

---

## Authentication flow

1. **Signup** (`POST /api/auth/signup`) validates the body with Zod, checks the email is
   not already taken, creates the user, and returns an access token plus a refresh token.
2. **Login** (`POST /api/auth/login`) looks the user up with `.select('+password')`,
   compares the supplied password against the bcrypt hash, and issues a new token pair.
   A missing user and a wrong password return the **same** message, so the endpoint
   cannot be used to discover which emails are registered.
3. **Protected routes** run the `protect` middleware, which:
   - reads the `Authorization: Bearer <token>` header
   - verifies the signature and expiry with `jwt.verify`
   - loads the user from the database and attaches it to `req.user`
   - returns 401 if the header is missing, the token is invalid or expired, or the user
     has since been deleted
4. **Refresh** (`POST /api/auth/refresh`) exchanges a refresh token for a new pair.
5. **Logout** (`POST /api/auth/logout`) revokes one refresh token, or all of a user's
   tokens with `{ "allDevices": true }`.

### Why two token types

The access token is a short-lived JWT (15 minutes by default). It is stateless, so
verifying it needs no database call, but that also means it cannot be revoked before it
expires. Keeping it short limits the damage if it leaks.

The refresh token is long-lived (7 days by default) but is **not** a JWT. It is 48 bytes
of random data with no claims in it, stored server side as a SHA-256 hash. Because it is
looked up in the database on every use, it can be revoked instantly.

### Rotation and reuse detection

Every refresh rotates: the token you present is revoked and a new one is issued in the
same **family**. If a token that has already been revoked is presented again, that means
someone is replaying a stolen token, so the entire family is revoked and every session
from that original login is killed.

---

## Authorization and ownership

Two separate mechanisms:

**Ownership.** `GET /api/requests` filters on `createdBy: req.user._id` inside the query
itself, so another user's requests are never fetched in the first place. For the
single-record routes, `findOwnedRequest()` loads the request and then compares
`request.createdBy` against `req.user._id`.

The distinction between 404 and 403 is deliberate:

- **404** — no request with that id exists
- **403** — it exists, but it belongs to somebody else

Changing the id in the URL to somebody else's request returns 403 on read, update and
delete.

**Role.** The `restrictTo('admin')` middleware guards the admin routes. A valid token
belonging to a non-admin gets 403; no token at all gets 401.

A third layer sits underneath both: every Zod schema uses `.strict()`, so sending
`createdBy` or `role` in a request body is rejected with a 400 as an unrecognised key.
Privilege escalation through the body is impossible.

---

## Response format

Every response uses the same envelope.

**Success**

```json
{
  "success": true,
  "message": "Request created successfully",
  "data": { }
}
```

**List responses** add pagination and echo back the filters that were applied:

```json
{
  "success": true,
  "data": [ ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "recordsOnPage": 10,
    "totalRecords": 34,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "appliedFilters": { "status": "Pending", "priority": "High" }
}
```

**Error**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Please provide a valid email address" },
    { "field": "password", "message": "Password must contain a number" }
  ]
}
```

Every response also carries an `x-request-id` header. If one is supplied on the way in it
is echoed back, otherwise one is generated. It appears in the server log line for that
request, which makes a single request traceable end to end.

---

## API documentation

Interactive OpenAPI documentation is served at `/api-docs` while the server is running.
The raw spec is at `/api-docs.json`.

Base URL: `http://localhost:5000`

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | none | Register a new account |
| POST | `/api/auth/login` | none | Log in |
| POST | `/api/auth/refresh` | refresh token in body | Exchange a refresh token for a new pair |
| POST | `/api/auth/logout` | Bearer | Revoke one or all refresh tokens |
| GET | `/api/auth/me` | Bearer | Return the current user |

#### POST /api/auth/signup

Request body:

```json
{
  "name": "Alice Kumar",
  "email": "alice@example.com",
  "password": "Password123"
}
```

Password rules: 8–72 characters, and must contain at least one lowercase letter, one
uppercase letter and one number.

Response `201`:

```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "id": "6710a1b2c3d4e5f600112233",
      "name": "Alice Kumar",
      "email": "alice@example.com",
      "role": "user",
      "createdAt": "2026-09-04T08:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "kQ2mZ8xF...",
    "expiresIn": "15m"
  }
}
```

Errors: `400` validation failed, `409` email already registered, `429` too many attempts.

#### POST /api/auth/login

Request body:

```json
{ "email": "alice@example.com", "password": "Password123" }
```

Response `200`: same shape as signup, with `"message": "Logged in successfully"`.

Errors: `400` validation failed, `401` invalid email or password, `429` too many attempts.

#### POST /api/auth/refresh

```json
{ "refreshToken": "kQ2mZ8xF..." }
```

Response `200` returns a new `accessToken` and a new `refreshToken`. The old one is now
dead.

Errors: `401` invalid, expired, or already-used token. Replaying a used token revokes
every session in that family.

#### POST /api/auth/logout

Requires `Authorization: Bearer <accessToken>`. Body must contain either a
`refreshToken` or `allDevices`:

```json
{ "refreshToken": "kQ2mZ8xF..." }
```

```json
{ "allDevices": true }
```

Response `200`. Errors: `400` if neither field is present, `401` if the access token is
missing or invalid.

---

### Service requests

All of these require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/requests` | Create a request |
| GET | `/api/requests` | List your requests, with filters |
| GET | `/api/requests/stats` | Aggregated counts for your requests |
| GET | `/api/requests/:requestId` | Get one request |
| GET | `/api/requests/:requestId/history` | Status change history |
| PUT | `/api/requests/:requestId` | Update a request |
| DELETE | `/api/requests/:requestId` | Soft delete a request |
| POST | `/api/requests/:requestId/restore` | Restore a soft-deleted request |

#### POST /api/requests

```json
{
  "title": "Login server returning 502",
  "description": "The authentication server has been returning 502 errors since this morning's deploy.",
  "category": "Technical",
  "priority": "High"
}
```

`requestId`, `status` and `createdBy` are all set by the server. Sending any of them is
rejected with a 400.

Response `201`:

```json
{
  "success": true,
  "message": "Request created successfully",
  "data": {
    "requestId": "REQ-MTMMJEIQ-FAFF46",
    "title": "Login server returning 502",
    "description": "The authentication server has been returning 502 errors since this morning's deploy.",
    "category": "Technical",
    "priority": "High",
    "status": "Pending",
    "createdBy": "6710a1b2c3d4e5f600112233",
    "statusHistory": [
      { "status": "Pending", "changedBy": "6710a1b2c3d4e5f600112233", "changedAt": "2026-09-04T08:00:00.000Z" }
    ],
    "isDeleted": false,
    "createdAt": "2026-09-04T08:00:00.000Z",
    "updatedAt": "2026-09-04T08:00:00.000Z",
    "ageInDays": 0
  }
}
```

Errors: `400` validation failed, `401` no token.

#### GET /api/requests/:requestId

Response `200` returns the single request.

Errors: `400` malformed id, `401` no token, `403` the request belongs to another user,
`404` no such request.

#### PUT /api/requests/:requestId

Every field is optional, but any field that is present is validated. The body cannot be
empty.

```json
{ "status": "In Progress", "statusNote": "Investigating the load balancer" }
```

`statusNote` may only be sent alongside a `status` change. Updates go through
`document.save()`, not `findOneAndUpdate`, so full schema validation and the status
history hook both run.

Errors: `400` validation failed, `401` no token, `403` not yours, `404` not found.

#### DELETE /api/requests/:requestId

Soft deletes. The document stays in the database with `isDeleted: true`, and query
middleware hides it from every ordinary query.

Response `200`:

```json
{
  "success": true,
  "message": "Request deleted successfully",
  "data": { "requestId": "REQ-MTMMJEIQ-FAFF46", "deletedAt": "2026-09-04T09:15:00.000Z" }
}
```

#### GET /api/requests/stats

```json
{
  "success": true,
  "data": {
    "total": 14,
    "byStatus": { "Pending": 5, "In Progress": 3, "Completed": 4, "Cancelled": 2 },
    "byPriority": { "Low": 4, "Medium": 6, "High": 4 },
    "byCategory": { "Technical": 6, "Billing": 3, "Hardware": 2, "Network": 2, "General": 1 }
  }
}
```

---

### Admin

All of these require a token belonging to a user whose `role` is `admin`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/requests` | Every request in the system, including soft-deleted ones, with the owner populated |
| GET | `/api/admin/stats` | Platform-wide aggregation, including the top five users by request count |
| GET | `/api/admin/audit-logs` | The audit trail, filterable by `action` and `entityId`, paginated |

Errors: `401` no token, `403` valid token but not an admin.

---

### System

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness probe. Returns uptime |
| GET | `/api-docs` | Interactive Swagger UI |
| GET | `/api-docs.json` | Raw OpenAPI 3.0.3 spec |

---

## Filtering, search, pagination and sorting

All query parameters apply to `GET /api/requests`.

| Parameter | Values | Default | Description |
|---|---|---|---|
| `status` | `Pending`, `In Progress`, `Completed`, `Cancelled` | — | Filter by status |
| `priority` | `Low`, `Medium`, `High` | — | Filter by priority |
| `category` | `Technical`, `Billing`, `Hardware`, `Network`, `General` | — | Filter by category |
| `search` | any string, max 100 chars | — | Search title and description |
| `searchMode` | `regex`, `text` | `regex` | Which search strategy to use |
| `createdAfter` | ISO date | — | Only requests created on or after this date |
| `createdBefore` | ISO date | — | Only requests created on or before this date |
| `sort` | `createdAt`, `updatedAt`, `title`, `priority`, `status` | `createdAt` | Sort field |
| `order` | `asc`, `desc` | `desc` | Sort direction |
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | integer 1–100 | `10` | Records per page |

Filters combine freely:

```
GET /api/requests?status=Pending&priority=High&category=Technical
GET /api/requests?search=server&sort=createdAt&order=desc&page=2&limit=5
GET /api/requests?createdAfter=2026-01-01&createdBefore=2026-06-30
```

### Two search modes

`regex` (the default) does case-insensitive substring matching across `title` and
`description`, so `?search=serv` matches "server". User input is escaped before it
reaches the regex, because otherwise a search for `c++` throws, and a pattern like
`(a+)+$` is a ReDoS that can hang the event loop.

`text` uses the weighted MongoDB text index. It matches whole words only, but it ranks
results by relevance and returns a `score` on each record, with title matches scoring
higher than description matches.

```
GET /api/requests?search=serv                       # regex, substring
GET /api/requests?search=server&searchMode=text     # ranked, whole words
```

### Validation of query parameters

The query string is validated by a Zod schema, which means:

- `?priority=Urgent` returns 400 rather than silently returning nothing
- `?page=0` returns 400
- `?limit=999999` returns 400, so nobody can dump the whole collection in one call
- `?sort=password` returns 400, because only whitelisted fields are sortable
- `?createdAfter=2026-06-01&createdBefore=2026-01-01` returns 400, because the range is
  backwards
- unrecognised parameters return 400, because the schema is `.strict()`

`page` and `limit` arrive as strings and are coerced to numbers by the schema, so the
controller receives real integers.

---

## Error handling

All errors funnel through a single error-handling middleware in
`src/middleware/errorHandler.js`. Controllers never contain a `try/catch`; they are
wrapped in an `asyncHandler` that forwards any rejected promise to `next()`.

A `notFound` middleware sits after every route, so an unmatched URL returns a JSON 404
rather than Express's default HTML page.

The handler translates framework and driver errors into the right status codes:

| Condition | Status | Response |
|---|---|---|
| Success | 200 | |
| Resource created | 201 | |
| Zod or Mongoose validation failure | 400 | Per-field `errors` array |
| Mongoose `CastError` (malformed id) | 400 | |
| Missing, invalid or expired token | 401 | |
| Valid token, wrong user or wrong role | 403 | |
| Route or resource not found | 404 | |
| Duplicate key (`E11000`) or invalid state transition | 409 | |
| Rate limit exceeded | 429 | |
| Anything unhandled | 500 | |

When `NODE_ENV=production`, 500-level responses are replaced with a generic
"Internal Server Error" message so stack traces and driver internals are never leaked to
a client. The full error is still written to the server log.

### Security measures

- `helmet` sets security headers on every response
- `cors` is enabled
- JSON bodies are capped at 10 KB
- `/api/auth` is rate limited to 20 requests per 15 minutes per IP, to slow down
  credential stuffing
- the rest of `/api` is limited to 300 requests per 15 minutes per IP
- passwords are bcrypt hashed and excluded from query results by default
- refresh tokens are stored as SHA-256 hashes, so a database dump does not hand an
  attacker a set of usable sessions
- NoSQL operator injection is blocked by `.strict()` on every Zod schema: a payload like
  `{"email": {"$gt": ""}}` is rejected as an unrecognised key before it reaches Mongoose

---

## Project structure

```
.
├── src/
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── controllers/              # request handling, no business rules in the routes
│   │   ├── authController.js
│   │   └── requestController.js
│   ├── docs/
│   │   └── openapi.js            # OpenAPI 3.0.3 spec served at /api-docs
│   ├── middleware/
│   │   ├── auth.js               # protect (JWT) and restrictTo (roles)
│   │   └── errorHandler.js       # notFound + centralised error handler
│   ├── models/                   # Mongoose schemas, validation and hooks
│   │   ├── AuditLog.js
│   │   ├── RefreshToken.js
│   │   ├── Request.js
│   │   └── User.js
│   ├── routes/                   # URL to controller mapping only
│   │   ├── adminRoutes.js
│   │   ├── authRoutes.js
│   │   └── requestRoutes.js
│   ├── services/                 # logic that is not tied to one HTTP request
│   │   ├── auditService.js
│   │   └── tokenService.js
│   ├── utils/
│   │   ├── ApiError.js           # error class carrying an HTTP status code
│   │   ├── asyncHandler.js       # removes try/catch from every controller
│   │   ├── escapeRegex.js
│   │   └── generateRequestId.js
│   ├── validators/               # Zod schemas for body, query and params
│   │   ├── authValidators.js
│   │   ├── requestValidators.js
│   │   └── validate.js
│   └── app.js                    # Express app: middleware, routes, error handling
├── scripts/
│   └── seed.js
├── tests/
├── postman/
│   └── Service-Request-API.postman_collection.json
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── server.js                     # boot, config check, graceful shutdown
```

`server.js` is separate from `src/app.js` on purpose. `app.js` exports a configured
Express app with no side effects, which lets the test suite import it and drive it with
Supertest without ever opening a port.

---

## Testing

### Postman

`postman/Service-Request-API.postman_collection.json` contains 56 requests organised
into folders:

| Folder | Covers |
|---|---|
| 00 — System & Docs | Health check, OpenAPI spec |
| 01 — Authentication | Signup, login, `/me`, and the validation failure cases |
| 02 — Refresh Tokens | Rotation, reuse detection, logout, logout everywhere |
| 03 — Service Requests | Full CRUD, history, soft delete, restore |
| 04 — Filtering, Search, Pagination | Every query parameter, individually and combined |
| 05 — Admin & Audit | Admin-only routes and the audit trail |
| 06 — Security & Error Handling | 401, 403, 404, 409 and the validation guards |

To use it: import the collection, set the `baseUrl` variable to
`http://localhost:5000`, then run the folders in order. The signup and login requests
save their tokens into collection variables automatically, so later requests are
authenticated without any copying and pasting.

Note that `/api/auth` is rate limited to 20 requests per 15 minutes. A single full pass
of the collection uses 13 of those, so running it twice in quick succession will produce
429s on the second pass.

### Automated tests

```bash
npm test
```

Jest and Supertest, against an in-memory MongoDB instance provided by
`mongodb-memory-server`, so the tests need no running database and leave no state
behind. The first run downloads a MongoDB binary, so allow an extra minute.

| File | Covers |
|---|---|
| `tests/auth.test.js` | Signup validation, duplicate emails, login, token rejection |
| `tests/requests.test.js` | CRUD, ownership enforcement, filters, search, pagination, sorting |
| `tests/advanced.test.js` | Refresh rotation, status history, soft delete, admin routes, audit trail |

The tests that matter most are the ones in `describe('ownership enforcement')`. They
prove that user B cannot read, update or delete user A's request by changing the id in
the URL, and that ownership cannot be transferred through the request body.

### Linting

```bash
npm run lint
```

ESLint 9 with the recommended ruleset. The CI workflow in
`.github/workflows/ci.yml` runs the linter and the test suite on Node 20 and 22 on every
push and pull request, and separately verifies that the Docker image builds.

---

## Bonus features

Implemented beyond the core requirements:

| Feature | Where |
|---|---|
| Admin role and admin-only routes | `middleware/auth.js`, `routes/adminRoutes.js` |
| Status history | `models/Request.js` pre-save hook, `GET /:requestId/history` |
| Soft delete and restore | `models/Request.js` query hooks, `DELETE` and `/restore` |
| Rate limiting | `app.js`, tighter on `/api/auth` than on the rest |
| Automated tests | `tests/` |
| Swagger / OpenAPI documentation | `src/docs/openapi.js`, served at `/api-docs` |
| Refresh token rotation with reuse detection | `services/tokenService.js` |
| Advanced search | Weighted text index plus a `searchMode` parameter |
| Audit logging | `models/AuditLog.js`, `services/auditService.js` |
| Docker and docker-compose | `Dockerfile`, `docker-compose.yml` |
| CI pipeline | `.github/workflows/ci.yml` |

### A note on Mongoose 9

Mongoose 9 removed the `next` callback from schema middleware. All hooks in this project
are promise-based and simply return when they are done, rather than calling `next()`.
Copying a `pre('save')` hook from an older tutorial into this codebase will throw
`next is not a function`.

---

## Licence

MIT
