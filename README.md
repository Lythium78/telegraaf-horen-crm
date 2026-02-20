# Telegraaf Horen - CRM Systeem

Customer Relationship Management (CRM) application voor Telegraaf Horen, speciaal ontworpen voor het beheer van contacten en bedrijfsgegevens.

## Eigenschappen

- **Contactbeheer:** Voeg, bewerk en verwijder contacten eenvoudig
- **Bedrijfsgegevens:** Koppel contacten aan bedrijven
- **Dashboard:** Snelle overzichten van contacten en statistieken
- **Responsive Design:** Werkt op desktop, tablet en mobiel
- **Nederlandse UI:** Volledig Nederlands interface
- **Huisstijl:** Telegraaf Horen merkidentiteit toegepast

## Snelstart

### Vereisten
- Node.js 14+ en npm
- Windows, macOS of Linux

### Installatie

1. **Clone of download het project**
   ```bash
   cd crm-project
   ```

2. **Installeer dependencies**
   ```bash
   npm install
   ```

3. **Start de applicatie**
   ```bash
   npm start
   ```
   of dubbelklik op `start-app.bat` (Windows)

4. **Open in browser**
   Navigeer naar `http://localhost:3001`

## Projectstructuur

```
crm-project/
├── server.js              # Express server + API routes
├── database.js            # SQLite database layer
├── crm.db                 # Database file
├── package.json           # Afhankelijkheden
├── public/
│   ├── index.html         # Dashboard
│   ├── app.js             # Frontend logica
│   └── style.css          # Styling
├── start-app.bat          # Windows launcher
└── README.md              # Deze file
```

## API Endpoints

### Health
- `GET /api/health` - Server status

### Contacten
- `GET /api/contacts` - Alle contacten ophalen
- `GET /api/contacts/:id` - Specifiek contact ophalen
- `POST /api/contacts` - Nieuw contact aanmaken
- `PUT /api/contacts/:id` - Contact bijwerken
- `DELETE /api/contacts/:id` - Contact verwijderen

## Database Schema

### contacts tabel
| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | INTEGER | Primaire sleutel |
| naam | TEXT | Naam van contact (verplicht) |
| email | TEXT | Email adres |
| telefoonnummer | TEXT | Telefoonnummer |
| bedrijf | TEXT | Bedrijfsnaam |
| type | TEXT | Type: klant, prospect, partner |
| status | TEXT | Status: nieuw, in_bewerking, actief, inactief |
| notities | TEXT | Aantekeningen |
| aangemaakt_op | DATETIME | Aanmaakdatum |
| bijgewerkt_op | DATETIME | Bijwerkdatum |

## Huisstijl Kleuren

- **Donkerblauw:** #12243E (Headers, achtergrond)
- **Beige/Goud:** #D1B18A (Titels, accenten)
- **Teal:** #3AA6B9 (Knoppen, links)

## Ontwikkeling

### Server resetten
```bash
npm start
```

### Database leegmaken
Verwijder `crm.db` en herstart de server.

## Troubleshooting

**Port 3001 is in gebruik**
- Wijzig `PORT` in `server.js` naar een ander getal (bijv. 3002)

**npm install mislukt**
- Controleer Node.js versie: `node --version`
- Verwijder `node_modules` en probeer opnieuw

**Database errors**
- Controleer bestanden: `crm.db` en `database.js`
- Reset database door `crm.db` te verwijderen

## Licentie

© 2026 Telegraaf Horen. Alle rechten voorbehouden.

## Support

Voor vragen of issues, neem contact op met het Telegraaf Horen team.
