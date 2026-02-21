# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Telegraaf Horen CRM v2.0** — A secure, multi-user Customer Relationship Management system for managing contacts and business relationships. Built with Node.js + Express + SQLite, running on Railway.app cloud (€5/maand).

**Key fact:** This is a **security-first implementation** (Phase 1 complete). All routes require authentication, audit logging is mandatory, and sensitive data is protected.

---

## Architecture & Stack

### Backend
- **Framework:** Express.js (Node.js)
- **Database:** SQLite via sql.js (in-memory with file persistence)
- **Authentication:** Sessions + bcryptjs password hashing
- **Security:** Helmet, CORS (restricted), Rate limiting
- **Logging:** Winston (audit logs, error logs — NO PII in logs)
- **Port:** 3001 (development), Railway dynamic (production)

### Frontend
- **Tech:** Vanilla HTML/CSS/JavaScript (no framework)
- **Branding:** Telegraaf Horen huisstijl (donkerblauw #12243E, teal #3AA6B9, beige #D1B18A)
- **Languages:** Dutch (UI + domain terms), English (technical)

### Database Schema (Phase 1)

Three core tables:

```
contacts:
  - id (PK), naam, email, telefoonnummer, bedrijf
  - type (klant/prospect/partner), status, notities
  - aangemaakt_op, bijgewerkt_op (timestamps)

gebruikers:
  - id (PK), naam, gebruikersnaam (UNIQUE), wachtwoord_hash
  - rol (admin/medewerker/viewer), actief, laatste_login
  - aangemaakt_op

audit_log:
  - id, gebruiker_id (FK), actie, resource_type, resource_id
  - ip_adres, tijdstip
  - PURPOSE: Track all mutations (WHO, WHAT, WHEN) — NO data content
```

---

## Module Structure

### Core Modules

**`server.js`** (370 lines)
- Express app initialization with 13 middleware layers
- Security: Helmet, CORS, rate limiting, session management
- 3 routes: `/login` (POST), `/logout` (GET), `/api/*` (protected)
- 5 API endpoints: health, mij, contacts (CRUD)
- Error handlers: Generic errors (no internal details leak), 404 handler

**`auth.js`** (65 lines)
- `vereistInlog` middleware — checks session existence
- `vereistRol(minimaleRol)` middleware — role-based access (viewer < medewerker < admin)
- `verificeerInlog()` — bcryptjs comparison with timing-attack mitigation
- `hashWachtwoord()` — bcryptjs.hash(pw, 12) for new users

**`database.js`** (320 lines)
- Uses sql.js (SQLite in-memory + file persistence)
- Pattern: `db.prepare()` → `stmt.bind()` → `stmt.step()` → `stmt.getAsObject()`
- **CRITICAL:** Always call `saveDatabase()` after writes
- Contact functions: CRUD + getAllContacts (no pagination yet)
- User functions: getGebruikerByNaam, getAllGebruikers, createGebruiker, updateLaatsteLogin
- Audit function: logAudit(userId, actie, resourceType, resourceId, ipAdres)

**`logger.js`** (65 lines)
- Winston transport setup (audit.log, error.log)
- `auditLog(actie, gebruikersnaam, resourceId, extra)` — signature in this exact order
- `logError()` — for debugging (stack traces are safe)
- ⚠️ `database.js` has a separate `logAudit()` — these are two independent systems. `server.js` uses only `logger.js`'s `auditLog()`

**`create-admin.js`** (50 lines)
- CLI tool: `node create-admin.js "Naam" "username" "password"`
- Auto-called via `npm run create:admin`
- Validates: min 8-char password, unique username
- Hashes password + inserts into gebruikers table

**`public/login.html`** (220 lines)
- Telegraaf Horen branded login form
- Async fetch to `/login` endpoint via `public/login.js`
- Shows error on failed auth (vague message, no user enumeration)
- ⚠️ CSP: NO inline event handlers allowed (`onsubmit`, `onclick` etc. are blocked by Helmet's `script-src-attr: 'none'`). All event listeners must be in `login.js` via `addEventListener`

**`public/login.js`** (110 lines)
- Handles login form submission via `addEventListener('submit', handleLogin)`
- Manages loading state, error display, and redirect on success

### Configuration Files

**`.env`** (required, NOT in git)
```
NODE_ENV=development|production
PORT=3001
SESSION_SECRET=[64-char random, generated once]
TOEGESTAAN_ORIGIN=http://localhost:3001|https://app.railway.app
DB_PATH=./crm.db
LOG_DIR=./logs
# Auto-admin bij lege database (exact deze namen — server.js leest ADMIN_NAAM + ADMIN_GEBRUIKER + ADMIN_WACHTWOORD):
ADMIN_NAAM=Mield
ADMIN_GEBRUIKER=mield
ADMIN_WACHTWOORD=SterkWachtwoord123!
```

**`.env.template`** (for distribution)
- Same structure as `.env` but with placeholder values
- Included in git for setup reference

**`railway.json`** (deployment config)
- Minimal config for Railway.app NIXPACKS builder
- startCommand: `node server.js`
- Auto-detects PORT from Railway environment

---

## Common Development Tasks

### Run Server
```bash
npm start              # Production-like, requires .env
npm run dev          # Same (alias)
```

### Create First Admin
```bash
npm run create:admin -- "Mield" "mield" "YourPassword123!"
```

### Test Locally
1. Ensure Intake Tracker is stopped (port 3000 conflict)
2. Start CRM: `npm start`
3. Navigate: `http://localhost:3001/login`
4. Login with credentials from `create-admin`

### Add New API Endpoint
1. **Add middleware stacking** in `server.js`:
   ```javascript
   app.get('/api/custom', vereistInlog, vereistRol('medewerker'), (req, res) => {
     auditLog('custom_actie', req.session.gebruiker.gebruikersnaam, resourceId, { ip: req.ip });
     res.json({ success: true, data: ... });
   });
   ```
   - ALWAYS include `vereistInlog`
   - Add `vereistRol()` if only certain roles should access
   - ALWAYS call `auditLog()` for mutations — signature: `(actie, gebruikersnaam, resourceId, extra)`
   - NEVER expose error messages: catch and log, return generic error

2. **Database functions** in `database.js`:
   - Use parameterized queries: `db.prepare('... WHERE id = ?')`
   - NEVER use string concatenation in SQL
   - Always `saveDatabase()` after INSERT/UPDATE/DELETE
   - Return early if not found (null or empty array)

3. **Frontend** in `public/app.js`:
   - Fetch authenticated (cookies sent automatically with `credentials: 'include'`)
   - Handle 401 → redirect to `/login`
   - Show errors to user (but check audit logs for details)

### Database Schema Changes
- All migrations happen in `initDatabase()` via `tableNames.includes()` checks
- Add new table creation block in `database.js` → `initDatabase()`
- Add export function in `module.exports` at bottom
- Example:
  ```javascript
  if (!tableNames.includes('new_table')) {
    db.run(`CREATE TABLE new_table (...)`);
    console.log('[DB] Created new_table');
  }
  ```

---

## Security Model (Phase 1)

### Authentication Flow
1. User visits `/login` → `login.html` form
2. Form posts to `POST /login` with username + password
3. Server calls `verificeerInlog()` → bcryptjs.compare (slow, timing-safe)
4. On success: `session.regenerate()` → store user object → return JSON
5. On failure: vague error ("username or password incorrect"), no user enumeration
6. On access: `vereistInlog` middleware checks `req.session.gebruiker`

### Authorization: Role-Based Access Control (RBAC)
- **admin:** Full access, can CRUD contacts + manage users (future)
- **medewerker:** Can CREATE/READ/UPDATE contacts, cannot DELETE
- **viewer:** READ-only (for future external consultants)
- Middleware: `vereistRol('medewerker')` checks role rank; 403 if insufficient

### Audit Trail
Every mutation logged to `audit_log` table:
- `ingelogd` (login success)
- `inlog_mislukt` (failed login, no username leaked)
- `contact_bekeken` (read)
- `contact_aangemaakt` (create)
- `contact_bijgewerkt` (update)
- `contact_verwijderd` (delete)

**CRITICAL:** Audit logs contain ONLY IDs and actions, NEVER names/emails/data.

### Defense Layers
1. **CORS:** Only `TOEGESTAAN_ORIGIN` can call API (blocks external sites)
2. **Rate Limiting:** Max 5 login attempts per 15 min per IP
3. **Password Hashing:** bcryptjs 12 rounds (200ms per attempt = secure)
4. **Session Timeout:** 8 hours inactive → auto-logout
5. **Input Validation:** Server-side trimming, type checking (no SQL injection)
6. **Error Handling:** No stack traces to client, logged internally
7. **HTTPS:** Railway auto-enforces HTTPS in production

---

## Deployment (Railway.app)

### Pre-Deployment Checklist
- [ ] Code committed to GitHub (crm-project repo)
- [ ] `.env` NOT in git (check `.gitignore`)
- [ ] `npm install` successful
- [ ] Local test: login works, contacts can be CRUD'd
- [ ] First admin created: `npm run create:admin`

### Deploy Steps
1. Push to GitHub: `git push origin main`
2. Railway detects push → auto-deploys
3. Set environment variables in Railway dashboard:
   - `NODE_ENV=production`
   - `SESSION_SECRET=[64-char]` (generate fresh: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `TOEGESTAAN_ORIGIN=https://[your-app].railway.app`
   - `DB_PATH=/data/crm.db`
   - `LOG_DIR=/data/logs`
4. Add Volume: Mount `/data` → persists database + logs across restarts
5. Test: `https://[your-app].railway.app/login`

### Post-Deployment
- Create admin: `railway run npm run create:admin -- "Name" "user" "pw"`
- Check logs: `railway logs -f`
- Invite colleagues: share URL + username

---

## Code Patterns & Conventions

### SQL Queries
```javascript
// ✅ CORRECT — parameterized
const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
stmt.bind([parseInt(id)]);

// ❌ WRONG — string concatenation
const stmt = db.prepare('SELECT * FROM contacts WHERE id = ' + id);
```

### API Responses
```javascript
// Success
res.json({ success: true, data: {...} });
res.status(201).json({ success: true, data: {...} });  // Create

// Error
res.status(400).json({ success: false, error: 'User-friendly message' });
res.status(401).json({ success: false, error: 'Niet ingelogd' });
res.status(403).json({ success: false, error: 'Onvoldoende rechten' });
res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
```

### Input Validation
```javascript
// Sanitize + validate before use
const naam = String(naam).trim().substring(0, 200);
const email = email ? String(email).trim().toLowerCase().substring(0, 254) : null;
const tel = telefoonnummer
  ? String(telefoonnummer).replace(/[^\d\s+\-()]/g, '').substring(0, 20)
  : null;

// Whitelist enum values
const geldige_types = ['klant', 'prospect', 'partner'];
if (!geldige_types.includes(type)) type = 'klant';
```

### Middleware Stacking
```javascript
// Rate limit all /api routes
app.use('/api/', algemeenLimiet);

// Login rate limit: only on POST (NOT app.use('/login') — that would also block GET page loads)
app.post('/login', loginLimiet, async (req, res) => {...});

// Protect specific route
app.post('/api/contacts', vereistInlog, vereistRol('medewerker'), (req, res) => {...});
                          // ^^^ check session, ^^^ check role
```

---

## Testing & Debugging

### Manual Test Flow
1. **Health check:** `GET /api/health` (no auth required in test)
2. **Bad login:** POST `/login` with wrong password → 401
3. **Good login:** POST `/login` with correct creds → session cookie set
4. **Access protected:** GET `/api/contacts` → 200 (session present)
5. **Audit log:** Check `logs/audit.log` for entries
6. **Logout:** GET `/logout` → session destroyed, cookie cleared

### Check Audit Log
```bash
tail -f logs/audit.log  # Real-time
cat logs/audit.log | grep "contact_aangemaakt"  # Filter by action
```

### Database Inspection
```bash
# Dump all contacts (careful with PII)
# Use database.getAllContacts() in app.js console

# Check user count
# SELECT COUNT(*) FROM gebruikers;  (via direct query in initDatabase)
```

---

## File Locations & Size Estimates

```
crm-project/
├── server.js              (370 lines) — Main Express app + routes
├── auth.js                (65 lines)  — Authentication middleware
├── logger.js              (65 lines)  — Audit logging
├── database.js            (320 lines) — Database layer
├── create-admin.js        (50 lines)  — Admin setup CLI
├── package.json           (35 lines)  — Dependencies
├── railway.json           (10 lines)  — Railway config
├── .env                   — Configuration (NOT in git)
├── .env.template          — Template for setup (in git)
├── .gitignore             — Excludes secrets, db, logs
├── public/
│   ├── index.html         (200 lines) — Dashboard + contact form
│   ├── login.html         (220 lines) — Login form (Telegraaf Horen branding)
│   ├── app.js             (TBD)      — Frontend logic
│   └── style.css          (TBD)      — Styling
├── logs/                  — audit.log, error.log (created at runtime)
├── crm.db                 — SQLite database (created at first run)
├── sessies.db             — Session store (created at first run)
└── CLAUDE.md              — This file
```

---

## Gotchas & Warnings

### 🚨 NEVER
- **Commit `.env`** — Contains SESSION_SECRET, credentials
- **Log PII** — auditLog() must ONLY have actie, user ID, resource ID
- **Expose errors** — catch and return generic "fout opgetreden" message
- **Trust client data** — Always validate/sanitize server-side
- **Use string concat in SQL** — Always parameterized queries
- **Skip `saveDatabase()`** — After every write, call it
- **Skip `vereistInlog`** — All routes (except /login) need auth check

### ⚠️ Watch Out
- **Port 3001 conflict** — Intake Tracker may be running, change PORT or kill old process
- **SQLite concurrency** — sql.js locks entire DB during write (acceptable for this scale)
- **Session timeout** — 8 hours, auto-logout may surprise users
- **Rate limiting** — Legitimate users get blocked after 5 failed logins for 15 min; limiter is on `app.post('/login')` only — NOT `app.use('/login')`
- **bcryptjs is slow** — By design (200ms per hash), DO NOT reduce rounds below 12
- **CSP blocks inline handlers** — Helmet sets `script-src-attr: 'none'`. Never add `onsubmit`, `onclick` etc. directly in HTML. All handlers must be in `.js` files using `addEventListener`
- **Edge vs Chrome** — Edge enforces CSP more strictly than Chrome. Test login in Edge after any login.html changes
- **`.env` variable names** — `server.js` reads `ADMIN_NAAM`, `ADMIN_GEBRUIKER`, `ADMIN_WACHTWOORD`. Using wrong names (e.g. `ADMIN_GEBRUIKERSNAAM`) silently skips auto-admin creation
- **Sessions in development** — In-memory store (development); SQLiteStore only in production. Sessions lost on every server restart during dev

### 📌 Remember
- **Phase 1 = Security baseline** — Features (search, dashboard) come in Phase 2
- **Dutch-first UI** — domain terms (klant, gehoortest, etc.) stay Dutch
- **Production-ready from day 1** — Code assumes Railway deployment + real users
- **Audit = accountability** — Every action is logged for compliance (AVG)

---

## Next Steps (Phase 2+)

Not in Phase 1, but planned:

- **Search & filter:** Contact lookup by name, email, phone, company
- **Dashboard:** Stats (new contacts this week, pending follow-ups)
- **Bulk import:** CSV or PDF batch upload
- **Bedrijven module:** Company management (separate table)
- **Contact timeline:** History of changes, notes, activities
- **Intake Tracker integration:** Share customer data between CRM and Intake system
- **2FA/passwordless:** Enhanced auth methods
- **Admin panel:** UI for user management (currently CLI only)

---

## References

- **README.md** — User-facing documentation (setup, API endpoints)
- **RAILWAY-SETUP.md** — Deployment guide (in crm-project root)
- **DEPLOYMENT-CHECKLIST.md** — Verification checklist
- **CRM-IMPLEMENTATION-PLAN.md** — High-level plan + sparring topics (in memory/)
- **Memory file:** `~/.claude/.../MEMORY.md` — Project context (Intake Tracker, backup system, etc.)

---

**Last Updated:** Feb 21, 2026 | Phase: 1 (Security Foundation) | Status: Lokaal LIVE — Railway deployment gepland
