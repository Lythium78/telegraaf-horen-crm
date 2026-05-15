# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Telegraaf Horen CRM v2.0** — Multi-user CRM for a Dutch hearing aid retailer. Node.js + Express + SQLite, deployed on Railway.app (€5/maand). Phase 2 complete: all core modules live.

**Status:** Production on Railway. Admin panel, search, leads pipeline, hoortoestellen, taken, bestellingen, nazorg, foto editor — all built and deployed.

---

## Architecture & Stack

- **Backend:** Express.js, sql.js (SQLite in-memory + file), bcryptjs sessions, Helmet/CORS/rate limiting, Winston logging
- **Frontend:** Vanilla HTML/CSS/JS — no framework. CSP-compliant (no inline handlers).
- **Branding:** donkerblauw `#12243E`, teal `#3AA6B9`, beige `#D1B18A`
- **Language convention:** Dutch UI + domain terms, English code + config
- **Deploy:** `git push origin main` → Railway auto-deploys. DB persisted on `/data` volume.

---

## Running the Server

```bash
# Requires .env (see .env.template)
npm start

# Start without .env (testing only — sessions lost on restart)
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))") \
NODE_ENV=development PORT=3001 DB_PATH=/tmp/crm.db node server.js
```

---

## Database Schema

Eight tables. All schema changes use the `tableNames.includes()` pattern in `initDatabase()` — no separate migration runner.

```
contacts          — klanten (id, naam, email, telefoonnummer, mobiel, bedrijf,
                    type, status, notities, aanhef, geboortedatum, adres,
                    postcode, woonplaats, huisarts, voorschrijver,
                    klantnummer_extern, aangemaakt_op, bijgewerkt_op)

gebruikers        — id, naam, gebruikersnaam (UNIQUE), wachtwoord_hash,
                    rol (admin|medewerker|viewer), actief, laatste_login

audit_log         — id, gebruiker_id (FK), actie, resource_type, resource_id,
                    ip_adres, tijdstip  ← NO data content, only IDs + actions

leads             — pipeline: lead→gekwalificeerd→intake_gepland→klant→inactief
                    herkomst: telefoon|verwijzing|website|inloop

hoortoestellen    — contact_id (FK), merk, type_naam, serienummer_links/rechts,
                    kleur, leverdatum, factuurdatum

taken             — titel, deadline, status (open|in_uitvoering|afgerond),
                    contact_id/lead_id (FK), eigenaar, aangemaakt_door

contact_notities  — contact_id or lead_id (FK), medewerker, tekst

bestellingen      — contact_id (FK), bezorgmethode (afhalen|verzenden),
                    status (besteld|klaar|geleverd)
bestelling_regels — bestelling_id (FK), artikel_naam, artikel_type, hoeveelheid
```

Adding a column to an existing table: add to the `extraKolommen` array in `initDatabase()`.

---

## Module Structure

**`server.js`** (1285 lines) — All routes. Sections separated by `// ====` comments.
- Middleware order: Helmet → CORS → rate limit → session → body parser → trust proxy → DB init → static → routes → error handlers
- Every route follows: `vereistInlog` → optionally `vereistRol(rol)` → business logic → `auditLog()` → response

**`database.js`** (1423 lines) — All DB functions grouped by domain.
- Pattern: `db.prepare(sql)` → `stmt.bind([...])` → `stmt.step()` → `stmt.getAsObject()` → `stmt.free()` → `saveDatabase()`
- **`saveDatabase()` must be called after every write.** sql.js is in-memory; without this, changes are lost on restart.
- `logAudit()` here is separate from `logger.js`'s `auditLog()` — server.js only uses the logger version.

**`auth.js`** (65 lines)
- `vereistInlog` — session guard middleware
- `vereistRol(minimaleRol)` — role hierarchy: viewer < medewerker < admin
- `verificeerInlog()` / `hashWachtwoord()` — bcryptjs 12 rounds (never reduce)

**`logger.js`** (65 lines)
- `auditLog(actie, gebruikersnaam, resourceId, extra)` — Winston to `audit.log`
- Signature order matters. `extra` is an object (e.g. `{ ip: req.ip }`).

**`public/app.js`** (1758 lines) — Single-page frontend logic.
- Global state: `contacts`, `leads`, `taken`, `bestellingen`, `currentUser`
- `init()` → `laadHuidigeGebruiker()` → show/hide admin nav → load dashboard
- `schakelSectie(naam)` switches sections and loads data for each
- `escapeHtml()` used everywhere before inserting user data into DOM

**`public/style.css`** (1558 lines)
- Mobile breakpoint at `≤640px`: sidebar becomes fixed bottom nav bar
- At `≤1024px`: sidebar collapses to icon-only strip

---

## API Surface

All `/api/*` routes require `vereistInlog`. Role shown where restricted.

```
GET    /api/health
GET    /api/mij
GET    /api/stats                                  — dashboard counts

GET    /api/contacts                               — ?zoek= searches naam/email/bedrijf/tel/mobiel/woonplaats/klantnummer
GET    /api/contacts/:id
POST   /api/contacts                               medewerker+
PUT    /api/contacts/:id                           medewerker+
DELETE /api/contacts/:id                           admin

GET    /api/contacts/:id/hoortoestellen
POST   /api/contacts/:id/hoortoestellen            medewerker+
PUT    /api/hoortoestellen/:id                     medewerker+
DELETE /api/hoortoestellen/:id                     medewerker+
GET    /api/nazorg/aankomend                       — ?dagen= (default 60); ±30d around 1yr/5yr anniversaries

GET    /api/contacts/:id/notities
POST   /api/contacts/:id/notities                  medewerker+
GET    /api/leads/:id/notities
POST   /api/leads/:id/notities                     medewerker+
DELETE /api/notities/:id                           medewerker+

GET    /api/contacts/:id/bestellingen
POST   /api/contacts/:id/bestellingen              medewerker+  (with regels array)
GET    /api/bestellingen                           — ?status= filter
PUT    /api/bestellingen/:id                       medewerker+
DELETE /api/bestellingen/:id                       admin

GET    /api/leads                                  — ?herkomst= ?status= filters
GET    /api/leads/:id
POST   /api/leads                                  medewerker+
PUT    /api/leads/:id                              medewerker+
DELETE /api/leads/:id                              admin

GET    /api/taken                                  — ?status= ?eigenaar= ?contact_id= ?lead_id=
GET    /api/taken/:id
POST   /api/taken                                  medewerker+
PUT    /api/taken/:id                              medewerker+
DELETE /api/taken/:id

GET    /api/gebruikers                             admin
POST   /api/gebruikers                             admin  (naam, gebruikersnaam, wachtwoord, rol)
PUT    /api/gebruikers/:id                         admin  (naam?, rol?, actief?)
POST   /api/gebruikers/:id/wachtwoord              admin  (wachtwoord min 8 chars)
```

---

## Security Rules

- **Every route needs `vereistInlog`** — no exceptions outside `/login` and `/login.js`
- **`auditLog()` on every mutation** — signature: `(actie, gebruikersnaam, resourceId, { ip: req.ip })`
- **Audit logs: NO PII** — only action names, IDs, IP addresses
- **All errors generic to client** — log details internally, return `'Er is een fout opgetreden'`
- **SQL always parameterized** — `db.prepare('... WHERE id = ?')`, never string concat
- **Admin cannot deactivate their own account** — enforced in `PUT /api/gebruikers/:id`
- **CSP blocks inline handlers** — all event listeners in `.js` files via `addEventListener`, never `onclick=` in HTML

---

## Adding a New Feature

**New API route** in `server.js`:
```javascript
app.post('/api/resource', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const naam = String(req.body.naam || '').trim().substring(0, 200);
    if (!naam) return res.status(400).json({ success: false, error: 'Naam verplicht' });

    const result = database.createResource({ naam });
    auditLog('resource_aangemaakt', req.session.gebruiker.gebruikersnaam, result.id, { ip: req.ip });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[API] Error:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});
```

**New DB table** in `database.js` → `initDatabase()`:
```javascript
if (!tableNames.includes('nieuwe_tabel')) {
  db.run(`CREATE TABLE nieuwe_tabel (...)`);
}
```
Then add the function and export it in `module.exports`.

**New frontend section**: add nav button in `index.html`, add `<section id="section-naam">`, add `case 'naam': await laadNaam(); break;` in `schakelSectie()`.

---

## Gotchas

- **`saveDatabase()` after every write** — sql.js is in-memory; skipping this loses data silently
- **Two separate audit systems** — `logger.js`'s `auditLog()` (used in routes) vs `database.js`'s `logAudit()` (DB table). Don't mix them.
- **`.env` variable names are exact** — `ADMIN_NAAM`, `ADMIN_GEBRUIKER`, `ADMIN_WACHTWOORD`. Wrong names silently skip auto-admin creation.
- **Login rate limiter on `app.post('/login')` only** — not `app.use('/login')` (that would also block GET page loads)
- **Sessions are in-memory in development** — lost on every server restart. Production uses SQLiteStore.
- **CSP is stricter in Edge than Chrome** — test login form in Edge after any `login.html` changes
- **`font-size < 16px` on inputs triggers iOS auto-zoom** — inputs use `16px !important` in mobile CSS

---

## Claude Code Setup

**Super-agent skill** at `.claude/skills/super-agent/SKILL.md` — invoke with `/super-agent`. Analyzes project context and asks clarifying questions before implementing. Enforces a demo/test phase before every commit.

**Session-start hook** at `.claude/hooks/session-start.sh` — automatically installs skills and runs `npm install` at the start of each cloud session.

---

## What's Still Planned

- **CSV bulk import** — import existing customer data from Excel/other systems
- **Contact timeline** — full history of changes per contact (who changed what, when)
- **Intake Tracker koppeling** — data sharing with separate Intake Tracker system (not yet available)
- **2FA** — enhanced authentication

---

**Last Updated:** May 2026 | Phase: 2 (Core Features) | Status: Live op Railway
