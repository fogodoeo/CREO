$ErrorActionPreference = 'Stop'

$installRoot = Join-Path $env:LOCALAPPDATA 'CREO\CaptureAgent'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvRoot = Join-Path $installRoot '.venv'

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'creo_capture_agent.py') -Destination (Join-Path $installRoot 'creo_capture_agent.py') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'requirements.txt') -Destination (Join-Path $installRoot 'requirements.txt') -Force

$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
}
if ($null -eq $pythonCommand) {
    throw 'Python 3가 필요합니다. python.org에서 Python을 설치한 뒤 다시 실행해주세요.'
}

if ($pythonCommand.Name -eq 'py.exe') {
    & $pythonCommand.Source -3 -m venv $venvRoot
} else {
    & $pythonCommand.Source -m venv $venvRoot
}

$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
$venvPythonW = Join-Path $venvRoot 'Scripts\pythonw.exe'
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $installRoot 'requirements.txt')
& $venvPython (Join-Path $installRoot 'creo_capture_agent.py') --configure

$shell = New-Object -ComObject WScript.Shell
$startupFolder = [Environment]::GetFolderPath('Startup')
$startupLink = $shell.CreateShortcut((Join-Path $startupFolder 'CREO 캡처 에이전트.lnk'))
$startupLink.TargetPath = $venvPythonW
$startupLink.Arguments = '"' + (Join-Path $installRoot 'creo_capture_agent.py') + '"'
$startupLink.WorkingDirectory = $installRoot
$startupLink.Save()

$desktopFolder = [Environment]::GetFolderPath('Desktop')
$settingsLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO 캡처 설정.lnk'))
$settingsLink.TargetPath = $venvPythonW
$settingsLink.Arguments = '"' + (Join-Path $installRoot 'creo_capture_agent.py') + '" --configure'
$settingsLink.WorkingDirectory = $installRoot
$settingsLink.Save()

$logLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO 캡처 로그.lnk'))
$logLink.TargetPath = 'notepad.exe'
$logLink.Arguments = '"' + (Join-Path $installRoot 'capture-agent.log') + '"'
$logLink.WorkingDirectory = $installRoot
$logLink.Save()

Start-Process -FilePath $venvPythonW -ArgumentList ('"' + (Join-Path $installRoot 'creo_capture_agent.py') + '"') -WorkingDirectory $installRoot -WindowStyle Hidden
Write-Host ''
Write-Host 'CREO 캡처 에이전트 설치가 완료되었습니다.' -ForegroundColor Green
Write-Host '바탕화면의 CREO 캡처 설정에서 언제든 값을 변경할 수 있습니다.'
