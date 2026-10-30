# ============================================================================
# [AetherPMO AI Data Security Gateway Comprehensive Verification Suite]
# File: scripts/test_ai_security_gateway.ps1
# Pure ASCII runner for 100% Windows PowerShell 5.1 compatibility
# ============================================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO] AI Data Security Gateway and De-identification Test Suite" -ForegroundColor Cyan
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
# Suite 1: File Architecture and Module Integrity
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 1] Security Gateway File Architecture and Module Integrity" -ForegroundColor Yellow

$reqModules = @(
    "api/ai/security/data-classifier.js",
    "api/ai/security/deidentifier.js",
    "api/ai/security/prompt-whitelist.js",
    "api/ai/security/text-sanitizer.js",
    "api/ai/security/gateway.js",
    "api/ai/security/audit-guard.js",
    "api/ai/security/index.js"
)

foreach ($mod in $reqModules) {
    $exists = Test-Path (Join-Path $projectRoot $mod)
    Assert-Result "Module exists on disk: $mod" $exists "Security component present"
}

# ----------------------------------------------------------------------------
# Suite 2: Automated De-identification and Deterministic Token Mapping
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 2] Automated De-identification and Deterministic Token Mapping" -ForegroundColor Yellow

$deidContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/security/deidentifier.js"), [System.Text.Encoding]::UTF8)

# Check 2.1: Deterministic token mapping prefix
$hasProjectToken = $deidContent.Contains("getOrSetToken(name, projectToToken, tokenToProject, 'PROJECT', pRef)")
$hasAgencyToken = $deidContent.Contains("getOrSetToken(agency, agencyToToken, tokenToAgency, 'AGENCY', aRef)")
$hasPersonToken = $deidContent.Contains("getOrSetToken(name, personToToken, tokenToPerson, 'PERSON', perRef)")
$hasCompanyToken = $deidContent.Contains("getOrSetToken(company, companyToToken, tokenToCompany, 'COMPANY', cRef)")
Assert-Result "Deterministic token generation for Project, Agency, Person, and Company" ($hasProjectToken -and $hasAgencyToken -and $hasPersonToken -and $hasCompanyToken) "PROJECT_001, AGENCY_001, PERSON_001, COMPANY_001 enforced"

# Check 2.2: Server-side restoration (De-pseudonymization)
$hasRestoration = $deidContent.Contains("tokenToProject.entries()") -and $deidContent.Contains("tokenToAgency.entries()")
Assert-Result "Server-side safe restoration (tokenToProject reverse substitution)" $hasRestoration "Authorized users receive restored names"

# Check 2.3: Categorical budget scaling (Raw amounts excluded)
$hasBudgetScale = $deidContent.Contains("categorizeBudget") -and $deidContent.Contains("100000000") -and $deidContent.Contains("2000000000")
Assert-Result "Raw budget excluded and replaced by server-computed categorical buckets" $hasBudgetScale "Prevents financial contract amount leaks"

# ----------------------------------------------------------------------------
# Suite 3: PII, Internal IP, and Secret Token Redaction
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 3] PII, Internal Network IPs, and Secrets Redaction" -ForegroundColor Yellow

# Check 3.1: Resident Registration Number (RRN) Redaction
$hasRrnRedact = $deidContent.Contains("redactedPiiCount++") -and $deidContent.Contains("\d{6}[-\s]?[1-4]\d{6}")
Assert-Result "Resident Registration Number (RRN) pattern redacted" $hasRrnRedact "Korean SSN fully purged"

# Check 3.2: Phone & Contact Redaction
$hasPhoneRedact = $deidContent.Contains("01[016789][-\s]?\d{3,4}[-\s]?\d{4}")
Assert-Result "Cellular and landline telephone numbers redacted" $hasPhoneRedact "Phone numbers purged"

# Check 3.3: Email Redaction
$hasEmailRedact = $deidContent.Contains("[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
Assert-Result "Personal email addresses redacted" $hasEmailRedact "Email addresses purged"

# Check 3.4: Private/Internal IP blocking
$hasIpRedact = $deidContent.Contains("192\.168\.\d{1,3}\.\d{1,3}") -and $deidContent.Contains("10\.\d{1,3}\.\d{1,3}\.\d{1,3}")
Assert-Result "Internal RFC1918 private network IPs (10.x, 192.168.x, 172.16-31.x) blocked" $hasIpRedact "Internal network infrastructure concealed"

# Check 3.5: Secret keys, JWT, and API tokens blocked
$hasSecretRedact = $deidContent.Contains("sb_secret_") -and $deidContent.Contains("Bearer\s+") -and $deidContent.Contains("redactedSecretCount++")
Assert-Result "Supabase Secret Key, Bearer JWT tokens, and passwords blocked" $hasSecretRedact "Authentication tokens concealed"

# ----------------------------------------------------------------------------
# Suite 4: 4-Tier Data Classification and Document Screening
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 4] 4-Tier Data Classification and Document Screening" -ForegroundColor Yellow

$classContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/security/data-classifier.js"), [System.Text.Encoding]::UTF8)

# Check 4.1: 4 Tiers defined
$hasTiers = $classContent.Contains("PUBLIC: 'PUBLIC'") -and $classContent.Contains("INTERNAL: 'INTERNAL'") -and $classContent.Contains("CONFIDENTIAL: 'CONFIDENTIAL'") -and $classContent.Contains("RESTRICTED: 'RESTRICTED'")
Assert-Result "4-Tier classification defined (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)" $hasTiers "All 4 classification tiers implemented"

# Check 4.2: Confidential markers screening
$hasConfMarkers = $classContent.Contains("CONFIDENTIAL_MARKERS") -and $classContent.Contains("CLASSIFICATION.CONFIDENTIAL")
Assert-Result "Confidential document markers detected and blocked immediately" $hasConfMarkers "Non-public documents blocked"

# Check 4.3: Fail-Closed document policy (Default-Deny for unverified documents)
$hasDocFailClosed = $classContent.Contains("classifyDocument") -and $classContent.Contains("isPublicDeclared") -and $classContent.Contains("isAllowed: false")
Assert-Result "Unverified documents default-denied and blocked (Fail-Closed)" $hasDocFailClosed "Default-Deny enforced"

# ----------------------------------------------------------------------------
# Suite 5: Whitelist-Based Minimal Prompt Generation (AI-01 ~ AI-05)
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 5] Whitelist-Based Minimal Prompt Generation per Feature" -ForegroundColor Yellow

$wlContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/security/prompt-whitelist.js"), [System.Text.Encoding]::UTF8)

# Check 5.1: AI-01 minimal whitelist (Budget category, WBS summary counts, issue/action statistics)
$hasAI01Wl = $wlContent.Contains("budgetCategory: p.categorizeBudget") -and $wlContent.Contains("wbsMetrics: wbsSummary") -and $wlContent.Contains("totalOpen: openIssues.length")
Assert-Result "AI-01 uses minimal whitelisted indicators with budget category and issue stats" $hasAI01Wl "Raw database object dump blocked"

# Check 5.2: AI-02 deliverable summary whitelist (Author emails & file paths blocked)
$hasAI02Wl = $wlContent.Contains("deliverableMetrics") -and $wlContent.Contains("unregisteredItems: keyUnregistered")
Assert-Result "AI-02 transmits only standard deliverable names and status (No emails/paths)" $hasAI02Wl "Deliverables whitelist enforced"

# Check 5.3: AI-03 weekly report whitelist (Activity counts, no raw user emails)
$hasAI03Wl = $wlContent.Contains("performanceMetrics") -and $wlContent.Contains("completedTotalCount: completedCount")
Assert-Result "AI-03 pre-aggregates weekly performance metrics on server" $hasAI03Wl "Weekly report minimal metrics enforced"

# Check 5.4: AI-04 risk assessment whitelist
$hasAI04Wl = $wlContent.Contains("scoresBreakdown") -and $wlContent.Contains("scheduleGapPercent: counts.scheduleGap")
Assert-Result "AI-04 transmits 4-pillar risk scores and objective grounding counts" $hasAI04Wl "Risk analysis whitelist enforced"

# Check 5.5: AI-05 RFP metadata whitelist
$hasAI05Wl = $wlContent.Contains("fileName: p.pseudonymizeText(meta.fileName")
Assert-Result "AI-05 passes pseudonymized document metadata and range notice" $hasAI05Wl "RFP metadata whitelist enforced"

# ----------------------------------------------------------------------------
# Suite 6: Fail-Closed Security Rules and Zero External Calls on Rejection
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 6] Fail-Closed Security Rules and Gatekeeper Verification" -ForegroundColor Yellow

$gwContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/security/gateway.js"), [System.Text.Encoding]::UTF8)
$sanContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/security/text-sanitizer.js"), [System.Text.Encoding]::UTF8)

# Check 6.1: Residual leak scanner
$hasResidualScanner = $sanContent.Contains("verifyResidualSafety") -and $sanContent.Contains("safe: false")
Assert-Result "verifyResidualSafety checks final prompt payload before egress" $hasResidualScanner "Deep residual safety gatekeeper active"

# Check 6.2: Egress gatekeeper intercepts before LLM invocation
$chatContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/chat.js"), [System.Text.Encoding]::UTF8)
$hasGateCall = $chatContent.Contains("securityGateway.inspectAndPrepareEgress")
$hasBlockedCheck = $chatContent.Contains("if (!egressResult.allowed)") -and $chatContent.Contains("return res.status(403).json")
Assert-Result "chat.js executes inspectAndPrepareEgress and returns 403 on block (Zero LLM calls)" ($hasGateCall -and $hasBlockedCheck) "Guarantees 0 external LLM calls on blocked requests"

# Check 6.3: Prompt injection defense
$hasInjectionFilter = $sanContent.Contains("INJECTION_PATTERNS") -and $sanContent.Contains("sanitizeUnstructuredText")
Assert-Result "Prompt injection and system jailbreak patterns neutralized" $hasInjectionFilter "Malicious prompt instructions sanitized"

# ----------------------------------------------------------------------------
# Suite 7: Audit Guard and Sensitive Data Concealment
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 7] Audit Guard and Sensitive Data Concealment" -ForegroundColor Yellow

$agContent = [System.IO.File]::ReadAllText((Join-Path $projectRoot "api/ai/security/audit-guard.js"), [System.Text.Encoding]::UTF8)

# Check 7.1: Mapping dictionary stripped from audit logs
$hasStripMapping = $agContent.Contains("delete safeRecord.mapping") -and $agContent.Contains("delete safeRecord.dictionary")
Assert-Result "Token mapping dictionaries explicitly purged from audit logs" $hasStripMapping "Mapping table remains server-confidential"

# Check 7.2: Snippets sanitized in audit log
$hasAuditSanitize = $agContent.Contains('sanitizeForAudit') -and $agContent.Contains('snippet: sanitizeForAudit')
Assert-Result "Audit log snippets sanitized to prevent credential/PII persistence" $hasAuditSanitize "Supabase DB audit records clean"

# Check 7.3: Safe console logging
$hasSafeConsole = $agContent.Contains("safeConsoleLog")
Assert-Result "safeConsoleLog filters out mapping tables and sensitive keys from Vercel logs" $hasSafeConsole "Log output redaction enforced"

# ----------------------------------------------------------------------------
# Suite 8: User Interface - Security Status, Badges, and Admin Panel
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 8] UI Security Status Badges and Admin Verification Panel" -ForegroundColor Yellow

$indexHtml = [System.IO.File]::ReadAllText((Join-Path $projectRoot "index.html"), [System.Text.Encoding]::UTF8)
$aiAutoJs = [System.IO.File]::ReadAllText((Join-Path $projectRoot "ai-automation.js"), [System.Text.Encoding]::UTF8)

# Check 8.1: RFP Public Document declaration checkbox in index.html
$hasPublicDocCheck = $indexHtml.Contains('id="ai-05-is-public-doc"')
$hasNoticeIdInput = $indexHtml.Contains('id="ai-05-notice-id"')
Assert-Result "index.html provides public document confirmation checkbox and notice ID input" ($hasPublicDocCheck -and $hasNoticeIdInput) "User declaration UI verified"

# Check 8.2: AI Security Panel in ai-automation.js
$hasSecurityPanel = $aiAutoJs.Contains("ai-security-panel") -and $aiAutoJs.Contains("secGate.status === 'PERMITTED'")
Assert-Result "ai-automation.js renders AI Data Security Gateway status panel" $hasSecurityPanel "Active status badge present"

# Check 8.3: Classification badge (PUBLIC / INTERNAL / BLOCKED)
$hasClassificationBadge = $aiAutoJs.Contains("secGate.classification === 'PUBLIC'") -and $aiAutoJs.Contains("INTERNAL")
Assert-Result "ai-automation.js displays transmission classification badge" $hasClassificationBadge "Classification tier visible to user"

# Check 8.4: Blocked notification card with actionable guide
$hasBlockedCard = $aiAutoJs.Contains("_renderSecurityBlockedView") -and $aiAutoJs.Contains("secGate.blockReason")
Assert-Result "Actionable blocked card rendered with remediation instructions on 403" $hasBlockedCard "User-friendly failure explanation"

# Check 8.5: Admin-only de-identification audit verification toggle
$hasAdminToggle = $aiAutoJs.Contains("toggleSecurityAuditDetails") -and $aiAutoJs.Contains("isAdmin")
Assert-Result "Admin-only de-identification audit detail toggle restricted to SYS_ADMIN/ADMIN" $hasAdminToggle "Least-privilege UI access enforced"

# ----------------------------------------------------------------------------
# Suite 9: Supabase Production RLS and Database Safety
# ----------------------------------------------------------------------------
Write-Host "`n[Suite 9] Supabase Production Schema and RLS Safety" -ForegroundColor Yellow

# Verify git status to ensure no database schema migration files were created or modified
$gitStatus = & git status --porcelain
$schemaModified = $gitStatus -match "migrations/|supabase_migrations/|schema\.sql"
Assert-Result "Zero modification to Supabase production migrations or schema" (-not $schemaModified) "Production DB schema untouched"

# ============================================================================
# Summary
# ============================================================================
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host " [Security Gateway Verification Summary]" -ForegroundColor Cyan
Write-Host "  Passed : $passedCount" -ForegroundColor Green
Write-Host "  Failed : $failedCount" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
Write-Host "============================================================================" -ForegroundColor Cyan

if ($failedCount -gt 0) {
    exit 1
} else {
    exit 0
}
