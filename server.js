// server.js - Telegraaf Horen CRM (Beveiligd)
// Met inlogsysteem, rollen, audit logging, security headers, rate limiting

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const SQLiteStore = require('connect-sqlite3')(session);
const database = require('./database');
const { vereistInlog, vereistRol, verificeerInlog } = require('./auth');
const { auditLog } = require('./logger');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PRODUCTIE = process.env.NODE_ENV === 'production';

// ============================================================
// 1. SECURITY HEADERS (Helmet)
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));

// ============================================================
// 2. CORS - Enkel eigen domein
// ============================================================
const toegestaneOrigins = IS_PRODUCTIE
  ? [process.env.TOEGESTAAN_ORIGIN]
  : ['http://localhost:3001', 'http://127.0.0.1:3001'];

app.use(cors({
  origin: function(origin, callback) {
    // Geen origin = verzoek van dezelfde server/browser, altijd toestaan
    if (!origin) {
      return callback(null, true);
    }
    // Check of origin in whitelist staat
    if (toegestaneOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Externe origin niet in whitelist
    return callback(new Error('CORS geblokkeerd'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// ============================================================
// 3. RATE LIMITING
// ============================================================
const algemeenLimiet = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Te veel verzoeken, probeer het later opnieuw' }
});

const loginLimiet = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Te veel inlogpogingen, wacht 15 minuten' }
});

app.use('/api/', algemeenLimiet);
app.use('/login', loginLimiet);

// ============================================================
// 4. SESSIE CONFIGURATIE
// ============================================================
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
}

app.use(session({
  store: new SQLiteStore({
    db: 'sessies.db',
    dir: __dirname,
    table: 'sessies'
  }),
  secret: process.env.SESSION_SECRET || (() => {
    throw new Error('SESSION_SECRET niet ingesteld in .env!');
  })(),
  name: 'th_crm_sessie',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTIE,
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
}));

// ============================================================
// 5. REQUEST PARSING
// ============================================================
app.use(bodyParser.json({ limit: '100kb' }));
app.use(bodyParser.urlencoded({ limit: '100kb', extended: true }));

// ============================================================
// 6. TRUST PROXY (voor Railway)
// ============================================================
app.set('trust proxy', 1);

// ============================================================
// 7. DATABASE INITIALISATIE
// ============================================================
(async () => {
  try {
    await database.initDatabase();
    console.log('[INIT] Database initialized successfully');

    // Auto-aanmaken eerste admin als er geen gebruikers zijn
    // Gebruikt ADMIN_NAAM, ADMIN_GEBRUIKER, ADMIN_WACHTWOORD omgevingsvariabelen
    const { hashWachtwoord } = require('./auth');
    const gebruikers = database.getAllGebruikers();
    if (gebruikers.length === 0) {
      const adminNaam = process.env.ADMIN_NAAM;
      const adminGebruiker = process.env.ADMIN_GEBRUIKER;
      const adminWachtwoord = process.env.ADMIN_WACHTWOORD;

      if (adminNaam && adminGebruiker && adminWachtwoord) {
        console.log('[INIT] Geen gebruikers gevonden, eerste admin aanmaken...');
        const hash = await hashWachtwoord(adminWachtwoord);
        database.createGebruiker(adminNaam, adminGebruiker, hash, 'admin');
        console.log(`[INIT] ✓ Admin aangemaakt: ${adminGebruiker}`);
      } else {
        console.log('[INIT] Geen gebruikers en geen ADMIN_* variabelen — stel ADMIN_NAAM, ADMIN_GEBRUIKER, ADMIN_WACHTWOORD in');
      }
    } else {
      console.log(`[INIT] ${gebruikers.length} gebruiker(s) gevonden in database`);
    }
  } catch (err) {
    console.error('[INIT] Database initialization failed:', err);
    process.exit(1);
  }
})();

// ============================================================
// 8. STATISCHE BESTANDEN (login openbaar, VOOR authenticatie)
// ============================================================
app.get('/login', (req, res) => {
  if (req.session && req.session.gebruiker) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve login.js OPENBAAR (niet beveiligd, nodig VOOR inlog)
app.use('/login.js', express.static(path.join(__dirname, 'public', 'login.js'), {
  setHeaders: (res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// ============================================================
// 9. EERSTE ADMIN SETUP (alleen als er GEEN gebruikers zijn)
// ============================================================
app.post('/setup-eerste-admin', async (req, res) => {
  try {
    // Controleer of er al gebruikers zijn
    const gebruikers = database.getAllGebruikers();
    if (gebruikers && gebruikers.length > 0) {
      return res.status(403).json({ success: false, error: 'Setup al gedaan - er zijn al gebruikers' });
    }

    // Geheime setup token check (staat in omgevingsvariabele)
    const setupToken = req.headers['x-setup-token'];
    if (!setupToken || setupToken !== process.env.SETUP_TOKEN) {
      return res.status(401).json({ success: false, error: 'Ongeldige setup token' });
    }

    const { naam, gebruikersnaam, wachtwoord } = req.body;
    if (!naam || !gebruikersnaam || !wachtwoord || wachtwoord.length < 8) {
      return res.status(400).json({ success: false, error: 'Naam, gebruikersnaam en wachtwoord (min 8 tekens) verplicht' });
    }

    const { hashWachtwoord } = require('./auth');
    const hash = await hashWachtwoord(wachtwoord);
    database.createGebruiker(naam, gebruikersnaam, hash, 'admin');

    console.log(`[SETUP] Eerste admin aangemaakt: ${gebruikersnaam}`);
    res.json({ success: true, message: `Admin '${gebruikersnaam}' aangemaakt! Je kunt nu inloggen.` });
  } catch (err) {
    console.error('[SETUP] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Fout bij aanmaken admin' });
  }
});

// ============================================================
// 10. AUTHENTICATIE ROUTES
// ============================================================

app.post('/login', async (req, res) => {
  try {
    const { gebruikersnaam, wachtwoord } = req.body;

    if (!gebruikersnaam || !wachtwoord) {
      return res.status(400).json({
        success: false,
        error: 'Gebruikersnaam en wachtwoord zijn verplicht'
      });
    }

    const schoneNaam = String(gebruikersnaam).trim().toLowerCase().substring(0, 50);
    const gebruiker = await verificeerInlog(schoneNaam, wachtwoord);

    if (!gebruiker) {
      auditLog(null, 'inlog_mislukt', null, null, req.ip);
      return res.status(401).json({
        success: false,
        error: 'Gebruikersnaam of wachtwoord onjuist'
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('[LOGIN] Session regenerate error:', err);
        return res.status(500).json({ success: false, error: 'Inloggen mislukt' });
      }

      req.session.gebruiker = gebruiker;
      database.updateLaatsteLogin(gebruiker.id);
      auditLog(gebruiker.id, 'ingelogd', null, null, req.ip);

      res.json({
        success: true,
        gebruiker: {
          naam: gebruiker.naam,
          rol: gebruiker.rol
        }
      });
    });
  } catch (err) {
    console.error('[LOGIN] Unexpected error:', err);
    res.status(500).json({ success: false, error: 'Inloggen mislukt door een serverfout' });
  }
});

app.get('/logout', (req, res) => {
  if (req.session.gebruiker) {
    auditLog(req.session.gebruiker.id, 'uitgelogd', null, null, req.ip);
  }
  req.session.destroy((err) => {
    res.clearCookie('th_crm_sessie');
    res.redirect('/login');
  });
});

// ============================================================
// 10. BEVEILIGDE ROUTES
// ============================================================

app.get('/', vereistInlog, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/', vereistInlog, express.static(path.join(__dirname, 'public'), {
  index: false
}));

// ============================================================
// 11. API ROUTES - ALLE BEVEILIGD
// ============================================================

app.get('/api/health', vereistInlog, (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/mij', vereistInlog, (req, res) => {
  res.json({
    success: true,
    data: {
      naam: req.session.gebruiker.naam,
      rol: req.session.gebruiker.rol,
      gebruikersnaam: req.session.gebruiker.gebruikersnaam
    }
  });
});

// GET alle contacts
app.get('/api/contacts', vereistInlog, (req, res) => {
  try {
    const contacts = database.getAllContacts();
    auditLog(req.session.gebruiker.id, 'contacts_opgelijst', null, null, req.ip);
    res.json({ success: true, data: contacts });
  } catch (err) {
    console.error('[API] Error fetching contacts:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// GET enkel contact
app.get('/api/contacts/:id', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const contact = database.getContactById(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact niet gevonden' });
    }

    auditLog(req.session.gebruiker.id, 'contact_bekeken', 'contact', id, req.ip);
    res.json({ success: true, data: contact });
  } catch (err) {
    console.error('[API] Error fetching contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE contact
app.post('/api/contacts', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const { naam, email, telefoonnummer, bedrijf, type, status, notities } = req.body;

    if (!naam || String(naam).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Naam is verplicht' });
    }

    const geldige_types = ['klant', 'prospect', 'partner'];
    const geldige_statussen = ['nieuw', 'in_bewerking', 'actief', 'inactief'];

    const contact = database.createContact({
      naam: String(naam).trim().substring(0, 200),
      email: email ? String(email).trim().toLowerCase().substring(0, 254) : null,
      telefoonnummer: telefoonnummer
        ? String(telefoonnummer).replace(/[^\d\s+\-()]/g, '').trim().substring(0, 20)
        : null,
      bedrijf: bedrijf ? String(bedrijf).trim().substring(0, 200) : null,
      type: geldige_types.includes(type) ? type : 'klant',
      status: geldige_statussen.includes(status) ? status : 'nieuw',
      notities: notities ? String(notities).trim().substring(0, 2000) : null
    });

    auditLog(req.session.gebruiker.id, 'contact_aangemaakt', 'contact', contact.id, req.ip);
    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    console.error('[API] Error creating contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// UPDATE contact
app.put('/api/contacts/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const { naam, email, telefoonnummer, bedrijf, type, status, notities } = req.body;
    const geldige_types = ['klant', 'prospect', 'partner'];
    const geldige_statussen = ['nieuw', 'in_bewerking', 'actief', 'inactief'];

    const updateData = {};
    if (naam !== undefined) updateData.naam = String(naam).trim().substring(0, 200);
    if (email !== undefined) updateData.email = email
      ? String(email).trim().toLowerCase().substring(0, 254) : null;
    if (telefoonnummer !== undefined) updateData.telefoonnummer = telefoonnummer
      ? String(telefoonnummer).replace(/[^\d\s+\-()]/g, '').substring(0, 20) : null;
    if (bedrijf !== undefined) updateData.bedrijf = bedrijf
      ? String(bedrijf).trim().substring(0, 200) : null;
    if (type !== undefined) updateData.type = geldige_types.includes(type) ? type : 'klant';
    if (status !== undefined) updateData.status = geldige_statussen.includes(status)
      ? status : 'nieuw';
    if (notities !== undefined) updateData.notities = notities
      ? String(notities).trim().substring(0, 2000) : null;

    const contact = database.updateContact(id, updateData);
    auditLog(req.session.gebruiker.id, 'contact_bijgewerkt', 'contact', id, req.ip);
    res.json({ success: true, data: contact });
  } catch (err) {
    console.error('[API] Error updating contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// DELETE contact (admin only)
app.delete('/api/contacts/:id', vereistInlog, vereistRol('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    database.deleteContact(id);
    auditLog(req.session.gebruiker.id, 'contact_verwijderd', 'contact', id, req.ip);
    res.json({ success: true, message: 'Contact verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// 12. ERROR HANDLERS
// ============================================================
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({
    success: false,
    error: 'Er is een interne fout opgetreden'
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Niet gevonden' });
});

// ============================================================
// 13. SERVER STARTEN
// ============================================================
app.listen(PORT, () => {
  console.log(`\n[SERVER] ==========================================`);
  console.log(`[SERVER] Telegraaf Horen CRM`);
  console.log(`[SERVER] Status: ONLINE`);
  console.log(`[SERVER] Poort: ${PORT}`);
  console.log(`[SERVER] Omgeving: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[SERVER] URL: http://localhost:${PORT}`);
  console.log(`[SERVER] Login: http://localhost:${PORT}/login`);
  console.log(`[SERVER] ==========================================\n`);
});

module.exports = app;
