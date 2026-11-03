param(
  [string]$BaseCommit = 'f21964595968dde261973f7e2cb965ce0ba600b7'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the repository root' }
$cacheRoot = Join-Path $repoRoot '.cache/performance-orchestration/real-performance'
$resolvedCacheRoot = [System.IO.Path]::GetFullPath($cacheRoot)
$resolvedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot)
if (-not $resolvedCacheRoot.StartsWith($resolvedRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Measurement output is outside the workspace: $resolvedCacheRoot"
}

$baseRoot = Join-Path $cacheRoot 'base-source'
$combinedRoot = Join-Path $cacheRoot 'combined-source'
$baseDist = Join-Path $cacheRoot 'base-dist'
$combinedDist = Join-Path $cacheRoot 'combined-dist'
$archive = Join-Path $cacheRoot 'base-source.tar'
foreach ($path in @($baseDist, $combinedDist)) {
  if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite existing measurement output: $path" }
}

$null = git rev-parse --verify "$BaseCommit^{commit}"
if ($LASTEXITCODE -ne 0) { throw "Base commit is unavailable: $BaseCommit" }
$timingFile = Join-Path $repoRoot 'frontend/public/data/shuttle-timing.json'
if (Test-Path -LiteralPath $timingFile) {
  $timingItem = Get-Item -LiteralPath $timingFile -Force
  if (($timingItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to snapshot generated data through a link: $timingFile"
  }
}

if ((Test-Path -LiteralPath $baseRoot) -or (Test-Path -LiteralPath $combinedRoot) -or (Test-Path -LiteralPath $archive)) {
  foreach ($path in @($baseRoot, $combinedRoot, $archive)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Prepared snapshot is incomplete: $path" }
  }
  foreach ($snapshotRoot in @($baseRoot, $combinedRoot)) {
    $dependencyLink = Join-Path $snapshotRoot 'node_modules'
    if (-not (Test-Path -LiteralPath $dependencyLink)) { throw "Prepared dependency link is missing: $dependencyLink" }
  }
} else {
  $null = New-Item -ItemType Directory -Path $baseRoot
  $null = New-Item -ItemType Directory -Path $combinedRoot
  & git -C $repoRoot archive --format=tar --output=$archive $BaseCommit frontend shared
  if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
  & tar.exe -xf $archive -C $baseRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not unpack the base source snapshot' }

  # The only live-tree copies are static frontend data and frozen frontend source.
  # No .env files, credentials, user storage or dependency directories are copied.
  $publicSource = Join-Path $repoRoot 'frontend/public'
  $basePublic = Join-Path $baseRoot 'frontend/public'
  $copyResult = & robocopy.exe $publicSource $basePublic /E /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -ge 8) { throw "Could not copy frontend public data: $copyResult" }

  $copyResult = & robocopy.exe $baseRoot $combinedRoot /E /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -ge 8) { throw "Could not create combined source snapshot: $copyResult" }
  $currentSource = Join-Path $repoRoot 'frontend/src'
  $combinedSource = Join-Path $combinedRoot 'frontend/src'
  $copyResult = & robocopy.exe $currentSource $combinedSource /E /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -ge 8) { throw "Could not overlay the combined frontend source: $copyResult" }

  $dependencyRoot = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'node_modules')).Path
  foreach ($snapshotRoot in @($baseRoot, $combinedRoot)) {
    $dependencyLink = Join-Path $snapshotRoot 'node_modules'
    if (Test-Path -LiteralPath $dependencyLink) { throw "Dependency link path already exists: $dependencyLink" }
    $null = New-Item -ItemType Junction -Path $dependencyLink -Target $dependencyRoot
  }
}

$vite = Join-Path $repoRoot 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw "Installed Vite executable is missing: $vite" }
$oldApiOrigin = $env:VITE_API_ORIGIN
$oldDataVersion = $env:VITE_DATA_VERSION
try {
  $env:VITE_API_ORIGIN = 'http://127.0.0.1:3001'
  $env:VITE_DATA_VERSION = 'development'
  foreach ($item in @(
    @{ Name = 'base'; Root = $baseRoot; Output = $baseDist; Cache = $baseViteCache },
    @{ Name = 'combined'; Root = $combinedRoot; Output = $combinedDist; Cache = $combinedViteCache }
  )) {
    Push-Location (Join-Path $item.Root 'frontend')
    try {
      Write-Host "Building $($item.Name) production rehearsal from $BaseCommit"
      & node $vite build --mode local-rehearsal --outDir $item.Output --emptyOutDir
      if ($LASTEXITCODE -ne 0) { throw "$($item.Name) production build failed with exit code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }
} finally {
  $env:VITE_API_ORIGIN = $oldApiOrigin
  $env:VITE_DATA_VERSION = $oldDataVersion
}

Write-Host "Base build: $baseDist"
Write-Host "Combined build: $combinedDist"
