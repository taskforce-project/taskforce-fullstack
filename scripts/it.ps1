# it.ps1 — Lance les tests d'INTEGRATION backend (B-T4+) contre un vrai Postgres.
#
# Faute de JDK local, on tourne dans le conteneur Maven (volume `tf-m2`). Testcontainers
# n'est PAS utilisable ici : son client docker-java (TC 1.20.x) est incompatible avec le proxy
# Docker Desktop 29 depuis un conteneur (HTTP 400). On démarre donc un Postgres pgvector
# *sibling* sur un réseau Docker partagé, et le conteneur Maven rejoint ce réseau (connexion
# par nom de service `<Name>-pg`). Equivalent fonctionnel : vrai PG + vrai Flyway + ddl-auto=validate.
#
# Plusieurs sessions lancent leurs suites sur le même poste. Chaque run a ses propres noms, tirés de
# `-Name` (au hasard par défaut) : réseau `<Name>-net`, base `<Name>-pg`, build `<Name>-mvn`. Il ne
# touche jamais à ceux des autres, et ne lance son build Maven qu'une fois les autres `*-mvn` finis :
# un seul build à la fois sur le poste. Un run coupé sans nettoyage (veille, process tué) laisse sa
# base et son réseau : `docker ps -a --filter name=tf-it-`, `docker network ls --filter name=tf-it-`.
#
# Usage :
#   .\scripts\it.ps1                      # tous les *IT / tests d'intégration (via le profil it)
#   .\scripts\it.ps1 -Test IntegrationSocleTest
#   .\scripts\it.ps1 -Offline             # -o (après un premier run en ligne)
#   .\scripts\it.ps1 -Test ALL -Name tf-w1   # noms choisis : tf-w1-net, tf-w1-pg, tf-w1-mvn
param(
  [string]$Test = "IntegrationSocleTest",
  [switch]$Offline,
  [switch]$Verify,
  [switch]$Full,  # rapport de couverture COMPLET (sans exclusions) → target/site/jacoco-full/
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')]
  [string]$Name = ("tf-it-" + [guid]::NewGuid().ToString("N").Substring(0, 6))
)
# Pas de $ErrorActionPreference="Stop" : en PS 5.1 le stderr des commandes natives (docker)
# déclenche une terminaison. On pilote via $LASTEXITCODE à la place.
$net = "$Name-net"
$pg  = "$Name-pg"
$mvn = "$Name-mvn"
$api = (Resolve-Path "$PSScriptRoot/../backend/tf-api").Path
# Contrats du harnais (cas partagés avec le runner), lus par les tests de contrat sous /contracts.
$contracts = (Resolve-Path "$PSScriptRoot/../contracts").Path
# Référence d'API publiée (`fern/openapi/openapi.json`), lue par ProcessApiReferenceTest sous /fern.
$fern = (Resolve-Path "$PSScriptRoot/../fern").Path

# Builds Maven du poste : conteneurs `*-mvn` créés ou en cours, du plus récent au plus ancien.
function Get-MavenBuilds {
  @(docker ps -a --filter "name=-mvn$" --filter "status=created" --filter "status=running" --format "{{.Names}}")
}

# Un nom déjà pris est celui d'un autre run : ne toucher ni à son build ni à sa base.
docker container inspect $mvn *>$null
if ($LASTEXITCODE -eq 0) { throw "$mvn already exists: another run uses -Name $Name" }
Write-Host "==> Run $Name (network $net, Postgres $pg, Maven $mvn)"

$code = 1
try {
  docker network inspect $net *>$null
  if ($LASTEXITCODE -ne 0) { docker network create $net *>$null }

  # -Full → suite complète + rapport sans exclusions. -Verify → mvn verify (gate). -Test ALL → toute la suite.
  if ($Full)        { $mvnArgs = @("clean", "test", "-Pcov-full") }
  elseif ($Verify)  { $mvnArgs = @("clean", "verify") }
  elseif ($Test -eq "ALL") { $mvnArgs = @("clean", "test") }  # clean → exec JaCoCo propre
  else              { $mvnArgs = @("test", "-Dtest=$Test") }
  if ($Offline) { $mvnArgs = @("-o") + $mvnArgs }
  $mvnArgs = $mvnArgs + @("-Dcontracts.dir=/contracts", "-Dfern.dir=/fern")

  # Un seul build Maven à la fois. Le conteneur créé, pas encore lancé, sert de ticket : on attend la
  # fin des autres `*-mvn`, on crée le sien, et seul le plus ancien des tickets passe. Deux runs qui
  # partent ensemble ne lancent donc pas deux builds : le plus récent rend son ticket et attend.
  $waitingFor = ""
  while ($true) {
    $others = @(Get-MavenBuilds | Where-Object { $_ -ne $mvn })
    if ($others.Count -gt 0) {
      if ("$others" -ne $waitingFor) {
        $waitingFor = "$others"
        Write-Host "==> Waiting for another Maven build to finish: $($others -join ', ')"
      }
      Start-Sleep -Seconds 10
      continue
    }
    docker create --rm --name $mvn --network $net `
      -v "${api}:/app" -v "${contracts}:/contracts:ro" -v "${fern}:/fern:ro" -v "tf-m2:/root/.m2" `
      -e "SPRING_DATASOURCE_URL=jdbc:postgresql://${pg}:5432/tf" `
      -e "SPRING_DATASOURCE_USERNAME=tf" -e "SPRING_DATASOURCE_PASSWORD=tf" `
      -w /app maven:3.9-eclipse-temurin-21 mvn @mvnArgs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker create $mvn failed" }
    if ((Get-MavenBuilds | Select-Object -Last 1) -eq $mvn) { break }
    docker rm -f $mvn *>$null
  }

  Write-Host "==> Postgres pgvector sibling"
  docker rm -f $pg *>$null | Out-Null
  docker run -d --name $pg --network $net `
    -e POSTGRES_DB=tf -e POSTGRES_USER=tf -e POSTGRES_PASSWORD=tf `
    pgvector/pgvector:pg16 -c max_connections=300 | Out-Null

  Write-Host "==> Attente readiness Postgres"
  $ready = $false
  foreach ($i in 1..30) {
    docker exec $pg pg_isready -U tf -d tf 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { docker logs --tail 30 $pg; throw "Postgres non prêt" }

  Write-Host "==> mvn $($mvnArgs -join ' ')"
  docker start -a $mvn
  $code = $LASTEXITCODE
} finally {
  Write-Host "==> Cleanup"
  docker rm -f $mvn *>$null | Out-Null
  docker rm -f $pg *>$null | Out-Null
  docker network rm $net *>$null | Out-Null
}
exit $code
