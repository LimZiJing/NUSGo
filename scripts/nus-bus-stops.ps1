param(
    [Parameter(Position = 0)]
    [string] $Command = 'bus-stops'
)

$ErrorActionPreference = 'Stop'

if ($Command -ne 'bus-stops') {
    throw "Only the bus-stops command is currently supported."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
$dotenv = @{}

if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $key = $matches[1]
            $value = $matches[2]
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $dotenv[$key] = $value
        }
    }
}

function Get-Setting([string] $Name, [string] $Fallback = '') {
    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue.Trim()
    }
    if ($dotenv.ContainsKey($Name)) {
        return $dotenv[$Name].Trim()
    }
    return $Fallback
}

function Require-Setting([string] $Name) {
    $value = Get-Setting $Name
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing $Name. Copy .env.example to .env and fill in the required values."
    }
    return $value
}

$proxyBaseUrl = Require-Setting 'NUS_BUS_PROXY_BASE_URL'
$apiKey = Require-Setting 'NUS_X_API_KEY'
$jwt = Require-Setting 'NUS_UNIVUS_JWT'
$userId = Require-Setting 'NUS_USER_ID'
$deviceId = Get-Setting 'NUS_DEVICE_ID'
if ([string]::IsNullOrWhiteSpace($deviceId)) {
    $deviceId = [guid]::NewGuid().ToString()
}
$domain = Get-Setting 'NUS_DOMAIN' 'PUBLIC'
$ipaddr = Get-Setting 'NUS_IPADDR' '0.0.0.0'
$version = Get-Setting 'NUS_APP_VERSION' '2.56.0'

$body = [ordered]@{
    deviceid = $deviceId
    domain   = $domain
    ipaddr   = $ipaddr
    token    = $jwt
    userid   = $userId
    version  = $version
} | ConvertTo-Json -Compress

$curlArgs = @(
    '-sS'
    '-X', 'POST'
    "$proxyBaseUrl/univus/api/bus-proxy/bus-stops"
    '-H', "Authorization: Bearer $jwt"
    '-H', "X-API-KEY: $apiKey"
    '-H', 'Content-Type: application/json; charset=utf-8'
    '--data-raw', $body
)

$response = & curl.exe @curlArgs
if ($LASTEXITCODE -ne 0) {
    throw "curl.exe failed with exit code $LASTEXITCODE"
}

try {
    ($response -join [Environment]::NewLine) | ConvertFrom-Json | ConvertTo-Json -Depth 20
} catch {
    $response
}
