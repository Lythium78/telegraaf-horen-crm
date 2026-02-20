#!/usr/bin/env node

/**
 * create-admin.js - Snel admin-account aanmaken
 *
 * Gebruik: node create-admin.js <naam> <gebruikersnaam> <wachtwoord>
 *
 * Voorbeeld:
 *   node create-admin.js "Mield" "mield" "WachtwoordHier123!"
 */

require('dotenv').config();
const database = require('./database');
const { hashWachtwoord } = require('./auth');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Gebruik: node create-admin.js <naam> <gebruikersnaam> <wachtwoord>\n');
    console.log('Voorbeeld:');
    console.log('  node create-admin.js "Mield" "mield" "WachtwoordHier123!"\n');
    process.exit(1);
  }

  const [naam, gebruikersnaam, wachtwoord] = args;

  try {
    console.log('[INIT] Database initialiseren...');
    await database.initDatabase();
    console.log('[OK] Database initialized\n');

    // Validatie
    if (wachtwoord.length < 8) {
      console.log('[ERROR] Wachtwoord moet minstens 8 karakters zijn');
      process.exit(1);
    }

    const bestaand = database.getGebruikerByNaam(gebruikersnaam);
    if (bestaand) {
      console.log(`[ERROR] Gebruikersnaam '${gebruikersnaam}' bestaat al`);
      process.exit(1);
    }

    // Hash wachtwoord
    console.log('[BUSY] Wachtwoord hashing (dit duurt een moment)...');
    const hash = await hashWachtwoord(wachtwoord);

    // Voeg toe
    console.log('[BUSY] Admin-gebruiker toevoegen...');
    database.createGebruiker(naam, gebruikersnaam, hash, 'admin');

    console.log('[OK] Admin-gebruiker succesvol aangemaakt!\n');
    console.log('[INFO] Inloggegevens:');
    console.log(`      Naam: ${naam}`);
    console.log(`      Gebruikersnaam: ${gebruikersnaam}`);
    console.log(`      Rol: admin`);
    console.log('\n[INFO] Je kunt nu inloggen op http://localhost:3001/login\n');

    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
}

main();
