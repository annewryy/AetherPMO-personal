# AetherPMO Git Auto-Update Watcher Script
# This script monitors files in the directory and automatically commits/pushes changes to GitHub.

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Starting Git Auto-Update Watcher in $scriptPath..." -ForegroundColor Cyan

# 1. Initialize Git Repository if not initialized
if (!(Test-Path ".git")) {
    Write-Host "Initializing Git Repository..." -ForegroundColor Yellow
    git init
}

# 2. Configure Remote Origin
$remoteUrl = "https://github.com/annewryy/AetherPMS.git"
$currentRemote = git remote get-url origin 2>$null
if ($null -eq $currentRemote) {
    Write-Host "Connecting to remote origin: $remoteUrl" -ForegroundColor Yellow
    git remote add origin $remoteUrl
} elseif ($currentRemote -ne $remoteUrl) {
    Write-Host "Updating remote origin to: $remoteUrl" -ForegroundColor Yellow
    git remote set-url origin $remoteUrl
}

# Ensure on main branch
$branch = git branch --show-current
if ($branch -ne "main") {
    Write-Host "Setting default branch to main..." -ForegroundColor Yellow
    git checkout -b main 2>$null
    git branch -M main
}

# 3. Create Function to Commit and Push
function Sync-ToGitHub {
    param(
        [string]$Path
    )
    
    # Wait briefly to let write locks release
    Start-Sleep -Milliseconds 500
    
    # Check if there are changes
    $status = git status --porcelain
    if ([string]::IsNullOrEmpty($status)) {
        return
    }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitMsg = "auto update: $timestamp"
    
    Write-Host "`n[$(Get-Date -Format "HH:mm:ss")] Change detected in path: $Path" -ForegroundColor Yellow
    Write-Host "Staging and committing changes..." -ForegroundColor Gray
    
    git add -A
    git commit -m $commitMsg
    
    Write-Host "Pushing to GitHub (main branch)..." -ForegroundColor Yellow
    
    # Capture standard error to output push failures
    $pushOutput = git push origin main 2>&1
    
    $isSuccess = $LASTEXITCODE -eq 0
    if ($isSuccess) {
        Write-Host "Successfully synced to GitHub! ($commitMsg)" -ForegroundColor Success
    } else {
        Write-Host "Push failed with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Error Output:" -ForegroundColor DarkRed
        Write-Host $pushOutput -ForegroundColor Red
        
        if ($pushOutput -match "Permission to .* denied" -or $pushOutput -match "could not read Username" -or $pushOutput -match "Authentication failed") {
            Write-Host "`n[Authentication Assistance]" -ForegroundColor Magenta
            Write-Host "GitHub push failed due to authentication. Please check:" -ForegroundColor Yellow
            Write-Host "1. Ensure you have push access rights to the repository: $remoteUrl" -ForegroundColor Gray
            Write-Host "2. Try running 'git push origin main' manually in your terminal to authenticate." -ForegroundColor Gray
            Write-Host "3. If using a Personal Access Token (PAT), store credentials with: git config --global credential.helper manager" -ForegroundColor Gray
        }
    }
}

# Run once initially to capture any existing uncommitted changes
Sync-ToGitHub "Startup"

# 4. FileSystemWatcher Setup
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $scriptPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Filter out changes to git repository internal folder, watcher script itself, and backup files
$filterAction = {
    param($FullPath)
    if ($FullPath -match "\\\.git" -or $FullPath -match "git_watcher\.ps1" -or $FullPath -match "\.bak$") {
        return $false
    }
    return $true
}

$action = {
    $path = $Event.SourceEventArgs.FullPath
    if (&$filterAction $path) {
        Sync-ToGitHub $path
    }
}

Register-ObjectEvent $watcher -EventName "Changed" -Action $action | Out-Null
Register-ObjectEvent $watcher -EventName "Created" -Action $action | Out-Null
Register-ObjectEvent $watcher -EventName "Deleted" -Action $action | Out-Null
Register-ObjectEvent $watcher -EventName "Renamed" -Action $action | Out-Null

Write-Host "Monitoring folder for changes. Press Ctrl+C to stop watcher script." -ForegroundColor Green

# Keep script running to listen to events
while ($true) {
    Start-Sleep -Seconds 1
}
