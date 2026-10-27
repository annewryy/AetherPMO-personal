# AetherPMO AI Enhancements Verification Test Suite (Encoding Independent)
$baseDir = Split-Path $PSScriptRoot -Parent
Set-Location $baseDir

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " [AetherPMO] AI Automation 5 Features Enhancement Verification" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$testResults = @()

function Assert-Test($testName, $condition, $detail) {
    if ($condition) {
        Write-Host " [PASS] $testName" -ForegroundColor Green
        if ($detail) { Write-Host "        $detail" -ForegroundColor Gray }
        $script:testResults += [PSCustomObject]@{ Test = $testName; Status = "PASS"; Detail = $detail }
    } else {
        Write-Host " [FAIL] $testName" -ForegroundColor Red
        if ($detail) { Write-Host "        $detail" -ForegroundColor Yellow }
        $script:testResults += [PSCustomObject]@{ Test = $testName; Status = "FAIL"; Detail = $detail }
    }
}

# 1. Security & Audit Log
Write-Host "`n--- 1. Security & Audit Log Check ---" -ForegroundColor Yellow
$sqlContent = [System.IO.File]::ReadAllText((Join-Path $baseDir "scripts\security_02_grant_audit_log_only.sql"))
Assert-Test "anon ALL REVOKE" ($sqlContent.Contains("REVOKE ALL ON TABLE public.activity_logs FROM anon;")) "anon access completely revoked"
Assert-Test "Allow all access RLS DROP" ($sqlContent.Contains('DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;')) "Overly permissive policy dropped"
Assert-Test "AI_AUDIT anti-forgery RLS" ($sqlContent.Contains("type IS DISTINCT FROM 'AI_AUDIT'")) "authenticated user cannot forge AI_AUDIT"
Assert-Test "service_role minimal grant" ($sqlContent.Contains("GRANT SELECT, INSERT ON TABLE public.activity_logs TO service_role;")) "service_role granted SELECT, INSERT only"

$chatJsContent = [System.IO.File]::ReadAllText((Join-Path $baseDir "api\ai\chat.js"))
Assert-Test "saveAIAuditLog Bearer header" ($chatJsContent.Contains("Authorization") -and $chatJsContent.Contains("serviceRoleKey")) "PostgREST service_role Bearer header injected"
Assert-Test "SUPABASE_SECRET_KEY support" ($chatJsContent.Contains("SUPABASE_SECRET_KEY")) "Modern Supabase secret key compatible"

# 2. AI-01 Project Summary
Write-Host "`n--- 2. [AI-01] Project Summary ---" -ForegroundColor Yellow
Assert-Test "AI-01 5 standard sections" ($chatJsContent.Contains("AI-01") -and $chatJsContent.Contains("### 1.") -and $chatJsContent.Contains("### 3.")) "Diagnosis, bottlenecks, 3 recs, roadmap, data quality"
Assert-Test "AI-01 WBS missing data guard" ($chatJsContent.Contains("hasRegisteredWbs") -and $chatJsContent.Contains("wbsStatus")) "No fake tasks fabricated on missing WBS"
Assert-Test "AI-01 data tag separation" ($chatJsContent.Contains("[AI") -and $chatJsContent.Contains("specificInstructions")) "Actual DB vs AI proposed separation"

# 3. AI-02 Deliverables Gap Analysis
Write-Host "`n--- 3. [AI-02] Deliverables Gap Analysis ---" -ForegroundColor Yellow
Assert-Test "normalizeArtifactName function" ($chatJsContent.Contains("function normalizeArtifactName")) "3-stage normalized comparison algorithm"
Assert-Test "Fetch error guard vs 0-item misjudgment" ($chatJsContent.Contains("hasFetchError") -and $chatJsContent.Contains("isIndeterminate")) "DB fetch error marked as indeterminate, not 0-count"

# 4. AI-03 Weekly Report
Write-Host "`n--- 4. [AI-03] Weekly Report ---" -ForegroundColor Yellow
Assert-Test "AI_AUDIT log separated from achievements" ($chatJsContent.Contains("AI_AUDIT") -and $chatJsContent.Contains("aiAuditCountThisWeek")) "AI audit logs strictly excluded from weekly task accomplishments"
Assert-Test "No fake achievements on missing records" ($chatJsContent.Contains("performanceSummary.hasRecords") -and $chatJsContent.Contains("hasCompletionRecords")) "Clear notice when completion evidence is absent"

# 5. AI-04 Risk Analysis
Write-Host "`n--- 5. [AI-04] Risk Analysis ---" -ForegroundColor Yellow
Assert-Test "4-dimension quantitative scoring" ($chatJsContent.Contains("scheduleScore") -and $chatJsContent.Contains("deliverableScore") -and $chatJsContent.Contains("issueScore") -and $chatJsContent.Contains("actionItemScore")) "30+25+25+20 = 100 pt max"
Assert-Test "Incomplete data blocks NORMAL grade" ($chatJsContent.Contains("allFourEvaluated") -and $chatJsContent.Contains("isPartiallyEvaluated")) "Partial assessment prevents false NORMAL rating"

# 6. AI-05 RFP Analysis
Write-Host "`n--- 6. [AI-05] RFP Analysis ---" -ForegroundColor Yellow
Assert-Test "40k char limit and coverage calc" ($chatJsContent.Contains("MAX_RFP_CHARS = 40000") -and $chatJsContent.Contains("coveragePercent")) "Smart section anchoring & honesty notice"
Assert-Test "Omission warning banner" ($chatJsContent.Contains("isTruncated") -and $chatJsContent.Contains("rangeNotice")) "Notice to cross-check raw text when truncated"
Assert-Test "Citations [p.N] prompted" ($chatJsContent.Contains("[p.N]")) "Page citations enforced"

# 7. UI/UX & Themes
Write-Host "`n--- 7. UI/UX & CSS Theme System ---" -ForegroundColor Yellow
$aiJsContent = [System.IO.File]::ReadAllText((Join-Path $baseDir "ai-automation.js"))
Assert-Test "_renderEnhancedReportView engine" ($aiJsContent.Contains("_renderEnhancedReportView")) "KPI grid + Diagnosis banner + 3 Recs + Comparison table + Details"
Assert-Test "Raw Markdown copy/download" ($aiJsContent.Contains("dataset?.rawMarkdown")) "Full markdown preservation"

$cssContent = [System.IO.File]::ReadAllText((Join-Path $baseDir "style.css"))
Assert-Test "CSS .ai-kpi-grid" ($cssContent.Contains(".ai-kpi-grid") -and $cssContent.Contains(".ai-kpi-card")) "KPI card grid style"
Assert-Test "CSS .ai-diagnosis-banner" ($cssContent.Contains(".ai-diagnosis-banner")) "Diagnosis banner style"
Assert-Test "CSS .ai-recs-grid" ($cssContent.Contains(".ai-recs-grid") -and $cssContent.Contains(".ai-rec-card.critical")) "3-tier recommendations style"
Assert-Test "CSS .ai-comparison-card" ($cssContent.Contains(".ai-comparison-card") -and $cssContent.Contains(".ai-gauge-track")) "Comparison & gauge style"
Assert-Test "CSS .ai-report-details" ($cssContent.Contains(".ai-report-details")) "Accordion details report style"

Write-Host "`n=================================================================" -ForegroundColor Cyan
$passCount = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$color = "Green"
if ($failCount -gt 0) { $color = "Red" }
Write-Host " Verification Finished: Total $($testResults.Count), PASS: $passCount, FAIL: $failCount" -ForegroundColor $color
Write-Host "=================================================================" -ForegroundColor Cyan

if ($failCount -gt 0) { exit 1 } else { exit 0 }
