const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crm.db');
let db = null;
let SQL = null;

// Zorg dat de map voor de database bestaat
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('[DB] Created directory:', dbDir);
}

async function initDatabase() {
  try {
    SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      const fileContent = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileContent);
      console.log('[DB] Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('[DB] Created new database');
    }

    // Create tables if they don't exist
    const tables = db.exec('SELECT name FROM sqlite_master WHERE type="table"');
    const tableNames = tables.length > 0 ? tables[0].values.map(row => row[0]) : [];

    // Contacts tabel
    if (!tableNames.includes('contacts')) {
      db.run(`
        CREATE TABLE contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          naam TEXT NOT NULL,
          email TEXT,
          telefoonnummer TEXT,
          bedrijf TEXT,
          type TEXT DEFAULT 'klant',
          status TEXT DEFAULT 'nieuw',
          notities TEXT,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          bijgewerkt_op DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DB] Created contacts table');
    }

    // Gebruikers tabel (voor inlogsysteem)
    if (!tableNames.includes('gebruikers')) {
      db.run(`
        CREATE TABLE gebruikers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          naam TEXT NOT NULL,
          gebruikersnaam TEXT UNIQUE NOT NULL,
          wachtwoord_hash TEXT NOT NULL,
          rol TEXT NOT NULL DEFAULT 'medewerker',
          actief INTEGER NOT NULL DEFAULT 1,
          laatste_login DATETIME,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DB] Created gebruikers table');
    }

    // Audit log tabel (voor compliance & tracking)
    if (!tableNames.includes('audit_log')) {
      db.run(`
        CREATE TABLE audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          gebruiker_id INTEGER,
          actie TEXT NOT NULL,
          resource_type TEXT,
          resource_id INTEGER,
          ip_adres TEXT,
          tijdstip DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id)
        )
      `);
      console.log('[DB] Created audit_log table');
    }

    // ============================================================
    // MIGRATIE: Extra kolommen aan contacts tabel toevoegen
    // ============================================================
    const contactsInfo = db.exec('PRAGMA table_info(contacts)');
    const contactsKolommen = contactsInfo.length > 0
      ? contactsInfo[0].values.map(row => row[1])
      : [];

    const extraKolommen = [
      { naam: 'aanhef',              sql: 'ALTER TABLE contacts ADD COLUMN aanhef TEXT' },
      { naam: 'geboortedatum',       sql: 'ALTER TABLE contacts ADD COLUMN geboortedatum TEXT' },
      { naam: 'adres',               sql: 'ALTER TABLE contacts ADD COLUMN adres TEXT' },
      { naam: 'postcode',            sql: 'ALTER TABLE contacts ADD COLUMN postcode TEXT' },
      { naam: 'woonplaats',          sql: 'ALTER TABLE contacts ADD COLUMN woonplaats TEXT' },
      { naam: 'mobiel',              sql: 'ALTER TABLE contacts ADD COLUMN mobiel TEXT' },
      { naam: 'huisarts',            sql: 'ALTER TABLE contacts ADD COLUMN huisarts TEXT' },
      { naam: 'voorschrijver',       sql: 'ALTER TABLE contacts ADD COLUMN voorschrijver TEXT' },
      { naam: 'klantnummer_extern',  sql: 'ALTER TABLE contacts ADD COLUMN klantnummer_extern TEXT' }
    ];

    for (const kolom of extraKolommen) {
      if (!contactsKolommen.includes(kolom.naam)) {
        db.run(kolom.sql);
        console.log(`[DB] Migrated contacts: added column ${kolom.naam}`);
      }
    }

    // ============================================================
    // NIEUWE TABEL: leads
    // ============================================================
    if (!tableNames.includes('leads')) {
      db.run(`
        CREATE TABLE leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          naam TEXT NOT NULL,
          aanhef TEXT,
          telefoon TEXT,
          mobiel TEXT,
          email TEXT,
          herkomst TEXT DEFAULT 'telefoon',
          pipeline_status TEXT DEFAULT 'lead',
          notities TEXT,
          medewerker TEXT,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          bijgewerkt_op DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DB] Created leads table');
    }

    // ============================================================
    // NIEUWE TABEL: hoortoestellen
    // ============================================================
    if (!tableNames.includes('hoortoestellen')) {
      db.run(`
        CREATE TABLE hoortoestellen (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER NOT NULL,
          merk TEXT,
          type_naam TEXT,
          serienummer_links TEXT,
          serienummer_rechts TEXT,
          kleur TEXT,
          leverdatum TEXT,
          factuurdatum TEXT,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        )
      `);
      console.log('[DB] Created hoortoestellen table');
    }

    // ============================================================
    // NIEUWE TABEL: taken
    // ============================================================
    if (!tableNames.includes('taken')) {
      db.run(`
        CREATE TABLE taken (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          titel TEXT NOT NULL,
          omschrijving TEXT,
          deadline TEXT,
          status TEXT DEFAULT 'open',
          contact_id INTEGER,
          lead_id INTEGER,
          eigenaar TEXT,
          aangemaakt_door TEXT,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          bijgewerkt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
        )
      `);
      console.log('[DB] Created taken table');
    }

    // ============================================================
    // NIEUWE TABEL: contact_notities
    // ============================================================
    if (!tableNames.includes('contact_notities')) {
      db.run(`
        CREATE TABLE contact_notities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER,
          lead_id INTEGER,
          medewerker TEXT NOT NULL,
          tekst TEXT NOT NULL,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
        )
      `);
      console.log('[DB] Created contact_notities table');
    }

    // ============================================================
    // NIEUWE TABEL: bestellingen
    // ============================================================
    if (!tableNames.includes('bestellingen')) {
      db.run(`
        CREATE TABLE bestellingen (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER NOT NULL,
          bezorgmethode TEXT DEFAULT 'afhalen',
          status TEXT DEFAULT 'besteld',
          notities TEXT,
          aangemaakt_door TEXT,
          aangemaakt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          bijgewerkt_op DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        )
      `);
      console.log('[DB] Created bestellingen table');
    }

    // ============================================================
    // NIEUWE TABEL: bestelling_regels
    // ============================================================
    if (!tableNames.includes('bestelling_regels')) {
      db.run(`
        CREATE TABLE bestelling_regels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bestelling_id INTEGER NOT NULL,
          artikel_naam TEXT NOT NULL,
          artikel_type TEXT DEFAULT 'accessoire',
          hoeveelheid INTEGER DEFAULT 1,
          notitie TEXT,
          FOREIGN KEY (bestelling_id) REFERENCES bestellingen(id) ON DELETE CASCADE
        )
      `);
      console.log('[DB] Created bestelling_regels table');
    }

    saveDatabase();
  } catch (err) {
    console.error('[DB] Initialization error:', err);
    throw err;
  }
}

function saveDatabase() {
  try {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err);
  }
}

// ============================================================
// CONTACT FUNCTIES (bestaand + uitgebreid met extra velden)
// ============================================================

function getAllContacts() {
  try {
    const result = db.exec('SELECT * FROM contacts ORDER BY bijgewerkt_op DESC');
    if (result.length === 0) return [];
    const kolommen = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      kolommen.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (err) {
    console.error('[DB] Error fetching all contacts:', err);
    return [];
  }
}

function getContactById(id) {
  try {
    const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
    stmt.bind([parseInt(id)]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }

    stmt.free();
    return null;
  } catch (err) {
    console.error('[DB] Error fetching contact by ID:', err);
    return null;
  }
}

function createContact(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO contacts (
        naam, email, telefoonnummer, bedrijf, type, status, notities,
        aanhef, geboortedatum, adres, postcode, woonplaats,
        mobiel, huisarts, voorschrijver, klantnummer_extern
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      data.naam,
      data.email || null,
      data.telefoonnummer || null,
      data.bedrijf || null,
      data.type || 'klant',
      data.status || 'nieuw',
      data.notities || null,
      data.aanhef || null,
      data.geboortedatum || null,
      data.adres || null,
      data.postcode || null,
      data.woonplaats || null,
      data.mobiel || null,
      data.huisarts || null,
      data.voorschrijver || null,
      data.klantnummer_extern || null
    ]);

    stmt.step();
    stmt.free();

    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0].values[0][0];

    return getContactById(lastId);
  } catch (err) {
    console.error('[DB] Error creating contact:', err);
    throw err;
  }
}

function updateContact(id, data) {
  try {
    const updates = [];
    const values = [];

    const velden = [
      'naam', 'email', 'telefoonnummer', 'bedrijf', 'type', 'status', 'notities',
      'aanhef', 'geboortedatum', 'adres', 'postcode', 'woonplaats',
      'mobiel', 'huisarts', 'voorschrijver', 'klantnummer_extern'
    ];

    for (const veld of velden) {
      if (data[veld] !== undefined) {
        updates.push(`${veld} = ?`);
        values.push(data[veld]);
      }
    }

    if (updates.length === 0) {
      return getContactById(id);
    }

    updates.push('bijgewerkt_op = CURRENT_TIMESTAMP');
    values.push(parseInt(id));

    const query = `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(query);
    stmt.bind(values);
    stmt.step();
    stmt.free();

    saveDatabase();
    return getContactById(id);
  } catch (err) {
    console.error('[DB] Error updating contact:', err);
    throw err;
  }
}

function deleteContact(id) {
  try {
    const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
    stmt.bind([parseInt(id)]);
    stmt.step();
    stmt.free();

    saveDatabase();
  } catch (err) {
    console.error('[DB] Error deleting contact:', err);
    throw err;
  }
}

// ============================================================
// GEBRUIKERSBEHEER FUNCTIES
// ============================================================

function getGebruikerByNaam(gebruikersnaam) {
  try {
    const stmt = db.prepare(
      'SELECT * FROM gebruikers WHERE gebruikersnaam = ? AND actief = 1'
    );
    stmt.bind([gebruikersnaam.toLowerCase()]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (err) {
    console.error('[DB] Error fetching gebruiker:', err);
    return null;
  }
}

function getAllGebruikers() {
  try {
    const result = db.exec(
      'SELECT id, naam, gebruikersnaam, rol, actief, laatste_login FROM gebruikers ORDER BY naam'
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      id: row[0],
      naam: row[1],
      gebruikersnaam: row[2],
      rol: row[3],
      actief: row[4],
      laatste_login: row[5]
    }));
  } catch (err) {
    console.error('[DB] Error fetching all gebruikers:', err);
    return [];
  }
}

function updateLaatsteLogin(gebruikerId) {
  try {
    const stmt = db.prepare(
      'UPDATE gebruikers SET laatste_login = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.bind([parseInt(gebruikerId)]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    console.error('[DB] Error updating laatste_login:', err);
  }
}

function createGebruiker(naam, gebruikersnaam, wachtwoordHash, rol = 'medewerker') {
  try {
    const stmt = db.prepare(
      'INSERT INTO gebruikers (naam, gebruikersnaam, wachtwoord_hash, rol) VALUES (?, ?, ?, ?)'
    );
    stmt.bind([
      naam,
      gebruikersnaam.toLowerCase(),
      wachtwoordHash,
      rol
    ]);
    stmt.step();
    stmt.free();
    saveDatabase();
    console.log('[DB] Created user:', gebruikersnaam);
  } catch (err) {
    console.error('[DB] Error creating gebruiker:', err);
    throw err;
  }
}

// ============================================================
// AUDIT LOGGING FUNCTIES
// ============================================================

function logAudit(gebruikerId, actie, resourceType = null, resourceId = null, ipAdres = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (gebruiker_id, actie, resource_type, resource_id, ip_adres)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.bind([
      gebruikerId ? parseInt(gebruikerId) : null,
      actie,
      resourceType,
      resourceId ? parseInt(resourceId) : null,
      ipAdres
    ]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    // Audit log fouten mogen applicatie niet stoppen
    console.error('[DB] Audit log error:', err.message);
  }
}

// ============================================================
// LEADS FUNCTIES
// ============================================================

function getAllLeads(filter = {}) {
  try {
    const conditions = [];
    const params = [];

    if (filter.herkomst) {
      conditions.push('herkomst = ?');
      params.push(filter.herkomst);
    }
    if (filter.pipeline_status) {
      conditions.push('pipeline_status = ?');
      params.push(filter.pipeline_status);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = db.exec(`SELECT * FROM leads ${where} ORDER BY bijgewerkt_op DESC`, params);

    if (result.length === 0) return [];
    const kolommen = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      kolommen.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (err) {
    console.error('[DB] Error fetching all leads:', err);
    return [];
  }
}

function getLeadById(id) {
  try {
    const stmt = db.prepare('SELECT * FROM leads WHERE id = ?');
    stmt.bind([parseInt(id)]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (err) {
    console.error('[DB] Error fetching lead by ID:', err);
    return null;
  }
}

function createLead(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO leads (naam, aanhef, telefoon, mobiel, email, herkomst, pipeline_status, notities, medewerker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      data.naam,
      data.aanhef || null,
      data.telefoon || null,
      data.mobiel || null,
      data.email || null,
      data.herkomst || 'telefoon',
      data.pipeline_status || 'lead',
      data.notities || null,
      data.medewerker || null
    ]);
    stmt.step();
    stmt.free();

    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0].values[0][0];
    return getLeadById(lastId);
  } catch (err) {
    console.error('[DB] Error creating lead:', err);
    throw err;
  }
}

function updateLead(id, data) {
  try {
    const updates = [];
    const values = [];

    const velden = ['naam', 'aanhef', 'telefoon', 'mobiel', 'email', 'herkomst', 'pipeline_status', 'notities', 'medewerker'];
    for (const veld of velden) {
      if (data[veld] !== undefined) {
        updates.push(`${veld} = ?`);
        values.push(data[veld]);
      }
    }

    if (updates.length === 0) {
      return getLeadById(id);
    }

    updates.push('bijgewerkt_op = CURRENT_TIMESTAMP');
    values.push(parseInt(id));

    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(query);
    stmt.bind(values);
    stmt.step();
    stmt.free();

    saveDatabase();
    return getLeadById(id);
  } catch (err) {
    console.error('[DB] Error updating lead:', err);
    throw err;
  }
}

function deleteLead(id) {
  try {
    const stmt = db.prepare('DELETE FROM leads WHERE id = ?');
    stmt.bind([parseInt(id)]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    console.error('[DB] Error deleting lead:', err);
    throw err;
  }
}

// ============================================================
// HOORTOESTELLEN FUNCTIES
// ============================================================

function getHoortoestelByContact(contactId) {
  try {
    const stmt = db.prepare('SELECT * FROM hoortoestellen WHERE contact_id = ? ORDER BY aangemaakt_op DESC');
    stmt.bind([parseInt(contactId)]);

    const resultaat = [];
    while (stmt.step()) {
      resultaat.push(stmt.getAsObject());
    }
    stmt.free();
    return resultaat;
  } catch (err) {
    console.error('[DB] Error fetching hoortoestellen:', err);
    return [];
  }
}

function createHoortoestel(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO hoortoestellen (contact_id, merk, type_naam, serienummer_links, serienummer_rechts, kleur, leverdatum, factuurdatum)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      parseInt(data.contact_id),
      data.merk || null,
      data.type_naam || null,
      data.serienummer_links || null,
      data.serienummer_rechts || null,
      data.kleur || null,
      data.leverdatum || null,
      data.factuurdatum || null
    ]);
    stmt.step();
    stmt.free();

    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0].values[0][0];

    const stmt2 = db.prepare('SELECT * FROM hoortoestellen WHERE id = ?');
    stmt2.bind([lastId]);
    let hoortoestel = null;
    if (stmt2.step()) {
      hoortoestel = stmt2.getAsObject();
    }
    stmt2.free();
    return hoortoestel;
  } catch (err) {
    console.error('[DB] Error creating hoortoestel:', err);
    throw err;
  }
}

function updateHoortoestel(id, data) {
  try {
    const updates = [];
    const values = [];

    const velden = ['merk', 'type_naam', 'serienummer_links', 'serienummer_rechts', 'kleur', 'leverdatum', 'factuurdatum'];
    for (const veld of velden) {
      if (data[veld] !== undefined) {
        updates.push(`${veld} = ?`);
        values.push(data[veld]);
      }
    }

    if (updates.length === 0) {
      const stmt = db.prepare('SELECT * FROM hoortoestellen WHERE id = ?');
      stmt.bind([parseInt(id)]);
      let hoortoestel = null;
      if (stmt.step()) hoortoestel = stmt.getAsObject();
      stmt.free();
      return hoortoestel;
    }

    values.push(parseInt(id));

    const query = `UPDATE hoortoestellen SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(query);
    stmt.bind(values);
    stmt.step();
    stmt.free();

    saveDatabase();

    const stmt2 = db.prepare('SELECT * FROM hoortoestellen WHERE id = ?');
    stmt2.bind([parseInt(id)]);
    let hoortoestel = null;
    if (stmt2.step()) hoortoestel = stmt2.getAsObject();
    stmt2.free();
    return hoortoestel;
  } catch (err) {
    console.error('[DB] Error updating hoortoestel:', err);
    throw err;
  }
}

function deleteHoortoestel(id) {
  try {
    const stmt = db.prepare('DELETE FROM hoortoestellen WHERE id = ?');
    stmt.bind([parseInt(id)]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    console.error('[DB] Error deleting hoortoestel:', err);
    throw err;
  }
}

// Geeft hoortoestellen terug waarvan de leverdatum bijna 1 jaar of 5 jaar geleden is.
// Marge: ±30 dagen rond de jubileumdag.
// Retourneert contact info + hoortoestel info + type_herinnering ('check_up' | 'garantie_verloop')
function getNazorgAankomend(aantalDagen = 60) {
  try {
    const result = db.exec(`
      SELECT
        h.id AS hoortoestel_id,
        h.contact_id,
        h.merk,
        h.type_naam,
        h.serienummer_links,
        h.serienummer_rechts,
        h.leverdatum,
        c.naam AS contact_naam,
        c.telefoonnummer AS contact_telefoon,
        c.email AS contact_email,
        CASE
          WHEN (
            CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', h.leverdatum) AS INTEGER) = 1
            AND ABS(
              julianday('now') - julianday(
                date(h.leverdatum, '+1 year')
              )
            ) <= 30
          ) THEN 'check_up'
          WHEN (
            CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', h.leverdatum) AS INTEGER) = 5
            AND ABS(
              julianday('now') - julianday(
                date(h.leverdatum, '+5 years')
              )
            ) <= 30
          ) THEN 'garantie_verloop'
          ELSE NULL
        END AS type_herinnering
      FROM hoortoestellen h
      JOIN contacts c ON c.id = h.contact_id
      WHERE h.leverdatum IS NOT NULL
        AND (
          (
            CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', h.leverdatum) AS INTEGER) = 1
            AND ABS(
              julianday('now') - julianday(date(h.leverdatum, '+1 year'))
            ) <= 30
          )
          OR (
            CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', h.leverdatum) AS INTEGER) = 5
            AND ABS(
              julianday('now') - julianday(date(h.leverdatum, '+5 years'))
            ) <= 30
          )
        )
      ORDER BY h.leverdatum ASC
    `);

    if (result.length === 0) return [];
    const kolommen = result[0].columns;
    return result[0].values
      .map(row => {
        const obj = {};
        kolommen.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      })
      .filter(row => row.type_herinnering !== null);
  } catch (err) {
    console.error('[DB] Error fetching nazorg aankomend:', err);
    return [];
  }
}

// ============================================================
// TAKEN FUNCTIES
// ============================================================

function getAllTaken(filter = {}) {
  try {
    const conditions = [];
    const params = [];

    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.eigenaar) {
      conditions.push('eigenaar = ?');
      params.push(filter.eigenaar);
    }
    if (filter.contact_id) {
      conditions.push('contact_id = ?');
      params.push(parseInt(filter.contact_id));
    }
    if (filter.lead_id) {
      conditions.push('lead_id = ?');
      params.push(parseInt(filter.lead_id));
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = db.exec(`SELECT * FROM taken ${where} ORDER BY deadline ASC, aangemaakt_op DESC`, params);

    if (result.length === 0) return [];
    const kolommen = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      kolommen.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (err) {
    console.error('[DB] Error fetching taken:', err);
    return [];
  }
}

function getTaakById(id) {
  try {
    const stmt = db.prepare('SELECT * FROM taken WHERE id = ?');
    stmt.bind([parseInt(id)]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (err) {
    console.error('[DB] Error fetching taak by ID:', err);
    return null;
  }
}

function createTaak(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO taken (titel, omschrijving, deadline, status, contact_id, lead_id, eigenaar, aangemaakt_door)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      data.titel,
      data.omschrijving || null,
      data.deadline || null,
      data.status || 'open',
      data.contact_id ? parseInt(data.contact_id) : null,
      data.lead_id ? parseInt(data.lead_id) : null,
      data.eigenaar || null,
      data.aangemaakt_door || null
    ]);
    stmt.step();
    stmt.free();

    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0].values[0][0];
    return getTaakById(lastId);
  } catch (err) {
    console.error('[DB] Error creating taak:', err);
    throw err;
  }
}

function updateTaak(id, data) {
  try {
    const updates = [];
    const values = [];

    const velden = ['titel', 'omschrijving', 'deadline', 'status', 'contact_id', 'lead_id', 'eigenaar'];
    for (const veld of velden) {
      if (data[veld] !== undefined) {
        updates.push(`${veld} = ?`);
        values.push(data[veld]);
      }
    }

    if (updates.length === 0) {
      return getTaakById(id);
    }

    updates.push('bijgewerkt_op = CURRENT_TIMESTAMP');
    values.push(parseInt(id));

    const query = `UPDATE taken SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(query);
    stmt.bind(values);
    stmt.step();
    stmt.free();

    saveDatabase();
    return getTaakById(id);
  } catch (err) {
    console.error('[DB] Error updating taak:', err);
    throw err;
  }
}

function deleteTaak(id) {
  try {
    const stmt = db.prepare('DELETE FROM taken WHERE id = ?');
    stmt.bind([parseInt(id)]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    console.error('[DB] Error deleting taak:', err);
    throw err;
  }
}

// ============================================================
// NOTITIES FUNCTIES
// ============================================================

function getNotitiesVoorContact(contactId) {
  try {
    const stmt = db.prepare(
      'SELECT * FROM contact_notities WHERE contact_id = ? ORDER BY aangemaakt_op DESC'
    );
    stmt.bind([parseInt(contactId)]);
    const resultaat = [];
    while (stmt.step()) {
      resultaat.push(stmt.getAsObject());
    }
    stmt.free();
    return resultaat;
  } catch (err) {
    console.error('[DB] Error fetching notities voor contact:', err);
    return [];
  }
}

function getNotitiesVoorLead(leadId) {
  try {
    const stmt = db.prepare(
      'SELECT * FROM contact_notities WHERE lead_id = ? ORDER BY aangemaakt_op DESC'
    );
    stmt.bind([parseInt(leadId)]);
    const resultaat = [];
    while (stmt.step()) {
      resultaat.push(stmt.getAsObject());
    }
    stmt.free();
    return resultaat;
  } catch (err) {
    console.error('[DB] Error fetching notities voor lead:', err);
    return [];
  }
}

function createNotitie(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO contact_notities (contact_id, lead_id, medewerker, tekst)
      VALUES (?, ?, ?, ?)
    `);
    stmt.bind([
      data.contact_id ? parseInt(data.contact_id) : null,
      data.lead_id ? parseInt(data.lead_id) : null,
      data.medewerker,
      data.tekst
    ]);
    stmt.step();
    stmt.free();

    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0].values[0][0];

    const stmt2 = db.prepare('SELECT * FROM contact_notities WHERE id = ?');
    stmt2.bind([lastId]);
    let notitie = null;
    if (stmt2.step()) notitie = stmt2.getAsObject();
    stmt2.free();
    return notitie;
  } catch (err) {
    console.error('[DB] Error creating notitie:', err);
    throw err;
  }
}

function deleteNotitie(id) {
  try {
    const stmt = db.prepare('DELETE FROM contact_notities WHERE id = ?');
    stmt.bind([parseInt(id)]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    console.error('[DB] Error deleting notitie:', err);
    throw err;
  }
}

// ============================================================
// BESTELLINGEN FUNCTIES
// ============================================================

function getBestellingenVoorContact(contactId) {
  try {
    const stmt = db.prepare(`
      SELECT b.*, br.id AS regel_id, br.artikel_naam, br.artikel_type, br.hoeveelheid, br.notitie AS regel_notitie
      FROM bestellingen b
      LEFT JOIN bestelling_regels br ON br.bestelling_id = b.id
      WHERE b.contact_id = ?
      ORDER BY b.aangemaakt_op DESC
    `);
    stmt.bind([parseInt(contactId)]);

    // Groepeer regels per bestelling
    const bestellingenMap = {};
    const volgorde = [];

    while (stmt.step()) {
      const rij = stmt.getAsObject();
      const bId = rij.id;

      if (!bestellingenMap[bId]) {
        bestellingenMap[bId] = {
          id: rij.id,
          contact_id: rij.contact_id,
          bezorgmethode: rij.bezorgmethode,
          status: rij.status,
          notities: rij.notities,
          aangemaakt_door: rij.aangemaakt_door,
          aangemaakt_op: rij.aangemaakt_op,
          bijgewerkt_op: rij.bijgewerkt_op,
          regels: []
        };
        volgorde.push(bId);
      }

      if (rij.regel_id) {
        bestellingenMap[bId].regels.push({
          id: rij.regel_id,
          bestelling_id: bId,
          artikel_naam: rij.artikel_naam,
          artikel_type: rij.artikel_type,
          hoeveelheid: rij.hoeveelheid,
          notitie: rij.regel_notitie
        });
      }
    }
    stmt.free();

    return volgorde.map(id => bestellingenMap[id]);
  } catch (err) {
    console.error('[DB] Error fetching bestellingen voor contact:', err);
    return [];
  }
}

function getAllBestellingen(filter = {}) {
  try {
    const conditions = [];
    const params = [];

    if (filter.status) {
      conditions.push('b.status = ?');
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = db.exec(`
      SELECT b.*, c.naam AS contact_naam
      FROM bestellingen b
      JOIN contacts c ON c.id = b.contact_id
      ${where}
      ORDER BY b.bijgewerkt_op DESC
    `, params);

    if (result.length === 0) return [];
    const kolommen = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      kolommen.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (err) {
    console.error('[DB] Error fetching all bestellingen:', err);
    return [];
  }
}

function createBestelling(data, regels = []) {
  try {
    // Bestelling aanmaken
    const stmt = db.prepare(`
      INSERT INTO bestellingen (contact_id, bezorgmethode, status, notities, aangemaakt_door)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.bind([
      parseInt(data.contact_id),
      data.bezorgmethode || 'afhalen',
      data.status || 'besteld',
      data.notities || null,
      data.aangemaakt_door || null
    ]);
    stmt.step();
    stmt.free();

    const resultId = db.exec('SELECT last_insert_rowid() as id');
    const bestellingId = resultId[0].values[0][0];

    // Regels aanmaken
    for (const regel of regels) {
      const stmtRegel = db.prepare(`
        INSERT INTO bestelling_regels (bestelling_id, artikel_naam, artikel_type, hoeveelheid, notitie)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmtRegel.bind([
        bestellingId,
        regel.artikel_naam,
        regel.artikel_type || 'accessoire',
        regel.hoeveelheid || 1,
        regel.notitie || null
      ]);
      stmtRegel.step();
      stmtRegel.free();
    }

    saveDatabase();

    // Geef bestelling terug met regels
    const bestellingen = getBestellingenVoorContact(data.contact_id);
    return bestellingen.find(b => b.id === bestellingId) || null;
  } catch (err) {
    console.error('[DB] Error creating bestelling:', err);
    throw err;
  }
}

function updateBestelling(id, data) {
  try {
    const updates = [];
    const values = [];

    if (data.bezorgmethode !== undefined) {
      updates.push('bezorgmethode = ?');
      values.push(data.bezorgmethode);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.notities !== undefined) {
      updates.push('notities = ?');
      values.push(data.notities);
    }

    if (updates.length === 0) {
      const stmt = db.prepare('SELECT * FROM bestellingen WHERE id = ?');
      stmt.bind([parseInt(id)]);
      let b = null;
      if (stmt.step()) b = stmt.getAsObject();
      stmt.free();
      return b;
    }

    updates.push('bijgewerkt_op = CURRENT_TIMESTAMP');
    values.push(parseInt(id));

    const query = `UPDATE bestellingen SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(query);
    stmt.bind(values);
    stmt.step();
    stmt.free();

    saveDatabase();

    const stmt2 = db.prepare('SELECT * FROM bestellingen WHERE id = ?');
    stmt2.bind([parseInt(id)]);
    let bestelling = null;
    if (stmt2.step()) bestelling = stmt2.getAsObject();
    stmt2.free();
    return bestelling;
  } catch (err) {
    console.error('[DB] Error updating bestelling:', err);
    throw err;
  }
}

function deleteBestelling(id) {
  try {
    // Regels worden automatisch verwijderd via ON DELETE CASCADE
    const stmt = db.prepare('DELETE FROM bestellingen WHERE id = ?');
    stmt.bind([parseInt(id)]);
    stmt.step();
    stmt.free();
    saveDatabase();
  } catch (err) {
    console.error('[DB] Error deleting bestelling:', err);
    throw err;
  }
}

// ============================================================
// DASHBOARD STATISTIEKEN
// ============================================================

function getDashboardStats() {
  try {
    const vandaag = new Date().toISOString().substring(0, 10);

    // Leads statistieken
    const leadsResult = db.exec('SELECT COUNT(*) FROM leads');
    const totaalLeads = leadsResult.length > 0 ? leadsResult[0].values[0][0] : 0;

    const leadsPerStatusResult = db.exec(
      'SELECT pipeline_status, COUNT(*) FROM leads GROUP BY pipeline_status'
    );
    const leadsPerStatus = {};
    if (leadsPerStatusResult.length > 0) {
      for (const rij of leadsPerStatusResult[0].values) {
        leadsPerStatus[rij[0]] = rij[1];
      }
    }

    // Contacten statistieken
    const contactenResult = db.exec('SELECT COUNT(*) FROM contacts');
    const totaalContacten = contactenResult.length > 0 ? contactenResult[0].values[0][0] : 0;

    const actiefResult = db.exec("SELECT COUNT(*) FROM contacts WHERE status = 'actief'");
    const actiefContacten = actiefResult.length > 0 ? actiefResult[0].values[0][0] : 0;

    // Taken statistieken
    const openTakenResult = db.exec("SELECT COUNT(*) FROM taken WHERE status != 'afgerond'");
    const openTaken = openTakenResult.length > 0 ? openTakenResult[0].values[0][0] : 0;

    const takenVandaagResult = db.exec(
      "SELECT COUNT(*) FROM taken WHERE deadline = ? AND status != 'afgerond'",
      [vandaag]
    );
    const takenVandaag = takenVandaagResult.length > 0 ? takenVandaagResult[0].values[0][0] : 0;

    // Bestellingen in behandeling
    const bestellingenResult = db.exec(
      "SELECT COUNT(*) FROM bestellingen WHERE status IN ('besteld', 'klaar')"
    );
    const bestellingenInBehandeling = bestellingenResult.length > 0
      ? bestellingenResult[0].values[0][0]
      : 0;

    // Nazorg binnenkort (30 dagen marge)
    const nazorgResultaat = getNazorgAankomend(30);
    const nazorgBinnenkort = nazorgResultaat.length;

    return {
      totaal_leads: totaalLeads,
      leads_per_status: leadsPerStatus,
      totaal_contacten: totaalContacten,
      actieve_contacten: actiefContacten,
      open_taken: openTaken,
      taken_vandaag: takenVandaag,
      bestellingen_in_behandeling: bestellingenInBehandeling,
      nazorg_binnenkort: nazorgBinnenkort
    };
  } catch (err) {
    console.error('[DB] Error fetching dashboard stats:', err);
    return {
      totaal_leads: 0,
      leads_per_status: {},
      totaal_contacten: 0,
      actieve_contacten: 0,
      open_taken: 0,
      taken_vandaag: 0,
      bestellingen_in_behandeling: 0,
      nazorg_binnenkort: 0
    };
  }
}

module.exports = {
  initDatabase,
  saveDatabase,
  // Contacts
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  // Gebruikers
  getGebruikerByNaam,
  getAllGebruikers,
  updateLaatsteLogin,
  createGebruiker,
  // Audit
  logAudit,
  // Leads
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  // Hoortoestellen
  getHoortoestelByContact,
  createHoortoestel,
  updateHoortoestel,
  deleteHoortoestel,
  getNazorgAankomend,
  // Taken
  getAllTaken,
  getTaakById,
  createTaak,
  updateTaak,
  deleteTaak,
  // Notities
  getNotitiesVoorContact,
  getNotitiesVoorLead,
  createNotitie,
  deleteNotitie,
  // Bestellingen
  getBestellingenVoorContact,
  getAllBestellingen,
  createBestelling,
  updateBestelling,
  deleteBestelling,
  // Dashboard
  getDashboardStats
};
