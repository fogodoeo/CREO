$ErrorActionPreference = 'Stop'
trap {
    Write-Host ('Installation failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}

$installRoot = Join-Path $env:LOCALAPPDATA 'CREO\CaptureAgent'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceExe = Join-Path $sourceRoot 'CREO-Capture-Agent.exe'
$installedExe = Join-Path $installRoot 'CREO-Capture-Agent.exe'
$configPath = Join-Path $installRoot 'config.json'
$logPath = Join-Path $installRoot 'capture-agent.log'
$diagnosticsPath = Join-Path $installRoot 'diagnostics.json'

if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
    throw 'CREO-Capture-Agent.exe was not found.'
}

Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like 'CREO*Capture*Agent*' -or
    $_.ProcessName -like 'CREO*Agent*'
} | Stop-Process -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination $installedExe -Force
if (-not (Test-Path -LiteralPath $logPath)) { New-Item -ItemType File -Path $logPath | Out-Null }

Write-Host 'Opening CREO Capture Agent settings...' -ForegroundColor Cyan
Write-Host 'Use F3 for PRISM Output Screenshot, run Diagnostics and Capture Test, then save.' -ForegroundColor Cyan
& $installedExe --configure

$configurationReady = $false
$config = $null
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $configPath | ConvertFrom-Json
}
if ($null -eq $config) {
    Write-Host 'Settings are not complete. Use the desktop Settings shortcut after installation.' -ForegroundColor Yellow
} elseif ([string]::IsNullOrWhiteSpace([string]$config.agent_token)) {
    Write-Host 'Admin password is empty. It can be entered later from Capture Settings.' -ForegroundColor Yellow
} elseif (-not (Test-Path -LiteralPath ([string]$config.screenshot_directory) -PathType Container)) {
    Write-Host 'PRISM screenshot folder was not found. Select it later from Capture Settings.' -ForegroundColor Yellow
} else {
    $configurationReady = $true
}
if (($null -ne $config) -and ([string]$config.hotkey -ne 'f3')) {
    Write-Host ('Warning: configured hotkey is ' + [string]$config.hotkey + ', not F3.') -ForegroundColor Yellow
}

$shell = New-Object -ComObject WScript.Shell
$startupFolder = [Environment]::GetFolderPath('Startup')
$desktopFolder = [Environment]::GetFolderPath('Desktop')

$startupLink = $shell.CreateShortcut((Join-Path $startupFolder 'CREO Capture Agent.lnk'))
$startupLink.TargetPath = $installedExe
$startupLink.WorkingDirectory = $installRoot
$startupLink.Save()

$settingsLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO Capture Settings.lnk'))
$settingsLink.TargetPath = $installedExe
$settingsLink.Arguments = '--configure'
$settingsLink.WorkingDirectory = $installRoot
$settingsLink.Save()

$startLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO Capture Agent Start.lnk'))
$startLink.TargetPath = $installedExe
$startLink.WorkingDirectory = $installRoot
$startLink.Save()

$diagnosticsLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO Capture Diagnostics.lnk'))
$diagnosticsLink.TargetPath = $installedExe
$diagnosticsLink.Arguments = '--diagnose'
$diagnosticsLink.WorkingDirectory = $installRoot
$diagnosticsLink.Save()

$logLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO Capture Log.lnk'))
$logLink.TargetPath = 'notepad.exe'
$logLink.Arguments = '"' + $logPath + '"'
$logLink.WorkingDirectory = $installRoot
$logLink.Save()

$diagnosticsFileLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO Capture Status.lnk'))
$diagnosticsFileLink.TargetPath = 'notepad.exe'
$diagnosticsFileLink.Arguments = '"' + $diagnosticsPath + '"'
$diagnosticsFileLink.WorkingDirectory = $installRoot
$diagnosticsFileLink.Save()

$folderLink = $shell.CreateShortcut((Join-Path $desktopFolder 'CREO Capture Folder.lnk'))
$folderLink.TargetPath = 'explorer.exe'
$folderLink.Arguments = '"' + $installRoot + '"'
$folderLink.WorkingDirectory = $installRoot
$folderLink.Save()

if ($configurationReady) {
    Start-Process -FilePath $installedExe -WorkingDirectory $installRoot -WindowStyle Hidden
} else {
    Write-Host 'Agent was installed but not started because setup is incomplete.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'CREO Capture Agent v1.2.3 installed successfully. Python is not required.' -ForegroundColor Green
Write-Host 'Debug log and diagnostic status shortcuts were created on the desktop.' -ForegroundColor Green
