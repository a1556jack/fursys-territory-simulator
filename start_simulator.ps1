$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) {
    $nodeCommand.Source
} else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw 'Node.js를 찾을 수 없습니다. Node.js를 설치하거나 Codex에서 실행해 주세요.'
}

function Get-SimulatorHealth([int]$Port) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
        if ($health.appId -eq 'fursys-territory-simulator') {
            return $health
        }
    } catch {
        return $null
    }
    return $null
}

function Test-PortInUse([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(400) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

$ports = 4317..4330
$port = $null
foreach ($candidate in $ports) {
    if (Get-SimulatorHealth $candidate) {
        $port = $candidate
        break
    }
}

if ($null -eq $port) {
    $port = $ports | Where-Object { -not (Test-PortInUse $_) } | Select-Object -First 1
    if ($null -eq $port) {
        throw '4317~4330 포트에 빈 자리가 없어 시뮬레이터를 시작할 수 없습니다.'
    }

    Write-Host "퍼시스 권역 시뮬레이터 서버를 $port 포트에서 시작합니다."
    $env:PORT = [string]$port
    Start-Process -FilePath $nodeExe `
        -ArgumentList (Join-Path $root 'server.mjs') `
        -WorkingDirectory $root `
        -WindowStyle Hidden
    Remove-Item Env:PORT -ErrorAction SilentlyContinue

    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        if (Get-SimulatorHealth $port) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw '시뮬레이터 서버가 제한 시간 안에 시작되지 않았습니다.'
    }
}

$url = "http://127.0.0.1:$port/"
Write-Host "시뮬레이터가 준비되었습니다: $url"
if ($env:SIMULATOR_NO_BROWSER -ne '1') {
    Start-Process $url
}
