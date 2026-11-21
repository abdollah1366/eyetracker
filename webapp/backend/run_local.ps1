# Run the FastAPI backend locally with SQLite — no Docker / PostgreSQL needed.
# Usage:  .\run_local.ps1
#         .\run_local.ps1 -Email me@example.com -Password mypass

param(
    [string]$Email = "abdollahbarati66@gmail.com",
    [string]$Password = "12345",
    [int]$Port = 8000
)

Set-Location -Path $PSScriptRoot

# Environment variables take precedence over any .env file.
$env:DATABASE_URL   = "sqlite+pysqlite:///./local.db"
$env:JWT_SECRET     = "local-dev-secret-change-me"
$env:ADMIN_EMAIL    = $Email
$env:ADMIN_PASSWORD = $Password
$env:ADMIN_NAME     = "System Administrator"

$uvicorn = Join-Path $PSScriptRoot '.venv\Scripts\uvicorn.exe'
if (-not (Test-Path $uvicorn)) {
    $uvicorn = 'uvicorn'
}

Write-Host "Backend: http://127.0.0.1:$Port  |  DB: $PSScriptRoot\local.db"
Write-Host "Login:   $Email / $Password"
& $uvicorn app.main:app --reload --port $Port
