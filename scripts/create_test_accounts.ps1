<#
.SYNOPSIS
    AetherPMO-Personal 15개 신규 테스트 계정 생성 및 역할 동기화 스크립트

.DESCRIPTION
    Supabase Auth Admin API를 통해 사용자 계정을 생성하고,
    생성된 UUID를 기반으로 public.profiles 테이블에 정보를 동기화합니다.
    조직정보(corporation_type, division, team, part, position)는 일체 입력하지 않으며,
    기존 컬럼은 NULL을 유지합니다.

.PARAMETER ServiceRoleKey
    Supabase project service_role secret key (필수)

.PARAMETER SupabaseUrl
    Supabase 프로젝트 URL (기본값: https://rhbyfzimvpkkuljnmfct.supabase.co)

.PARAMETER DefaultPassword
    생성될 테스트 계정의 초기 비밀번호 (기본값: Aether2026!#)

.EXAMPLE
    .\create_test_accounts.ps1 -ServiceRoleKey "your_service_role_key_here"
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ServiceRoleKey,

    [Parameter(Mandatory = $false)]
    [string]$SupabaseUrl = "https://rhbyfzimvpkkuljnmfct.supabase.co",

    [Parameter(Mandatory = $false)]
    [string]$DefaultPassword = "Aether2026!#"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  AetherPMO-Personal 테스트 계정 15개 생성 및 프로필 동기화" -ForegroundColor Cyan
Write-Host "  Target Supabase URL: $SupabaseUrl" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan

# 1. 대상 15개 계정 정의 (매니저 이메일: aetherpmo.com 확인 완료)
$targetAccounts = @(
    # 매니저 5명 (화면 manager -> DB 저장 EXEC_ADMIN)
    @{ Name = "매니저1"; Email = "manager1@aerherpmo.com"; ScreenRole = "manager"; Role = "EXEC_ADMIN" },
    @{ Name = "매니저2"; Email = "manager2@aerherpmo.com"; ScreenRole = "manager"; Role = "EXEC_ADMIN" },
    @{ Name = "매니저3"; Email = "manager3@aerherpmo.com"; ScreenRole = "manager"; Role = "EXEC_ADMIN" },
    @{ Name = "매니저4"; Email = "manager4@aerherpmo.com"; ScreenRole = "manager"; Role = "EXEC_ADMIN" },
    @{ Name = "매니저5"; Email = "manager5@aerherpmo.com"; ScreenRole = "manager"; Role = "EXEC_ADMIN" },

    # PM 5명 (화면 pm -> DB 저장 PM)
    @{ Name = "pm1"; Email = "pm1@aetherpmo.com"; ScreenRole = "pm"; Role = "PM" },
    @{ Name = "pm2"; Email = "pm2@aetherpmo.com"; ScreenRole = "pm"; Role = "PM" },
    @{ Name = "pm3"; Email = "pm3@aetherpmo.com"; ScreenRole = "pm"; Role = "PM" },
    @{ Name = "pm4"; Email = "pm4@aetherpmo.com"; ScreenRole = "pm"; Role = "PM" },
    @{ Name = "pm5"; Email = "pm5@aetherpmo.com"; ScreenRole = "pm"; Role = "PM" },

    # 수행담당자 5명 (화면 worker -> DB 저장 WORKER)
    @{ Name = "수행담당자1"; Email = "viewer1@aetherpmo.com"; ScreenRole = "worker"; Role = "WORKER" },
    @{ Name = "수행담당자2"; Email = "viewer2@aetherpmo.com"; ScreenRole = "worker"; Role = "WORKER" },
    @{ Name = "수행담당자3"; Email = "viewer3@aetherpmo.com"; ScreenRole = "worker"; Role = "WORKER" },
    @{ Name = "수행담당자4"; Email = "viewer4@aetherpmo.com"; ScreenRole = "worker"; Role = "WORKER" },
    @{ Name = "수행담당자5"; Email = "viewer5@aetherpmo.com"; ScreenRole = "worker"; Role = "WORKER" }
)

# 공통 헤더 정의 (PowerShell 5.1 한글 인코딩 깨짐 방지를 위해 charset=utf-8 명시)
$headers = @{
    "apikey"        = $ServiceRoleKey
    "Authorization" = "Bearer $ServiceRoleKey"
    "Content-Type"  = "application/json; charset=utf-8"
}

# 2. 기존 auth.users 조회 (중복 생성 방지)
Write-Host "`n[1/4] Supabase Auth 기존 사용자 목록 조회 중..." -ForegroundColor Yellow
$authUsersUri = "$SupabaseUrl/auth/v1/admin/users?per_page=1000"
try {
    $existingUsersResponse = Invoke-RestMethod -Uri $authUsersUri -Method Get -Headers $headers
    $existingUsers = $existingUsersResponse.users
    $userCount = if ($existingUsers) { $existingUsers.Count } else { 0 }
    Write-Host "-> 현재 등록된 Auth 사용자 수: $userCount 명" -ForegroundColor Green
} catch {
    Write-Host "-> [오류] Auth 사용자 목록 조회 실패: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "   세부정보: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# 3. 기존 public.profiles 조회
Write-Host "`n[2/4] public.profiles 기존 레코드 조회 중..." -ForegroundColor Yellow
$profilesUri = "$SupabaseUrl/rest/v1/profiles?select=id,email,name,role"
try {
    $existingProfiles = Invoke-RestMethod -Uri $profilesUri -Method Get -Headers $headers
    $profileCount = if ($existingProfiles) { $existingProfiles.Count } else { 0 }
    Write-Host "-> 현재 등록된 Profiles 레코드 수: $profileCount 건" -ForegroundColor Green
} catch {
    Write-Host "-> [오류] Profiles 목록 조회 실패: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "   세부정보: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# 4. 계정 생성 및 프로필 동기화 실행
Write-Host "`n[3/4] 15개 테스트 계정 생성 및 프로필 동기화 진행..." -ForegroundColor Yellow

$successCount = 0
$failCount = 0
$results = @()

foreach ($acc in $targetAccounts) {
    $email = $acc.Email
    $name = $acc.Name
    $role = $acc.Role
    $screenRole = $acc.ScreenRole

    Write-Host "`n--- [$screenRole] $name ($email) 처리 중 ---" -ForegroundColor Cyan

    $matchedUser = $existingUsers | Where-Object { $_.email.ToLower() -eq $email.ToLower() }
    $userId = $null

    # A. Auth User 생성 또는 식별
    if ($matchedUser) {
        $userId = $matchedUser.id
        Write-Host "  [Auth] 기존 계정 존재 (UUID: $userId) - 신규 생성을 건너뛰고 프로필을 검증합니다." -ForegroundColor Gray
    } else {
        Write-Host "  [Auth] 신규 사용자 생성 중..." -ForegroundColor Yellow
        $createPayload = @{
            email         = $email
            password      = $DefaultPassword
            email_confirm = $true
            user_metadata = @{
                name = $name
                role = $role
            }
        }
        $createJson = $createPayload | ConvertTo-Json -Depth 3
        $createBodyBytes = [System.Text.Encoding]::UTF8.GetBytes($createJson)

        try {
            $createdUser = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/admin/users" -Method Post -Headers $headers -Body $createBodyBytes
            $userId = $createdUser.id
            Write-Host "  [Auth] 생성 성공! (UUID: $userId)" -ForegroundColor Green
        } catch {
            Write-Host "  [Auth 실패] $($_.Exception.Message)" -ForegroundColor Red
            if ($_.ErrorDetails) {
                Write-Host "   세부정보: $($_.ErrorDetails.Message)" -ForegroundColor Red
            }
            $failCount++
            $results += [PSCustomObject]@{
                Name   = $name
                Email  = $email
                Role   = $role
                Status = "Auth 생성 실패"
                Id     = $null
            }
            continue
        }
    }

    # B. public.profiles 동기화 (id에는 UUID만 사용, email 컬럼에 이메일 저장)
    # 조직정보 컬럼(corporation_type, division, team, part, position)은 입력하지 않음 (NULL 유지)
    $matchedProfile = $existingProfiles | Where-Object { $_.id -eq $userId -or $_.email.ToLower() -eq $email.ToLower() }

    $profileHeaders = @{
        "apikey"        = $ServiceRoleKey
        "Authorization" = "Bearer $ServiceRoleKey"
        "Content-Type"  = "application/json; charset=utf-8"
        "Prefer"        = "return=representation"
    }

    try {
        if ($matchedProfile) {
            Write-Host "  [Profile] 기존 프로필 업데이트 중 (UUID: $userId)..." -ForegroundColor Yellow
            $patchPayload = @{
                name = $name
                role = $role
            }
            $patchJson = $patchPayload | ConvertTo-Json -Depth 2
            $patchBodyBytes = [System.Text.Encoding]::UTF8.GetBytes($patchJson)

            $patchUri = "$SupabaseUrl/rest/v1/profiles?id=eq.$userId"
            $null = Invoke-RestMethod -Uri $patchUri -Method Patch -Headers $profileHeaders -Body $patchBodyBytes
            Write-Host "  [Profile] 업데이트 완료." -ForegroundColor Green
        } else {
            Write-Host "  [Profile] 신규 프로필 등록 중 (UUID: $userId)..." -ForegroundColor Yellow
            $profilePayload = @{
                id    = $userId
                email = $email
                name  = $name
                role  = $role
            }
            $insertJson = $profilePayload | ConvertTo-Json -Depth 2
            $insertBodyBytes = [System.Text.Encoding]::UTF8.GetBytes($insertJson)

            $insertUri = "$SupabaseUrl/rest/v1/profiles"
            $null = Invoke-RestMethod -Uri $insertUri -Method Post -Headers $profileHeaders -Body $insertBodyBytes
            Write-Host "  [Profile] 등록 완료." -ForegroundColor Green
        }

        $successCount++
        $results += [PSCustomObject]@{
            Name   = $name
            Email  = $email
            Role   = $role
            Status = "성공"
            Id     = $userId
        }
    } catch {
        Write-Host "  [Profile 실패] $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "   세부정보: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        $failCount++
        $results += [PSCustomObject]@{
            Name   = $name
            Email  = $email
            Role   = $role
            Status = "Profile 동기화 실패"
            Id     = $userId
        }
    }
}

# 5. 최종 검증 및 요약 출력
Write-Host "`n[4/4] 작업 완료 결과 요약" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$summaryColor = if ($failCount -eq 0) { "Green" } else { "Red" }
Write-Host "총 15개 중 성공: $successCount, 실패: $failCount" -ForegroundColor $summaryColor
Write-Host "초기 비밀번호: $DefaultPassword" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan