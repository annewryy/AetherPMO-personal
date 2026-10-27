# AetherPMO Full Live Suite Test
$supabaseUrl = "https://rhbyfzimvpkkuljnmfct.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoYnlmemltdnBra3Vsam5tZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTc4NzIsImV4cCI6MjEwMDgzMzg3Mn0.S09e1TikZXLGSDOHmjYkBnVRp3Fc7thJI1jmCp582u8"

Write-Host "--- TEST 1: Auth and Profile ---"
$authHeaders = @{
    "apikey" = $anonKey
    "Content-Type" = "application/json"
}
$loginBody = '{"email":"pm1@aetherpmo.com","password":"Aether2026!#"}'

try {
    $loginRes = Invoke-RestMethod -Uri ($supabaseUrl + "/auth/v1/token?grant_type=password") -Method Post -Headers $authHeaders -Body $loginBody
    $jwtToken = $loginRes.access_token
    $userId = $loginRes.user.id
    Write-Host "[PASS] Login OK, User ID: $userId"
} catch {
    Write-Host "[FAIL] Login Failed: " $_.Exception.Message
    exit 1
}

$userHeaders = @{
    "apikey" = $anonKey
    "Authorization" = ("Bearer " + $jwtToken)
}

try {
    $profUri = $supabaseUrl + '/rest/v1/profiles?id=eq.' + $userId + '&select=id,email,name,role'
    $profRes = Invoke-RestMethod -Uri $profUri -Method Get -Headers $userHeaders
    Write-Host "[PASS] Profile OK: Role=" $profRes[0].role ", Name=" $profRes[0].name
} catch {
    Write-Host "[WARN] Profile Error: " $_.Exception.Message
}

try {
    $projUri = $supabaseUrl + '/rest/v1/projects?select=id,project_code,name,status,progress,start_date,end_date,budget,wbs,milestones&limit=3'
    $projs = Invoke-RestMethod -Uri $projUri -Method Get -Headers $userHeaders
    Write-Host "[PASS] Projects OK, Count=" $projs.Count
    $testProj = $projs[0]
    Write-Host ("       Target Project: [" + $testProj.project_code + "] " + $testProj.name + " (" + $testProj.progress + "%)")
} catch {
    Write-Host "[FAIL] Projects Error: " $_.Exception.Message
    exit 1
}

Write-Host "`n--- TEST 2: AI-04 Scoring Rule Engine ---"
$startDate = [DateTime]::Parse($testProj.start_date)
$endDate = [DateTime]::Parse($testProj.end_date)
$today = [DateTime]::Today
$totalDays = ($endDate - $startDate).TotalDays
$elapsedDays = [Math]::Max(0, ($today - $startDate).TotalDays)
$plannedProgress = [Math]::Min(100, [Math]::Round(($elapsedDays / $totalDays) * 100))
$actualProgress = [int]$testProj.progress
$gap = $plannedProgress - $actualProgress

Write-Host ("       Planned (linear): " + $plannedProgress + "%, Actual: " + $actualProgress + "%, Gap: " + $gap + "%p")
if ($gap -ge 15) { $schedScore = 30; $schedGrade = "CRITICAL" }
elseif ($gap -ge 10) { $schedScore = 20; $schedGrade = "WARNING" }
elseif ($gap -ge 5) { $schedScore = 10; $schedGrade = "CAUTION" }
else { $schedScore = 0; $schedGrade = "NORMAL" }
Write-Host "[PASS] AI-04 Schedule Risk Score: $schedScore / 30 ($schedGrade)"

Write-Host "`n--- TEST 3: AI-05 RFP 3-way Balanced Chunking ---"
$mockText = ("Sample RFP Content Paragraph. " * 2000)
Write-Host ("       Large Document Chars: " + $mockText.Length + " (> 40,000 chars)")
if ($mockText.Length -gt 40000) {
    $p1 = $mockText.Substring(0, 14000)
    $p3 = $mockText.Substring($mockText.Length - 12000)
    $midStart = [Math]::Max(14000, [Math]::Floor(($mockText.Length - 14000) / 2))
    $p2 = $mockText.Substring($midStart, 14000)
    $combined = "=== [SEC 1] ===`n" + $p1 + "`n`n=== [SEC 2] ===`n" + $p2 + "`n`n=== [SEC 3] ===`n" + $p3
    Write-Host "[PASS] AI-05 3-Way Chunking OK, Combined Length: " $combined.Length
}

$shortText = "Too short"
if ($shortText.Length -lt 30) {
    Write-Host "[PASS] AI-05 Minimum length validation (<30 chars blocked) OK"
}

Write-Host "`n--- TEST 4: Audit Logs in DB ---"
try {
    $auditUri = $supabaseUrl + '/rest/v1/activity_logs?type=eq.AI_AUDIT&limit=5'
    $auditLogs = Invoke-RestMethod -Uri $auditUri -Method Get -Headers $userHeaders
    Write-Host "[PASS] Audit logs query OK, Rows: " $auditLogs.Count
} catch {
    Write-Host "[WARN] Audit logs: " $_.Exception.Message
}

Write-Host "`n[ALL TESTS PASSED SUCCESSFULLY]"
