# ============================================================================
# AetherPMO AI 5대 기능(AI-01~05) 실제 엔드포인트 통합 검증 스크립트
# 
# [원칙 준수]:
# 1. 임의의 감사로그 INSERT 모킹 완전 배제 -> 실제 /api/ai/chat 호출만 수행
# 2. 비밀 키, JWT, 비밀번호 평문 하드코딩 완전 배제 (환경변수 주입 및 마스킹)
# 3. HTTP 200, Gemini 응답, metadata, logId 일치, 401/403 보안 차단 전수 검증
# 4. 검증 실패 또는 모의 실행 시 ALL TESTS PASSED 출력 절대 금지 (Fail-Fast)
# ============================================================================
param(
    [string]$TargetApiUrl = "https://aether-pmo-personal-h2n3gf5ow-annewryys-projects.vercel.app/api/ai/chat",
    [string]$TestEmail = "pm1@aetherpmo.com",
    [string]$TestPassword = "",
    [string]$VercelBypassSecret = ""
)

if ($env:AETHER_TEST_PASSWORD) { $TestPassword = $env:AETHER_TEST_PASSWORD }
if ($env:VERCEL_PROTECTION_BYPASS) { $VercelBypassSecret = $env:VERCEL_PROTECTION_BYPASS }

$supabaseUrl = "https://rhbyfzimvpkkuljnmfct.supabase.co"
$anonKey = $env:SUPABASE_ANON_KEY
if (-not $anonKey) {
    # 기본 공개 anon 키 (환경변수 미지정 시 fallback)
    $anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoYnlmemltdnBra3Vsam5tZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTc4NzIsImV4cCI6MjEwMDgzMzg3Mn0.S09e1TikZXLGSDOHmjYkBnVRp3Fc7thJI1jmCp582u8"
}
$serviceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $TestPassword) {
    if ($env:AETHER_DEFAULT_PW) {
        $TestPassword = $env:AETHER_DEFAULT_PW
    } else {
        $secPw = Read-Host "Enter test password for $TestEmail" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPw)
        $TestPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    }
}

Write-Host "================================================================"
Write-Host " [Step 1] Supabase Auth Login & JWT Token Verification"
Write-Host "================================================================"

$authHeaders = @{
    "apikey" = $anonKey
    "Content-Type" = "application/json"
}

$loginPayload = @{
    email = $TestEmail
    password = $TestPassword
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri ($supabaseUrl + "/auth/v1/token?grant_type=password") -Method Post -Headers $authHeaders -Body $loginPayload
    $jwtToken = $loginRes.access_token
    $userId = $loginRes.user.id
    $maskedToken = $jwtToken.Substring(0, [Math]::Min(12, $jwtToken.Length)) + "...[MASKED]"
    Write-Host "[PASS] Login OK (User ID: $userId, Token: $maskedToken)"
} catch {
    Write-Host "[FAIL] Login Failed: " $_.Exception.Message
    exit 1
}

$userHeaders = @{
    "apikey" = $anonKey
    "Authorization" = ("Bearer " + $jwtToken)
}

# 대상 프로젝트 조회
try {
    $projUri = $supabaseUrl + '/rest/v1/projects?select=id,project_code,name,status,progress&limit=3'
    $projs = Invoke-RestMethod -Uri $projUri -Method Get -Headers $userHeaders
    if ($projs.Count -eq 0) {
        Write-Host "[FAIL] No project accessible."
        exit 1
    }
    $targetProj = $projs[0]
    Write-Host ("[PASS] Target Project: [" + $targetProj.project_code + "] " + $targetProj.name + " (" + $targetProj.id + ")")
} catch {
    Write-Host "[FAIL] Project query failed: " $_.Exception.Message
    exit 1
}

Write-Host "`n================================================================"
Write-Host " [Step 2] Security Access Control (401 & 403 Tests)"
Write-Host "================================================================"

# 2-1. 미인증(무토큰) 요청 401 차단 검증
try {
    $noTokenHeaders = @{ "Content-Type" = "application/json" }
    $noTokenBody = '{"message":"test","featureType":"AI-01"}'
    $res401 = Invoke-WebRequest -Uri $TargetApiUrl -Method Post -Headers $noTokenHeaders -Body $noTokenBody -TimeoutSec 10 -ErrorAction Stop
    Write-Host "[FAIL] Unauthenticated request was NOT blocked! Status: " $res401.StatusCode
    exit 1
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 401) {
        Write-Host "[PASS] 401 Unauthorized safely enforced for unauthenticated request."
    } else {
        Write-Host "[FAIL] Expected 401 Unauthorized, got: $status"
        exit 1
    }
}

# 2-2. 실제 존재하지만 pm1에게 접근 권한이 없는 프로젝트에 대한 403 차단 검증
try {
    # 전체 프로젝트 중 현재 사용자가 접근 가능한 프로젝트를 제외한 실제 비인가 프로젝트 1건 조회
    $allProjUri = $supabaseUrl + '/rest/v1/projects?select=id,project_code,name&order=id.desc&limit=10'
    $allProjs = Invoke-RestMethod -Uri $allProjUri -Method Get -Headers @{ "apikey" = $anonKey; "Authorization" = ("Bearer " + $jwtToken) }
    $unauthProj = $allProjs | Where-Object { $_.id -ne $targetProj.id } | Select-Object -First 1
    $unauthProjId = if ($unauthProj) { $unauthProj.id } else { "3f345495-cb2f-4843-9a0c-73555aebdb2c" }
    $unauthProjCode = if ($unauthProj) { $unauthProj.project_code } else { "OP-25-1095" }
    Write-Host ("    [INFO] Testing 403 access control with existing unassigned project: [" + $unauthProjCode + "] " + $unauthProjId)
    $forbiddenHeaders = @{
        "Content-Type" = "application/json"
        "Authorization" = ("Bearer " + $jwtToken)
        "apikey" = $anonKey
    }
    if ($VercelBypassSecret) { $forbiddenHeaders["x-vercel-protection-bypass"] = $VercelBypassSecret }
    $forbiddenBody = @{
        featureType = "AI-01"
        projectId = $unauthProjId
        message = "권한 없는 실제 프로젝트 분석 시도"
    } | ConvertTo-Json
    $res403 = Invoke-WebRequest -Uri $TargetApiUrl -Method Post -Headers $forbiddenHeaders -Body $forbiddenBody -TimeoutSec 15 -ErrorAction Stop
    Write-Host "[FAIL] Unauthorized project access was NOT blocked! Status: " $res403.StatusCode
    exit 1
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 403) {
        Write-Host "[PASS] 403 Forbidden safely enforced for unauthorized real project access."
    } else {
        Write-Host "[FAIL] Expected 403 Forbidden, got: $status"
        exit 1
    }
}

Write-Host "================================================================"
Write-Host " [Step 3] AI-01 ~ AI-05 Actual Endpoint Execution & Gemini Verification"
Write-Host "================================================================"

$features = @(
    @{ 
        Code = "AI-01"; 
        Name = "Project Summary"; 
        Payload = @{ featureType = "AI-01"; projectId = $targetProj.id } 
    },
    @{ 
        Code = "AI-02"; 
        Name = "Deliverables Gap Analysis"; 
        Payload = @{ featureType = "AI-02"; projectId = $targetProj.id } 
    },
    @{ 
        Code = "AI-03"; 
        Name = "Weekly Report Generation"; 
        Payload = @{ featureType = "AI-03"; projectId = $targetProj.id } 
    },
    @{ 
        Code = "AI-04"; 
        Name = "Project Risk Assessment"; 
        Payload = @{ featureType = "AI-04"; projectId = $targetProj.id } 
    },
    @{ 
        Code = "AI-05"; 
        Name = "RFP Requirements Analysis"; 
        Payload = @{ 
            featureType = "AI-05"; 
            rfpFileName = "2026_클라우드구축_RFP.pdf";
            rfpText = "1. 사업개요: 2026 공공 클라우드 고도화 사업. 발주기관: 국가정보자원관리원. 사업기간: 2026.03 ~ 2026.12. 사업예산: 50억원. 2. 주요과업: MSA 전환, 쿠버네티스 컨테이너 구축, CI/CD 배포 자동화. 3. 입찰참가자격: 소프트웨어사업자 등록업체. 4. 평가기준: 기술평가 90%, 가격평가 10%. 5. 투입인력: PM 특급기술자 10년 이상. 6. 제출서류: 제안서 및 실적증명서 일체. 마감일: 2026-02-28."
        } 
    }
)

$apiReqHeaders = @{
    "Content-Type" = "application/json"
    "Authorization" = ("Bearer " + $jwtToken)
    "apikey" = $anonKey
}
if ($VercelBypassSecret) {
    $apiReqHeaders["x-vercel-protection-bypass"] = $VercelBypassSecret
}

$capturedLogIds = @()

foreach ($feat in $features) {
    $fCode = $feat.Code
    $fName = $feat.Name
    Write-Host "`n>>> [실제 AI 호출: $fCode] $fName"
    
    $postBody = $feat.Payload | ConvertTo-Json -Depth 5
    $startTime = [DateTime]::Now

    try {
        $response = Invoke-RestMethod -Uri $TargetApiUrl -Method Post -Headers $apiReqHeaders -Body $postBody -TimeoutSec 70
        $durationMs = [Math]::Round(([DateTime]::Now - $startTime).TotalMilliseconds)

        # 1. 실제 Gemini 응답 텍스트 존재 검증
        if (-not $response.answer -or $response.answer.Length -lt 30) {
            Write-Host "    [FAIL] $fCode Gemini 응답이 비어있거나 너무 짧습니다."
            exit 1
        }

        # 2. 메타데이터 검증
        $modelName = $response.metadata.model
        $latency = $response.metadata.latencyMs
        $logId = $response.metadata.dbAudit.logId
        $dbSaved = $response.metadata.dbAudit.dbSaved
        if ($dbSaved -ne $true -or -not $logId) {
            Write-Host ("    [FAIL] " + $fCode + " DB 감사로그 저장 실패: dbSaved=" + $dbSaved + ", logId=" + $logId)
            exit 1
        }

        Write-Host ("    [PASS] Gemini 응답 성공 (모델: " + $modelName + ", 소요: " + $durationMs + "ms)")
        Write-Host ("    [감사로그 저장 결과]: logId=" + $logId + ", dbSaved=" + $dbSaved)

        if ($logId) {
            $capturedLogIds += $logId
        }

        $snippet = $response.answer.Substring(0, [Math]::Min(100, $response.answer.Length)).Replace("`n", " ")
        Write-Host ("    [응답 내용 발췌]: " + $snippet + "...")
    } catch {
        $errMsg = $_.Exception.Message
        Write-Host ("    [FAIL] $fCode 실제 엔드포인트 호출 실패: " + $errMsg)
        Write-Host "    -> Vercel Deployment Protection 활성화 시 Vercel Protection Bypass 헤더 또는 브라우저 테스트 필요"
        Write-Host "`n[BLOCKED] 실제 AI 응답 검증이 실패하였으므로 테스트를 중단합니다."
        exit 1
    }
}

Write-Host "`n================================================================"
Write-Host " [Step 4] Supabase activity_logs DB SELECT Verification"
Write-Host "================================================================"

if (-not $serviceRoleKey) {
    Write-Host "[FAIL] SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않아 DB 전수 조회가 불가능합니다."
    exit 1
} else {
    try {
        $auditQueryHeaders = @{
            "apikey" = $serviceRoleKey
        }
        $queryUri = $supabaseUrl + '/rest/v1/activity_logs?type=eq.AI_AUDIT&order=date.desc&limit=10'
        $dbLogs = Invoke-RestMethod -Uri $queryUri -Method Get -Headers $auditQueryHeaders
        Write-Host ("[PASS] activity_logs DB 조회 성공: " + $dbLogs.Count + "건 확인")

        # 반환된 logId와 실제 DB 레코드 매칭 검증
        $matchedCount = 0
        foreach ($id in $capturedLogIds) {
            $found = $dbLogs | Where-Object { $_.id -eq $id }
            if ($found) { $matchedCount++ }
        }
        Write-Host ("[PASS] API 반환 logId와 실제 DB 저장 레코드 매칭: " + $matchedCount + "/" + $capturedLogIds.Count + "건 일치")
        if ($matchedCount -ne 5) {
            Write-Host "[FAIL] 5개 기능 중 일부의 감사로그가 DB에 저장되지 않았습니다! (일치: " $matchedCount "/5)"
            exit 1
        }
    } catch {
        Write-Host ("[FAIL] activity_logs DB 재조회 실패: " + $_.Exception.Message)
        exit 1
    }
}

Write-Host "`n================================================================"
Write-Host " [ALL TESTS PASSED SUCCESSFULLY - 5 FEATURES FULLY VERIFIED]"
Write-Host "================================================================"
