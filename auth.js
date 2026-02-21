// auth.js - Authenticatie module voor Telegraaf Horen CRM
// Sessie-gebaseerde authenticatie met bcryptjs password hashing

const bcrypt = require('bcryptjs');
const database = require('./database');

/**
 * Middleware: Controleer of gebruiker is ingelogd
 * Gebruikt voor alle beveiligde routes
 */
function vereistInlog(req, res, next) {
  if (req.session && req.session.gebruiker) {
    // Verleng sessie bij activiteit
    req.session.touch();
    return next();
  }

  // API verzoeken krijgen 401 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: 'Niet ingelogd'
    });
  }

  // Pagina verzoeken gaan naar login
  res.redirect('/login');
}

/**
 * Middleware: Controleer gebruiker-rol
 * Rollen: viewer (1) < medewerker (2) < admin (3)
 */
function vereistRol(minimaleRol) {
  const rolRang = { viewer: 1, medewerker: 2, admin: 3 };

  return function(req, res, next) {
    if (!req.session || !req.session.gebruiker) {
      return res.status(401).json({ success: false, error: 'Niet ingelogd' });
    }

    const gebruikerRang = rolRang[req.session.gebruiker.rol] || 0;
    const vereistRang = rolRang[minimaleRol] || 99;

    if (gebruikerRang >= vereistRang) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Onvoldoende rechten voor deze actie'
    });
  };
}

/**
 * Verifieer inloggegevens (gebruikersnaam + wachtwoord)
 * Gelijk timing tegen timing-aanvallen (user enumeration)
 */
async function verificeerInlog(gebruikersnaam, wachtwoord) {
  const gebruiker = database.getGebruikerByNaam(gebruikersnaam);

  if (!gebruiker) {
    // Gelijke timing: doe hashing ook al gebruiker niet bestaat (voorkomt user enumeration)
    // Gebruik een valide bcrypt hash formaat (60 tekens: $2b$12$ + 22 salt + 31 hash)
    await bcrypt.compare(wachtwoord, '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8QdWJDHFOOzM8MKZW1y');
    return null;
  }

  const geldig = await bcrypt.compare(wachtwoord, gebruiker.wachtwoord_hash);
  if (!geldig) return null;

  // Controleer of gebruiker actief is
  if (!gebruiker.actief) return null;

  // Geef gebruikersdata terug zonder wachtwoord
  return {
    id: gebruiker.id,
    naam: gebruiker.naam,
    gebruikersnaam: gebruiker.gebruikersnaam,
    rol: gebruiker.rol
  };
}

/**
 * Hash een wachtwoord met bcryptjs
 * Veilig voor production (non-blocking)
 */
async function hashWachtwoord(wachtwoord) {
  return await bcrypt.hash(wachtwoord, 12);
}

module.exports = {
  vereistInlog,
  vereistRol,
  verificeerInlog,
  hashWachtwoord
};
