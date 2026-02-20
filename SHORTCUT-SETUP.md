# CRM Desktop Shortcut Setup

## Snelste manier: Run setup-shortcut.bat

1. Dubbelklik op `setup-shortcut.bat` in de crm-project map
2. Het shortcut wordt automatisch op je bureaublad aangemaakt
3. Klaar! Je hebt nu "Telegraaf Horen CRM.lnk" op je bureaublad

## Wat doet het shortcut?

- **Naam:** Telegraaf Horen CRM.lnk
- **Doelstelling:** C:\Users\MieldoTelegraafHoren\Documents\websites\crm-project\start-app.bat
- **Werkmap:** C:\Users\MieldoTelegraafHoren\Documents\websites\crm-project\
- **Venster:** Geminimaliseerd (terminal verborgen)
- **Poort:** 3001

## Hoe het shortcut werkt

1. Dubbelklik op het shortcut
2. De terminal start GEMINIMALISEERD (niet zichtbaar)
3. Server start automatisch op poort 3001
4. Browser opent automatisch naar http://localhost:3001
5. Druk op Ctrl+C om de server te stoppen (in de terminal)

## Logo

Het CRM heeft nu een uniek logo met alleen het oor, zodat het duidelijk anders is dan de Intake Tracker.

- **Bestand:** `public/logo.svg`
- **Kleuren:** Telegraaf Horen huisstijl (Donkerblauw, Beige, Teal)
- **Grootte:** Schaalbaat SVG

## Handmatig shortcut aanmaken (als setup-shortcut.bat niet werkt)

```powershell
$crmPath = 'C:\Users\MieldoTelegraafHoren\Documents\websites\crm-project'
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Telegraaf Horen CRM.lnk'

$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $crmPath 'start-app.bat'
$shortcut.WorkingDirectory = $crmPath
$shortcut.Description = 'Telegraaf Horen - CRM Systeem (poort 3001)'
$shortcut.WindowStyle = 7  # 7 = Minimized
$shortcut.Save()
```

Voer dit uit in PowerShell (als Administrator).

## Troubleshooting

**Shortcut niet op bureaublad?**
- Controleer: `C:\Users\MieldoTelegraafHoren\OneDrive\Bureaublad\` (OneDrive Desktop)
- Of: `C:\Users\MieldoTelegraafHoren\Desktop\` (Lokale Desktop)

**Terminal verschijnt niet geminimaliseerd?**
- Dit is normaal — de terminal start wel, maar wordt direct geminimaliseerd
- Controleer: http://localhost:3001 in je browser
- Logfiles zie je in de terminal (als je deze opent)

**Server start niet?**
- Controleer: `npm install` is eerst uitgevoerd?
- Controleer: poort 3001 is vrij (geen ander programma gebruikt het)
- Controleer: Node.js is geïnstalleerd (`node --version`)
