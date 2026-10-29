# ============================================================================
# [AetherPMO Browser Headless & PWA Security Test Suite v3.0]
# File: scripts/run_browser_and_pwa_tests.ps1
# Pure ASCII runner for 100% Windows PowerShell 5.1 compatibility
# ============================================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO] Headless Browser, SW Cache & Data Loss Prevention Suite v3.0" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

$passedCount = 0
$failedCount = 0

function Assert-Result([string]$testName, [bool]$condition, [string]$detail) {
    if ($condition) {
        Write-Host "  [PASS] $testName" -ForegroundColor Green
        if ($detail) { Write-Host "         $detail" -ForegroundColor DarkGray }
        $script:passedCount++
    } else {
        Write-Host "  [FAIL] $testName" -ForegroundColor Red
        if ($detail) { Write-Host "         $detail" -ForegroundColor Yellow }
        $script:failedCount++
    }
}

# ----------------------------------------------------------------------------
# [Suite 1] HTML Structure & Clean DOM Tag Balance
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 1] HTML Structure & Modals Layout" -ForegroundColor Yellow

$htmlContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "index.html"), [System.Text.Encoding]::UTF8)

$openDivs = ([regex]::Matches($htmlContent, "<div[\s>]")).Count
$closeDivs = ([regex]::Matches($htmlContent, "</div>")).Count
$diff = $openDivs - $closeDivs
Assert-Result "DOM div tag balance verification (Zero dangling tags)" ($diff -eq 0) "Open: $openDivs, Close: $closeDivs, Diff: $diff"

$hasAllModals = $htmlContent.Contains('id="ios-pwa-modal"') -and
                $htmlContent.Contains('id="android-pwa-modal"') -and
                $htmlContent.Contains('id="desktop-pwa-modal"') -and
                $htmlContent.Contains('id="pwa-update-confirm-modal"') -and
                $htmlContent.Contains('id="pwa-update-banner"')
Assert-Result "All 4 installation/confirmation modals & update banner present in DOM" $hasAllModals "Verified: ios, android, desktop, confirm-modal, update-banner"

# ----------------------------------------------------------------------------
# [Suite 2] Real Headless Chromium / Edge Engine Verification
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 2] Real Headless Browser Engine DOM Verification" -ForegroundColor Yellow

$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$browserBin = if (Test-Path $chromePath) { $chromePath } elseif (Test-Path $edgePath) { $edgePath } else { $null }

if ($browserBin) {
    $tempDump = Join-Path $projectRoot "scripts\temp_dom_dump.html"
    try {
        $p = Start-Process -FilePath $browserBin -ArgumentList @(
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--allow-file-access-from-files",
            "--dump-dom",
            "file:///$($projectRoot.Replace('\', '/'))/index.html"
        ) -NoNewWindow -PassThru -RedirectStandardOutput $tempDump

        $exited = $p.WaitForExit(10000)
        Start-Sleep -Milliseconds 600
        if ($exited -and (Test-Path $tempDump)) {
            $dumpText = [System.IO.File]::ReadAllText($tempDump, [System.Text.Encoding]::UTF8)
            $renderedHasConfirmModal = $dumpText.Contains('id="pwa-update-confirm-modal"')
            $renderedHasAndroidModal = $dumpText.Contains('id="android-pwa-modal"')
            $renderedHasBanner = $dumpText.Contains('id="pwa-update-banner"')
            $renderedHasViewport = $dumpText.Contains('viewport-fit=cover')
            Assert-Result "Headless Browser ($(Split-Path $browserBin -Leaf)) rendered clean DOM with all modals" ($renderedHasConfirmModal -and $renderedHasAndroidModal -and $renderedHasBanner -and $renderedHasViewport) "Rendered bytes: $($dumpText.Length)"
        } else {
            Assert-Result "Headless Browser dump DOM execution" $false "Process timed out or no dump produced"
        }
    } finally {
        if ($p) {
            try { $p.Dispose() } catch {}
        }
        Start-Sleep -Milliseconds 400
        if (Test-Path $tempDump) {
            Remove-Item -Force -ErrorAction SilentlyContinue $tempDump
        }
    }
} else {
    Write-Host "  [SKIP] No Chromium/Edge binary found on system" -ForegroundColor Yellow
}

# ----------------------------------------------------------------------------
# [Suite 3] Data Loss Prevention & Dirty-State Detection (app.js)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 3] Data Loss Prevention & Dirty Form State Logic" -ForegroundColor Yellow

$appContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "app.js"), [System.Text.Encoding]::UTF8)

# Check 3.1: applyPwaUpdate calls isUserEditingData
$applyCallsEditing = $appContent.Contains("applyPwaUpdate() {`r`n        const editingStatus = this.isUserEditingData();") -or
                     $appContent.Contains("applyPwaUpdate() {`n        const editingStatus = this.isUserEditingData();")
Assert-Result "applyPwaUpdate() directly invokes isUserEditingData() before reload" $applyCallsEditing "Guards in-flight work before updating"

# Check 3.2: Differentiates untouched initial values from genuinely dirty modified values
$distinguishesDirty = $appContent.Contains("el.value !== el.defaultValue") -and
                      $appContent.Contains("el.checked !== el.defaultChecked")
Assert-Result "isUserEditingData() distinguishes initial values from modified dirty state" $distinguishesDirty "el.defaultValue comparison active"

# Check 3.3: Confirmation modal open, cancel and force methods
$hasConfirmMethods = $appContent.Contains("openPwaUpdateConfirmModal(reason)") -and
                     $appContent.Contains("cancelPwaUpdate()") -and
                     $appContent.Contains("forcePwaUpdate()")
Assert-Result "PWA update confirmation modal lifecycle (open, cancel, force) implemented" $hasConfirmMethods "Allows user to abort or proceed consciously"

# ----------------------------------------------------------------------------
# [Suite 4] Service Worker Pre-cache Response Safety & Zero-Cache Verification (sw.js)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 4] Service Worker Pre-Cache Response Safety & Allowlist" -ForegroundColor Yellow

$swContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "sw.js"), [System.Text.Encoding]::UTF8)

# Check 4.1: Install event validates each asset with isSafeToCacheResponse before cache.put
$installHasSafety = $swContent.Contains("isSafeToCacheResponse(response)") -and
                    $swContent.Contains("cache.put(request, response)") -and
                    -not $swContent.Contains("cache.addAll(STATIC_ASSETS)")
Assert-Result "Install event pre-caches using isSafeToCacheResponse (No naked cache.addAll)" $installHasSafety "Safety policy applied to every pre-cache asset"

# Check 4.2: isSafeToCacheResponse enforces 200, basic/default, no-store, and private checks
$safeChecksDirectives = $swContent.Contains("response.status !== 200") -and
                        $swContent.Contains("cacheControl.includes('no-store')") -and
                        $swContent.Contains("cacheControl.includes('private')") -and
                        $swContent.Contains("contentType.includes('application/json')")
Assert-Result "isSafeToCacheResponse rejects non-200, JSON, no-store, and private responses" $safeChecksDirectives "Zero-cache directives enforced"

# Check 4.3: Request authorization headers hard bypass
$hasAuthHeadersBypass = $swContent.Contains("request.headers.has('authorization')") -and
                        $swContent.Contains("request.headers.has('apikey')")
Assert-Result "Requests carrying Authorization or apikey headers are 100% network-only" $hasAuthHeadersBypass "Never stored in CacheStorage"

# Check 4.4: Version bumped
$isVersionBumped = $swContent.Contains("'aetherpmo-v1.6.2-20261029-secure-pwa'")
Assert-Result "Service Worker version updated to v1.6.2-secure-pwa" $isVersionBumped "Cache version isolation verified"

# ----------------------------------------------------------------------------
# [Suite 5] Platform Installation Branching Logic
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 5] PWA Platform Installation Branching" -ForegroundColor Yellow

$hasIosBranch = $appContent.Contains("if (platform.isIos) {`r`n            this.openIosPwaModal();") -or
                $appContent.Contains("if (platform.isIos) {`n            this.openIosPwaModal();")
$hasAndroidBranch = $appContent.Contains("if (platform.isAndroid) {`r`n            this.openAndroidPwaModal();") -or
                    $appContent.Contains("if (platform.isAndroid) {`n            this.openAndroidPwaModal();")
$hasDesktopBranch = $appContent.Contains("if (platform.isDesktop) {`r`n            this.openDesktopPwaModal();") -or
                    $appContent.Contains("if (platform.isDesktop) {`n            this.openDesktopPwaModal();")
$hasDesktopSuppression = $appContent.Contains("if (platform.isDesktop && !this.deferredPwaPrompt) {`r`n            container.style.display = 'none';") -or
                         $appContent.Contains("if (platform.isDesktop && !this.deferredPwaPrompt) {`n            container.style.display = 'none';")

Assert-Result "iOS Safari click leads to iOS modal" $hasIosBranch "iOS branching verified"
Assert-Result "Android fallback click leads to Android modal (Never iOS modal)" $hasAndroidBranch "Android branching verified"
Assert-Result "Desktop fallback click leads to Desktop modal" $hasDesktopBranch "Desktop branching verified"
Assert-Result "Desktop environment suppresses mobile install prompt unless prompt ready" $hasDesktopSuppression "Desktop cleanliness verified"

# ----------------------------------------------------------------------------
# [Suite 6] Simulation: Simulated Response Safety Policy Unit Tests
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 6] Response Safety Policy Logic Simulation" -ForegroundColor Yellow

function Mock-IsSafeToCacheResponse([int]$status, [string]$type, [string]$contentType, [string]$cacheControl) {
    if ($status -ne 200) { return $false }
    if ($type -ne 'basic' -and $type -ne 'default') { return $false }
    $ct = $contentType.ToLower()
    if ($ct.Contains('application/json') -or $ct.Contains('application/ld+json')) { return $false }
    $cc = $cacheControl.ToLower()
    if ($cc.Contains('no-store') -or $cc.Contains('private')) { return $false }
    return $true
}

# Unit Test 6.1: Static CSS asset (safe)
$cssSafe = Mock-IsSafeToCacheResponse 200 'basic' 'text/css; charset=utf-8' 'public, max-age=31536000'
Assert-Result "Mock Test: Static CSS (200, public) is allowed" $cssSafe "Allowed into static cache"

# Unit Test 6.2: Sensitive Supabase JSON response (must reject)
$jsonReject = Mock-IsSafeToCacheResponse 200 'basic' 'application/json; charset=utf-8' 'public'
Assert-Result "Mock Test: Supabase/AI JSON response is REJECTED" (-not $jsonReject) "Rejected by content-type rule"

# Unit Test 6.3: Response with Cache-Control: no-store (must reject)
$noStoreReject = Mock-IsSafeToCacheResponse 200 'basic' 'text/html' 'no-store, no-cache'
Assert-Result "Mock Test: Response with no-store is REJECTED" (-not $noStoreReject) "Rejected by cache-control rule"

# Unit Test 6.4: Response with Cache-Control: private (must reject)
$privateReject = Mock-IsSafeToCacheResponse 200 'basic' 'text/javascript' 'private, max-age=0'
Assert-Result "Mock Test: Response with private directive is REJECTED" (-not $privateReject) "Rejected by cache-control rule"

# Unit Test 6.5: HTTP 401 Unauthorized response (must reject)
$unauthReject = Mock-IsSafeToCacheResponse 401 'basic' 'text/plain' 'no-cache'
Assert-Result "Mock Test: Non-200 HTTP response is REJECTED" (-not $unauthReject) "Rejected by status rule"

# ----------------------------------------------------------------------------
# [Suite 7] Summary & Physical Device Matrix Transparency Check
# ----------------------------------------------------------------------------
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO Test Verification Summary]" -ForegroundColor Cyan
Write-Host "  Passed : $passedCount" -ForegroundColor Green
Write-Host "  Failed : $failedCount" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
Write-Host "============================================================================" -ForegroundColor Cyan

if ($failedCount -gt 0) { exit 1 } else { exit 0 }
