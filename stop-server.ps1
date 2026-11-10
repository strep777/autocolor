param([switch]$Elevated)

$ErrorActionPreference = 'SilentlyContinue'
$ports = 8011..8020

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if ($ar.AsyncWaitHandle.WaitOne(250)) {
            $client.EndConnect($ar)
            return $true
        }
    } catch { }
    finally { $client.Close() }
    return $false
}

function Get-AppPorts {
    return @($ports | Where-Object { Test-Port $_ })
}

function Get-ProjectProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and (
            ($_.CommandLine -like '*uvicorn*app.main:app*' -and $_.CommandLine -like '*--app-dir*backend*') -or
            ($_.CommandLine -like '*serve.bat*' -and $_.CommandLine -like '*autoselectcolor*')
        )
    }
}

function Stop-ProjectProcesses {
    $targets = @(Get-ProjectProcesses)
    foreach ($proc in $targets) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($targets.Count -gt 0) { Start-Sleep -Milliseconds 900 }
}

function Wait-NoApp([int]$Seconds = 6) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (@(Get-AppPorts).Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 350
    }
    return (@(Get-AppPorts).Count -eq 0)
}

Stop-ProjectProcesses
if (Wait-NoApp) {
    exit 0
}

if (-not $Elevated) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $argList = '-NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '" -Elevated'
    Start-Process powershell -Verb RunAs -Wait -ArgumentList $argList
    if (Wait-NoApp 3) { exit 0 }
    exit 2
}

Stop-ProjectProcesses
$appPorts = @(Get-AppPorts)
foreach ($port in $appPorts) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $procId = [int]$conn.OwningProcess
        $info = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"
        if ($info -and ($info.CommandLine -like '*uvicorn*' -or $info.CommandLine -like '*serve.bat*')) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

if (Wait-NoApp) {
    exit 0
}

exit 2
