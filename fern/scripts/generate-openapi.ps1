# Genere la spec OpenAPI REELLE depuis le backend TaskForce en marche,
# pour alimenter la reference API de la doc Fern (fern/openapi/openapi.json).
#
# Pre-requis : le backend tourne et sert /api-docs (springdoc, actif partout SAUF en prod).
#   docker compose -f docker-compose.dev.yml up -d backend
#
# Usage (depuis n'importe ou) :
#   .\fern\scripts\generate-openapi.ps1
#   $env:TF_API_URL = 'http://localhost:8080'; .\fern\scripts\generate-openapi.ps1
#
# La spec ainsi ecrite remplace le PLACEHOLDER versionne. Commit -> la CI publie (voir README).

$ErrorActionPreference = 'Stop'

$base = if ($env:TF_API_URL) { $env:TF_API_URL.TrimEnd('/') } else { 'http://localhost:8080' }
$src  = "$base/api-docs"
$out  = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\openapi\openapi.json'))

Write-Host "-> Recuperation de la spec depuis $src"
try {
    $raw = (Invoke-WebRequest -Uri $src -UseBasicParsing -TimeoutSec 20).Content
} catch {
    Write-Error "Backend injoignable sur $src. Demarre le stack dev (docker compose -f docker-compose.dev.yml up -d backend) puis reessaie."
    exit 1
}

# Reformatage indente pour un diff Git lisible ; fallback sur le brut si le round-trip echoue.
try {
    $pretty = $raw | ConvertFrom-Json | ConvertTo-Json -Depth 100
} catch {
    $pretty = $raw
}

# UTF-8 SANS BOM (certains parseurs OpenAPI sont stricts sur le BOM).
[System.IO.File]::WriteAllText($out, $pretty, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK -> $out"
