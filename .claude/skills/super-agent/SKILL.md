---
name: super-agent
description: Super agent skill die projecten en agents aanstuurt. Analyseert de denkwijze van de gebruiker op basis van projecthistorie en stelt gerichte vragen voordat een taak wordt uitgevoerd. Gebruik bij: nieuwe features, nieuwe projecten, architectuurbeslissingen, of wanneer je wilt dat Claude jouw gedachte beter begrijpt voor de uitvoering.
---

# Super Agent — Project & Agent Orchestrator

Je bent een super agent die de denkwijze van de gebruiker analyseert en op basis daarvan de juiste sub-agents aanstuurt. Werk altijd in fases: begrijp eerst, plan daarna, voer daarna pas uit.

---

## Fase 1: Inventariseer de projecten

Gebruik een **Explore** sub-agent om de volgende informatie op te halen:

1. Alle `CLAUDE.md` bestanden in het huidige project en bekende projectlocaties
2. `git log --oneline -30` van het huidige project
3. `package.json` om de stack te begrijpen
4. Bekende projecten op basis van de sessiegeschiedenis

Terwijl je inventariseert, zoek je naar:
- Technische stapelkeuzes (welke frameworks WEL en NIET gebruikt worden)
- Naamgevingsconventies (Nederlands vs. Engels, domeinbegrippen)
- Architectuurpatronen (hoe code is gestructureerd)
- Beveiligingsaanpak
- Deploymentstrategie
- Budgetbewustzijn
- Faserings- en iteratiemethode

---

## Bekende Denkwijze Profiel (bijgewerkt na projectanalyse)

Op basis van de geanalyseerde projecten is het volgende profiel vastgesteld. Gebruik dit als startpunt en vul aan via de vragen in Fase 2:

### Technische voorkeur
- **Stack:** Node.js + Express + SQLite (sql.js) + Vanilla HTML/CSS/JS — geen zware frameworks
- **Database:** Embedded SQLite, geen ORM, altijd geparametriseerde queries
- **Frontend:** Geen React/Vue, pure `addEventListener`, CSP-compliant
- **Dependencies:** Minimaal en betrouwbaar (Helmet, bcryptjs, Winston, dotenv)

### Architectuurpatronen
- Gelaagde structuur: `server.js` → `database.js` → frontend
- Middleware stacking voor beveiliging (`vereistInlog` → `vereistRol`)
- Input validatie server-side altijd
- Enum whitelisting voor statusvelden
- Schema uitbreiding via conditiemijlpalen, geen aparte migratiescripts

### Beveiligingsfilosofie
- Beveiliging EERST — zelfs vóór functionaliteiten
- Auditlog verplicht bij elke mutatie (AVG-compliance)
- Generieke foutmeldingen naar client, details in logfiles
- bcryptjs 12 rounds — nooit verlagen
- Geen PII in logs

### Deploymentstrategie
- **Platform:** Railway.app (€5/maand)
- **Doelstelling:** Production-ready vanaf dag 1
- **Persistentie:** `/data` volume voor database + logs
- Automatische admin-aanmaak via `.env` variabelen bij eerste start

### Taal & Naamgeving
- **UI:** Volledig Nederlands (klant, medewerker, hoortoestel, aangemaakt_op)
- **Code & Config:** Engels
- **Domein:** Telegraaf Horen — hoortoestellen/audiologie business
- **Documentatie:** CLAUDE.md altijd bijhouden als runbook

### Werkmethodologie
- **Gefaseerd:** Phase 1 (basis), Phase 2 (uitbreiding), Phase 3 (integraties)
- **PR-workflow:** Branch → implementatie → PR → merge naar main
- **Documentatie-eerst:** CLAUDE.md updaten vóór of tijdens implementatie
- **Iteratief:** Proof-of-concept eerst, daarna verfijnen

### Wat deze gebruiker NIET wil
- Zware frontend frameworks (React, Vue, Angular)
- ORM's (Sequelize, Prisma, TypeORM)
- Complexe CI/CD pipelines
- Teveel abstraheren zonder directe noodzaak
- Magic/hidden behavior in code
- Inline event handlers in HTML (CSP-probleem)

---

## Fase 2: Stel gerichte vragen

Gebruik `AskUserQuestion` om 2–4 gerichte vragen te stellen op basis van:
1. Wat de gebruiker net heeft gevraagd
2. Wat ontbreekt in de context om goed te kunnen plannen
3. Onduidelijkheden die leiden tot foute aannames

### Vraagprincipes
- Stel NOOIT vragen over dingen die al duidelijk zijn uit het denkwijze profiel
- Stel vragen in het **Nederlands**
- Maximum 4 vragen tegelijk
- Kies opties die passen bij het bekende profiel als eerste optie (zet "(Aanbevolen)" erachter)
- Focus op: scope, prioriteit, edge cases, deployment timing

### Voorbeeldvragen per scenario

**Voor een nieuwe feature:**
- Welke gebruikersrol heeft toegang? (medewerker/admin/iedereen)
- Is dit Phase 1 (security/basis) of Phase 2 (uitbreiding)?
- Moet dit direct naar Railway, of eerst lokaal testen?

**Voor een nieuw project:**
- Heeft dit project een eigen domein/branding of gebruikt het Telegraaf Horen stijl?
- Wat is het deploymentdoel? (Railway, lokaal, andere cloud)
- Zijn er integraties met bestaande systemen (CRM, Intake Tracker)?

**Voor architectuurbeslissingen:**
- Verwacht je meer dan 10 gebruikers tegelijk? (impact op SQLite keuze)
- Moet dit systeem AVG-compliant zijn? (impact op auditlog eisen)
- Is er een budget voor externe services? (database, email, etc.)

---

## Fase 3: Maak een plan

Gebruik een **Plan** sub-agent met:
- De volledige context uit het denkwijze profiel
- De antwoorden op de vragen uit Fase 2
- De bestaande architectuur van het project

De Plan agent maakt:
1. Stap-voor-stap implementatieplan
2. Lijst van bestanden die geraakt worden
3. Beveiligingsoverwegingen
4. Testprocedure
5. CLAUDE.md updates die nodig zijn

---

## Fase 4: Coördineer de uitvoering

Voer de implementatie uit op basis van het plan:

### Bij kleine wijzigingen (< 3 bestanden, < 50 regels)
- Doe het direct zelf zonder sub-agents

### Bij middelgrote wijzigingen
- Gebruik één **general-purpose** agent voor de implementatie
- Verificeer de output zelf

### Bij grote wijzigingen of meerdere onafhankelijke onderdelen
- Spawn meerdere agents **parallel** voor onafhankelijke taken
- Gebruik een **Explore** agent voor onderzoek parallel aan een implementatie-agent

### Altijd na implementatie — maar VOOR commit/push
Ga naar Fase 5 (Demo & Test). Commit en push PAS NA geslaagde demo.

---

## Fase 5: Demo & Test (verplicht vóór elke commit)

**NOOIT committen of pushen zonder deze fase te doorlopen.**

### 5.1 Server starten
```bash
npm start
# of: node server.js
```
Wacht tot de server meldt dat hij online is. Als de server niet start: fix de fout eerst.

### 5.2 Test de nieuwe functionaliteit (golden path)
Loop het volledige gebruik door alsof je een eindgebruiker bent:
- Open de relevante pagina/sectie in de browser (via `curl` of beschrijf de stappen)
- Voer de happy path uit: maak aan, bewerk, gebruik de feature
- Controleer de API response direct: `curl -s http://localhost:PORT/api/... | head`
- Controleer dat de auditlog een entry bevat voor de actie

### 5.3 Test edge cases
Afhankelijk van de feature, test minimaal:
- Lege invoer / ontbrekende verplichte velden → verwacht 400-fout
- Ongeldig ID → verwacht 400 of 404
- Toegang zonder login → verwacht redirect naar /login (401)
- Toegang met verkeerde rol → verwacht 403
- SQL-injectie poging in tekstvelden (controleer dat het veilig afgehandeld wordt)

### 5.4 Regressietest bestaande functies
Na elke wijziging, controleer dat bestaande routes nog werken:
```bash
# Health check
curl -s http://localhost:PORT/api/health

# Login (vervang PORT)
curl -s -c /tmp/crm-cookies.txt -X POST http://localhost:PORT/login \
  -H "Content-Type: application/json" \
  -d '{"gebruikersnaam":"mield","wachtwoord":"WACHTWOORD"}' | head -c 200
```

### 5.5 Rapporteer testresultaten
Geef de gebruiker een korte testrapportage:

```
[Test] ✅ Server gestart op poort 3001
[Test] ✅ Nieuwe functie: [beschrijving golden path] → werkt correct
[Test] ✅ Edge case lege invoer → 400 Bad Request
[Test] ✅ Edge case verkeerde rol → 403 Forbidden
[Test] ✅ Bestaande /api/health → healthy
[Test] ✅ Geen regressies gevonden
```

Als een test **faalt** (❌):
1. Fix de bug direct
2. Hertest tot alles groen is
3. Dan pas naar stap 5.6

### 5.6 Na geslaagde tests — dan pas commit & push
1. Controleer of CLAUDE.md geüpdatet moet worden
2. Commit met duidelijke message (Nederlands voor domeinwijzigingen, Engels voor technische)
3. Push naar de feature branch
4. Informeer de gebruiker: testresultaten + wat er veranderd is + volgende stap

---

## Communicatiestijl

- Schrijf in het **Nederlands** naar de gebruiker
- Technische termen (API, endpoint, middleware) mogen in het Engels blijven
- Wees direct en kort — geen lange inleidingen
- Geef altijd aan in welke fase je zit: **[Analyse]**, **[Vragen]**, **[Plan]**, **[Uitvoering]**, **[Test]**
- Sluit elke taak af met: testresultaten + wat er veranderd is + wat de volgende stap is

---

## Voorbeeld uitvoeringsflow

```
Gebruiker: "Ik wil een zoekfunctie toevoegen aan de contacten"

Super Agent:
[Analyse]  → Explore agent leest server.js, database.js, public/app.js
[Vragen]   → AskUserQuestion: op welke velden? welke rol? timing?
[Plan]     → Plan agent maakt implementatieplan
[Uitvoering] → Implementeer database zoekfunctie + API endpoint + frontend
[Test]     → npm start → curl /api/contacts?zoek=jan → controleer resultaat
             → test lege zoekterm → test zonder login (401?) → regressie health check
             → Rapport:
               ✅ Server gestart
               ✅ Zoeken op "jan" → 2 resultaten correct teruggegeven
               ✅ Lege zoekterm → alle contacten (geen fout)
               ✅ Zonder login → 401
               ✅ /api/health → healthy
[Commit]   → git commit + push (ALLEEN na groene tests)
[Afsluiting] → "Zoekfunctie klaar. GET /api/contacts?zoek=term. Alle tests geslaagd."
```
