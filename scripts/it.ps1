# it.ps1 — Lance les tests d'INTEGRATION backend (B-T4+) contre un vrai Postgres.
#
# Faute de JDK local, on tourne dans le conteneur Maven (volume `tf-m2`). Testcontainers
# n'est PAS utilisable ici : son client docker-java (TC 1.20.x) est incompatible avec le proxy
# Docker Desktop 29 depuis un conteneur (HTTP 400). On démarre donc un Postgres pgvector
# *sibling* sur un réseau Docker partagé, et le conteneur Maven rejoint ce réseau (connexion
# par nom de service `tf-it-pg`). Equivalent fonctionnel : vrai PG + vrai Flyway + ddl-auto=validate.
#
# Usage :
#   .\scripts\it.ps1                      # tous les *IT / tests d'intégration (via le profil it)
#   .\scripts\it.ps1 -Test IntegrationSocleTest
#   .\scripts\it.ps1 -Offline             # -o (après un premier run en ligne)
param(
  [string]$Test = "IntegrationSocleTest",
  [switch]$Offline
)
# Pas de $ErrorActionPreference="Stop" : en PS 5.1 le stderr des commandes natives (docker)
# déclenche une terminaison. On pilote via $LASTEXITCODE à la place.
$net = "tf-it-net"
$pg  = "tf-it-pg"
$api = (Resolve-Path "$PSScriptRoot/../backend/tf-api").Path

Write-Host "==> Network + Postgres pgvector sibling"
docker network inspect $net *>$null
if ($LASTEXITCODE -ne 0) { docker network create $net *>$null }
docker rm -f $pg *>$null | Out-Null
docker run -d --name $pg --network $net `
  -e POSTGRES_DB=tf -e POSTGRES_USER=tf -e POSTGRES_PASSWORD=tf `
  pgvector/pgvector:pg16 | Out-Null

Write-Host "==> Attente readiness Postgres"
$ready = $false
foreach ($i in 1..30) {
  docker exec $pg pg_isready -U tf -d tf 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { docker logs --tail 30 $pg; docker rm -f $pg | Out-Null; throw "Postgres non prêt" }

try {
  # -Test ALL → toute la suite (unit + web + intégration) en un run → un seul jacoco.exec (coverage agrégé).
  if ($Test -eq "ALL") { $mvnArgs = @("test") } else { $mvnArgs = @("test", "-Dtest=$Test") }
  if ($Offline) { $mvnArgs = @("-o") + $mvnArgs }
  Write-Host "==> mvn $($mvnArgs -join ' ')"
  docker run --rm --network $net `
    -v "${api}:/app" -v "tf-m2:/root/.m2" `
    -e "SPRING_DATASOURCE_URL=jdbc:postgresql://${pg}:5432/tf" `
    -e "SPRING_DATASOURCE_USERNAME=tf" -e "SPRING_DATASOURCE_PASSWORD=tf" `
    -w /app maven:3.9-eclipse-temurin-21 mvn @mvnArgs
  $code = $LASTEXITCODE
} finally {
  Write-Host "==> Cleanup"
  docker rm -f $pg *>$null | Out-Null
  docker network rm $net *>$null | Out-Null
}
exit $code
