[CmdletBinding()]
param(
  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$ImageName = 'gpt-image-playground',

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$Tag = 'dist',

  [Parameter()]
  [switch]$SkipInstall,

  [Parameter()]
  [switch]$NoCache,

  [Parameter()]
  [switch]$BuildOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$image = "${ImageName}:${Tag}"
$viteEnv = [ordered]@{
  VITE_DEFAULT_API_URL = '__VITE_DEFAULT_API_URL_PLACEHOLDER__'
  VITE_API_PROXY_AVAILABLE = '__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__'
  VITE_API_PROXY_LOCKED = '__VITE_API_PROXY_LOCKED_PLACEHOLDER__'
  VITE_DOCKER_DEPLOYMENT = '__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__'
  VITE_DOCKER_LEGACY_API_URL_USED = '__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__'
  VITE_SHOW_PRESET_CONFIG_ONLY = '__VITE_SHOW_PRESET_CONFIG_ONLY_PLACEHOLDER__'
  VITE_LOCK_PRESET_CONFIG_PARAMS = '__VITE_LOCK_PRESET_CONFIG_PARAMS_PLACEHOLDER__'
  VITE_PREVENT_PRESET_CONFIG_DELETION = '__VITE_PREVENT_PRESET_CONFIG_DELETION_PLACEHOLDER__'
}
$composeEnv = [ordered]@{
  IMAGE_NAME = $ImageName
  IMAGE_TAG = $Tag
}
$previousEnv = @{}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm was not found. Install Node.js 20 or later first.'
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'docker was not found. Install and start Docker first.'
}

$ErrorActionPreference = 'Continue'
& docker compose version 2>$null | Out-Null
$dockerComposeExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($dockerComposeExitCode -ne 0) {
  throw 'Docker Compose was not found. Install the docker compose plugin first.'
}

$ErrorActionPreference = 'Continue'
& docker info 2>$null | Out-Null
$dockerInfoExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($dockerInfoExitCode -ne 0) {
  throw 'Cannot connect to the Docker daemon. Make sure Docker is running.'
}

Push-Location $projectRoot
try {
  if (-not $SkipInstall) {
    Write-Host '==> Installing npm dependencies'
    & npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed with exit code $LASTEXITCODE"
    }
  }

  foreach ($name in $viteEnv.Keys) {
    $current = Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    $previousEnv[$name] = @{
      Exists = $null -ne $current
      Value = if ($null -ne $current) { $current.Value } else { $null }
    }
    Set-Item -LiteralPath "Env:$name" -Value $viteEnv[$name]
  }

  foreach ($name in $composeEnv.Keys) {
    $current = Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    $previousEnv[$name] = @{
      Exists = $null -ne $current
      Value = if ($null -ne $current) { $current.Value } else { $null }
    }
    Set-Item -LiteralPath "Env:$name" -Value $composeEnv[$name]
  }

  Write-Host '==> Building dist with runtime placeholders'
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE"
  }

  Write-Host "==> Building Docker image $image with Docker Compose"
  $dockerArgs = @('compose', '-f', 'deploy/docker-compose.dist.yml', 'build')
  if ($NoCache) {
    $dockerArgs += '--no-cache'
  }
  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose build failed with exit code $LASTEXITCODE"
  }

  if (-not $BuildOnly) {
    Write-Host '==> Starting container with Docker Compose'
    & docker compose -f deploy/docker-compose.dist.yml up -d --no-build --force-recreate
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose up failed with exit code $LASTEXITCODE"
    }
  }

  Write-Host ''
  Write-Host "Build completed: $image" -ForegroundColor Green
  if ($BuildOnly) {
    Write-Host 'The image was built without starting the container.'
  } else {
    Write-Host 'Application URL: http://localhost:8080'
    & docker compose -f deploy/docker-compose.dist.yml ps
  }
}
finally {
  foreach ($name in @($viteEnv.Keys) + @($composeEnv.Keys)) {
    if (-not $previousEnv.ContainsKey($name)) {
      continue
    }

    if ($previousEnv[$name].Exists) {
      Set-Item -LiteralPath "Env:$name" -Value $previousEnv[$name].Value
    } else {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
  }
  Pop-Location
}
