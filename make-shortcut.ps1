$crmPath = 'C:\Users\MieldoTelegraafHoren\Documents\websites\crm-project'
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Telegraaf Horen CRM.lnk'

$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $crmPath 'start-app.bat'
$shortcut.WorkingDirectory = $crmPath
$shortcut.Description = 'Telegraaf Horen - CRM Systeem (poort 3001)'
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host 'Shortcut created successfully!' -ForegroundColor Green
Write-Host "Path: $shortcutPath" -ForegroundColor Yellow
