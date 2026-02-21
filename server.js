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

// ============================================================
// 4. SESSIE CONFIGURATIE
// ============================================================
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
}

const dataDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname);

const sessionStore = IS_PRODUCTIE
  ? new SQLiteStore({ db: 'sessies.db', dir: dataDir })
  : undefined;

console.log('[INIT] Sessies: ' + (sessionStore ? 'SQLiteStore (persistent)' : 'in-memory store (development)'));

app.use(session({
  secret: process.env.SESSION_SECRET || (() => {
    throw new Error('SESSION_SECRET niet ingesteld in .env!');
  })(),
  store: sessionStore,
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
        console.log(`[INIT] Admin aangemaakt: ${adminGebruiker}`);
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
app.get('/login.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'login.js'));
});

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

app.post('/login', loginLimiet, async (req, res) => {
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
      auditLog('inlog_mislukt', 'onbekend', null, { ip: req.ip });
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
      auditLog('ingelogd', gebruiker.gebruikersnaam, null, { ip: req.ip });

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
    auditLog('uitgelogd', req.session.gebruiker.gebruikersnaam, null, { ip: req.ip });
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

// ============================================================
// DASHBOARD STATS
// ============================================================

app.get('/api/stats', vereistInlog, (req, res) => {
  try {
    const stats = database.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[API] Error fetching stats:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// CONTACTS ROUTES
// ============================================================

// GET alle contacts
app.get('/api/contacts', vereistInlog, (req, res) => {
  try {
    const contacts = database.getAllContacts();
    auditLog('contacts_opgelijst', req.session.gebruiker.gebruikersnaam, null, { ip: req.ip });
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

    auditLog('contact_bekeken', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, data: contact });
  } catch (err) {
    console.error('[API] Error fetching contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE contact
app.post('/api/contacts', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const {
      naam, email, telefoonnummer, bedrijf, type, status, notities,
      aanhef, geboortedatum, adres, postcode, woonplaats,
      mobiel, huisarts, voorschrijver, klantnummer_extern
    } = req.body;

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
      notities: notities ? String(notities).trim().substring(0, 2000) : null,
      aanhef: aanhef ? String(aanhef).trim().substring(0, 20) : null,
      geboortedatum: geboortedatum ? String(geboortedatum).trim().substring(0, 10) : null,
      adres: adres ? String(adres).trim().substring(0, 300) : null,
      postcode: postcode ? String(postcode).trim().substring(0, 10) : null,
      woonplaats: woonplaats ? String(woonplaats).trim().substring(0, 100) : null,
      mobiel: mobiel
        ? String(mobiel).replace(/[^\d\s+\-()]/g, '').trim().substring(0, 20)
        : null,
      huisarts: huisarts ? String(huisarts).trim().substring(0, 200) : null,
      voorschrijver: voorschrijver ? String(voorschrijver).trim().substring(0, 200) : null,
      klantnummer_extern: klantnummer_extern ? String(klantnummer_extern).trim().substring(0, 50) : null
    });

    auditLog('contact_aangemaakt', req.session.gebruiker.gebruikersnaam, contact.id, { ip: req.ip });
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

    const {
      naam, email, telefoonnummer, bedrijf, type, status, notities,
      aanhef, geboortedatum, adres, postcode, woonplaats,
      mobiel, huisarts, voorschrijver, klantnummer_extern
    } = req.body;

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
    if (aanhef !== undefined) updateData.aanhef = aanhef
      ? String(aanhef).trim().substring(0, 20) : null;
    if (geboortedatum !== undefined) updateData.geboortedatum = geboortedatum
      ? String(geboortedatum).trim().substring(0, 10) : null;
    if (adres !== undefined) updateData.adres = adres
      ? String(adres).trim().substring(0, 300) : null;
    if (postcode !== undefined) updateData.postcode = postcode
      ? String(postcode).trim().substring(0, 10) : null;
    if (woonplaats !== undefined) updateData.woonplaats = woonplaats
      ? String(woonplaats).trim().substring(0, 100) : null;
    if (mobiel !== undefined) updateData.mobiel = mobiel
      ? String(mobiel).replace(/[^\d\s+\-()]/g, '').substring(0, 20) : null;
    if (huisarts !== undefined) updateData.huisarts = huisarts
      ? String(huisarts).trim().substring(0, 200) : null;
    if (voorschrijver !== undefined) updateData.voorschrijver = voorschrijver
      ? String(voorschrijver).trim().substring(0, 200) : null;
    if (klantnummer_extern !== undefined) updateData.klantnummer_extern = klantnummer_extern
      ? String(klantnummer_extern).trim().substring(0, 50) : null;

    const contact = database.updateContact(id, updateData);
    auditLog('contact_bijgewerkt', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
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
    auditLog('contact_verwijderd', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, message: 'Contact verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// LEADS ROUTES
// ============================================================

const geldigeHerkomst = ['telefoon', 'verwijzing', 'website', 'inloop'];
const geldigePipelineStatus = ['lead', 'gekwalificeerd', 'intake_gepland', 'klant', 'inactief'];

// GET alle leads
app.get('/api/leads', vereistInlog, (req, res) => {
  try {
    const filter = {};
    if (req.query.herkomst && geldigeHerkomst.includes(req.query.herkomst)) {
      filter.herkomst = req.query.herkomst;
    }
    if (req.query.status && geldigePipelineStatus.includes(req.query.status)) {
      filter.pipeline_status = req.query.status;
    }

    const leads = database.getAllLeads(filter);
    res.json({ success: true, data: leads });
  } catch (err) {
    console.error('[API] Error fetching leads:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// GET één lead
app.get('/api/leads/:id', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const lead = database.getLeadById(id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead niet gevonden' });
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    console.error('[API] Error fetching lead:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE lead
app.post('/api/leads', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const { naam, aanhef, telefoon, mobiel, email, herkomst, pipeline_status, notities, medewerker } = req.body;

    if (!naam || String(naam).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Naam is verplicht' });
    }

    const lead = database.createLead({
      naam: String(naam).trim().substring(0, 200),
      aanhef: aanhef ? String(aanhef).trim().substring(0, 20) : null,
      telefoon: telefoon
        ? String(telefoon).replace(/[^\d\s+\-()]/g, '').trim().substring(0, 20)
        : null,
      mobiel: mobiel
        ? String(mobiel).replace(/[^\d\s+\-()]/g, '').trim().substring(0, 20)
        : null,
      email: email ? String(email).trim().toLowerCase().substring(0, 254) : null,
      herkomst: geldigeHerkomst.includes(herkomst) ? herkomst : 'telefoon',
      pipeline_status: geldigePipelineStatus.includes(pipeline_status) ? pipeline_status : 'lead',
      notities: notities ? String(notities).trim().substring(0, 2000) : null,
      medewerker: medewerker ? String(medewerker).trim().substring(0, 100) : req.session.gebruiker.naam
    });

    auditLog('lead_aangemaakt', req.session.gebruiker.gebruikersnaam, lead.id, { ip: req.ip });
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    console.error('[API] Error creating lead:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// UPDATE lead
app.put('/api/leads/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const { naam, aanhef, telefoon, mobiel, email, herkomst, pipeline_status, notities, medewerker } = req.body;

    const updateData = {};
    if (naam !== undefined) updateData.naam = String(naam).trim().substring(0, 200);
    if (aanhef !== undefined) updateData.aanhef = aanhef ? String(aanhef).trim().substring(0, 20) : null;
    if (telefoon !== undefined) updateData.telefoon = telefoon
      ? String(telefoon).replace(/[^\d\s+\-()]/g, '').trim().substring(0, 20) : null;
    if (mobiel !== undefined) updateData.mobiel = mobiel
      ? String(mobiel).replace(/[^\d\s+\-()]/g, '').trim().substring(0, 20) : null;
    if (email !== undefined) updateData.email = email
      ? String(email).trim().toLowerCase().substring(0, 254) : null;
    if (herkomst !== undefined) updateData.herkomst = geldigeHerkomst.includes(herkomst)
      ? herkomst : 'telefoon';
    if (pipeline_status !== undefined) updateData.pipeline_status = geldigePipelineStatus.includes(pipeline_status)
      ? pipeline_status : 'lead';
    if (notities !== undefined) updateData.notities = notities
      ? String(notities).trim().substring(0, 2000) : null;
    if (medewerker !== undefined) updateData.medewerker = medewerker
      ? String(medewerker).trim().substring(0, 100) : null;

    const lead = database.updateLead(id, updateData);
    auditLog('lead_bijgewerkt', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, data: lead });
  } catch (err) {
    console.error('[API] Error updating lead:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// DELETE lead (admin only)
app.delete('/api/leads/:id', vereistInlog, vereistRol('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    database.deleteLead(id);
    auditLog('lead_verwijderd', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, message: 'Lead verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting lead:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// HOORTOESTELLEN ROUTES
// ============================================================

// GET hoortoestellen van contact
app.get('/api/contacts/:id/hoortoestellen', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const hoortoestellen = database.getHoortoestelByContact(id);
    res.json({ success: true, data: hoortoestellen });
  } catch (err) {
    console.error('[API] Error fetching hoortoestellen:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE hoortoestel voor contact
app.post('/api/contacts/:id/hoortoestellen', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId) || contactId < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig contact ID' });
    }

    const contact = database.getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact niet gevonden' });
    }

    const { merk, type_naam, serienummer_links, serienummer_rechts, kleur, leverdatum, factuurdatum } = req.body;

    const hoortoestel = database.createHoortoestel({
      contact_id: contactId,
      merk: merk ? String(merk).trim().substring(0, 100) : null,
      type_naam: type_naam ? String(type_naam).trim().substring(0, 200) : null,
      serienummer_links: serienummer_links ? String(serienummer_links).trim().substring(0, 100) : null,
      serienummer_rechts: serienummer_rechts ? String(serienummer_rechts).trim().substring(0, 100) : null,
      kleur: kleur ? String(kleur).trim().substring(0, 50) : null,
      leverdatum: leverdatum ? String(leverdatum).trim().substring(0, 10) : null,
      factuurdatum: factuurdatum ? String(factuurdatum).trim().substring(0, 10) : null
    });

    auditLog('hoortoestel_aangemaakt', req.session.gebruiker.gebruikersnaam, hoortoestel.id, { ip: req.ip });
    res.status(201).json({ success: true, data: hoortoestel });
  } catch (err) {
    console.error('[API] Error creating hoortoestel:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// UPDATE hoortoestel
app.put('/api/hoortoestellen/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const { merk, type_naam, serienummer_links, serienummer_rechts, kleur, leverdatum, factuurdatum } = req.body;

    const updateData = {};
    if (merk !== undefined) updateData.merk = merk ? String(merk).trim().substring(0, 100) : null;
    if (type_naam !== undefined) updateData.type_naam = type_naam ? String(type_naam).trim().substring(0, 200) : null;
    if (serienummer_links !== undefined) updateData.serienummer_links = serienummer_links
      ? String(serienummer_links).trim().substring(0, 100) : null;
    if (serienummer_rechts !== undefined) updateData.serienummer_rechts = serienummer_rechts
      ? String(serienummer_rechts).trim().substring(0, 100) : null;
    if (kleur !== undefined) updateData.kleur = kleur ? String(kleur).trim().substring(0, 50) : null;
    if (leverdatum !== undefined) updateData.leverdatum = leverdatum ? String(leverdatum).trim().substring(0, 10) : null;
    if (factuurdatum !== undefined) updateData.factuurdatum = factuurdatum ? String(factuurdatum).trim().substring(0, 10) : null;

    const hoortoestel = database.updateHoortoestel(id, updateData);
    auditLog('hoortoestel_bijgewerkt', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, data: hoortoestel });
  } catch (err) {
    console.error('[API] Error updating hoortoestel:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// DELETE hoortoestel
app.delete('/api/hoortoestellen/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    database.deleteHoortoestel(id);
    auditLog('hoortoestel_verwijderd', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, message: 'Hoortoestel verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting hoortoestel:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// GET aankomende nazorg momenten
app.get('/api/nazorg/aankomend', vereistInlog, (req, res) => {
  try {
    const aantalDagen = req.query.dagen ? Math.min(parseInt(req.query.dagen) || 60, 365) : 60;
    const nazorg = database.getNazorgAankomend(aantalDagen);
    res.json({ success: true, data: nazorg });
  } catch (err) {
    console.error('[API] Error fetching nazorg:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// TAKEN ROUTES
// ============================================================

const geldigeTaakStatus = ['open', 'in_uitvoering', 'afgerond'];

// GET alle taken
app.get('/api/taken', vereistInlog, (req, res) => {
  try {
    const filter = {};
    if (req.query.status && geldigeTaakStatus.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.eigenaar) {
      filter.eigenaar = String(req.query.eigenaar).trim().substring(0, 100);
    }
    if (req.query.contact_id) {
      const cId = parseInt(req.query.contact_id);
      if (!isNaN(cId) && cId > 0) filter.contact_id = cId;
    }
    if (req.query.lead_id) {
      const lId = parseInt(req.query.lead_id);
      if (!isNaN(lId) && lId > 0) filter.lead_id = lId;
    }

    const taken = database.getAllTaken(filter);
    res.json({ success: true, data: taken });
  } catch (err) {
    console.error('[API] Error fetching taken:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// GET één taak
app.get('/api/taken/:id', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const taak = database.getTaakById(id);
    if (!taak) {
      return res.status(404).json({ success: false, error: 'Taak niet gevonden' });
    }

    res.json({ success: true, data: taak });
  } catch (err) {
    console.error('[API] Error fetching taak:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE taak
app.post('/api/taken', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const { titel, omschrijving, deadline, status, contact_id, lead_id, eigenaar } = req.body;

    if (!titel || String(titel).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Titel is verplicht' });
    }

    let parsedContactId = null;
    if (contact_id) {
      parsedContactId = parseInt(contact_id);
      if (isNaN(parsedContactId) || parsedContactId < 1) parsedContactId = null;
    }

    let parsedLeadId = null;
    if (lead_id) {
      parsedLeadId = parseInt(lead_id);
      if (isNaN(parsedLeadId) || parsedLeadId < 1) parsedLeadId = null;
    }

    const taak = database.createTaak({
      titel: String(titel).trim().substring(0, 300),
      omschrijving: omschrijving ? String(omschrijving).trim().substring(0, 2000) : null,
      deadline: deadline ? String(deadline).trim().substring(0, 10) : null,
      status: geldigeTaakStatus.includes(status) ? status : 'open',
      contact_id: parsedContactId,
      lead_id: parsedLeadId,
      eigenaar: eigenaar ? String(eigenaar).trim().substring(0, 100) : req.session.gebruiker.naam,
      aangemaakt_door: req.session.gebruiker.naam
    });

    auditLog('taak_aangemaakt', req.session.gebruiker.gebruikersnaam, taak.id, { ip: req.ip });
    res.status(201).json({ success: true, data: taak });
  } catch (err) {
    console.error('[API] Error creating taak:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// UPDATE taak
app.put('/api/taken/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const { titel, omschrijving, deadline, status, contact_id, lead_id, eigenaar } = req.body;

    const updateData = {};
    if (titel !== undefined) updateData.titel = String(titel).trim().substring(0, 300);
    if (omschrijving !== undefined) updateData.omschrijving = omschrijving
      ? String(omschrijving).trim().substring(0, 2000) : null;
    if (deadline !== undefined) updateData.deadline = deadline
      ? String(deadline).trim().substring(0, 10) : null;
    if (status !== undefined) updateData.status = geldigeTaakStatus.includes(status) ? status : 'open';
    if (contact_id !== undefined) {
      const cId = parseInt(contact_id);
      updateData.contact_id = (!isNaN(cId) && cId > 0) ? cId : null;
    }
    if (lead_id !== undefined) {
      const lId = parseInt(lead_id);
      updateData.lead_id = (!isNaN(lId) && lId > 0) ? lId : null;
    }
    if (eigenaar !== undefined) updateData.eigenaar = eigenaar
      ? String(eigenaar).trim().substring(0, 100) : null;

    const taak = database.updateTaak(id, updateData);
    auditLog('taak_bijgewerkt', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, data: taak });
  } catch (err) {
    console.error('[API] Error updating taak:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// DELETE taak
app.delete('/api/taken/:id', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    database.deleteTaak(id);
    auditLog('taak_verwijderd', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, message: 'Taak verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting taak:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// NOTITIES ROUTES
// ============================================================

// GET notities van contact
app.get('/api/contacts/:id/notities', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const notities = database.getNotitiesVoorContact(id);
    res.json({ success: true, data: notities });
  } catch (err) {
    console.error('[API] Error fetching notities:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE notitie voor contact
app.post('/api/contacts/:id/notities', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId) || contactId < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig contact ID' });
    }

    const contact = database.getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact niet gevonden' });
    }

    const { tekst } = req.body;
    if (!tekst || String(tekst).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Tekst is verplicht' });
    }

    const notitie = database.createNotitie({
      contact_id: contactId,
      lead_id: null,
      medewerker: req.session.gebruiker.naam,
      tekst: String(tekst).trim().substring(0, 5000)
    });

    auditLog('notitie_aangemaakt', req.session.gebruiker.gebruikersnaam, notitie.id, { ip: req.ip });
    res.status(201).json({ success: true, data: notitie });
  } catch (err) {
    console.error('[API] Error creating notitie:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// GET notities van lead
app.get('/api/leads/:id/notities', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const notities = database.getNotitiesVoorLead(id);
    res.json({ success: true, data: notities });
  } catch (err) {
    console.error('[API] Error fetching lead notities:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE notitie voor lead
app.post('/api/leads/:id/notities', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    if (isNaN(leadId) || leadId < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig lead ID' });
    }

    const lead = database.getLeadById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead niet gevonden' });
    }

    const { tekst } = req.body;
    if (!tekst || String(tekst).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Tekst is verplicht' });
    }

    const notitie = database.createNotitie({
      contact_id: null,
      lead_id: leadId,
      medewerker: req.session.gebruiker.naam,
      tekst: String(tekst).trim().substring(0, 5000)
    });

    auditLog('notitie_aangemaakt', req.session.gebruiker.gebruikersnaam, notitie.id, { ip: req.ip });
    res.status(201).json({ success: true, data: notitie });
  } catch (err) {
    console.error('[API] Error creating lead notitie:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// DELETE notitie
app.delete('/api/notities/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    database.deleteNotitie(id);
    auditLog('notitie_verwijderd', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, message: 'Notitie verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting notitie:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// BESTELLINGEN ROUTES
// ============================================================

const geldigeBezorgmethode = ['afhalen', 'verzenden'];
const geldigeBestellingStatus = ['besteld', 'klaar', 'geleverd'];
const geldigeArtikelType = ['batterij', 'dome', 'filter', 'reinigingsmiddel', 'accessoire'];

// GET alle bestellingen
app.get('/api/bestellingen', vereistInlog, (req, res) => {
  try {
    const filter = {};
    if (req.query.status && geldigeBestellingStatus.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const bestellingen = database.getAllBestellingen(filter);
    res.json({ success: true, data: bestellingen });
  } catch (err) {
    console.error('[API] Error fetching bestellingen:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// GET bestellingen van contact
app.get('/api/contacts/:id/bestellingen', vereistInlog, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const bestellingen = database.getBestellingenVoorContact(id);
    res.json({ success: true, data: bestellingen });
  } catch (err) {
    console.error('[API] Error fetching bestellingen voor contact:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// CREATE bestelling voor contact
app.post('/api/contacts/:id/bestellingen', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId) || contactId < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig contact ID' });
    }

    const contact = database.getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact niet gevonden' });
    }

    const { bezorgmethode, status, notities, regels } = req.body;

    // Valideer regels
    const gevalideerdRegels = [];
    if (Array.isArray(regels)) {
      for (const regel of regels) {
        if (!regel.artikel_naam || String(regel.artikel_naam).trim().length === 0) continue;
        gevalideerdRegels.push({
          artikel_naam: String(regel.artikel_naam).trim().substring(0, 200),
          artikel_type: geldigeArtikelType.includes(regel.artikel_type)
            ? regel.artikel_type : 'accessoire',
          hoeveelheid: Math.max(1, Math.min(999, parseInt(regel.hoeveelheid) || 1)),
          notitie: regel.notitie ? String(regel.notitie).trim().substring(0, 500) : null
        });
      }
    }

    const bestelling = database.createBestelling({
      contact_id: contactId,
      bezorgmethode: geldigeBezorgmethode.includes(bezorgmethode) ? bezorgmethode : 'afhalen',
      status: geldigeBestellingStatus.includes(status) ? status : 'besteld',
      notities: notities ? String(notities).trim().substring(0, 2000) : null,
      aangemaakt_door: req.session.gebruiker.naam
    }, gevalideerdRegels);

    auditLog('bestelling_aangemaakt', req.session.gebruiker.gebruikersnaam, bestelling ? bestelling.id : null, { ip: req.ip });
    res.status(201).json({ success: true, data: bestelling });
  } catch (err) {
    console.error('[API] Error creating bestelling:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// UPDATE bestelling status
app.put('/api/bestellingen/:id', vereistInlog, vereistRol('medewerker'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    const { bezorgmethode, status, notities } = req.body;

    const updateData = {};
    if (bezorgmethode !== undefined) updateData.bezorgmethode = geldigeBezorgmethode.includes(bezorgmethode)
      ? bezorgmethode : 'afhalen';
    if (status !== undefined) updateData.status = geldigeBestellingStatus.includes(status)
      ? status : 'besteld';
    if (notities !== undefined) updateData.notities = notities
      ? String(notities).trim().substring(0, 2000) : null;

    const bestelling = database.updateBestelling(id, updateData);
    auditLog('bestelling_bijgewerkt', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, data: bestelling });
  } catch (err) {
    console.error('[API] Error updating bestelling:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// DELETE bestelling (admin only)
app.delete('/api/bestellingen/:id', vereistInlog, vereistRol('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Ongeldig ID' });
    }

    database.deleteBestelling(id);
    auditLog('bestelling_verwijderd', req.session.gebruiker.gebruikersnaam, id, { ip: req.ip });
    res.json({ success: true, message: 'Bestelling verwijderd' });
  } catch (err) {
    console.error('[API] Error deleting bestelling:', err);
    res.status(500).json({ success: false, error: 'Er is een fout opgetreden' });
  }
});

// ============================================================
// 12. ERROR HANDLERS
// ============================================================
app.use((err, req, res, next) => {
  console.error('[ERROR] Type:', err.constructor.name);
  console.error('[ERROR] Message:', err.message);
  console.error('[ERROR] Stack:', err.stack);
  console.error('[ERROR] Route:', req.method, req.path);

  const errorResponse = {
    success: false,
    error: IS_PRODUCTIE ? 'Er is een interne fout opgetreden' : err.message
  };

  res.status(500).json(errorResponse);
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
