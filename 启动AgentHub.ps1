# AgentHub launcher
$ErrorActionPreference = "Stop"

$workDir = "C:\Users\xiong\Documents\Codex\2026-06-16\5-82-kkc-agent-agenthub-https-3\kkc-agent"
$electronBin = "$workDir\node_modules\.pnpm\electron@33.4.11\node_modules\electron\dist\electron.exe"
$launcherLogDir = Join-Path $workDir '.launcher-logs'
$launcherLogPath = Join-Path $launcherLogDir ("launch-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

New-Item -ItemType Directory -Path $launcherLogDir -Force | Out-Null

function Write-LauncherLog {
    param([string]$Message)

    Add-Content -LiteralPath $launcherLogPath -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Test-DevServerHealthy {
    param(
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Get-FreePort {
    param(
        [string]$Address = '127.0.0.1'
    )

    $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Parse($Address)), 0
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Clear-NextCache {
    $cacheDir = Join-Path (Join-Path $workDir '.next') 'cache'
    Remove-Item -LiteralPath $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
}

function Get-DevServerCandidates {
    $candidates = @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and
        $_.CommandLine -match [regex]::Escape($workDir) -and
        (
            $_.CommandLine -match 'next\s+dev' -or
            $_.CommandLine -match 'next\\dist\\server\\lib\\start-server\.js'
        )
    })

    return $candidates
}

function Get-HealthyDevServerFromCandidates {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Candidates
    )

    foreach ($candidate in $Candidates) {
        $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $candidate.ProcessId -ErrorAction SilentlyContinue)
        foreach ($listener in $listeners) {
            if (-not $listener.LocalPort) {
                continue
            }

            $url = "http://localhost:$($listener.LocalPort)"
            if (Test-DevServerHealthy -Url $url) {
                return [pscustomobject]@{
                    url = $url
                    port = [int]$listener.LocalPort
                    processId = [int]$candidate.ProcessId
                }
            }
        }
    }

    return $null
}

function Wait-ForHealthyDevServer {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Candidates,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $healthy = Get-HealthyDevServerFromCandidates -Candidates $Candidates
        if ($healthy) {
            return $healthy
        }

        Start-Sleep -Seconds 2
        $Candidates = @(Get-DevServerCandidates)
        if ($Candidates.Count -eq 0) {
            return $null
        }
    }

    return $null
}

$launcherMutex = New-Object System.Threading.Mutex($false, 'Global\AgentHub.AgentHubLauncher')
$hasLauncherLock = $false

try {
    $hasLauncherLock = $launcherMutex.WaitOne(0, $false)
    if (-not $hasLauncherLock) {
        Write-LauncherLog 'Another launcher instance is already running; exiting.'
        return
    }

    Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Stop-Process -Force

    $devUrl = $null
    $existingCandidates = @(Get-DevServerCandidates)

    if ($existingCandidates.Count -gt 0) {
        Write-LauncherLog ("Found existing dev server candidates: {0}" -f (($existingCandidates | ForEach-Object { $_.ProcessId }) -join ', '))
        $healthyServer = Wait-ForHealthyDevServer -Candidates $existingCandidates -TimeoutSeconds 30
        if ($healthyServer) {
            $devUrl = $healthyServer.url
            Write-LauncherLog ("Reusing dev server {0} (PID {1})" -f $healthyServer.url, $healthyServer.processId)
        } else {
            $stillRunning = @(Get-DevServerCandidates)
            if ($stillRunning.Count -gt 0) {
                throw "Found existing Next dev server in $workDir, but it never became healthy. Check .next\dev\logs\next-development.log."
            }
        }
    }

    if (-not $devUrl) {
        $localDevUrl = 'http://localhost:3000'
        if (Test-DevServerHealthy -Url $localDevUrl) {
            $devUrl = $localDevUrl
            Write-LauncherLog "Reusing healthy dev server at $devUrl"
        }
    }

    if (-not $devUrl) {
        $devPort = Get-FreePort
        $devUrl = "http://localhost:$devPort"
        $devStdout = Join-Path $launcherLogDir ("dev-{0}.stdout.log" -f $devPort)
        $devStderr = Join-Path $launcherLogDir ("dev-{0}.stderr.log" -f $devPort)

        Write-Host "Starting Dev server on $devUrl..."
        Write-LauncherLog "Starting new dev server"
        Clear-NextCache
        $env:AGENTHUB_DEV_URL = $devUrl

        $devProcess = Start-Process -FilePath 'pnpm.cmd' -ArgumentList @('dev', '--port', "$devPort") -WorkingDirectory $workDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $devStdout -RedirectStandardError $devStderr

        $deadline = (Get-Date).AddMinutes(3)
        $ready = $false
        do {
            if (Test-DevServerHealthy -Url $devUrl) {
                $ready = $true
                break
            }

            if ($devProcess.HasExited) {
                $stdout = if (Test-Path $devStdout) { Get-Content -LiteralPath $devStdout -Raw } else { '' }
                $stderr = if (Test-Path $devStderr) { Get-Content -LiteralPath $devStderr -Raw } else { '' }
                throw "Dev server exited early with code $($devProcess.ExitCode).`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
            }

            Write-Host '.' -NoNewline
            Start-Sleep -Seconds 2
        } while ((Get-Date) -lt $deadline)

        if (-not $ready) {
            $stdout = if (Test-Path $devStdout) { Get-Content -LiteralPath $devStdout -Raw } else { '' }
            $stderr = if (Test-Path $devStderr) { Get-Content -LiteralPath $devStderr -Raw } else { '' }
            throw "Dev server on $devUrl did not become healthy within 3 minutes.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
        }

        Write-Host ' Ready!'
    }

    Write-Host 'Launching desktop app...'
    Write-LauncherLog ("Launching desktop app against {0}" -f $devUrl)
    $env:AGENTHUB_DEV = '1'
    $env:AGENTHUB_DEV_URL = $devUrl
    Start-Process -FilePath $electronBin -ArgumentList @('dist-electron\main.js') -WorkingDirectory $workDir -WindowStyle Hidden

    Write-Host 'AgentHub started!'
    Start-Sleep -Seconds 1
} finally {
    if ($hasLauncherLock) {
        try {
            $launcherMutex.ReleaseMutex() | Out-Null
        } catch {
        }
    }
    $launcherMutex.Dispose()
}
