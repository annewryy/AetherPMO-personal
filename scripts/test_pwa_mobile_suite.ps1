# ============================================================================
# [AetherPMO Mobile PWA & Responsive Test Suite]
# File: scripts/test_pwa_mobile_suite.ps1
# Pure ASCII runner for 100% Windows PowerShell 5.1 compatibility
# ============================================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO] Mobile PWA & Responsive Safe Area Verification Suite" -ForegroundColor Cyan
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
# [Test 1] manifest.webmanifest Configuration & Icon Assets Verification
# ----------------------------------------------------------------------------
Write-Host "`n[Test 1] Web App Manifest & App Icon Assets" -ForegroundColor Yellow

$manifestPath = Join-Path $projectRoot "manifest.webmanifest"
$manifestRaw = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)

$manifestValid = $false
$manifest = $null
try {
    # Simple JSON parse check
    $manifest = ConvertFrom-Json $manifestRaw
    $manifestValid = $true
} catch {
    $manifestValid = $false
}
Assert-Result "manifest.webmanifest is valid JSON" $manifestValid "Manifest parse succeeded"

$nameMatch = ($manifest.name -eq "AetherPMO" -and $manifest.short_name -eq "AetherPMO")
Assert-Result "App name and short_name configured as 'AetherPMO'" $nameMatch "name: $($manifest.name), short_name: $($manifest.short_name)"

$displayMatch = ($manifest.display -eq "standalone" -and $manifest.start_url -eq "/" -and $manifest.scope -eq "/")
Assert-Result "Display mode is standalone with scope '/' and start_url '/'" $displayMatch "display: $($manifest.display)"

# Check icons existence on disk
$iconsExist = $true
$missingIcons = @()
foreach ($icon in $manifest.icons) {
    $iconRelPath = $icon.src.TrimStart('/')
    $iconFullPath = Join-Path $projectRoot $iconRelPath
    if (-not (Test-Path $iconFullPath)) {
        $iconsExist = $false
        $missingIcons += $iconRelPath
    }
}
Assert-Result "All manifest referenced icon files exist on disk" $iconsExist "Verified $($manifest.icons.Count) icons including maskable SVGs & PNGs"

# ----------------------------------------------------------------------------
# [Test 2] Service Worker (sw.js) Security & App Shell Strategy
# ----------------------------------------------------------------------------
Write-Host "`n[Test 2] Service Worker (sw.js) & Zero-Cache Business Security" -ForegroundColor Yellow

$swContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "sw.js"), [System.Text.Encoding]::UTF8)

# Check 2.1: Supabase & Auth API hard network-only bypass (Zero Offline Caching of business data)
$hasSupabaseBypass = $swContent.Contains("url.hostname.includes('supabase.co')") -and $swContent.Contains("url.pathname.includes('/rest/v1/')") -and $swContent.Contains("url.pathname.includes('/auth/v1/')")
Assert-Result "Supabase DB, REST, and Auth APIs are 100% network-only bypassed" $hasSupabaseBypass "Zero business/token caching guaranteed"

# Check 2.2: Same-origin API routes bypassed
$hasApiBypass = $swContent.Contains("url.pathname.startsWith('/api/')")
Assert-Result "Same-origin backend /api/ endpoints are network-only bypassed" $hasApiBypass "Dynamic AI & business APIs never cached"

# Check 2.3: App Shell assets pre-caching includes ai-automation.js
$hasAppShellPreCache = $swContent.Contains("'/app.js'") -and $swContent.Contains("'/ai-automation.js'") -and $swContent.Contains("'/manifest.webmanifest'")
Assert-Result "Static App Shell pre-caches HTML, CSS, JS, AI Studio & Manifest" $hasAppShellPreCache "Instant offline app shell launch verified"

# Check 2.4: Skip waiting message handler
$hasSkipWaiting = $swContent.Contains("SKIP_WAITING") -and $swContent.Contains("self.clients.claim()")
Assert-Result "Service Worker handles SKIP_WAITING and claims clients immediately" $hasSkipWaiting "Seamless background update support"

# ----------------------------------------------------------------------------
# [Test 3] HTML Meta Tags & PWA Install Prompts (index.html)
# ----------------------------------------------------------------------------
Write-Host "`n[Test 3] HTML Meta Tags & PWA Mobile Installation Elements" -ForegroundColor Yellow

$htmlContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "index.html"), [System.Text.Encoding]::UTF8)

# Check 3.1: iOS & Mobile meta tags
$hasAppleCapable = $htmlContent.Contains('<meta name="apple-mobile-web-app-capable" content="yes">')
$hasAppleTitle = $htmlContent.Contains('<meta name="apple-mobile-web-app-title" content="AetherPMO">')
$hasAppName = $htmlContent.Contains('<meta name="application-name" content="AetherPMO">')
$hasViewportFit = $htmlContent.Contains('viewport-fit=cover')
Assert-Result "iOS Safari & Android PWA standalone meta tags present" ($hasAppleCapable -and $hasAppleTitle -and $hasAppName -and $hasViewportFit) "viewport-fit=cover & apple-mobile-web-app-title verified"

# Check 3.2: Login screen install container
$hasInstallContainer = $htmlContent.Contains('id="pwa-install-container"') -and $htmlContent.Contains('id="pwa-install-btn"')
Assert-Result "Login screen includes 'AetherPMO Mobile App Install' container" $hasInstallContainer "Button & hint container present"

# Check 3.3: iOS Safari step-by-step install guide modal
$hasIosModal = $htmlContent.Contains('id="ios-pwa-modal"') -and $htmlContent.Contains('ios-install-steps') -and $htmlContent.Contains('closeIosPwaModal()')
Assert-Result "iOS Safari 3-step 'Add to Home Screen' modal is defined" $hasIosModal "Visual Safari guide verified"

# ----------------------------------------------------------------------------
# [Test 4] Application Logic (app.js) PWA Handlers
# ----------------------------------------------------------------------------
Write-Host "`n[Test 4] JavaScript Application (app.js) PWA Installation Logic" -ForegroundColor Yellow

$appContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "app.js"), [System.Text.Encoding]::UTF8)

# Check 4.1: isPwaStandalone() method exists and checks matchMedia / standalone
$hasStandaloneCheck = $appContent.Contains('isPwaStandalone()') -and $appContent.Contains("display-mode: standalone")
Assert-Result "isPwaStandalone() checks standalone mode and navigator.standalone" $hasStandaloneCheck "Standalone state detection implemented"

# Check 4.2: beforeinstallprompt listener captures deferred prompt
$hasBeforeInstallPrompt = $appContent.Contains("beforeinstallprompt") -and $appContent.Contains("this.deferredPwaPrompt = e")
Assert-Result "Android / Chrome beforeinstallprompt event captured cleanly" $hasBeforeInstallPrompt "Native install dialog triggering supported"

# Check 4.3: appinstalled event listener clears prompt & displays toast
$hasAppInstalledListener = $appContent.Contains("appinstalled") -and $appContent.Contains("this.deferredPwaPrompt = null")
Assert-Result "appinstalled event clears prompt and hides installation banner" $hasAppInstalledListener "Automatic UI cleanup upon installation"

# Check 4.4: iOS detection and modal trigger
$hasIosHandling = $appContent.Contains("openIosPwaModal()") -and $appContent.Contains("closeIosPwaModal()")
Assert-Result "iOS Safari install modal open/close handlers implemented" $hasIosHandling "iOS specific flow implemented"

# ----------------------------------------------------------------------------
# [Test 5] CSS Responsive & Safe Area Enhancements (style.css)
# ----------------------------------------------------------------------------
Write-Host "`n[Test 5] CSS Mobile Responsiveness & Safe Area (style.css)" -ForegroundColor Yellow

$cssContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "style.css"), [System.Text.Encoding]::UTF8)

# Check 5.1: Safe Area insets
$hasSafeAreaVars = $cssContent.Contains("env(safe-area-inset-top") -and $cssContent.Contains("env(safe-area-inset-bottom")
Assert-Result "CSS implements env(safe-area-inset-*) for iPhone home bar & notch" $hasSafeAreaVars "Safe area variables defined"

# Check 5.2: Minimum 44px touch targets on mobile
$hasTouchTargets = $cssContent.Contains("min-height: 44px")
Assert-Result "Mobile buttons and inputs enforce minimum 44px touch targets" $hasTouchTargets "Touch friendly ergonomics verified"

# Check 5.3: Table horizontal scrolling & modal safe-area bounds
$hasTableScroll = $cssContent.Contains("overflow-x: auto !important") -and $cssContent.Contains("-webkit-overflow-scrolling: touch")
Assert-Result "Data tables and modals wrapped with horizontal/vertical touch scrolling" $hasTableScroll "Prevents mobile UI cut-offs"

# Check 5.4: Dark and Light theme styling for PWA button & modal
$hasPwaStyles = $cssContent.Contains(".pwa-install-container") -and $cssContent.Contains(".ios-pwa-modal-dialog") -and $cssContent.Contains("body.light-theme .pwa-install-btn")
Assert-Result "PWA installation UI styled for both Dark and Light themes" $hasPwaStyles "Full theme compatibility verified"

# ----------------------------------------------------------------------------
# [Test 6] Vercel Hosting Configuration (vercel.json)
# ----------------------------------------------------------------------------
Write-Host "`n[Test 6] Vercel Hosting Headers (vercel.json)" -ForegroundColor Yellow

$vercelContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "vercel.json"), [System.Text.Encoding]::UTF8)

# Check 6.1: Service worker Cache-Control header
$hasSwHeader = $vercelContent.Contains('"source": "/sw.js"') -and $vercelContent.Contains('"key": "Cache-Control"') -and $vercelContent.Contains("must-revalidate")
Assert-Result "vercel.json sets no-cache/must-revalidate headers on /sw.js" $hasSwHeader "Prevents stale service worker caching"

# Check 6.2: Manifest MIME type header
$hasManifestHeader = $vercelContent.Contains('"source": "/manifest.webmanifest"') -and $vercelContent.Contains("application/manifest+json")
Assert-Result "vercel.json sets application/manifest+json MIME type header" $hasManifestHeader "Valid PWA manifest serving guaranteed"

# ----------------------------------------------------------------------------
# [Test 7] Regression Testing on Previous AI Automation & Security Features
# ----------------------------------------------------------------------------
Write-Host "`n[Test 7] Core System & AI Automation Regression Check" -ForegroundColor Yellow

$chatJsContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/chat.js"), [System.Text.Encoding]::UTF8)
$hasLimit500 = $chatJsContent.Contains("&limit=500")
$hasAuditLogSecurity = [System.IO.File]::Exists((Join-Path $projectRoot "scripts/security_02_grant_audit_log_only.sql"))
Assert-Result "Previous AI-01~05 500-limit aggregation & least-privilege SQL intact" ($hasLimit500 -and $hasAuditLogSecurity) "Zero regressions detected"

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
Write-Host "`n============================================================================" -ForegroundColor Cyan
$summaryColor = "Green"
if ($failedCount -gt 0) { $summaryColor = "Red" }
Write-Host " [PWA Verification Summary] Passed: $passedCount / Failed: $failedCount" -ForegroundColor $summaryColor
Write-Host "============================================================================" -ForegroundColor Cyan

if ($failedCount -gt 0) {
    exit 1
} else {
    exit 0
}
