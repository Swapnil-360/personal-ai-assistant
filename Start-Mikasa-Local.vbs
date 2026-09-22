Set WshShell = CreateObject("WScript.Shell")
WScript.Sleep 5000
WshShell.Run "cmd /c ""d:\Projects\personal-ai-assistant\start_local.bat""", 0, False
Set WshShell = Nothing
