param(
    [Parameter(Position = 0)]
    [string] $Command = 'bus-stops',

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path (Join-Path $projectRoot 'backend') '.env'
$dotenv = @{}
$script:nusSession = $null
$script:nusDeviceId = $null

# Keep provider credentials in the backend environment. Process environment
# variables take precedence so CI and deployment settings can override local
# development defaults.
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
        throw "Missing $Name. Copy backend/.env.example to backend/.env and fill in the required values."
    }
    return $value
}

function Get-ArgumentValue([string] $Name, [string[]] $Aliases) {
    $values = @($Arguments | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($values.Count -eq 1 -and -not [string]::IsNullOrWhiteSpace($values[0])) {
        return $values[0]
    }
    if ($values.Count -eq 2 -and $Aliases -contains $values[0]) {
        return $values[1]
    }
    throw "$Name requires a value, for example: npm run bus:call -- $Command $($Aliases[0]) VALUE"
}

function Assert-NoArguments {
    if (@($Arguments | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
        throw "$Command does not accept additional arguments."
    }
}

function Read-ErrorResponse($ErrorRecord) {
    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) {
        return $null
    }
    try {
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        try {
            $content = $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
        if ([string]::IsNullOrWhiteSpace($content)) {
            return $null
        }
        return $content | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Refresh-NusSession {
    $accessTokenUrl = Get-Setting 'NUS_ACCESS_TOKEN_URL' 'https://myizaac2.nus.edu.sg/univus-public/mobile/get-access-token'
    $htdApi = Require-Setting 'NUS_X_HTD_API'
    $appApi = Require-Setting 'NUS_X_APP_API'
    if ([string]::IsNullOrWhiteSpace($script:nusDeviceId)) {
        $script:nusDeviceId = Get-Setting 'NUS_DEVICE_ID'
        if ([string]::IsNullOrWhiteSpace($script:nusDeviceId)) {
            $script:nusDeviceId = [guid]::NewGuid().ToString()
        }
    }

    $bodyJson = [ordered]@{
        deviceid = $script:nusDeviceId
        ipaddr   = Get-Setting 'NUS_IPADDR' '0.0.0.0'
        version  = Get-Setting 'NUS_APP_VERSION' 'univus_android_2.59.2_140'
    } | ConvertTo-Json -Compress

    try {
        $response = Invoke-RestMethod `
            -Uri $accessTokenUrl `
            -Method Post `
            -Headers @{
                Accept       = 'application/json'
                'X-HTD-API'  = $htdApi
                'X-APP-API'  = $appApi
            } `
            -ContentType 'application/json' `
            -Body $bodyJson
    } catch {
        throw "NUS access-token request failed: $($_.Exception.Message)"
    }

    if ($null -eq $response.data -or
        [string]::IsNullOrWhiteSpace([string]$response.data.token) -or
        [string]::IsNullOrWhiteSpace([string]$response.data.userid) -or
        [string]::IsNullOrWhiteSpace([string]$response.data.domain)) {
        throw 'NUS access-token response did not contain a usable session.'
    }

    $script:nusSession = [pscustomobject]@{
        token  = [string]$response.data.token
        userId = [string]$response.data.userid
        domain = [string]$response.data.domain
    }
    return $script:nusSession
}

function Get-NusSession {
    if ($null -ne $script:nusSession) {
        return $script:nusSession
    }

    $token = Get-Setting 'NUS_UNIVUS_JWT'
    $userId = Get-Setting 'NUS_USER_ID'
    if (-not [string]::IsNullOrWhiteSpace($token) -and -not [string]::IsNullOrWhiteSpace($userId)) {
        if ([string]::IsNullOrWhiteSpace($script:nusDeviceId)) {
            $script:nusDeviceId = Get-Setting 'NUS_DEVICE_ID'
            if ([string]::IsNullOrWhiteSpace($script:nusDeviceId)) {
                $script:nusDeviceId = [guid]::NewGuid().ToString()
            }
        }
        $script:nusSession = [pscustomobject]@{
            token  = $token
            userId = $userId
            domain = Get-Setting 'NUS_DOMAIN' 'PUBLIC'
        }
        return $script:nusSession
    }

    return Refresh-NusSession
}

function Invoke-BusProxyRequest([string] $Uri, [hashtable] $Headers, [string] $BodyJson) {
    try {
        return Invoke-RestMethod `
            -Uri $Uri `
            -Method Post `
            -Headers $Headers `
            -ContentType 'application/json; charset=utf-8' `
            -Body $BodyJson
    } catch {
        $errorResponse = Read-ErrorResponse $_
        if ($null -ne $errorResponse -and [string]$errorResponse.code -eq '10011') {
            return $errorResponse
        }
        throw
    }
}

function Invoke-BusProxy([string] $Endpoint, [hashtable] $Extra = @{}) {
    $proxyBaseUrl = Require-Setting 'NUS_BUS_PROXY_BASE_URL'
    $htdApi = Require-Setting 'NUS_X_HTD_API'
    $appApi = Require-Setting 'NUS_X_APP_API'
    $apiKey = Require-Setting 'NUS_X_API_KEY'
    $session = Get-NusSession

    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        $body = [ordered]@{
            deviceid = $script:nusDeviceId
            domain   = $session.domain
            ipaddr   = Get-Setting 'NUS_IPADDR' '0.0.0.0'
            token    = $session.token
            userid   = $session.userId
            version  = Get-Setting 'NUS_APP_VERSION' 'univus_android_2.59.2_140'
        }
        # Each endpoint adds its own fields while sharing the common UniVus body.
        foreach ($entry in $Extra.GetEnumerator()) {
            $body[$entry.Key] = $entry.Value
        }

        $bodyJson = $body | ConvertTo-Json -Compress
        $headers = @{
            # The API contract requires the raw JWT in token and Bearer here.
            Authorization = "Bearer $($session.token)"
            'X-HTD-API'   = $htdApi
            'X-APP-API'   = $appApi
            'X-API-KEY'   = $apiKey
        }

        # Invoke-RestMethod keeps the JSON string intact. Windows PowerShell can
        # strip JSON quotes when the same body is passed to native curl.exe.
        $response = Invoke-BusProxyRequest `
            -Uri "$proxyBaseUrl/univus/api/bus-proxy/$Endpoint" `
            -Headers $headers `
            -BodyJson $bodyJson

        if ([string]$response.code -eq '10011') {
            if ($attempt -eq 1) {
                throw 'NUS session remained expired after refreshing the token.'
            }
            $session = Refresh-NusSession
            continue
        }

        $response | ConvertTo-Json -Depth 20
        return
    }
}

if ($Command -in @('help', '--help', '-h')) {
    @"
Usage: npm run bus:call -- COMMAND [VALUE]

Commands:
  bus-stops
  active-bus ROUTE_CODE
  bus-location VEHICLE_PLATE
  bus-stops-all-pickups
  checkpoint-bus-stop ROUTE_CODE
  pickup-point ROUTE_CODE
  pickup-point-shuttle-service ROUTE_CODE
  route-min-max-time ROUTE_CODE
  shuttle-service BUS_STOP_NAME
  ticker-tapes

The value may also be passed with the documented option name, for example:
  npm run bus:call -- active-bus --route-code D2
"@
    exit 0
}

switch ($Command) {
    'bus-stops' {
        Assert-NoArguments
        Invoke-BusProxy 'bus-stops'
        break
    }
    'active-bus' {
        Invoke-BusProxy 'active-bus' @{ route_code = Get-ArgumentValue 'route code' @('--route-code', '-RouteCode') }
        break
    }
    'bus-location' {
        Invoke-BusProxy 'bus-location' @{ veh_plate = Get-ArgumentValue 'vehicle plate' @('--vehicle-plate', '-VehiclePlate') }
        break
    }
    'bus-stops-all-pickups' {
        Assert-NoArguments
        Invoke-BusProxy 'bus-stops-all-pickups'
        break
    }
    'checkpoint-bus-stop' {
        Invoke-BusProxy 'checkpoint-bus-stop' @{ route_code = Get-ArgumentValue 'route code' @('--route-code', '-RouteCode') }
        break
    }
    'pickup-point' {
        Invoke-BusProxy 'pickup-point' @{ route_code = Get-ArgumentValue 'route code' @('--route-code', '-RouteCode') }
        break
    }
    'pickup-point-shuttle-service' {
        Invoke-BusProxy 'pickup-point-shuttle-service' @{ route_code = Get-ArgumentValue 'route code' @('--route-code', '-RouteCode') }
        break
    }
    'route-min-max-time' {
        Invoke-BusProxy 'route-min-max-time' @{ route_code = Get-ArgumentValue 'route code' @('--route-code', '-RouteCode') }
        break
    }
    'shuttle-service' {
        Invoke-BusProxy 'shuttle-service' @{ busstopname = Get-ArgumentValue 'bus stop name' @('--bus-stop-name', '-BusStopName') }
        break
    }
    'ticker-tapes' {
        Assert-NoArguments
        Invoke-BusProxy 'ticker-tapes'
        break
    }
    default {
        throw "Unknown command: $Command. Run npm run bus:call -- help."
    }
}
