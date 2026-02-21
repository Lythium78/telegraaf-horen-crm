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

function getAllContacts() {
  try {
    const result = db.exec('SELECT * FROM contacts ORDER BY bijgewerkt_op DESC');
    return result.length > 0 ? result[0].values.map(row => {
      return {
        id: row[0],
        naam: row[1],
        email: row[2],
        telefoonnummer: row[3],
        bedrijf: row[4],
        type: row[5],
        status: row[6],
        notities: row[7],
        aangemaakt_op: row[8],
        bijgewerkt_op: row[9]
      };
    }) : [];
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
      INSERT INTO contacts (naam, email, telefoonnummer, bedrijf, type, status, notities)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      data.naam,
      data.email || null,
      data.telefoonnummer || null,
      data.bedrijf || null,
      data.type || 'klant',
      data.status || 'nieuw',
      data.notities || null
    ]);

    stmt.step();
    stmt.free();

    saveDatabase();

    // Return the created contact
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

    if (data.naam !== undefined) {
      updates.push('naam = ?');
      values.push(data.naam);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email);
    }
    if (data.telefoonnummer !== undefined) {
      updates.push('telefoonnummer = ?');
      values.push(data.telefoonnummer);
    }
    if (data.bedrijf !== undefined) {
      updates.push('bedrijf = ?');
      values.push(data.bedrijf);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
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

module.exports = {
  initDatabase,
  saveDatabase,
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  getGebruikerByNaam,
  getAllGebruikers,
  updateLaatsteLogin,
  createGebruiker,
  logAudit
};
