[CmdletBinding()]
param(
    [switch]$SkipRuntime
)

$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$readmePath = Join-Path $repoRoot "README.md"
$pomPath = Join-Path $repoRoot "backend/tf-api/pom.xml"
$frontendPkgPath = Join-Path $repoRoot "frontend/package.json"
$landingPkgPath = Join-Path $repoRoot "landing-page/package.json"

function Get-BadgeToken([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) {
        return "unknown"
    }

    return $text.Replace("_", "__").Replace("-", "--").Replace(" ", "_")
}

function New-Badge([string]$label, [string]$value, [string]$color) {
    $labelToken = Get-BadgeToken $label
    $valueToken = Get-BadgeToken $value
    return "![$label](https://img.shields.io/badge/$labelToken-$valueToken-$color.svg)"
}

function Get-ProjectRuntimeStatus {
    if ($SkipRuntime -or $env:CI -eq "true") {
        return @{ Value = "ci"; Color = "blueviolet" }
    }

    try {
        $dockerVersion = docker --version 2>$null
        if (-not $dockerVersion) {
            return @{ Value = "unknown"; Color = "lightgrey" }
        }

        $psJson = docker compose -f "docker-compose.dev.yml" ps --format json 2>$null
        if (-not $psJson) {
            return @{ Value = "down"; Color = "critical" }
        }

        $services = $psJson | ConvertFrom-Json
        if (-not $services) {
            return @{ Value = "down"; Color = "critical" }
        }

        $runningCount = 0
        foreach ($service in $services) {
            if ($service.State -eq "running" -or $service.Status -match "^running") {
                $runningCount++
            }
        }

        if ($runningCount -ge 4) {
            return @{ Value = "up"; Color = "brightgreen" }
        }

        if ($runningCount -gt 0) {
            return @{ Value = "partial"; Color = "yellow" }
        }

        return @{ Value = "down"; Color = "critical" }
    }
    catch {
        return @{ Value = "unknown"; Color = "lightgrey" }
    }
}

[xml]$pomXml = Get-Content -Path $pomPath
$frontendPkg = Get-Content -Path $frontendPkgPath | ConvertFrom-Json
$landingPkg = Get-Content -Path $landingPkgPath | ConvertFrom-Json

$backendVersion = [string]$pomXml.project.version
$springBootVersion = [string]$pomXml.project.parent.version
$javaVersion = [string]$pomXml.project.properties."java.version"
$keycloakVersion = [string]$pomXml.project.properties."keycloak.version"
$frontendVersion = [string]$frontendPkg.version
$landingVersion = [string]$landingPkg.version
$nextVersion = [string]$frontendPkg.dependencies.next
$nextVersion = $nextVersion.TrimStart('^', '~')

$runtime = Get-ProjectRuntimeStatus

$badges = @(
    New-Badge -label "Version" -value "0.2.0-rc1" -color "blue"
    New-Badge -label "License" -value "Fair Use" -color "green"
    New-Badge -label "Java" -value $javaVersion -color "orange"
    New-Badge -label "Spring Boot" -value $springBootVersion -color "brightgreen"
    New-Badge -label "Next.js" -value $nextVersion -color "black"
    New-Badge -label "TailwindCSS" -value "4" -color "38bdf8"
    New-Badge -label "Keycloak" -value $keycloakVersion -color "blue"
    New-Badge -label "PostgreSQL" -value "16" -color "blue"
    New-Badge -label "Docker" -value "Ready" -color "blue"
    New-Badge -label "Backend App" -value $backendVersion -color "6f42c1"
    New-Badge -label "Frontend App" -value $frontendVersion -color "0ea5e9"
    New-Badge -label "Landing App" -value $landingVersion -color "f59e0b"
    New-Badge -label "Runtime" -value $runtime.Value -color $runtime.Color
)

$startMarker = "<!-- BADGES:START -->"
$endMarker = "<!-- BADGES:END -->"
$readmeContent = Get-Content -Path $readmePath -Raw

$pattern = "(?s)" + [regex]::Escape($startMarker) + ".*?" + [regex]::Escape($endMarker)
$newBadgeBlock = ($startMarker + "`n" + ($badges -join "`n") + "`n" + $endMarker)

if ($readmeContent -notmatch $pattern) {
    throw "Badge markers not found in README.md"
}

$updated = [regex]::Replace($readmeContent, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newBadgeBlock }, 1)
Set-Content -Path $readmePath -Value $updated -NoNewline

Write-Host "README badges updated successfully." -ForegroundColor Green
