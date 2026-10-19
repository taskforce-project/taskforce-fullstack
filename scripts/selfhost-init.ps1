# Writes .env for docker-compose.yml from .env.selfhost.example, with fresh secrets (Windows PowerShell 5.1 or 7).
# Never touches an existing .env: its secrets protect the data already stored.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$target = Join-Path $root ".env"

if (Test-Path $target) {
  Write-Host ".env already exists, nothing changed. Its secrets protect your data: keep it, or move it away to start over."
  exit 0
}

function New-Secret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

$content = (Get-Content (Join-Path $root ".env.selfhost.example") -Raw) -replace "`r`n", "`n"
foreach ($key in @("DB_PASSWORD", "KEYCLOAK_ADMIN_PASSWORD", "KEYCLOAK_CLIENT_SECRET", "MINIO_ROOT_PASSWORD",
                   "TF_ENCRYPTION_KEY", "AI_SERVICE_TOKEN", "TF_HUMAN_CHALLENGE_SECRET")) {
  $content = $content -replace "(?m)^$key=.*$", "$key=$(New-Secret)"
}
# UTF-8 without BOM and LF line endings: what docker compose expects.
[System.IO.File]::WriteAllText($target, $content, (New-Object System.Text.UTF8Encoding $false))

$app = ([regex]::Match($content, "(?m)^TF_APP_URL=(.*)$")).Groups[1].Value
$kc = ([regex]::Match($content, "(?m)^TF_KEYCLOAK_URL=(.*)$")).Groups[1].Value
Write-Host ".env written with new secrets."
Write-Host "Next: docker compose up -d --build, then open $app and create your account."
Write-Host "Keycloak console (password resets): $kc, user admin, password KEYCLOAK_ADMIN_PASSWORD in .env."
