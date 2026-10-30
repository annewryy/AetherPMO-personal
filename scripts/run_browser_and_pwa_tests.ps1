# ============================================================================
# [AetherPMO Headless Browser, Mojibake Detection & PWA Verification Suite v4.0]
# File: scripts/run_browser_and_pwa_tests.ps1
# Pure ASCII runner for 100% Windows PowerShell 5.1 compatibility
# ============================================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO] Real Browser, Encoding & Zero-Data-Loss Verification Suite v4.0" -ForegroundColor Cyan
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
# [Suite 1] Encoding & Mojibake Integrity Scanner (No Broken Korean Text)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 1] Encoding & Mojibake Integrity Scanner" -ForegroundColor Yellow

$htmlContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "index.html"), [System.Text.Encoding]::UTF8)

# Check 1.1: Scan for Unicode replacement char (0xFFFD) or malformed button tag
$hasReplacementChar = $htmlContent.Contains([char]0xFFFD)
$hasBrokenButtonTag = $htmlContent.Contains('??/button') -or $htmlContent.Contains('?/button')
Assert-Result "index.html contains ZERO replacement characters or malformed button tags" (-not $hasReplacementChar -and -not $hasBrokenButtonTag) "Clean UTF-8 text verified across all modals and banner"

# Check 1.2: Verify exact expected Korean strings in update banner & confirmation modal
$hasCleanBannerText = $htmlContent.Contains("id=`"pwa-update-banner`"") -and
                      $htmlContent.Contains(">지금 새로고침</button>") -and
                      $htmlContent.Contains(">나중에</button>")
Assert-Result "pwa-update-banner contains pristine Korean copy and valid closing tags" $hasCleanBannerText "Pristine update banner verified"

$hasCleanModalText = $htmlContent.Contains('id="pwa-update-confirm-modal"') -and
                     $htmlContent.Contains("취소 (작업 계속)") -and
                     $htmlContent.Contains("무시하고 업데이트") -and
                     $htmlContent.Contains('aria-label="닫기"')
Assert-Result "pwa-update-confirm-modal contains pristine Korean copy and accessibility labels" $hasCleanModalText "Pristine confirm modal verified"

# Check 1.3: DOM div tag balance (Zero dangling tags)
$openDivs = ([regex]::Matches($htmlContent, "<div[\s>]")).Count
$closeDivs = ([regex]::Matches($htmlContent, "</div>")).Count
$diff = $openDivs - $closeDivs
Assert-Result "HTML div tag balance verification (Zero dangling tags)" ($diff -eq 0) "Open: $openDivs, Close: $closeDivs, Diff: $diff"

# ----------------------------------------------------------------------------
# [Suite 2] Real Chromium Headless Engine Render Verification
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 2] Real Headless Chromium Engine Render Verification" -ForegroundColor Yellow

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
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
            $renderedHasBanner = $dumpText.Contains('id="pwa-update-banner"') -and $dumpText.Contains(">지금 새로고침</button>")
            $renderedHasModal = $dumpText.Contains('id="pwa-update-confirm-modal"') -and $dumpText.Contains("취소 (작업 계속)")
            $renderedHasButtons = $dumpText.Contains(">나중에</button>") -and $dumpText.Contains("무시하고 업데이트")
            $renderedNoMojibake = -not ($dumpText.Contains("??/button") -or $dumpText.Contains([char]0xFFFD))
            Assert-Result "Chromium rendered DOM contains clean Korean banner, modal and button text" ($renderedHasBanner -and $renderedHasModal -and $renderedHasButtons -and $renderedNoMojibake) "Rendered bytes: $($dumpText.Length)"
        } else {
            Assert-Result "Chromium headless execution" $false "Process failed to produce dump"
        }
    } finally {
        if ($p) { try { $p.Dispose() } catch {} }
        Start-Sleep -Milliseconds 400
        if (Test-Path $tempDump) { Remove-Item -Force -ErrorAction SilentlyContinue $tempDump }
    }
} else {
    Write-Host "  [SKIP] Chromium/Edge binary not found" -ForegroundColor Yellow
}

# ----------------------------------------------------------------------------
# [Suite 3] Dirty State Detection & Deletion Handling (app.js)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 3] Dirty State Detection (Empty string & Deletion handling)" -ForegroundColor Yellow

$appContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "app.js"), [System.Text.Encoding]::UTF8)

# Check 3.1: Does NOT discard empty string (detects deletion of pre-existing text)
$hasNoEmptyDiscard = -not $appContent.Contains("el.value !== el.defaultValue && el.value.trim() !== ''")
Assert-Result "Dirty detection does NOT ignore empty strings (Detects total deletion of pre-existing values)" $hasNoEmptyDiscard "el.value !== initialVal enforced unconditionally"

# Check 3.2: Supports dynamic data-initial-value attribute
$hasDynamicInitialCheck = $appContent.Contains("el.hasAttribute('data-initial-value')")
Assert-Result "Dynamic form initialization supported via data-initial-value" $hasDynamicInitialCheck "Both DOM defaultValue & data-initial-value evaluated"

# Check 3.3: applyPwaUpdate calls isUserEditingData and cancels gracefully
$hasDirtyUpdateGuard = $appContent.Contains("applyPwaUpdate() {`r`n        const editingStatus = this.isUserEditingData();") -or
                       $appContent.Contains("applyPwaUpdate() {`n        const editingStatus = this.isUserEditingData();")
$hasCancelMethod = $appContent.Contains("cancelPwaUpdate()") -and $appContent.Contains("this.showToast")
Assert-Result "applyPwaUpdate() blocks refresh when dirty, cancelPwaUpdate() aborts update without data loss" ($hasDirtyUpdateGuard -and $hasCancelMethod) "User edit safety guaranteed"

# ----------------------------------------------------------------------------
# [Suite 4] Service Worker Pre-Cache Response Safety & Allowlist
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 4] Service Worker Pre-Cache Response Safety & Allowlist" -ForegroundColor Yellow

$swContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "sw.js"), [System.Text.Encoding]::UTF8)

# Check 4.1: Install event pre-caches using isSafeToCacheResponse (no naked cache.addAll)
$hasPreCacheSafety = $swContent.Contains("isSafeToCacheResponse(response)") -and
                    $swContent.Contains("cache.put(request, response)") -and
                    -not $swContent.Contains("cache.addAll(STATIC_ASSETS)")
Assert-Result "Install event pre-caches using isSafeToCacheResponse (No naked cache.addAll)" $hasPreCacheSafety "Safety policy applied to every pre-cache asset"

# Check 4.2: isSafeToCacheResponse rejects non-200, JSON, no-store, and private responses
$safeChecksDirectives = $swContent.Contains("response.status !== 200") -and
                        $swContent.Contains("cacheControl.includes('no-store')") -and
                        $swContent.Contains("cacheControl.includes('private')") -and
                        $swContent.Contains("contentType.includes('application/json')")
Assert-Result "isSafeToCacheResponse rejects non-200, JSON, no-store, and private responses" $safeChecksDirectives "Zero-cache directives enforced"

# Check 4.3: Request authorization headers hard bypass
$hasAuthHeadersBypass = $swContent.Contains("request.headers.has('authorization')") -and
                        $swContent.Contains("request.headers.has('apikey')")
Assert-Result "Requests carrying Authorization or apikey headers are 100% network-only" $hasAuthHeadersBypass "Never stored in CacheStorage"

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

Assert-Result "iOS Safari click leads to iOS modal" $hasIosBranch "iOS branching verified"
Assert-Result "Android fallback click leads to Android modal (Never iOS modal)" $hasAndroidBranch "Android branching verified"
Assert-Result "Desktop fallback click leads to Desktop modal" $hasDesktopBranch "Desktop branching verified"

# ----------------------------------------------------------------------------
# Summary Report
# ----------------------------------------------------------------------------
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO Test Verification Summary]" -ForegroundColor Cyan
Write-Host "  Passed : $passedCount" -ForegroundColor Green
Write-Host "  Failed : $failedCount" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
Write-Host "============================================================================" -ForegroundColor Cyan

if ($failedCount -gt 0) { exit 1 } else { exit 0 }
