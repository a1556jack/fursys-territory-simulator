$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root
Write-Host '퍼시스 권역 시뮬레이터를 시작합니다.'
Write-Host 'Codex 브라우저 주소창에 http://127.0.0.1:4317 을 입력하세요.'
node .\server.mjs
