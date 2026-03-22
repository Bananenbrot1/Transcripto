' Transcripto Launcher
' This script launches the app without showing a console window

Dim objShell, objFSO, projectPath, appDataPath, pnpmCmd

Set objShell = WScript.CreateObject("WScript.Shell")
Set objFSO = WScript.CreateObject("Scripting.FileSystemObject")

' Get project path (directory where this script is)
projectPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Get pnpm location from AppData
appDataPath = objShell.ExpandEnvironmentStrings("%APPDATA%")
pnpmCmd = appDataPath & "\npm\pnpm.cmd"

' Check if pnpm exists
If Not objFSO.FileExists(pnpmCmd) Then
    MsgBox "Error: pnpm not found at " & pnpmCmd & vbCrLf & vbCrLf & _
            "Please install Node.js and pnpm first.", vbExclamation, "Transcripto - Error"
    WScript.Quit 1
End If

' Run the start command in the project directory (hidden window)
On Error Resume Next
objShell.CurrentDirectory = projectPath
objShell.Run """" & pnpmCmd & """ start", 0, False
If Err.Number <> 0 Then
    MsgBox "Error launching Transcripto: " & Err.Description, vbExclamation, "Transcripto - Error"
    WScript.Quit 1
End If
On Error GoTo 0

' Optional: Show a notification that the app is starting
' Uncomment the line below if you want a popup notification
' objShell.Popup "Transcripto is starting...", 3, "Transcripto", vbInformation

WScript.Quit 0
