# ============================================================
#  scripts/quality.ps1 — tests, couverture, lint, build
#  Usage : .\scripts\quality.ps1 <action>
#  Actions : test-fe cov-fe test-be cov-be lint build-fe build-be
# ============================================================
param([Parameter(Position=0, Mandatory=$true)][string]$Action)
. "$PSScriptRoot\_lib.ps1"

function FE([scriptblock]$b) { Push-Location frontend;      try { & $b } finally { Pop-Location } }
function BE([scriptblock]$b) { Push-Location backend/tf-api; try { & $b } finally { Pop-Location } }

switch ($Action) {
  'test-fe'  { Run 'frontend : vitest run';        FE { npm test -- run } }
  'cov-fe'   { Run 'frontend : couverture';        FE { npm run test:coverage } }
  'test-be'  { Run 'backend : mvnw test';          BE { .\mvnw.cmd test } }
  'cov-be'   { Run 'backend : jacoco';             BE { .\mvnw.cmd clean test jacoco:report } }
  'lint'     { Run 'frontend : eslint';            FE { npm run lint } }
  'build-fe' { Run 'frontend : next build';        FE { npm run build } }
  'build-be' { Run 'backend : mvn package';        BE { .\mvnw.cmd clean package -DskipTests } }
  default    { Warn "Action qualite inconnue : $Action" }
}
