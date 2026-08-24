# Security follow-ups (reviewed 2026-08-20)

Findings from a security review of the Postgres/Railway sync pipeline and the
dashboard's API routes. Ordered by priority.

## 1. High priority — no authentication on any API route

**Files**: every `api/*.js` route (`orders.js`, `config.js`, `parcel-sla.js`,
`parcel-cost.js`, `cx-ship-cost.js`, `duplicate-orders.js`, `inventory.js`, etc.)

Every route only conditionally sets `Access-Control-Allow-Origin` if the
request's `Origin` header matches an allowlist — but never rejects the request
otherwise. CORS is a *browser-enforced* mechanism (stops a webpage's JS from
reading a cross-origin response); it does nothing to stop a direct HTTP client
(curl, Postman, a script) from getting the full response. There is no API key,
session, or any other server-side check anywhere.

**Verified live** (2026-08-20): `curl` with no `Origin` header, and `curl` with
a spoofed non-allowlisted `Origin`, both returned full 200 JSON responses with
real freight costs, tracking numbers, PO numbers, and carrier data from
production. Anyone who finds the dashboard's URL can pull this data with zero
credentials.

**Fix options**:
- Add a shared bearer token checked in each handler (simplest, no new infra)
- Vercel's built-in Deployment Protection
- Put the whole site behind Vercel password protection if it doesn't need to
  be publicly reachable at all

## 2. Medium priority — TLS certificate verification disabled on Postgres

**File**: `lib/db.js:5` — `ssl: { rejectUnauthorized: false }`

Accepts any certificate presented by the Postgres server, defeating protection
against a man-in-the-middle between Vercel and Railway. Requires an attacker
in a privileged network position to exploit (not a random internet attacker),
so lower priority than #1, but the fix is cheap.

**Fix**: use `rejectUnauthorized: true` with Railway's actual CA certificate
(or `sslmode=verify-full` with the correct CA bundle) instead of disabling
verification.

## 3. Medium priority — CSV/formula injection in Orders export

**Files**: `app.js` (`csvEscape()` + `exportOrdersToCSV()`), `lib/shopify.js`
(~line 210, `customerName` field)

`csvEscape()` only quotes values containing `,`/`"`/`\n` — it doesn't
neutralize a leading `=`, `+`, `-`, or `@`, which Excel/Sheets treat as the
start of a formula. `customerName` comes straight from the Shopify shipping
address "name" field, which a customer enters freely at checkout with no
sanitization anywhere in the pipeline.

**Exploit chain** (multi-step, so lower real-world likelihood): a customer
places an order with a shipping name like `=HYPERLINK(...)` → an ops employee
exports Orders to CSV → opens it in Excel without formula-warning protections
→ formula executes.

**Fix**: in `csvEscape()`, prefix any value starting with `=`, `+`, `-`, `@`,
tab, or CR with a `'` before quoting (standard CSV-injection mitigation).

---

**Checked and found clean**: SQL injection (all queries parameterized), XSS
(all dynamic fields escaped before `innerHTML` insertion in the tab-rendering
JS), hardcoded credentials (none found outside `.env`/`.env.example`
placeholders), and whether `sync-service/` is reachable on the public site
(`.vercelignore` correctly excludes it — verified via direct request, 404).
