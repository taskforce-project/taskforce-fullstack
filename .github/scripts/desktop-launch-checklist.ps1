# The checks of the desktop launch checklist (.github/workflows/desktop-launch-checklist.yml). One call, one step: it ends
# with one line in the job summary saying in plain English what was proved, or it fails the job and says why.
#
# No test door, no account, no credential: the app stops at its sign-in window, and what needs an account is left out.

[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('versions', 'download', 'clean-install', 'first-start', 'first-database', 'update', 'updated-database',
    'without-account', 'no-visual-cpp', 'uninstall', 'verdict')]
  [string] $Step
)

# This script installs, starts and uninstalls TaskForce in the folders of the current user: never on someone's computer.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  Write-Host 'This script installs and uninstalls TaskForce: it only runs on a GitHub-hosted runner.'
  exit 2
}

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$From = $env:FROM_VERSION
$To = $env:TO_VERSION

# Where the per-user installer puts the app, and where the app keeps its data (desktop/src/paths.ts).
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\taskforce-desktop'
$Resources = Join-Path $InstallDir 'resources'
$AppExe = Join-Path $InstallDir 'TaskForce.exe'
$UserData = Join-Path $env:APPDATA 'TaskForce'
$LogFile = Join-Path $UserData 'logs\desktop.log'

# What the run places in the user data, shaped like a person's: a marker, and a database in a folder of `accounts`. The
# app never opens that folder: its name is not one the app derives from an account (desktop/src/paths.ts).
$Marker = Join-Path $UserData 'launch-checklist-marker.txt'
$DataDir = Join-Path $UserData 'accounts\launch-checklist'
$Cluster = Join-Path $DataDir 'postgres'
$DbLog = Join-Path $DataDir 'logs\postgres.log'

# Kept between the steps. Only the `evidence` folder leaves the machine.
$Work = Join-Path $env:RUNNER_TEMP 'launch-checklist'
$Evidence = Join-Path $Work 'evidence'
$Installers = Join-Path $Work 'installers'
$PasswordFile = Join-Path $Work 'database-password'
$FingerprintFile = Join-Path $Work 'database-fingerprint'
New-Item -ItemType Directory -Force -Path $Evidence, $Installers | Out-Null

$SignInTitle = 'Sign in to TaskForce'
$DebugPort = 9333
$DbPort = 55432
$DbUser = 'taskforce'
$Database = 'taskforce'
$Connection = @('-h', '127.0.0.1', '-p', "$DbPort", '-U', $DbUser)
$ChecklistRows = 2000

$ExpectedFiles = @(
  'TaskForce.exe',
  'Uninstall TaskForce.exe',
  'resources\app.asar',
  'resources\app-update.yml',
  'resources\jre\bin\java.exe',
  'resources\backend\tf-api.jar',
  'resources\postgres\bin\postgres.exe',
  'resources\postgres\bin\initdb.exe',
  'resources\postgres\bin\pg_ctl.exe',
  'resources\postgres\bin\pg_dump.exe',
  'resources\postgres\bin\pg_restore.exe',
  'resources\postgres\bin\psql.exe',
  'resources\postgres\lib\vector.dll',
  'resources\postgres\share\extension\vector.control',
  'resources\frontend\server.js',
  'resources\frontend\.next\BUILD_ID',
  'resources\frontend\node_modules\next\package.json',
  'resources\runner\dist\index.js'
)

# What the page in the window says about itself: loaded, its button there and usable, its bridge to the app in place.
$SignInProbe = @'
JSON.stringify({
  ready: document.readyState,
  title: document.title,
  button: (() => { const b = document.getElementById("signin"); return !!b && b.offsetParent !== null && !b.disabled; })(),
  bridge: typeof (window.taskforceSignIn && window.taskforceSignIn.signIn),
})
'@

# One table of the app's data: text, vectors and a vector index, the kinds of data a person's copy must bring back.
$ChecklistTable = @"
CREATE TABLE launch_checklist (id integer PRIMARY KEY, label text NOT NULL, embedding vector(3) NOT NULL);
INSERT INTO launch_checklist
  SELECT i, chr(233) || ' ' || i, ARRAY[sin(i), cos(i), i / 1000.0::float8]::vector(3) FROM generate_series(1, $ChecklistRows) i;
CREATE INDEX launch_checklist_hnsw ON launch_checklist USING hnsw (embedding vector_cosine_ops);
"@
$FingerprintQuery = "SELECT count(*) || ':' || md5(string_agg(id || '|' || label || '|' || embedding::text, ',' ORDER BY id)) FROM launch_checklist"
$VectorPlanQuery = "SET enable_seqscan = off; EXPLAIN (COSTS OFF) SELECT id FROM launch_checklist ORDER BY embedding <=> '[1,0,0]' LIMIT 5"

# -------------------------------------------------- Plumbing --------------------------------------------------

function Add-Summary([string] $Line) {
  Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $Line -Encoding utf8
}

function Save-Logs {
  foreach ($log in $LogFile, $DbLog) {
    if (Test-Path -LiteralPath $log) { Copy-Item -LiteralPath $log -Destination $Evidence -Force }
  }
}

# Runs one step. The last thing the check returns is what it proved; whatever it throws is why the job stops.
function Invoke-Check([string] $Title, [scriptblock] $Check) {
  try {
    $proof = @(& $Check)[-1]
  } catch {
    $reason = "$($_.Exception.Message)" -replace '\s*\r?\n\s*', ' '
    Save-Logs
    Add-Summary "- **FAILED at ${Title}.** $reason"
    Write-Host "::error title=Failed at ${Title}::$($reason -replace '%', '%25')"
    exit 1
  }
  Save-Logs
  Add-Summary "- **${Title}.** $proof"
  Write-Host $proof
}

function Wait-For([string] $What, [int] $Seconds, [scriptblock] $Condition) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  $script:WaitDetail = ''
  do {
    $value = & $Condition
    if ($value) { return $value }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Waited $Seconds s for $What, in vain. $script:WaitDetail"
}

function Invoke-Tool([string] $What, [string] $Tool, [string[]] $Arguments) {
  & $Tool @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE" }
}

# The runner is full of developer tools a person's computer does not have: Java, Node, its own PostgreSQL and the PG*
# variables that go with it. The installed programs must work without them.
function Use-BareEnvironment {
  $env:Path = @("$env:SystemRoot\System32", $env:SystemRoot, "$env:SystemRoot\System32\Wbem",
    "$env:SystemRoot\System32\WindowsPowerShell\v1.0") -join ';'
  Get-ChildItem Env: | Where-Object Name -Match '^(PG|JAVA_HOME|NODE_)' | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
}

function ConvertTo-Version([string] $Text) {
  if ($Text -notmatch '^\d+\.\d+\.\d+$') { throw "'$Text' is not a version: expected something like 1.9.0" }
  [version] $Text
}

function Get-SetupPath([string] $Version) {
  Join-Path $Installers "$Version\TaskForce-Setup-$Version.exe"
}

# -------------------------------------------------- Installation --------------------------------------------------

function Invoke-Installer([string] $Version, [string[]] $Arguments) {
  $started = Get-Date
  $process = Start-Process -FilePath (Get-SetupPath $Version) -ArgumentList $Arguments -PassThru
  $null = $process.Handle # Without it, the exit code cannot be read afterwards.
  if (-not $process.WaitForExit(6 * 60 * 1000)) {
    $process.Kill()
    throw "The installer of $Version was still running after 6 minutes"
  }
  if ($process.ExitCode -ne 0) { throw "The installer of $Version ended with exit code $($process.ExitCode)" }
  [int] ((Get-Date) - $started).TotalSeconds
}

function Get-UninstallEntry {
  Get-ChildItem -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } |
    Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like 'TaskForce*' } |
    Select-Object -First 1
}

function Get-Shortcuts {
  @(
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\TaskForce.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'TaskForce.lnk')
  )
}

# The version inside app.asar's package.json, the one the app itself reports (asar format: two size fields, a JSON index,
# then the files).
function Read-AsarVersion {
  $stream = [IO.File]::OpenRead((Join-Path $Resources 'app.asar'))
  try {
    $reader = [IO.BinaryReader]::new($stream)
    $null = $reader.ReadUInt32()
    $headerSize = $reader.ReadUInt32()
    $null = $reader.ReadUInt32()
    $indexSize = $reader.ReadInt32()
    $index = [Text.Encoding]::UTF8.GetString($reader.ReadBytes($indexSize)) | ConvertFrom-Json
    $entry = $index.files.'package.json'
    $stream.Position = 8 + [long] $headerSize + [long] $entry.offset
    ([Text.Encoding]::UTF8.GetString($reader.ReadBytes([int] $entry.size)) | ConvertFrom-Json).version
  } finally {
    $stream.Dispose()
  }
}

# The files say which version is installed: the executable, the app's own package.json, the list of programs.
function Confirm-Installation([string] $Version) {
  $missing = @($ExpectedFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $InstallDir $_)) })
  if ($missing) { throw "Missing from the program folder: $($missing -join ', ')" }

  $absent = @(Get-Shortcuts | Where-Object { -not (Test-Path -LiteralPath $_) })
  if ($absent) { throw "Missing shortcuts: $($absent -join ', ')" }

  $entry = Get-UninstallEntry
  if (-not $entry) { throw 'The installer left no entry in the list of installed programs' }
  if ($entry.DisplayVersion -ne $Version) { throw "The list of programs says $($entry.DisplayVersion), expected $Version" }
  if ($entry.QuietUninstallString -notlike "*$InstallDir\Uninstall TaskForce.exe*") {
    throw "The program is not where it should be: $($entry.QuietUninstallString)"
  }

  $exeVersion = (Get-Item -LiteralPath $AppExe).VersionInfo.ProductVersion
  if ($exeVersion -notmatch "^$([regex]::Escape($Version))(\.0)?$") { throw "TaskForce.exe says $exeVersion, expected $Version" }

  $packageVersion = Read-AsarVersion
  if ($packageVersion -ne $Version) { throw "The app's package.json says $packageVersion, expected $Version" }

  Get-ChildItem -LiteralPath (Join-Path $Resources 'postgres\bin') -File | Select-Object Name, Length |
    Format-Table -AutoSize | Out-String -Width 120 | Set-Content -LiteralPath (Join-Path $Evidence "postgres-bin-$Version.txt")
}

# -------------------------------------------------- The app and its window --------------------------------------------------

function Get-StartLines([string] $Version) {
  if (-not (Test-Path -LiteralPath $LogFile)) { return @() }
  @(Select-String -LiteralPath $LogFile -SimpleMatch "INFO TaskForce $Version starting (" | ForEach-Object Line)
}

function Get-SignInWindow {
  Get-Process -Name TaskForce -ErrorAction SilentlyContinue | Where-Object MainWindowTitle -EQ $SignInTitle | Select-Object -First 1
}

# Runs a script in a page of the app, through the debugging port every Electron build offers.
function Invoke-InPage([string] $WebSocketUrl, [string] $Expression) {
  $timeout = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(30))
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  try {
    # The awaited results are thrown away: PowerShell would otherwise write them out, mixed with the answer.
    $null = $socket.ConnectAsync([uri] $WebSocketUrl, $timeout.Token).GetAwaiter().GetResult()
    $request = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $Expression; returnByValue = $true } } | ConvertTo-Json -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($request)
    $null = $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, $timeout.Token).GetAwaiter().GetResult()
    $buffer = [byte[]]::new(64KB)
    $received = [IO.MemoryStream]::new()
    do {
      $part = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $timeout.Token).GetAwaiter().GetResult()
      $received.Write($buffer, 0, $part.Count)
    } while (-not $part.EndOfMessage)
    ([Text.Encoding]::UTF8.GetString($received.ToArray()) | ConvertFrom-Json).result.result.value
  } finally {
    $socket.Dispose()
    $timeout.Dispose()
  }
}

# The state of the sign-in page, once it is loaded from the app's own files; nothing until then.
function Read-SignInPage {
  try {
    $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json/list" -TimeoutSec 5 | ForEach-Object { $_ })
    $page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -match '/resources/app\.asar/static/signin\.html' } | Select-Object -First 1
    if (-not $page) {
      $script:WaitDetail = "The pages open in the app: $(($targets | ForEach-Object { "$($_.type) $($_.url)" }) -join ', ')"
      return $null
    }
    $state = Invoke-InPage $page.webSocketDebuggerUrl $SignInProbe | ConvertFrom-Json
    if ($state.ready -eq 'complete') { $state }
  } catch {
    $script:WaitDetail = "Last problem: $($_.Exception.Message)"
    $null
  }
}

function Save-Screenshot([string] $Name) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $image = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($image)
    try {
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $image.Save((Join-Path $Evidence "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $image.Dispose()
    }
  } catch {
    Write-Host "::warning title=No screenshot::$($_.Exception.Message)"
  }
}

# Sends the window the message of its close button: with no account, the app quits with it (desktop/src/main.ts).
function Close-App {
  $window = Get-SignInWindow
  if (-not $window) { throw 'TaskForce has no sign-in window to close' }
  if (-not $window.CloseMainWindow()) { throw 'TaskForce did not accept the request to close its window' }
  Wait-For 'TaskForce to close' 60 { -not (Get-Process -Name TaskForce -ErrorAction SilentlyContinue) } | Out-Null
}

function Confirm-NoCrash {
  $reports = Join-Path $UserData 'Crashpad\reports'
  if (Test-Path -LiteralPath $reports) {
    $dumps = @(Get-ChildItem -LiteralPath $reports -File -Filter '*.dmp')
    if ($dumps) { throw "TaskForce left $($dumps.Count) crash report(s)" }
  }
  $errors = @(Select-String -LiteralPath $LogFile -SimpleMatch ' ERROR ' | ForEach-Object Line)
  if ($errors) { throw "The app's log reports an error: $($errors[0])" }
}

# Starts the installed app, follows it up to its sign-in window, closes it. Returns the line of its log that says so.
function Test-Start([string] $Version, [string] $Shot) {
  $earlier = @(Get-StartLines $Version).Count
  $app = Start-Process -FilePath $AppExe -ArgumentList "--remote-debugging-port=$DebugPort" -PassThru
  $null = $app.Handle # Without it, the exit code cannot be read afterwards.

  $line = Wait-For "the app's log to say that TaskForce $Version is starting" 120 {
    $lines = @(Get-StartLines $Version)
    if ($lines.Count -gt $earlier) { $lines[-1] }
  }
  Wait-For 'the window "Sign in to TaskForce"' 120 { Get-SignInWindow } | Out-Null
  Start-Sleep -Seconds 3
  Save-Screenshot $Shot
  $page = Wait-For 'the sign-in page to load from the app''s own files' 60 { Read-SignInPage }
  if ($page.title -ne $SignInTitle) { throw "The page in the window is titled '$($page.title)'" }
  if (-not $page.button) { throw 'The sign-in page shows no usable Sign in button' }
  if ($page.bridge -ne 'function') { throw 'The sign-in page has no bridge to the app: its preload script did not run' }
  $page | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Evidence "$Shot.json")

  Close-App
  if ($app.ExitCode -ne 0) { throw "TaskForce ended with exit code $($app.ExitCode)" }
  Confirm-NoCrash
  $line -replace '^\S+ INFO ', ''
}

# -------------------------------------------------- The user data --------------------------------------------------

function Get-Listing([string] $Root, [switch] $WithoutHash) {
  @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    [pscustomobject] @{
      Path   = [IO.Path]::GetRelativePath($Root, $_.FullName)
      Size   = $_.Length
      Sha256 = if ($WithoutHash) { '' } else { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    }
  })
}

function Save-Listing([object[]] $Listing, [string] $Name) {
  $Listing | Export-Csv -LiteralPath (Join-Path $Evidence $Name) -NoTypeInformation
}

# -------------------------------------------------- The embedded database --------------------------------------------------

function Set-DatabaseEnvironment {
  $env:PGPASSWORD = [IO.File]::ReadAllText($PasswordFile)
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGOPTIONS = '-c client_min_messages=warning'
}

# As EmbeddedPostgres.start (desktop/src/postgres.ts). Through files and not this step's output: pg_ctl hands its output
# to the server it starts, which would hold it open as long as the server runs.
function Start-Database([string] $Bin) {
  $options = "-p $DbPort -h 127.0.0.1 -c unix_socket_directories= -c max_connections=30 -c shared_buffers=64MB"
  $process = Start-Process -FilePath (Join-Path $Bin 'pg_ctl.exe') -NoNewWindow -PassThru `
    -ArgumentList @('-D', "`"$Cluster`"", '-o', "`"$options`"", '-l', "`"$DbLog`"", '-w', '-t', '60', 'start') `
    -RedirectStandardOutput (Join-Path $Work 'pg_ctl.out') -RedirectStandardError (Join-Path $Work 'pg_ctl.err')
  $null = $process.Handle
  if (-not $process.WaitForExit(90 * 1000)) { throw 'pg_ctl was still starting the database after 90 s' }
  if ($process.ExitCode -ne 0) { throw "The database did not start (pg_ctl exit code $($process.ExitCode))" }
}

function Stop-Database([string] $Bin) {
  Invoke-Tool 'Stopping the database' (Join-Path $Bin 'pg_ctl.exe') @('-D', $Cluster, '-m', 'fast', '-w', '-t', '30', 'stop')
}

function Invoke-Sql([string] $Bin, [string] $Name, [string] $Sql) {
  $output = & (Join-Path $Bin 'psql.exe') @Connection -d $Name -X -q -At -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "This SQL failed on database ${Name}: $Sql" }
  $output
}

# The migrations are inside the installed backend, as the app ships them.
function Export-Migrations([string] $Version) {
  $folder = Join-Path $Work "migrations\$Version"
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $jar = [IO.Compression.ZipFile]::OpenRead((Join-Path $Resources 'backend\tf-api.jar'))
  try {
    foreach ($entry in $jar.Entries) {
      if ($entry.FullName -match '^BOOT-INF/classes/db/migration/(V\d+__[^/]+\.sql)$') {
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $folder $Matches[1]), $true)
      }
    }
  } finally {
    $jar.Dispose()
  }
  $count = @(Get-MigrationFiles $Version).Count
  if ($count -lt 1) { throw "No migration found in the backend of $Version" }
}

function Get-MigrationFiles([string] $Version) {
  @(Get-ChildItem -LiteralPath (Join-Path $Work "migrations\$Version") -Filter 'V*.sql' |
    Sort-Object { [int] ($_.Name -replace '^V(\d+)__.*$', '$1') })
}

# One transaction each, in order: what Flyway does with them when the backend starts, without the backend, which needs
# an account.
function Invoke-Migrations([string] $Bin, [object[]] $Files) {
  foreach ($file in $Files) {
    & (Join-Path $Bin 'psql.exe') @Connection -d $Database -X -q -v ON_ERROR_STOP=1 --single-transaction -f $file.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Migration $($file.Name) did not apply on the embedded PostgreSQL" }
  }
}

function Get-RowCounts([string] $Bin, [string] $Name) {
  $script = Join-Path $Work 'count-rows.sql'
  Set-Content -LiteralPath $script -Encoding ascii -Value @'
SELECT format('SELECT %L, count(*) FROM %I.%I', schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename
\gexec
'@
  $output = & (Join-Path $Bin 'psql.exe') @Connection -d $Name -X -q -At -F '|' -v ON_ERROR_STOP=1 -f $script
  if ($LASTEXITCODE -ne 0) { throw "Counting the rows of database $Name failed" }
  @($output | Where-Object { $_ })
}

function Confirm-VectorSearch([string] $Bin, [string] $Name) {
  $plan = (Invoke-Sql $Bin $Name $VectorPlanQuery) -join ' '
  if ($plan -notmatch 'launch_checklist_hnsw') { throw "Database ${Name}: the vector search does not use its index: $plan" }
  $nearest = @(Invoke-Sql $Bin $Name "SELECT id FROM launch_checklist ORDER BY embedding <=> '[1,0,0]' LIMIT 5")
  if ($nearest.Count -ne 5) { throw "Database ${Name}: the vector search returned $($nearest.Count) rows instead of 5" }
}

# -------------------------------------------------- What runs without an account --------------------------------------------------

# As Frontend.start (desktop/src/frontend.ts): the Next server of the interface, run by the app's own executable.
function Test-Interface {
  $port = 55481
  $variables = @{ ELECTRON_RUN_AS_NODE = '1'; NODE_ENV = 'production'; PORT = "$port"; HOSTNAME = '127.0.0.1'; NEXT_TELEMETRY_DISABLED = '1' }
  foreach ($name in $variables.Keys) { Set-Item -LiteralPath "Env:$name" -Value $variables[$name] }
  $server = Start-Process -FilePath $AppExe -NoNewWindow -PassThru -ArgumentList "`"$(Join-Path $Resources 'frontend\server.js')`"" `
    -RedirectStandardOutput (Join-Path $Evidence 'interface.log') -RedirectStandardError (Join-Path $Evidence 'interface-errors.log')
  foreach ($name in $variables.Keys) { Remove-Item -LiteralPath "Env:$name" }
  try {
    $response = Wait-For 'the interface server to answer' 60 {
      if ($server.HasExited) { throw 'The interface server stopped while starting' }
      try { Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -MaximumRedirection 0 -SkipHttpErrorCheck -TimeoutSec 5 } catch { $null }
    }
    if ($response.StatusCode -ge 500) { throw "The interface server answered $($response.StatusCode)" }
    $asset = [regex]::Match($response.Content, '/_next/static/[^"'' ]+\.(?:js|css)').Value
    if ($asset) {
      $file = Invoke-WebRequest -Uri "http://127.0.0.1:$port$asset" -SkipHttpErrorCheck -TimeoutSec 10
      if ($file.StatusCode -ne 200) { throw "The interface server answered $($file.StatusCode) for one of its own files: $asset" }
    }
    "the interface server answered $($response.StatusCode)$(if ($asset) { ' and served its own files' })"
  } finally {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  }
}

# -------------------------------------------------- What the machine must already have --------------------------------------------------

# The runner has the Microsoft Visual C++ runtime in System32. Windows does not guarantee it: an app has to bring it. It is
# hidden for the time of the probe, so that the programs run as on a computer that never installed it.
function Hide-VisualCppRuntime {
  $hidden = @()
  $runtime = Get-ChildItem -LiteralPath (Join-Path $env:SystemRoot 'System32') -File |
    Where-Object Name -Match '^(vcruntime140(_\d|_threads)?|msvcp140(_\d|_atomic_wait|_codecvt_ids)?|concrt140|vccorlib140|vcomp140)\.dll$'
  foreach ($file in $runtime) {
    takeown.exe /a /f $file.FullName | Out-Null
    icacls.exe $file.FullName /grant '*S-1-5-32-544:F' | Out-Null
    Rename-Item -LiteralPath $file.FullName -NewName "$($file.Name).hidden"
    $hidden += "$($file.FullName).hidden"
  }
  $hidden
}

function Restore-VisualCppRuntime([string[]] $Hidden) {
  foreach ($file in $Hidden) { Rename-Item -LiteralPath $file -NewName ([IO.Path]::GetFileNameWithoutExtension($file)) }
}

# The exit code of a program asked for its version, as a hexadecimal Windows status when it could not even load.
function Test-Program([string] $Path) {
  $process = Start-Process -FilePath $Path -ArgumentList '--version' -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $Work 'probe.out') -RedirectStandardError (Join-Path $Work 'probe.err')
  $null = $process.Handle
  if (-not $process.WaitForExit(30 * 1000)) {
    $process.Kill()
    return 'still waiting after 30 s'
  }
  if ($process.ExitCode -eq 0) { return 'ok' }
  'exit code 0x{0:X8}' -f $process.ExitCode
}

# -------------------------------------------------- The steps --------------------------------------------------

if ($Step -notin 'versions', 'download', 'verdict') { Use-BareEnvironment }

switch ($Step) {
  'versions' {
    Invoke-Check 'Versions' {
      $tags = gh release list --repo $env:GITHUB_REPOSITORY --limit 300 --exclude-drafts --json tagName | ConvertFrom-Json
      if ($LASTEXITCODE -ne 0) { throw 'Could not list the GitHub Releases' }
      $published = @($tags | ForEach-Object { if ($_.tagName -match '^desktop-v(\d+\.\d+\.\d+)$') { [version] $Matches[1] } } | Sort-Object)
      if ($published.Count -lt 2) { throw 'Fewer than two desktop versions are published' }
      $next = if ($env:TO_INPUT) { ConvertTo-Version $env:TO_INPUT } else { $published[-1] }
      $previous = if ($env:FROM_INPUT) { ConvertTo-Version $env:FROM_INPUT } else { @($published | Where-Object { $_ -lt $next })[-1] }
      foreach ($version in $previous, $next) { if ($version -notin $published) { throw "Desktop $version is not published" } }
      if ($previous -ge $next) { throw "The update must go forward: $previous to $next" }
      Add-Content -LiteralPath $env:GITHUB_ENV -Value "FROM_VERSION=$previous", "TO_VERSION=$next"
      Add-Summary "# Desktop launch checklist: $previous to $next"
      Add-Summary ''
      "From $previous to $next, on a fresh $((Get-CimInstance Win32_OperatingSystem).Caption) runner, with only what is published on GitHub."
    }
  }

  'download' {
    Invoke-Check 'Published installers' {
      foreach ($version in $From, $To) {
        $folder = Join-Path $Installers $version
        New-Item -ItemType Directory -Force -Path $folder | Out-Null
        gh release download "desktop-v$version" --repo $env:GITHUB_REPOSITORY --pattern "TaskForce-Setup-$version.exe" --pattern 'latest.yml' --dir $folder | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Could not download the installer of $version" }
        $manifest = Get-Content -LiteralPath (Join-Path $folder 'latest.yml') -Raw
        if ($manifest -notmatch '(?m)^version:\s*(\S+)' -or $Matches[1] -ne $version) { throw "The update file of $version names another version" }
        if ($manifest -notmatch '(?m)^sha512:\s*(\S+)') { throw "The update file of $version has no checksum" }
        $published = $Matches[1]
        $actual = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath (Get-SetupPath $version) -Algorithm SHA512).Hash))
        if ($actual -ne $published) { throw "The installer of $version does not match the checksum published next to it" }
      }
      "Both installers come from the GitHub Releases and match the SHA-512 the updater would check."
    }
  }

  'clean-install' {
    Invoke-Check 'Clean install' {
      foreach ($trace in $InstallDir, $UserData) {
        if (Test-Path -LiteralPath $trace) { throw "This machine has already seen TaskForce: $trace exists" }
      }
      if (Get-UninstallEntry) { throw 'This machine has already seen TaskForce: it is in the list of programs' }
      $seconds = Invoke-Installer $From @('/S')
      Confirm-Installation $From
      Save-Listing (Get-Listing $InstallDir -WithoutHash) "program-files-$From.csv"
      "The installer of $From ran silently (exit code 0, $seconds s) on a machine with no trace of TaskForce. The program, with its Java, backend, PostgreSQL, interface and runner, is in the user's Programs folder, its two shortcuts exist, and the executable, the app's package.json and the list of programs all say $From."
    }
  }

  'first-start' {
    Invoke-Check 'First start' {
      $line = Test-Start $From "1-sign-in-$From"
      "TaskForce $From started and wrote '$line' in its log, opened the window '$SignInTitle' with its sign-in page loaded from the app's own files and its Sign in button usable, then closed with exit code 0 and no crash report."
    }
  }

  'first-database' {
    Invoke-Check 'Embedded database of the previous version' {
      $bin = Join-Path $Resources 'postgres\bin'
      New-Item -ItemType Directory -Force -Path (Split-Path $DbLog) | Out-Null
      [IO.File]::WriteAllText($PasswordFile, [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
      Set-DatabaseEnvironment
      # The options of EmbeddedPostgres.initdb (desktop/src/postgres.ts).
      Invoke-Tool 'initdb' (Join-Path $bin 'initdb.exe') @('-D', $Cluster, '-U', $DbUser, '-A', 'scram-sha-256', "--pwfile=$PasswordFile",
        '-E', 'UTF8', '--locale-provider=builtin', '--builtin-locale=C.UTF-8')
      Start-Database $bin
      try {
        Invoke-Sql $bin 'postgres' "CREATE DATABASE $Database" | Out-Null
        Export-Migrations $From
        $migrations = Get-MigrationFiles $From
        Invoke-Migrations $bin $migrations
        $pgvector = Invoke-Sql $bin $Database "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
        if (-not $pgvector) { throw 'The migrations applied, but pgvector is not loaded' }
        Invoke-Sql $bin $Database $ChecklistTable | Out-Null
        Confirm-VectorSearch $bin $Database
        $tables = Invoke-Sql $bin $Database "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
        [IO.File]::WriteAllText($FingerprintFile, (Invoke-Sql $bin $Database $FingerprintQuery))
      } finally {
        Stop-Database $bin
      }
      "The PostgreSQL installed with $From created a database in the user data folder, with the app's own options, and started by itself. The $($migrations.Count) migrations inside the installed backend applied ($tables tables), pgvector $pgvector loaded, and $ChecklistRows rows with vectors were written and found through a vector index."
    }
  }

  'update' {
    Invoke-Check 'Update' {
      [IO.File]::WriteAllText($Marker, "TaskForce launch checklist, run $env:GITHUB_RUN_ID. This file must survive the update.")
      $before = Get-Listing $UserData
      $logBefore = [IO.File]::ReadAllText($LogFile)
      Save-Listing $before 'user-data-before-update.csv'

      # The arguments the app gives the installer when a person clicks "Restart now" (desktop/src/updater.ts, installNow).
      $seconds = Invoke-Installer $To @('--updated', '/S', '--force-run')
      Confirm-Installation $To
      Save-Listing (Get-Listing $InstallDir -WithoutHash) "program-files-$To.csv"

      # With --force-run the installer opens the app again by itself.
      Wait-For "the installer to open TaskForce $To again" 120 { @(Get-StartLines $To).Count -gt 0 } | Out-Null
      Wait-For 'the window "Sign in to TaskForce" after the update' 120 { Get-SignInWindow } | Out-Null
      Close-App
      Confirm-NoCrash

      # Started once more by hand, to read the page in its window.
      $line = Test-Start $To "2-sign-in-$To"

      $after = Get-Listing $UserData
      Save-Listing $after 'user-data-after-update.csv'
      $now = @{}
      foreach ($file in $after) { $now[$file.Path] = $file }

      # What belongs to the person must come through to the byte. The rest of the folder is the browser profile of the
      # window, which each start rewrites.
      $theirs = @($before | Where-Object { $_.Path -like 'accounts\*' -or $_.Path -eq (Split-Path $Marker -Leaf) })
      $lost = @($theirs | Where-Object { -not $now.ContainsKey($_.Path) })
      if ($lost) { throw "The update lost $($lost.Count) file(s) of the user data, the first being $($lost[0].Path)" }
      $changed = @($theirs | Where-Object { $now[$_.Path].Sha256 -ne $_.Sha256 })
      if ($changed) { throw "The update changed $($changed.Count) file(s) of the user data, the first being $($changed[0].Path)" }

      if (-not [IO.File]::ReadAllText($LogFile).StartsWith($logBefore, [StringComparison]::Ordinal)) {
        throw "The app's log no longer starts with what the first version wrote"
      }

      $profileFiles = @($before | Where-Object { $_ -notin $theirs -and $_.Path -notlike 'logs\*' })
      $kept = @($profileFiles | Where-Object { $now.ContainsKey($_.Path) })
      "The installer of $To, run with the arguments the app gives it, replaced $From silently (exit code 0, $seconds s) and the installed files now say $To. It opened the app again by itself, and '$line' reached the same sign-in window. The user data came through: the marker and the $($theirs.Count - 1) files of the database folder are identical to the byte, the log keeps every line of the first run, and $($kept.Count) of the $($profileFiles.Count) files of the window's browser profile are still there."
    }
  }

  'updated-database' {
    Invoke-Check 'Embedded database after the update' {
      $bin = Join-Path $Resources 'postgres\bin'
      Set-DatabaseEnvironment
      Export-Migrations $To
      $old = Get-MigrationFiles $From
      $new = Get-MigrationFiles $To

      # Flyway refuses a database whose applied migrations have changed since: the app would not start after the update.
      $folder = Join-Path $Work "migrations\$To"
      foreach ($file in $old) {
        $target = Join-Path $folder $file.Name
        if (-not (Test-Path -LiteralPath $target)) { throw "Migration $($file.Name), shipped with $From, is gone from $To" }
        if (((Get-Content -LiteralPath $file.FullName -Raw) -replace "`r`n", "`n") -cne ((Get-Content -LiteralPath $target -Raw) -replace "`r`n", "`n")) {
          throw "Migration $($file.Name), shipped with $From, was changed in $To"
        }
      }
      $added = @($new | Where-Object { $_.Name -notin $old.Name })

      Start-Database $bin
      try {
        $expected = [IO.File]::ReadAllText($FingerprintFile)
        $found = Invoke-Sql $bin $Database $FingerprintQuery
        if ($found -ne $expected) { throw "The rows written by $From are not the same under $To" }

        # The copy the app makes before a migration (desktop/src/backup.ts), then a restore into a second database.
        $backups = Join-Path $DataDir 'backups'
        New-Item -ItemType Directory -Force -Path $backups | Out-Null
        $dump = Join-Path $backups "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss'))-before-$To.dump"
        Invoke-Tool 'pg_dump' (Join-Path $bin 'pg_dump.exe') (@($Connection) + @('-d', $Database, '-Fc', '-f', $dump))
        Invoke-Sql $bin 'postgres' 'CREATE DATABASE taskforce_restored' | Out-Null
        Invoke-Tool 'pg_restore' (Join-Path $bin 'pg_restore.exe') (@($Connection) + @('-d', 'taskforce_restored', '--exit-on-error', $dump))

        $source = Get-RowCounts $bin $Database
        $restored = Get-RowCounts $bin 'taskforce_restored'
        Set-Content -LiteralPath (Join-Path $Evidence 'row-counts-original.txt') -Value $source
        Set-Content -LiteralPath (Join-Path $Evidence 'row-counts-restored.txt') -Value $restored
        if ($source.Count -eq 0) { throw 'No table to compare' }
        $differences = @(Compare-Object -ReferenceObject $source -DifferenceObject $restored)
        if ($differences) { throw "The restored database differs in $($differences.Count) table line(s), the first being $($differences[0].InputObject)" }
        if ((Invoke-Sql $bin 'taskforce_restored' $FingerprintQuery) -ne $expected) { throw 'The rows of the restored database are not the same as the original' }
        Confirm-VectorSearch $bin 'taskforce_restored'
        $rows = ($source | ForEach-Object { [long] ($_ -split '\|')[-1] } | Measure-Object -Sum).Sum

        Invoke-Migrations $bin $added
        Confirm-VectorSearch $bin $Database
        if ((Invoke-Sql $bin $Database $FingerprintQuery) -ne $expected) { throw "The rows changed when the migrations of $To applied" }
      } finally {
        Stop-Database $bin
      }
      $size = [math]::Round((Get-Item -LiteralPath $dump).Length / 1KB)
      "The PostgreSQL of $To opened the database created by $From and found the same rows. A copy made as the app makes it ($size KB), restored into a second database, has the same row count in all $($source.Count) tables ($rows rows, the app's own tables being empty without an account) and the same vectors, found through their rebuilt index. None of the $($old.Count) migrations of $From has changed, and the $($added.Count) new one(s) of $To applied on top."
    }
  }

  'without-account' {
    Invoke-Check 'As far as no account goes' {
      $java = Join-Path $Resources 'jre\bin\java.exe'
      $javaSays = @(& $java --version)
      if ($LASTEXITCODE -ne 0) { throw 'The installed Java did not run' }
      $interface = Test-Interface
      "The installed Java runs ($($javaSays[0])) and $interface. That is as far as a run without an account goes: the backend serves a signed-in person, and this run has none, so it is not started."
    }
  }

  'no-visual-cpp' {
    Invoke-Check 'On a computer without the Visual C++ runtime' {
      # So that a program that cannot load fails at once instead of waiting behind a system dialog.
      Add-Type -Namespace Checklist -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);'
      [void] [Checklist.Native]::SetErrorMode(1)

      $bin = Join-Path $Resources 'postgres\bin'
      $tools = 'initdb', 'pg_ctl', 'postgres', 'pg_dump', 'pg_restore', 'psql'
      $hidden = Hide-VisualCppRuntime
      try {
        $results = foreach ($tool in $tools) { [pscustomobject] @{ Tool = $tool; Result = Test-Program (Join-Path $bin "$tool.exe") } }
        $java = Test-Program (Join-Path $Resources 'jre\bin\java.exe')
        $window = Test-Start $To "3-sign-in-without-visual-cpp"
      } finally {
        Restore-VisualCppRuntime $hidden
      }
      $results | Format-Table -AutoSize | Out-Host
      Write-Host "Hidden: $($hidden -join ', ')"
      Write-Host "App: $window"
      if ($java -ne 'ok') { throw "With the Visual C++ runtime hidden, the installed Java does not start ($java)" }
      $broken = @($results | Where-Object Result -NE 'ok')
      if ($broken) {
        $failures = ($broken | Group-Object Result | ForEach-Object { "$($_.Group.Tool -join ', ') ($($_.Name))" }) -join '; '
        throw "With the Visual C++ runtime hidden, as on a computer that never installed it, the app and its Java still start, but $($broken.Count) of the $($tools.Count) tools of its PostgreSQL cannot load: $failures. 0xC0000135 means a DLL is missing: the runtime, which neither the installer nor the bundle brings. On such a computer the app would stop right after sign-in, when it creates its database."
      }
      "With the Visual C++ runtime hidden, as on a computer that never installed it, the app reaches its sign-in window, its Java runs and the six tools of its PostgreSQL load: the program brings what it needs."
    }
  }

  'uninstall' {
    Invoke-Check 'Uninstall' {
      if (-not (Test-Path -LiteralPath $Marker)) { throw 'The marker is gone before the uninstall' }
      $entry = Get-UninstallEntry
      if ($entry.QuietUninstallString -notmatch '^"([^"]+)"\s*(.*)$') { throw "Unexpected uninstall command: $($entry.QuietUninstallString)" }
      $process = Start-Process -FilePath $Matches[1] -ArgumentList $Matches[2] -Wait -PassThru
      if ($process.ExitCode -ne 0) { throw "The uninstaller ended with exit code $($process.ExitCode)" }
      Wait-For 'the program folder to go' 60 { -not (Test-Path -LiteralPath $InstallDir) } | Out-Null
      if (Get-UninstallEntry) { throw 'TaskForce is still in the list of programs' }
      $left = @(Get-Shortcuts | Where-Object { Test-Path -LiteralPath $_ })
      if ($left) { throw "Shortcuts left behind: $($left -join ', ')" }

      if (-not (Test-Path -LiteralPath $Marker)) { throw 'The uninstaller removed the marker from the user data' }
      if (-not (Test-Path -LiteralPath (Join-Path $Cluster 'PG_VERSION'))) { throw 'The uninstaller removed the database from the user data' }
      $files = @(Get-ChildItem -LiteralPath $UserData -Recurse -File -Force)
      $size = [math]::Round(($files | Measure-Object -Property Length -Sum).Sum / 1MB)
      $names = (Get-ChildItem -LiteralPath $UserData -Force | Sort-Object Name | ForEach-Object Name) -join ', '
      Save-Listing (Get-Listing $UserData) 'user-data-after-uninstall.csv'
      "The uninstaller ended with exit code 0 and removed the program folder, the entry in the list of programs and both shortcuts. It left the user data in place, as it should since the data belongs to the person: $($files.Count) files, $size MB in %APPDATA%\TaskForce ($names), the marker and the database included."
    }
  }

  'verdict' {
    $steps = $env:CHECKLIST_STEPS | ConvertFrom-Json
    $failed = @($steps.PSObject.Properties | Where-Object { $_.Value.outcome -eq 'failure' } | ForEach-Object Name)
    Add-Summary ''
    if ($env:CHECKLIST_STATUS -ne 'success') {
      Add-Summary "**Result: the checklist did not finish. It stopped at: $(if ($failed) { $failed -join ', ' } else { $env:CHECKLIST_STATUS }).**"
    } elseif ($failed) {
      Add-Summary "**Result: every step of the checklist passed, but $($failed -join ', ') found a problem, described above.** The evidence is in the artifact of this run."
    } else {
      Add-Summary '**Result: every step passed.** The evidence (screenshots, the logs of the app, listings of its folders) is in the artifact of this run.'
    }
  }
}

# The result of a step is its summary line, not the exit code of the last program it happened to run.
exit 0
