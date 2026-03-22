' Create Desktop Shortcut for Transcripto
' This script creates a shortcut on your desktop to launch Transcripto

Dim objShell, objFSO, strDesktop, strStartMenu, objLink, scriptPath

Set objShell = WScript.CreateObject("WScript.Shell")
Set objFSO = WScript.CreateObject("Scripting.FileSystemObject")

' Get desktop folder path
strDesktop = objShell.SpecialFolders("Desktop")

' Get the path to the VBS launcher script
scriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName) & "\start-transcripto.vbs"

' Check if the launcher script exists
If Not objFSO.FileExists(scriptPath) Then
    MsgBox "Error: Cannot find start-transcripto.vbs" & vbCrLf & vbCrLf & _
            "Please run this from the Transcripto project directory.", vbExclamation, "Error"
    WScript.Quit 1
End If

' Create shortcut on desktop
Set objLink = objShell.CreateShortCut(strDesktop & "\Transcripto.lnk")
objLink.TargetPath = "wscript.exe"
objLink.Arguments = """" & scriptPath & """"
objLink.WorkingDirectory = objFSO.GetParentFolderName(scriptPath)
objLink.IconLocation = "C:\Windows\System32\wscript.ico"
objLink.Description = "Launch Transcripto - Speech-to-Text Transcription"
objLink.Save

MsgBox "Desktop shortcut created successfully!" & vbCrLf & vbCrLf & _
        "You can now double-click 'Transcripto.lnk' on your desktop to launch the app.", _
        vbInformation, "Success"

WScript.Quit 0
