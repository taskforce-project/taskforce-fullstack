[CmdletBinding()]
param()

# Badges du README, recalculés depuis le dépôt : version produit, stack et versions des serveurs que
# l'installation auto-hébergée démarre. Lancé par le workflow sync-readme-badges sur `dev`.

$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$readmePath = Join-Path $repoRoot "README.md"
$pomPath = Join-Path $repoRoot "backend/tf-api/pom.xml"
$frontendPkgPath = Join-Path $repoRoot "frontend/package.json"
$productVersionPath = Join-Path $repoRoot "frontend/product-version.json"
$composePath = Join-Path $repoRoot "docker-compose.yml"
$utf8 = New-Object System.Text.UTF8Encoding $false

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

# Version d'une image du compose d'auto-hébergement (ex. « quay.io/keycloak/keycloak:26.5.2 » -> « 26.5.2 »).
function Get-ComposeImageTag([string]$compose, [string]$image) {
    $match = [regex]::Match($compose, "image:\s*" + [regex]::Escape($image) + ":(\S+)")
    if ($match.Success) { return $match.Groups[1].Value }
    return "unknown"
}

[xml]$pomXml = [System.IO.File]::ReadAllText($pomPath, $utf8)
$frontendPkg = [System.IO.File]::ReadAllText($frontendPkgPath, $utf8) | ConvertFrom-Json
$productVersion = ([System.IO.File]::ReadAllText($productVersionPath, $utf8) | ConvertFrom-Json).version
$compose = [System.IO.File]::ReadAllText($composePath, $utf8)

$springBootVersion = [string]$pomXml.project.parent.version
$javaVersion = [string]$pomXml.project.properties."java.version"
$nextVersion = ([string]$frontendPkg.dependencies.next).TrimStart('^', '~')
$keycloakVersion = Get-ComposeImageTag $compose "quay.io/keycloak/keycloak"
$postgresVersion = (Get-ComposeImageTag $compose "pgvector/pgvector").TrimStart('p', 'g')

$badges = @(
    New-Badge -label "Version" -value $productVersion -color "blue"
    New-Badge -label "License" -value "AGPL-3.0" -color "blue"
    New-Badge -label "Java" -value $javaVersion -color "orange"
    New-Badge -label "Spring Boot" -value $springBootVersion -color "brightgreen"
    New-Badge -label "Next.js" -value $nextVersion -color "black"
    New-Badge -label "PostgreSQL" -value $postgresVersion -color "blue"
    New-Badge -label "Keycloak" -value $keycloakVersion -color "blue"
    New-Badge -label "Self-hosted" -value "Docker" -color "blue"
)

$startMarker = "<!-- BADGES:START -->"
$endMarker = "<!-- BADGES:END -->"
# Lecture et écriture en UTF-8 sans BOM : Get-Content et Set-Content de Windows PowerShell 5.1 passent par
# la page de codes ANSI et abîmeraient les caractères non ASCII du README.
$readmeContent = [System.IO.File]::ReadAllText($readmePath, $utf8)

$pattern = "(?s)" + [regex]::Escape($startMarker) + ".*?" + [regex]::Escape($endMarker)
$newBadgeBlock = ($startMarker + "`n" + ($badges -join "`n") + "`n" + $endMarker)

if ($readmeContent -notmatch $pattern) {
    throw "Badge markers not found in README.md"
}

$updated = [regex]::Replace($readmeContent, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newBadgeBlock }, 1)
[System.IO.File]::WriteAllText($readmePath, $updated, $utf8)

Write-Host "README badges updated successfully." -ForegroundColor Green
