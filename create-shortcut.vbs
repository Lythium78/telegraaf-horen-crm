' Create CRM Shortcut on Desktop
' Telegraaf Horen CRM

Set objShell = CreateObject("WScript.Shell")
strDesktop = objShell.SpecialFolders("Desktop")

' Get the current directory where this script is located
strScriptPath = objShell.CurrentDirectory
strCRMPath = strScriptPath

' Create shortcut
Set objLink = objShell.CreateShortCut(strDesktop & "\Telegraaf Horen CRM.lnk")
objLink.TargetPath = strCRMPath & "\start-app.bat"
objLink.WorkingDirectory = strCRMPath
objLink.Description = "Telegraaf Horen - CRM Systeem (poort 3001)"
objLink.IconLocation = strCRMPath & "\public\logo.svg"
objLink.WindowStyle = 7 ' Minimized window
objLink.Save

' Show confirmation
WScript.Echo "Shortcut created on Desktop!" & vbCrLf & vbCrLf & "Name: Telegraaf Horen CRM.lnk" & vbCrLf & "Target: " & strCRMPath & "\start-app.bat" & vbCrLf & "Window: Minimized"
