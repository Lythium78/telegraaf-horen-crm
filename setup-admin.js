#!/usr/bin/env node

/**
 * setup-admin.js - Een time setup script om de eerste admin-gebruiker aan te maken
 *
 * Gebruik: node setup-admin.js
 *
 * Dit script:
 * 1. Leest de database
 * 2. Controleer of admin al bestaat
 * 3. Voegt eerste admin toe (gebruikersnaam: admin, wachtwoord: uit .env)
 */

require('dotenv').config();
const database = require('./database');
const { hashWachtwoord } = require('./auth');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function vraag(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  try {
    console.log('\n[SETUP] Telegraaf Horen CRM - Admin Setup');
    console.log('[SETUP] =====================================\n');

    // Initialiseer database
    await database.initDatabase();
    console.log('[OK] Database initialized');

    // Controleer of admin al bestaat
    const admins = database.getAllGebruikers();
    if (admins && admins.length > 0) {
      console.log('[INFO] Gebruikers gevonden in database:');
      admins.forEach(g => {
        console.log(`      - ${g.gebruikersnaam} (${g.rol}) [${g.actief ? 'actief' : 'inactief'}]`);
      });
      const antwoord = await vraag('\n[VRAAG] Wil je toch een nieuwe admin toevoegen? (ja/nee): ');
      if (antwoord.toLowerCase() !== 'ja' && antwoord.toLowerCase() !== 'j') {
        console.log('[CANCEL] Setup geannuleerd\n');
        rl.close();
        process.exit(0);
      }
    }

    // Input
    const naam = await vraag('\n[INPUT] Volledige naam: ');
    const gebruikersnaam = await vraag('[INPUT] Gebruikersnaam (lowercase, geen spaties): ');
    const wachtwoord = await vraag('[INPUT] Wachtwoord (min. 12 karacters): ');

    // Validatie
    if (!naam || !gebruikersnaam || !wachtwoord) {
      console.log('[ERROR] Alle velden zijn verplicht\n');
      rl.close();
      process.exit(1);
    }

    if (wachtwoord.length < 12) {
      console.log('[ERROR] Wachtwoord moet minstens 12 karakters zijn\n');
      rl.close();
      process.exit(1);
    }

    if (!/^[a-z0-9._-]+$/.test(gebruikersnaam)) {
      console.log('[ERROR] Gebruikersnaam mag alleen lowercase letters, numbers, . - _ bevatten\n');
      rl.close();
      process.exit(1);
    }

    // Controleer dubbele gebruikersnaam
    const bestaand = database.getGebruikerByNaam(gebruikersnaam);
    if (bestaand) {
      console.log('[ERROR] Gebruikersnaam bestaat al\n');
      rl.close();
      process.exit(1);
    }

    // Hash wachtwoord
    console.log('[BUSY] Wachtwoord hashing...');
    const hash = await hashWachtwoord(wachtwoord);

    // Voeg toe
    console.log('[BUSY] Gebruiker toevoegen...');
    database.createGebruiker(naam, gebruikersnaam, hash, 'admin');

    console.log('[OK] Admin-gebruiker aangemaakt!\n');
    console.log('[INFO] Inloggegevens:');
    console.log(`      Gebruikersnaam: ${gebruikersnaam}`);
    console.log(`      Rol: admin`);
    console.log('\n[INFO] Je kunt nu inloggen op http://localhost:3001/login\n');

    rl.close();
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    rl.close();
    process.exit(1);
  }
}

main();
