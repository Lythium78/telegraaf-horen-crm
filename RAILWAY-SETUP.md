# Railway Deployment Setup — Telegraaf Horen CRM

**Doel:** Beveiligd CRM systeem live zetten op Railway.app (€5/maand)

---

## 📋 Stap 1: Voorbereiding (lokaal)

### 1a. GitHub Repository aanmaken

1. Ga naar https://github.com/new
2. Repository name: `telegraaf-horen-crm`
3. Description: `Customer Relationship Management system for Telegraaf Horen`
4. Public (voor Railway integration)
5. Maak aan

### 1b. Lokaal git initialiseren

```bash
cd C:\Users\MieldoTelegraafHoren\Documents\websites\crm-project

# Initialiseer git
git init

# Voeg alle bestanden toe (BEHALVE .env en databases)
git add .

# Controleer wat wordt gecommit (GEEN .env!)
git status

# Eerste commit
git commit -m "CRM: Phase 1 Security Implementation

- Inlogsysteem met sessions + bcryptjs
- Rol-based access control (admin/medewerker/viewer)
- Audit logging voor compliance
- Security headers (Helmet)
- Rate limiting + CORS
- Database: gebruikers + audit_log tabellen
- Ready for Railway deployment"

# Koppel GitHub repository
git remote add origin https://github.com/JOUW_USERNAME/telegraaf-horen-crm.git
git branch -M main
git push -u origin main
```

---

## 🚀 Stap 2: Railway Setup

### 2a. Account aanmaken

1. Ga naar https://railway.app
2. Sign up → GitHub gebruiken
3. Authoriseer Railway
4. Email bevestigen

### 2b. Project creëren

1. Dashboard → **New Project**
2. **Deploy from GitHub**
3. Selecteer je repository: `telegraaf-horen-crm`
4. **Deploy Now**

**Railway gaat nu:**
- Code clonen
- `npm install` runnen
- `npm start` starten
- App live zetten (duurt 2-3 minuten)

### 2c. Omgevingsvariabelen instellen

Nadat je project is gedeployd:

1. Ga naar je project → **Variables**
2. Voeg deze toe:

```
NODE_ENV=production
PORT=3000 (Railway wijst dit toe automatisch)
SESSION_SECRET=d11b75e1864e61b7ee5f858677ba1cdd20dd59169597149b92163f8001e59694c21cd626423097588ed7b596efc8388a90791a15f87a8e610ac1c6b8446f459b
TOEGESTAAN_ORIGIN=https://jouw-app-naam.railway.app
DB_PATH=/data/crm.db
LOG_DIR=/data/logs
```

**Let op:** Railway geeft je een URL. Die ziet er uit als:
```
https://telegraaf-horen-crm-production.up.railway.app
```

Vervang `TOEGESTAAN_ORIGIN` met jouw echte Railway URL.

### 2d. Persistent Volume toevoegen (voor database & logs)

1. **Settings** → **Volumes**
2. **Add Volume**
3. Mount path: `/data`
4. Naam: `crm-data`

Dit zorgt dat je database & logs niet verdwijnen bij redeploys.

---

## 🔐 Stap 3: Eerste Admin aanmaken op Railway

Na deploy moet je eerste admin aanmaken:

### Via Railway Console (makkelijkst):

1. Ga naar je project → **Deployments** → Laatst deployment
2. **View Logs** → zie dat app draait
3. **Railway CLI** (als geïnstalleerd):

```bash
railway login
railway link                          # Link je project
railway run npm run create:admin -- "Jouw Naam" "jouwgebruiker" "WachtwoordHier123!"
```

### Via lokaal script (alternatief):

Als railway CLI niet werkt, kan je lokaal aanmaken en dan syncen:

```bash
# Lokaal
node create-admin.js "Jouw Naam" "jouwgebruiker" "WachtwoordHier123!"

# Dan push je de geüpdatete database naar Railway
# (dit gaat automatisch via /data volume)
```

---

## 🧪 Stap 4: Testen

### Test 1: Login page bereikbaar
```
https://jouw-app.railway.app/login
```

Zou een Telegraaf Horen login pagina moeten tonen.

### Test 2: Inloggen
- Gebruikersnaam: jouwgebruiker
- Wachtwoord: WachtwoordHier123!
- Klikt "Inloggen"
- Zou dashboard moeten zien (met contacten)

### Test 3: Contact toevoegen
- Klik "Nieuw Contact"
- Vul naam/email in
- Sla op
- Controleer audit log (logs/audit.log)

### Test 4: Audit logging
```bash
# Via Railway logs zien
railway logs -f

# Of lokaal (via volume):
cat /data/logs/audit.log
```

---

## 🔗 Stap 5: Collega's uitnodigen

Zodra live:

1. **Geef je medewerkers de URL:**
   ```
   https://jouw-app.railway.app/login
   ```

2. **Maak hun accounts aan** (als admin):
   ```bash
   railway run npm run create:admin -- "Collega Naam" "collega.voornaam" "TijdelijkWachtwoord123!"
   ```

3. **Ze inloggen en wijzigen hun wachtwoord** (zelf)

---

## 📊 Monitoring & Logs

### Logs bekijken
```bash
# Via Railway CLI (realtime)
railway logs -f

# Via Railway dashboard
Project → Deployments → View Logs
```

### Audit trail checken
```bash
# Op Railway volume
/data/logs/audit.log
```

---

## ⚠️ Troubleshooting

### App startt niet
- Controleer omgevingsvariabelen (PROJECT_ID, SESSION_SECRET)
- Check `railway logs` voor fouten
- Controleer dat git push succesvol was

### 502 Bad Gateway
- App crashed → `railway logs` checken
- Wacht 30 sec en refresh
- Controleer database volume gekoppeld is

### Login werkt niet
- Controleer admin-user aangemaakt: `railway run npm run create:admin`
- Controleer SESSION_SECRET ingesteld
- Check audit log: `/data/logs/audit.log`

### Database leeg
- Volume niet gekoppeld → Voeg toe via Settings > Volumes
- Database corrupt → Restore backup (zie BACKUP-GUIDE.md)

---

## 💾 Backups op Railway

SQLite databases op Railway verlies je niet (volume persists), maar je wilt backups:

```bash
# Lokaal backup van Railway database
railway run cp /data/crm.db ./backup_$(date +%Y-%m-%d).db

# Dan synchroniseer naar OneDrive (via je local machine)
```

Of automatisch via een cron job (later optie).

---

## 🎉 Klaar!

Je CRM is nu:
- ✅ Live en bereikbaar 24/7
- ✅ Beveiligd (HTTPS, inlogsysteem, audit logs)
- ✅ AVG-compliant (EU-datacenter, gevoelige data beschermd)
- ✅ Schaalbaar (collega's kunnen overal inloggen)
- ✅ Budget-friendly (€5/maand)

**Volgende stap:** Features toevoegen (zoeken, dashboard, etc.)
