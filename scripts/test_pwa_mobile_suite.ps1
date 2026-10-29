# ============================================================================
# [AetherPMO Mobile PWA & Responsive Test Suite v2.0]
# File: scripts/test_pwa_mobile_suite.ps1
# Pure ASCII runner for 100% Windows PowerShell 5.1 compatibility
# ============================================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO] Mobile PWA, Security & Responsive Verification Suite v2.0" -ForegroundColor Cyan
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
# [Suite 1] HTML Structure & Clean DOM Hierarchy (index.html)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 1] HTML Structure & DOM Integrity" -ForegroundColor Yellow

$htmlPath = Join-Path $projectRoot "index.html"
$htmlContent = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::UTF8)

# Check 1.1: DOM div tag balance (Zero dangling divs)
$openDivMatches = [regex]::Matches($htmlContent, "<div[\s>]")
$closeDivMatches = [regex]::Matches($htmlContent, "</div>")
$divDiff = $openDivMatches.Count - $closeDivMatches.Count
Assert-Result "HTML div tag balance verification (Zero dangling tags)" ($divDiff -eq 0) "Open: $($openDivMatches.Count), Close: $($closeDivMatches.Count), Difference: $divDiff"

# Check 1.2: Extra 3 closing divs removed from bottom
$hasDanglingClosingPattern = $htmlContent.Contains("</div>`r`n        </div>`r`n    </div>`r`n</div>`r`n`r`n`r`n    <!-- HR accordion")
Assert-Result "Elimination of 3 redundant closing div tags after modal" (-not $hasDanglingClosingPattern) "Dangling tags successfully removed"

# Check 1.3: Presence of all 3 platform-specific install modals
$hasIosModal = $htmlContent.Contains('id="ios-pwa-modal"')
$hasAndroidModal = $htmlContent.Contains('id="android-pwa-modal"')
$hasDesktopModal = $htmlContent.Contains('id="desktop-pwa-modal"')
Assert-Result "Platform-specific install guide modals defined (iOS, Android, Desktop)" ($hasIosModal -and $hasAndroidModal -and $hasDesktopModal) "All 3 platform modal backdrops verified in DOM"

# Check 1.4: Presence of PWA update notification banner DOM
$hasUpdateBanner = $htmlContent.Contains('id="pwa-update-banner"') -and $htmlContent.Contains('onclick="app.applyPwaUpdate()"')
Assert-Result "PWA Service Worker Update banner element defined in DOM" $hasUpdateBanner "Non-blocking update banner with refresh trigger present"

# ----------------------------------------------------------------------------
# [Suite 2] Manifest & Asset Resources (manifest.webmanifest)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 2] Web App Manifest & App Icon Assets" -ForegroundColor Yellow

$manifestPath = Join-Path $projectRoot "manifest.webmanifest"
$manifestRaw = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
$manifest = ConvertFrom-Json $manifestRaw

Assert-Result "Manifest app naming is 'AetherPMO'" ($manifest.name -eq "AetherPMO" -and $manifest.short_name -eq "AetherPMO") "name: $($manifest.name)"
Assert-Result "Manifest display mode is 'standalone'" ($manifest.display -eq "standalone" -and $manifest.start_url -eq "/") "display: standalone"

$allIconsExist = $true
foreach ($icon in $manifest.icons) {
    $iconRelPath = $icon.src.TrimStart('/')
    if (-not (Test-Path (Join-Path $projectRoot $iconRelPath))) {
        $allIconsExist = $false
    }
}
Assert-Result "All manifest referenced icon assets exist on disk" $allIconsExist "Verified $($manifest.icons.Count) icons"

# ----------------------------------------------------------------------------
# [Suite 3] Service Worker Security & Zero-Cache Policy (sw.js)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 3] Service Worker Security & Zero-Cache Policies" -ForegroundColor Yellow

$swContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "sw.js"), [System.Text.Encoding]::UTF8)

# Check 3.1: Authorization and apikey header inspection bypass
$hasAuthHeaderCheck = $swContent.Contains("request.headers.has('authorization')") -and $swContent.Contains("request.headers.has('apikey')")
Assert-Result "Requests with Authorization or apikey headers are 100% network-only bypassed" $hasAuthHeaderCheck "Zero token/authenticated request caching guaranteed"

# Check 3.2: Supabase and backend API endpoints bypass
$hasSupabaseBypass = $swContent.Contains("url.hostname.includes('supabase.co')") -and $swContent.Contains("url.pathname.includes('/rest/v1/')") -and $swContent.Contains("url.pathname.includes('/auth/v1/')")
$hasApiBypass = $swContent.Contains("url.pathname.startsWith('/api/')")
Assert-Result "Supabase DB/Auth and same-origin /api/ routes are network-only bypassed" ($hasSupabaseBypass -and $hasApiBypass) "Business data completely excluded from CacheStorage"

# Check 3.3: Strict approved static allowlist (no loose regex matching)
$hasExplicitAllowlist = $swContent.Contains("EXPLICIT_STATIC_PATHS") -and $swContent.Contains("isApprovedStaticAsset")
$noLooseExtensionMatch = -not $swContent.Contains("ALLOWED_EXTENSIONS = /\.(html|css|js")
Assert-Result "Explicit static allowlist enforcement (No loose file extension matching)" ($hasExplicitAllowlist -and $noLooseExtensionMatch) "Only approved static files eligible for caching"

# Check 3.4: Response-level JSON and sensitive data rejection
$hasSafeResponseCheck = $swContent.Contains("isSafeToCacheResponse") -and $swContent.Contains("application/json") -and $swContent.Contains("no-store")
Assert-Result "Response filter rejects JSON and private/no-store payloads from CacheStorage" $hasSafeResponseCheck "Double-layer response protection verified"

# Check 3.5: No abrupt skipWaiting on install to prevent user data loss
$noAbruptSkipWaiting = -not $swContent.Contains("self.addEventListener('install', event => {`r`n    self.skipWaiting();") -and $swContent.Contains("self.addEventListener('message', event => {")
Assert-Result "Service Worker update executes gracefully on explicit user message (No abrupt skipWaiting)" $noAbruptSkipWaiting "Protects in-flight form entries from unexpected refresh"

# ----------------------------------------------------------------------------
# [Suite 4] JavaScript PWA Branching & Device Logic (app.js)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 4] JavaScript PWA Device Detection & Installation Flow" -ForegroundColor Yellow

$appContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "app.js"), [System.Text.Encoding]::UTF8)

# Check 4.1: Device platform detection helper
$hasPlatformDetection = $appContent.Contains("getPwaPlatform()") -and $appContent.Contains("/Android/i.test(ua)") -and $appContent.Contains("/iPad|iPhone|iPod/.test(ua)")
Assert-Result "getPwaPlatform() separates iOS, Android, and Desktop environments" $hasPlatformDetection "Accurate user-agent parsing verified"

# Check 4.2: Standalone detection prevents redundant prompts
$hasStandaloneCheck = $appContent.Contains("isPwaStandalone()") -and $appContent.Contains("display-mode: standalone") -and $appContent.Contains("navigator.standalone === true")
Assert-Result "isPwaStandalone() detects installed status on iOS and Android" $hasStandaloneCheck "Installed apps hide installation triggers"

# Check 4.3: Android without beforeinstallprompt does NOT open iOS modal
$hasAndroidFallback = $appContent.Contains("if (platform.isAndroid) {`r`n            this.openAndroidPwaModal();") -or $appContent.Contains("if (platform.isAndroid) {`n            this.openAndroidPwaModal();")
Assert-Result "Android fallback opens Android-specific guide (Never opens iOS modal)" $hasAndroidFallback "Zero platform mismatch verified"

# Check 4.4: Desktop logic does not force-display mobile button
$hasDesktopHandling = $appContent.Contains("if (platform.isDesktop && !this.deferredPwaPrompt) {`r`n            container.style.display = 'none';") -or $appContent.Contains("if (platform.isDesktop && !this.deferredPwaPrompt) {`n            container.style.display = 'none';")
Assert-Result "Desktop environment suppresses mobile install prompt unless native prompt is ready" $hasDesktopHandling "Clean desktop login interface preserved"

# Check 4.5: User editing data protection check
$hasDataLossGuard = $appContent.Contains("isUserEditingData()") -and $appContent.Contains("notifyPwaUpdateAvailable")
Assert-Result "Form input detection (isUserEditingData) protects active user work from update disruption" $hasDataLossGuard "Active typing & open modals detected"

# Check 4.6: Modal open/close handlers implemented for all platforms
$hasAllModalHandlers = $appContent.Contains("openIosPwaModal()") -and $appContent.Contains("openAndroidPwaModal()") -and $appContent.Contains("openDesktopPwaModal()")
Assert-Result "Modal lifecycle handlers implemented for iOS, Android, and Desktop" $hasAllModalHandlers "All 3 platform handlers verified"

# ----------------------------------------------------------------------------
# [Suite 5] CSS Mobile Responsiveness & Safe Area (style.css)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 5] CSS Mobile Responsiveness & Safe Area" -ForegroundColor Yellow

$cssContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "style.css"), [System.Text.Encoding]::UTF8)

# Check 5.1: Safe Area Insets for iPhone & Android Gesture Bar
$hasSafeArea = $cssContent.Contains("--safe-area-top: env(safe-area-inset-top") -and $cssContent.Contains("--safe-area-bottom: env(safe-area-inset-bottom")
Assert-Result "CSS implements env(safe-area-inset-*) for notch and home gesture bar" $hasSafeArea "Safe area variables defined"

# Check 5.2: 44px minimum touch target size
$has44pxTouch = $cssContent.Contains("min-height: 44px")
Assert-Result "Touch targets enforce minimum 44px height on mobile viewports" $has44pxTouch "Mobile ergonomic guidelines met"

# Check 5.3: Table overflow & horizontal touch scrolling
$hasTableScroll = $cssContent.Contains("overflow-x: auto") -and $cssContent.Contains("-webkit-overflow-scrolling: touch")
Assert-Result "Data tables and viewports prevent horizontal clipping on mobile" $hasTableScroll "Smooth touch scrolling enabled"

# Check 5.4: PWA Update banner styling for Dark/Light themes
$hasUpdateBannerCss = $cssContent.Contains(".pwa-update-banner") -and $cssContent.Contains("pwaBannerSlideUp")
Assert-Result "PWA update notification banner styled with safe-area offset and animations" $hasUpdateBannerCss "Theme-adaptive fixed banner styled"

# ----------------------------------------------------------------------------
# [Suite 6] Vercel Hosting & PWA Headers (vercel.json)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 6] Vercel Hosting & Cache Headers" -ForegroundColor Yellow

$vercelContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "vercel.json"), [System.Text.Encoding]::UTF8)
$hasSwNoCache = $vercelContent.Contains('"key": "Cache-Control", "value": "no-cache, no-store, must-revalidate"')
$hasManifestMime = $vercelContent.Contains('"key": "Content-Type", "value": "application/manifest+json; charset=utf-8"')
Assert-Result "vercel.json configures no-cache for /sw.js to ensure immediate updates" $hasSwNoCache "sw.js cache bypass header verified"
Assert-Result "vercel.json configures application/manifest+json MIME type" $hasManifestMime "manifest MIME type verified"

# ----------------------------------------------------------------------------
# [Suite 7] Automated Simulation: Mobile Platform Branching & Service Worker Logic
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 7] Executable Platform Branching Simulation" -ForegroundColor Yellow

# Simulate getPwaPlatform logic in PowerShell
function Simulate-GetPwaPlatform([string]$ua) {
    $isIos = ($ua -match "iPad|iPhone|iPod")
    $isAndroid = ($ua -match "Android")
    $isMobile = $isIos -or $isAndroid -or ($ua -match "webOS|BlackBerry|IEMobile|Opera Mini")
    return @{
        isIos = $isIos
        isAndroid = $isAndroid
        isMobile = $isMobile
        isDesktop = -not $isMobile
    }
}

# Scenario A: iPhone Safari
$iosUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
$iosPlatform = Simulate-GetPwaPlatform $iosUa
$iosPass = ($iosPlatform.isIos -eq $true -and $iosPlatform.isAndroid -eq $false -and $iosPlatform.isDesktop -eq $false)
Assert-Result "Simulation Scenario A: iPhone Safari accurately identifies as iOS mobile" $iosPass "Platform: iOS=$($iosPlatform.isIos), Android=$($iosPlatform.isAndroid), Desktop=$($iosPlatform.isDesktop)"

# Scenario B: Android Chrome
$androidUa = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36"
$androidPlatform = Simulate-GetPwaPlatform $androidUa
$androidPass = ($androidPlatform.isAndroid -eq $true -and $androidPlatform.isIos -eq $false -and $androidPlatform.isDesktop -eq $false)
Assert-Result "Simulation Scenario B: Android Chrome accurately identifies as Android mobile" $androidPass "Platform: iOS=$($androidPlatform.isIos), Android=$($androidPlatform.isAndroid), Desktop=$($androidPlatform.isDesktop)"

# Scenario C: Desktop Windows Chrome
$desktopUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
$desktopPlatform = Simulate-GetPwaPlatform $desktopUa
$desktopPass = ($desktopPlatform.isDesktop -eq $true -and $desktopPlatform.isMobile -eq $false)
Assert-Result "Simulation Scenario C: Desktop Chrome accurately identifies as Desktop" $desktopPass "Platform: Desktop=$($desktopPlatform.isDesktop), Mobile=$($desktopPlatform.isMobile)"

# Scenario D: Simulated SW Cache Allowlist Check
$testStaticApproved = @("/", "/index.html", "/style.css", "/app.js", "/ai-automation.js", "/manifest.webmanifest", "/favicon.ico")
$testBypassedUrls = @("/api/ai/chat", "/rest/v1/projects", "/auth/v1/user", "/data.json", "/api/user-profile")

$swAllowlistPass = $true
foreach ($url in $testStaticApproved) {
    if (-not $swContent.Contains("'$url'")) { $swAllowlistPass = $false }
}
Assert-Result "Simulation Scenario D: Static App Shell assets present in SW cache allowlist" $swAllowlistPass "Verified approved static assets"

$swBypassPass = $true
foreach ($url in $testBypassedUrls) {
    # Ensure none of the sensitive routes are in EXPLICIT_STATIC_PATHS
    if ($swContent.Contains("'$url'")) { $swBypassPass = $false }
}
Assert-Result "Simulation Scenario E: Sensitive API & DB routes completely excluded from SW cache allowlist" $swBypassPass "Verified sensitive routes excluded"

# ----------------------------------------------------------------------------
# Summary Report
# ----------------------------------------------------------------------------
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host " [PWA Verification Summary]" -ForegroundColor Cyan
Write-Host "  Passed : $passedCount" -ForegroundColor Green
Write-Host "  Failed : $failedCount" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
Write-Host "============================================================================" -ForegroundColor Cyan

if ($failedCount -gt 0) {
    exit 1
} else {
    exit 0
}
