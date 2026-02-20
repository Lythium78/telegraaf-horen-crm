# 🚀 Deployment Checklist — CRM naar Railway

Volg deze stappen in volgorde. Check af als je klaar bent.

---

## ✅ Voorbereiding (Lokaal)

- [ ] **Git repository aanmaken** op GitHub
  - Ga naar: https://github.com/new
  - Naam: `telegraaf-horen-crm`
  - Maak aan en kopieer HTTPS URL

- [ ] **Lokale git setup**
  ```bash
  cd C:\Users\MieldoTelegraafHoren\Documents\websites\crm-project
  git init
  git add .
  git status  # Controleer: GEEN .env files!
  ```

- [ ] **.env file checken** (MOET IN .gitignore staan)
  ```bash
  # Dit bestand mag NIET naar git!
  # Controleer .gitignore bevat: .env
  ```

- [ ] **Eerste commit**
  ```bash
  git commit -m "CRM: Phase 1 Security Implementation"
  git remote add origin https://github.com/JOUW_USERNAME/telegraaf-horen-crm.git
  git branch -M main
  git push -u origin main
  ```

- [ ] **Repository zichtbaar op GitHub**
  - Ga naar https://github.com/JOUW_USERNAME/telegraaf-horen-crm
  - Controleer bestanden staan erin (server.js, auth.js, etc.)
  - Controleer .env NIET zichtbaar is

---

## 🚀 Railway Setup

- [ ] **Railway account aanmaken**
  - Ga naar: https://railway.app
  - Sign up via GitHub
  - Email bevestigen

- [ ] **Nieuw project creëren**
  - Dashboard → New Project
  - Deploy from GitHub
  - Selecteer: `telegraaf-horen-crm`
  - Wacht op deployment (2-3 minuten)
  - Check logs: geen errors?

- [ ] **Omgevingsvariabelen instellen**
  - Project → Variables (of Settings)
  - Voeg toe:
    ```
    NODE_ENV=production
    SESSION_SECRET=d11b75e1864e61b7ee5f858677ba1cdd20dd59169597149b92163f8001e59694c21cd626423097588ed7b596efc8388a90791a15f87a8e610ac1c6b8446f459b
    TOEGESTAAN_ORIGIN=https://[JOUW-RAILWAY-URL]
    DB_PATH=/data/crm.db
    LOG_DIR=/data/logs
    ```
  - Vraag: Wat is jouw Railway URL?

- [ ] **Persistent volume toevoegen**
  - Project → Settings → Volumes
  - Add Volume
  - Mount path: `/data`
  - Save

- [ ] **Deploy trigger**
  - Project → Deployments
  - Klik Deploy (om vars toe te passen)
  - Wacht tot "Success"

---

## 🔐 Admin Setup

- [ ] **Railway CLI installeren** (optioneel)
  ```bash
  npm install -g @railway/cli
  ```

- [ ] **Login op Railway via CLI** (optioneel)
  ```bash
  railway login
  railway link  # Selecteer je project
  ```

- [ ] **Eerste admin aanmaken**
  ```bash
  # Via Railway:
  railway run npm run create:admin -- "Jouw Naam" "jouwgebruiker" "SterkWachtwoord123!"

  # Of lokaal (dan later syncen)
  node create-admin.js "Jouw Naam" "jouwgebruiker" "SterkWachtwoord123!"
  ```

- [ ] **Controleer admin aangemaakt**
  ```bash
  railway run npm run create:admin  # Zou je gebruiker moeten tonen
  ```

---

## 🧪 Testing

- [ ] **Controleer app draait**
  - Ga naar: https://[JOUW-RAILWAY-URL]/login
  - Zou login pagina moeten tonen

- [ ] **Test inloggen**
  - Gebruikersnaam: jouwgebruiker
  - Wachtwoord: SterkWachtwoord123!
  - Klik Inloggen
  - Zou dashboard moeten tonen

- [ ] **Test contact aanmaken**
  - Maak test contact aan
  - Check dat het verschijnt in contacten-list
  - Controleer bijgewerkt_op timestamp klopt

- [ ] **Test audit logging**
  - Controleer logs: `/data/logs/audit.log` bevat events
  ```bash
  railway run tail /data/logs/audit.log
  ```

- [ ] **Test rollen**
  - Maak medewerker account aan
  - Login als medewerker
  - Check: CAN toevoegen/wijzigen, CANNOT verwijderen

---

## 📋 Handover naar Collega's

- [ ] **Verzamel collega info**
  - Voornaam + Voornaam (voor gebruikersaccount)
  - Of laat hen zelf kiezen gebruikersnaam

- [ ] **Maak accounts aan**
  ```bash
  railway run npm run create:admin -- "Collega1 Naam" "collega1.naam" "TijdelijkWachtwoord123!"
  railway run npm run create:admin -- "Collega2 Naam" "collega2.naam" "TijdelijkWachtwoord123!"
  ```

- [ ] **Stuur collega's login info**
  - URL: https://[JOUW-RAILWAY-URL]/login
  - Gebruikersnaam: [hun gebruikersnaam]
  - Tijdelijk wachtwoord: [gegenereerd]
  - Instructie: "Verander wachtwoord na eerste login"

- [ ] **Test collega login**
  - Collega's proberen in te loggen
  - Kunnen ze contacts zien/toevoegen?
  - Werkt audit logging (zie in logs wie wat deed)?

---

## 🔐 Beveiligingscheck

- [ ] **HTTPS werkt**
  - URL begint met `https://`
  - Geen warnings over certificaat

- [ ] **CORS beperkt**
  - Alleen Railway URL mag API aanroepen
  - Test: externe site kan NIET API aanroepen

- [ ] **Rate limiting werkt**
  - Probeer 6x wrong wachtwoord
  - 6e poging zou moeten blocking met "Te veel inlogpogingen"

- [ ] **Audit logs schrijven**
  - Controleer `/data/logs/audit.log` bestaat
  - Bevat inlog/contact events, GEEN persoonsgegevens

- [ ] **Sessies verlopen**
  - Login
  - Sluit browser/cache
  - Probeer 9 uur later in te loggen
  - Zou uitgelogd moeten zijn (session expired)

---

## 📊 Monitoring Setup (optioneel)

- [ ] **UptimeRobot instellen** (voor health checks)
  - Ga naar: https://uptimerobot.com
  - New Monitor → HTTPS
  - URL: https://[JOUW-RAILWAY-URL]/api/health
  - Check interval: 5 minuten
  - Save

- [ ] **Railway Alerts instellen**
  - Project → Settings → Alerts
  - Add Alert voor crashes
  - Notify via email

---

## 🎉 Klaar!

Alles groen? Gefeliciteerd! 🚀

**Je CRM is nu:**
- ✅ Beveiligd (HTTPS, inlogsysteem, audit logs)
- ✅ Bereikbaar 24/7 (Cloud op €5/maand)
- ✅ Multi-user klaar (collega's kunnen overal inloggen)
- ✅ AVG-compliant (EU-datacenter, wachtwoorden gehasht)

---

## 📞 Support

Problemen? Check:
1. Railway logs: `railway logs -f`
2. RAILWAY-SETUP.md → Troubleshooting
3. Controleer omgevingsvariabelen gezet

---

## 🔄 Volgende Stap

Na deployment:
- [ ] Features toevoegen (search, dashboard, bulk import)
- [ ] Intake Tracker ook naar Railway (later)
- [ ] Integratie tussen apps (klantdata delen)
