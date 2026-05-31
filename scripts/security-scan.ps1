# ============================================================
# TaskForce - Security Scan Script
# ============================================================
# Usage:
#   .\scripts\security-scan.ps1               → Tous les scans
#   .\scripts\security-scan.ps1 -Images       → Images Docker uniquement
#   .\scripts\security-scan.ps1 -Source       → Filesystem uniquement
#   .\scripts\security-scan.ps1 -Static       → Semgrep statique uniquement
#   .\scripts\security-scan.ps1 -Severity HIGH → Seuil de sévérité (défaut: MEDIUM)
#
# Prérequis: Docker Desktop en cours d'exécution
# Les images backend/frontend doivent être buildées avant le scan d'images.
# ============================================================

[CmdletBinding()]
param(
    [switch]$Images,
    [switch]$Source,
    [switch]$Static,
    [ValidateSet("LOW", "MEDIUM", "HIGH", "CRITICAL")]
    [string]$Severity = "MEDIUM"
)

$ErrorActionPreference = "Continue"

# Si aucun flag, tout lancer
if (-not ($Images -or $Source -or $Static)) {
    $Images = $true
    $Source = $true
    $Static = $true
}

# ── Répertoire de rapports ────────────────────────────────
$Timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$ReportDir   = Join-Path $PSScriptRoot "..\security-reports\$Timestamp"
$ReportDir   = [System.IO.Path]::GetFullPath($ReportDir)
New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null

# ── Constantes ────────────────────────────────────────────
$ProjectName    = "taskforce-fullstack"
$BackendImage   = "${ProjectName}-backend"
$FrontendImage  = "${ProjectName}-frontend"
$WorkspaceRoot  = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$TrivyCache     = "trivy_cache"

# ── Helpers ───────────────────────────────────────────────
function Write-Header($text) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Write-Section($text) {
    Write-Host ""
    Write-Host ("─" * 60) -ForegroundColor Yellow
    Write-Host "  $text" -ForegroundColor Yellow
    Write-Host ("─" * 60) -ForegroundColor Yellow
}

function Write-Step($text) {
    Write-Host "  → $text" -ForegroundColor White
}

function Write-OK($text) {
    Write-Host "  ✓ $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "  ! $text" -ForegroundColor Yellow
}

function Write-Fail($text) {
    Write-Host "  ✗ $text" -ForegroundColor Red
}

# ── Résumé global ─────────────────────────────────────────
$ScanSummary = @{
    ImagesScanned   = 0
    TotalVulns      = 0
    CriticalVulns   = 0
    HighVulns       = 0
    MediumVulns     = 0
    SecretsFound    = 0
    MisconfigFound  = 0
    SemgrepFindings = 0
    Errors          = @()
}

# ── Démarrage ─────────────────────────────────────────────
Write-Header "TaskForce - Security Scan Report"
Write-Host "  Date      : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Gray
Write-Host "  Sévérité  : $Severity+" -ForegroundColor Gray
Write-Host "  Rapports  : $ReportDir" -ForegroundColor Gray

# ── Vérification Docker ───────────────────────────────────
Write-Step "Vérification de Docker..."
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker non disponible" }
    Write-OK "Docker OK"
} catch {
    Write-Fail "Docker n'est pas disponible. Veuillez démarrer Docker Desktop."
    exit 1
}

# ── Mise à jour de la DB Trivy ────────────────────────────
if ($Images -or $Source) {
    Write-Step "Mise à jour de la base de vulnérabilités Trivy..."
    docker run --rm `
        -v "${TrivyCache}:/root/.cache/trivy" `
        aquasec/trivy:latest `
        image --download-db-only --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Base Trivy à jour"
    } else {
        Write-Warn "Mise à jour Trivy échouée (mode hors ligne ou réseau limité)"
    }
}

# ════════════════════════════════════════════════════════════
# PARTIE 1 - SCAN DES IMAGES DOCKER
# ════════════════════════════════════════════════════════════
if ($Images) {
    Write-Section "1/3 - Scan des images Docker (CVE)"

    $ImagesToScan = @(
        @{ Tag = $BackendImage;  Label = "Backend (Spring Boot)" },
        @{ Tag = $FrontendImage; Label = "Frontend (Next.js)" }
    )

    foreach ($img in $ImagesToScan) {
        $tag   = $img.Tag
        $label = $img.Label

        Write-Host ""
        Write-Step "$label → $tag"

        # Vérifier que l'image existe localement
        $imgId = docker images -q $tag 2>&1
        if (-not $imgId) {
            Write-Warn "Image '$tag' introuvable. Lancer 'docker compose -f docker-compose.dev.yml build' d'abord."
            $ScanSummary.Errors += "Image '$tag' non trouvée"
            continue
        }

        $ScanSummary.ImagesScanned++
        $serviceSlug = if ($tag -like "*backend*") { "backend" } else { "frontend" }

        # ── Rapport table (console) ──────────────────────
        Write-Host ""
        docker run --rm `
            -v "${TrivyCache}:/root/.cache/trivy" `
            -v /var/run/docker.sock:/var/run/docker.sock:ro `
            aquasec/trivy:latest `
            image `
            --exit-code 0 `
            --severity "$Severity,HIGH,CRITICAL" `
            --format table `
            --no-progress `
            $tag

        # ── Rapport JSON ─────────────────────────────────
        $jsonFile = Join-Path $ReportDir "trivy-image-$serviceSlug.json"
        docker run --rm `
            -v "${TrivyCache}:/root/.cache/trivy" `
            -v /var/run/docker.sock:/var/run/docker.sock:ro `
            aquasec/trivy:latest `
            image `
            --exit-code 0 `
            --severity "$Severity,HIGH,CRITICAL" `
            --format json `
            --no-progress `
            $tag | Out-File -FilePath $jsonFile -Encoding UTF8

        # ── Rapport HTML ─────────────────────────────────
        $htmlFile = Join-Path $ReportDir "trivy-image-$serviceSlug.html"
        docker run --rm `
            -v "${TrivyCache}:/root/.cache/trivy" `
            -v /var/run/docker.sock:/var/run/docker.sock:ro `
            aquasec/trivy:latest `
            image `
            --exit-code 0 `
            --severity "$Severity,HIGH,CRITICAL" `
            --format template `
            --template "@contrib/html.tpl" `
            --no-progress `
            $tag | Out-File -FilePath $htmlFile -Encoding UTF8

        # ── Rapport SARIF (intégration IDE) ──────────────
        $sarifFile = Join-Path $ReportDir "trivy-image-$serviceSlug.sarif"
        docker run --rm `
            -v "${TrivyCache}:/root/.cache/trivy" `
            -v /var/run/docker.sock:/var/run/docker.sock:ro `
            aquasec/trivy:latest `
            image `
            --exit-code 0 `
            --format sarif `
            --no-progress `
            $tag | Out-File -FilePath $sarifFile -Encoding UTF8

        Write-OK "Rapports : trivy-image-$serviceSlug.json / .html / .sarif"

        # ── Comptage depuis le JSON ───────────────────────
        if (Test-Path $jsonFile) {
            try {
                $data = Get-Content $jsonFile | ConvertFrom-Json
                foreach ($result in $data.Results) {
                    foreach ($v in $result.Vulnerabilities) {
                        $ScanSummary.TotalVulns++
                        switch ($v.Severity) {
                            "CRITICAL" { $ScanSummary.CriticalVulns++ }
                            "HIGH"     { $ScanSummary.HighVulns++ }
                            "MEDIUM"   { $ScanSummary.MediumVulns++ }
                        }
                    }
                }
            } catch {
                Write-Warn "Impossible de parser $jsonFile"
            }
        }
    }
}

# ════════════════════════════════════════════════════════════
# PARTIE 2 - SCAN DU CODE SOURCE (vuln + secrets + misconfig)
# ════════════════════════════════════════════════════════════
if ($Source) {
    Write-Section "2/3 - Scan du code source (Trivy fs)"
    Write-Host ""

    # ── Table console ────────────────────────────────────
    docker run --rm `
        -v "${WorkspaceRoot}:/workspace:ro" `
        -v "${TrivyCache}:/root/.cache/trivy" `
        aquasec/trivy:latest `
        fs `
        --exit-code 0 `
        --scanners vuln,secret,misconfig `
        --severity "$Severity,HIGH,CRITICAL" `
        --format table `
        --no-progress `
        /workspace

    # ── JSON ─────────────────────────────────────────────
    $fsJsonFile = Join-Path $ReportDir "trivy-fs.json"
    docker run --rm `
        -v "${WorkspaceRoot}:/workspace:ro" `
        -v "${TrivyCache}:/root/.cache/trivy" `
        aquasec/trivy:latest `
        fs `
        --exit-code 0 `
        --scanners vuln,secret,misconfig `
        --severity "$Severity,HIGH,CRITICAL" `
        --format json `
        --no-progress `
        /workspace | Out-File -FilePath $fsJsonFile -Encoding UTF8

    # ── HTML ─────────────────────────────────────────────
    $fsHtmlFile = Join-Path $ReportDir "trivy-fs.html"
    docker run --rm `
        -v "${WorkspaceRoot}:/workspace:ro" `
        -v "${TrivyCache}:/root/.cache/trivy" `
        aquasec/trivy:latest `
        fs `
        --exit-code 0 `
        --scanners vuln,secret,misconfig `
        --severity "$Severity,HIGH,CRITICAL" `
        --format template `
        --template "@contrib/html.tpl" `
        --no-progress `
        /workspace | Out-File -FilePath $fsHtmlFile -Encoding UTF8

    Write-OK "Rapports : trivy-fs.json / trivy-fs.html"

    # ── Comptage secrets + misconfig ─────────────────────
    if (Test-Path $fsJsonFile) {
        try {
            $fsData = Get-Content $fsJsonFile | ConvertFrom-Json
            foreach ($result in $fsData.Results) {
                $ScanSummary.SecretsFound   += ($result.Secrets       | Measure-Object).Count
                $ScanSummary.MisconfigFound += ($result.Misconfigurations | Measure-Object).Count
            }
        } catch {
            Write-Warn "Impossible de parser $fsJsonFile"
        }
    }
}

# ════════════════════════════════════════════════════════════
# PARTIE 3 - ANALYSE STATIQUE (Semgrep CE)
# ════════════════════════════════════════════════════════════
if ($Static) {
    Write-Section "3/3 - Analyse statique Semgrep (Java + TypeScript)"
    Write-Host ""

    $semgrepTextFile = Join-Path $ReportDir "semgrep.txt"
    $semgrepJsonFile = Join-Path $ReportDir "semgrep.json"

    # ── Texte console ─────────────────────────────────────
    docker run --rm `
        -v "${WorkspaceRoot}:/src:ro" `
        semgrep/semgrep:latest `
        semgrep scan /src `
        --config auto `
        --config p/secrets `
        --no-git-ignore `
        --text `
        --severity WARNING `
        2>&1 | Tee-Object -FilePath $semgrepTextFile

    # ── JSON ─────────────────────────────────────────────
    docker run --rm `
        -v "${WorkspaceRoot}:/src:ro" `
        semgrep/semgrep:latest `
        semgrep scan /src `
        --config auto `
        --config p/secrets `
        --no-git-ignore `
        --json `
        --severity WARNING `
        2>&1 | Out-File -FilePath $semgrepJsonFile -Encoding UTF8

    Write-OK "Rapports : semgrep.txt / semgrep.json"

    # ── Comptage findings ─────────────────────────────────
    if (Test-Path $semgrepJsonFile) {
        try {
            $semgrepData = Get-Content $semgrepJsonFile | ConvertFrom-Json
            $ScanSummary.SemgrepFindings = ($semgrepData.results | Measure-Object).Count
        } catch {
            Write-Warn "Impossible de parser $semgrepJsonFile"
        }
    }
}

# ════════════════════════════════════════════════════════════
# RÉSUMÉ FINAL
# ════════════════════════════════════════════════════════════
Write-Header "RÉSUMÉ DU SCAN"

Write-Host ""
if ($Images) {
    Write-Host "  Images scannées       : $($ScanSummary.ImagesScanned)" -ForegroundColor White
    $cvColor = if ($ScanSummary.CriticalVulns -gt 0) { "Red" } elseif ($ScanSummary.HighVulns -gt 0) { "Yellow" } else { "Green" }
    Write-Host "  Vulnérabilités totales: $($ScanSummary.TotalVulns)" -ForegroundColor $cvColor
    Write-Host "    CRITICAL : $($ScanSummary.CriticalVulns)" -ForegroundColor Red
    Write-Host "    HIGH     : $($ScanSummary.HighVulns)" -ForegroundColor Yellow
    Write-Host "    MEDIUM   : $($ScanSummary.MediumVulns)" -ForegroundColor White
}
if ($Source) {
    $secColor = if ($ScanSummary.SecretsFound -gt 0) { "Red" } else { "Green" }
    Write-Host "  Secrets détectés      : $($ScanSummary.SecretsFound)" -ForegroundColor $secColor
    Write-Host "  Misconfigurations     : $($ScanSummary.MisconfigFound)" -ForegroundColor White
}
if ($Static) {
    $sgColor = if ($ScanSummary.SemgrepFindings -gt 0) { "Yellow" } else { "Green" }
    Write-Host "  Findings Semgrep      : $($ScanSummary.SemgrepFindings)" -ForegroundColor $sgColor
}

if ($ScanSummary.Errors.Count -gt 0) {
    Write-Host ""
    Write-Host "  Avertissements :" -ForegroundColor Yellow
    foreach ($err in $ScanSummary.Errors) {
        Write-Warn $err
    }
}

Write-Host ""
Write-Host "  Rapports disponibles :" -ForegroundColor Cyan
Get-ChildItem $ReportDir | Sort-Object Name | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 1)
    Write-Host "    $($_.Name) (${size}KB)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Répertoire complet : $ReportDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Ouvrir les rapports HTML :" -ForegroundColor White
Write-Host "    Invoke-Item '$ReportDir'" -ForegroundColor Gray
Write-Host ""
