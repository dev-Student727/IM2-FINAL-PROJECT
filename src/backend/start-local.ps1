$ErrorActionPreference = 'Stop'

$backendDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $backendDirectory

$apiPortOpen = Test-NetConnection -ComputerName '127.0.0.1' -Port 5000 `
    -InformationLevel Quiet -WarningAction SilentlyContinue

if ($apiPortOpen) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/health' -TimeoutSec 3
    } catch {
        throw "Port 5000 is occupied, but the Flask health endpoint failed: $($_.Exception.Message)"
    }

    if ($health.status -ne 'ok') {
        throw 'Port 5000 is occupied by a service that is not the MRB-POS Flask backend.'
    }

    Write-Host 'MRB-POS Flask backend is already running on port 5000.'
    exit 0
}

Write-Host 'Waiting for XAMPP MariaDB on 127.0.0.1:3306. Start MySQL in XAMPP Control Panel.'
while (-not (Test-NetConnection -ComputerName '127.0.0.1' -Port 3306 `
        -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    Start-Sleep -Seconds 2
}

Write-Host 'XAMPP MariaDB is reachable. Checking the configured database...'
python -c "from app import connect_to_database; connection = connect_to_database(); connection.close(); print('Database connection verified.')"
if ($LASTEXITCODE -ne 0) {
    throw 'The XAMPP database check failed. Review src/backend/.env and the MySQL credentials.'
}

Write-Host 'Starting MRB-POS Flask backend on http://127.0.0.1:5000.'
python app.py
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
