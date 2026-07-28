$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$url = 'http://127.0.0.1:4317/'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) {
    $nodeCommand.Source
} else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw 'Node.js를 찾을 수 없습니다. Node.js를 설치하거나 Codex에서 실행해 주세요.'
}

function Test-SimulatorServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not (Test-SimulatorServer)) {
    Write-Host '퍼시스 권역 시뮬레이터 서버를 시작합니다.'
    Start-Process -FilePath $nodeExe `
        -ArgumentList (Join-Path $root 'server.mjs') `
        -WorkingDirectory $root `
        -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        if (Test-SimulatorServer) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw '시뮬레이터 서버가 제한 시간 안에 시작되지 않았습니다.'
    }
}

Write-Host "시뮬레이터가 준비되었습니다: $url"
if ($env:SIMULATOR_NO_BROWSER -ne '1') {
    Start-Process $url
}
