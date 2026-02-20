// logger.js - Audit logging zonder persoonsgegevens te lekken
// Logt: wie, actie, resource_id, timestamp, ip_adres
// NOOIT: namen, email adressen, telefoonnummers, notities

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Zorg dat logs directory bestaat
const logsDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    // Audit log - Track alle acties
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 5242880,   // 5MB
      maxFiles: 30,       // 30 maanden aan logs
      tailable: true
    }),
    // Fout log - Track errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 10
    })
  ]
});

// In development ook naar console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Audit logging - GEEN persoonsgegevens!
 *
 * Voorbeelden:
 * - auditLog('ingelogd', 'john.doe', null, { ip: '192.168.1.1' })
 * - auditLog('contact_bekeken', 'john.doe', 42)
 * - auditLog('contact_aangemaakt', 'john.doe', 42)
 * - auditLog('contact_bijgewerkt', 'john.doe', 42)
 */
function auditLog(actie, gebruikersnaam, resourceId = null, extra = {}) {
  logger.info({
    type: 'audit',
    actie,                      // Wat gebeurde er
    gebruiker: gebruikersnaam,  // Wie deed het (gebruikersnaam, GEEN email)
    resource_id: resourceId,    // Alleen ID, NOOIT data
    timestamp: new Date().toISOString(),
    ...extra
  });
}

/**
 * Log fouten (voor debugging, niet AVG-gevoelig)
 */
function logError(bericht, err, context = {}) {
  logger.error({
    type: 'error',
    message: bericht,
    error: err.message,
    stack: err.stack,
    context
  });
}

module.exports = {
  logger,
  auditLog,
  logError
};
