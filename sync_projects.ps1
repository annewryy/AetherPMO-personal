# PowerShell script to synchronize projects from OneDrive Excel sheet to AetherPMS database
# Written in pure ASCII with Unicode character escapes for safety
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Unicode definitions for status keywords to avoid source code encoding mangling
$strActive = "$([char]0xC218)$([char]0xD589)$([char]0xC911)"    # 수행중
$strClosed = "$([char]0xC885)$([char]0xB8CC)"                   # 종료
$strBidding = "$([char]0xC218)$([char]0xD589)$([char]0xC608)$([char]0xC815)" # 수행예정
$strBidding2 = "$([char]0xC785)$([char]0xCC30)"                 # 입찰

$wildcardPath = "C:\Users\$env:USERNAME\OneDrive*\00. *\2. *\*260313.xlsx"
Write-Host "Resolving OneDrive Excel sheet: $wildcardPath"

$resolved = Resolve-Path $wildcardPath -ErrorAction SilentlyContinue
if (-not $resolved) {
    Write-Error "Could not locate project information board Excel file."
    exit 1
}

$filePath = $resolved[0].Path
Write-Host "Located file: $filePath"

try {
    Write-Host "Connecting to Excel COM interface..."
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    
    $workbook = $excel.Workbooks.Open($filePath, [Type]::Missing, $true)
    $sheet = $workbook.Sheets.Item(1)
    
    $projects = @()
    
    Write-Host "Parsing rows from 7 to 35..."
    
    for ($r = 7; $r -le 35; $r++) {
        $statusText = $sheet.Cells.Item($r, 2).Text.Trim()
        $code = $sheet.Cells.Item($r, 3).Text.Trim()
        $name = $sheet.Cells.Item($r, 4).Text.Trim()
        $customer = $sheet.Cells.Item($r, 5).Text.Trim()
        $pm = $sheet.Cells.Item($r, 6).Text.Trim()
        $sales = $sheet.Cells.Item($r, 7).Text.Trim()
        $contractStart = $sheet.Cells.Item($r, 8).Text.Trim()
        $contractEnd = $sheet.Cells.Item($r, 9).Text.Trim()
        $execStart = $sheet.Cells.Item($r, 10).Text.Trim()
        $execEnd = $sheet.Cells.Item($r, 11).Text.Trim()
        $budget = $sheet.Cells.Item($r, 12).Text.Trim().Replace("`n", " ").Replace("`r", " ")
        $bizType = $sheet.Cells.Item($r, 13).Text.Trim()
        $bizStructure = $sheet.Cells.Item($r, 14).Text.Trim()
        $difficulty = $sheet.Cells.Item($r, 15).Text.Trim()
        
        if ([string]::IsNullOrEmpty($code) -or $code -eq "프로젝트 코드") {
            continue
        }
        
        # Clean name and customer from double quotes and newlines
        $nameClean = $name.Replace("`n", " ").Replace("`r", " ").Replace("'", "\'").Replace('"', '\"')
        $customerClean = $customer.Replace("'", "\'").Replace('"', '\"')
        $pmClean = $pm.Replace("'", "\'").Replace('"', '\"')
        $salesClean = $sales.Replace("'", "\'").Replace('"', '\"')
        $budgetClean = $budget.Replace("'", "\'").Replace('"', '\"')
        $bizTypeClean = $bizType.Replace("'", "\'").Replace('"', '\"')
        $bizStructureClean = $bizStructure.Replace("'", "\'").Replace('"', '\"')
        $difficultyClean = $difficulty.Replace("'", "\'").Replace('"', '\"')
        
        # Map statuses
        $mappedStatus = "In Progress"
        if ($statusText -eq $strClosed) {
            $mappedStatus = "Completed"
        } elseif ($statusText -eq $strBidding -or $statusText -eq $strBidding2) {
            $mappedStatus = "Bidding"
        }
        
        # Determine dates
        $startDate = $contractStart
        if ([string]::IsNullOrEmpty($startDate)) { $startDate = $execStart }
        if ([string]::IsNullOrEmpty($startDate)) { $startDate = "2026-01-01" }
        
        $endDate = $contractEnd
        if ([string]::IsNullOrEmpty($endDate)) { $endDate = $execEnd }
        if ([string]::IsNullOrEmpty($endDate)) { $endDate = "2026-12-31" }
        
        # Calculate progress
        $progress = 0
        if ($mappedStatus -eq "Completed") {
            $progress = 100
        } elseif ($mappedStatus -eq "Bidding") {
            $progress = 0
        } else {
            try {
                $today = [datetime]"2026-05-28"
                $startDt = [datetime]$startDate
                $endDt = [datetime]$endDate
                if ($today -ge $endDt) {
                    $progress = 100
                } elseif ($today -le $startDt) {
                    $progress = 0
                } else {
                    $totalDays = ($endDt - $startDt).TotalDays
                    $elapsedDays = ($today - $startDt).TotalDays
                    if ($totalDays -gt 0) {
                        $progress = [math]::Round(($elapsedDays / $totalDays) * 100)
                    }
                }
            } catch {
                $progress = 45 # Fallback
            }
        }
        
        # Project Javascript Object
        $projObj = @"
            {
                id: '$code',
                name: '$nameClean',
                customer: '$customerClean',
                sales: '$salesClean',
                budget: '$budgetClean',
                bizType: '$bizTypeClean',
                bizStructure: '$bizStructureClean',
                difficulty: '$difficultyClean',
                manager: '$pmClean',
                startDate: '$startDate',
                endDate: '$endDate',
                status: '$mappedStatus',
                progress: $progress
            }
"@
        $projects += $projObj
    }
    
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    
    # --------------------------------------------------------------------------
    # UPDATE app.js FILE (Dynamic Path via $PSScriptRoot)
    # --------------------------------------------------------------------------
    $appJsPath = Join-Path $PSScriptRoot "app.js"
    Write-Host "Resolved app.js path: $appJsPath"
    
    if (Test-Path $appJsPath) {
        Write-Host "Updating app.js database..."
        $appJsContent = Get-Content -Path $appJsPath -Raw -Encoding UTF8
        
        $projString = $projects -join ",`n"
        
        # JavaScript logic block to generate checklists, activities, and artifacts dynamically
        $newLoadMockData = @"
    loadMockData() {
        const rawProjects = [
$projString
        ];

        // Mappings for departments
        const mockProjects = rawProjects.map(p => {
            let dept = "개발팀";
            if (p.manager === "이노선") dept = "품질관리팀";
            else if (p.manager === "박지민") dept = "디자인팀";
            else if (p.manager === "오영일" || p.manager === "김태환") dept = "기획팀";

            const desc = `고객사: \${p.customer} | 영업대표: \${p.sales} | 사업유형: \${p.bizType} | 사업구도: \${p.bizStructure} | 난이도: \${p.difficulty} | 예산: \${p.budget} 원 (VAT별도)`;

            return {
                id: p.id,
                name: p.name,
                desc: desc,
                dept: dept,
                manager: p.manager,
                startDate: p.startDate,
                endDate: p.endDate,
                status: p.status,
                progress: p.progress
            };
        });

        const mockChecklists = [];
        const mockArtifacts = [];
        const mockActivities = [];

        mockProjects.forEach(p => {
            const code = p.id;
            const pm = p.manager;
            const progress = p.progress;

            if (p.status === "Completed") {
                mockChecklists.push({ id: `chk-\${code}-1`, projectId: code, category: 'Requirements', title: '요구사항 분석서 제출', checked: true });
                mockChecklists.push({ id: `chk-\${code}-2`, projectId: code, category: 'Architecture Design', title: '시스템 설계 명세서 승인', checked: true });
                mockChecklists.push({ id: `chk-\${code}-3`, projectId: code, category: 'Source Code', title: '개발 소스코드 릴리즈 완료', checked: true });
                mockChecklists.push({ id: `chk-\${code}-4`, projectId: code, category: 'Final Report', title: '준공 검수 및 완료보고서 제출', checked: true });

                mockArtifacts.push({
                    id: `art-\${code}-final`,
                    projectId: code,
                    name: `[\${code}] 사업 완료보고서 및 인수인계서`,
                    category: 'Final Report',
                    version: 'v1.0.0',
                    description: '프로젝트 준공 및 검수 완료 최종 보고 서류.',
                    author: pm,
                    dueDate: p.endDate,
                    createdDate: p.endDate,
                    status: 'Approved',
                    fileName: `\${code}_Final_Report_v1.0.0.pdf`,
                    fileSize: '3.8 MB',
                    history: [
                        { version: 'v1.0.0', desc: '최종 보고서 등록', date: p.endDate, author: pm, fileName: `\${code}_Final_Report_v1.0.0.pdf`, fileSize: '3.8 MB' }
                    ],
                    reviews: [
                        { reviewer: '검수팀', comment: '최종 검수가 완료되었습니다.', date: `\${p.endDate} 14:00`, action: 'Approved' }
                    ]
                });
            } else if (p.status === "Bidding") {
                mockChecklists.push({ id: `chk-\${code}-1`, projectId: code, category: 'Requirements', title: '나라장터 사전 규격 분석 및 입찰 심사', checked: true });
                mockChecklists.push({ id: `chk-\${code}-2`, projectId: code, category: 'Etc', title: '제안요청서(RFP) 분석 및 투찰 준비', checked: false });
            } else {
                // In Progress
                mockChecklists.push({ id: `chk-\${code}-1`, projectId: code, category: 'Requirements', title: '정보화사업 착수계 및 사업책임자계 승인', checked: true });
                mockChecklists.push({ id: `chk-\${code}-2`, projectId: code, category: 'Architecture Design', title: '중간 설계 산출물 분석 보고', checked: progress > 50 });
                mockChecklists.push({ id: `chk-\${code}-3`, projectId: code, category: 'Source Code', title: '핵심 서비스 API 인터페이스 구현', checked: progress > 75 });
                mockChecklists.push({ id: `chk-\${code}-4`, projectId: code, category: 'Test Plan', title: '통합 및 사용자 기능 테스트 완료', checked: false });

                mockArtifacts.push({
                    id: `art-\${code}-init`,
                    projectId: code,
                    name: `[\${code}] 정보화사업 착수계 및 사업수행계획서`,
                    category: 'Requirements',
                    version: 'v1.0.0',
                    description: '수행 사업 착수계 통합 본.',
                    author: pm,
                    dueDate: p.startDate,
                    createdDate: p.startDate,
                    status: 'Approved',
                    fileName: `\${code}_Initiation_Docs_v1.0.0.pdf`,
                    fileSize: '4.5 MB',
                    history: [
                        { version: 'v1.0.0', desc: '착수계 초안 제출', date: p.startDate, author: pm, fileName: `\${code}_Initiation_Docs_v1.0.0.pdf`, fileSize: '4.5 MB' }
                    ],
                    reviews: [
                        { reviewer: '안유경 관리자', comment: '수행 계획 및 일정이 명확합니다. 승인 처리합니다.', date: `\${p.startDate} 11:30`, action: 'Approved' }
                    ]
                });
            }

            mockActivities.push({
                id: `act-\${code}`,
                projectId: code,
                projectName: p.name,
                type: 'project',
                text: `프로젝트 [\${code}] \${p.name} 이(가) 조달 관리 통합 동기화되었습니다.`,
                date: '2026-05-28 10:00'
            });
        });

        this.state = {
            projects: mockProjects,
            checklists: mockChecklists,
            artifacts: mockArtifacts,
            activities: mockActivities,
            templateSlots: [],
            theme: 'dark',
            konepsApiKey: ''
        };

        // Populate default template slots for projects
        this.state.projects.forEach(p => {
            this.preloadTemplateSlotsForProject(p.id);
        });

        this.saveState();
    }
"@
        
        $regex = "(?s)loadMockData\(\)\s*\{.*?this\.saveState\(\);\s*\}"
        if ($appJsContent -match $regex) {
            $appJsContent = $appJsContent -replace $regex, $newLoadMockData
            Write-Host "Successfully replaced loadMockData block in app.js."
        } else {
            Write-Warning "Could not find matching regex loadMockData block in app.js."
        }
        
        $targetBlock = "loadState() {
        const stored = localStorage.getItem('aether_pms_state');
        if (stored) {
            try {
                this.state = JSON.parse(stored);
                // Ensure all arrays exist"
                
        $replacementBlock = "loadState() {
        const stored = localStorage.getItem('aether_pms_state');
        if (stored) {
            try {
                this.state = JSON.parse(stored);
                
                // Force database reload if it's the old mock data
                const hasRealData = this.state.projects.some(p => p.id.startsWith('OP-'));
                if (!hasRealData) {
                    this.loadMockData();
                }
                
                // Ensure all arrays exist"
                
        if ($appJsContent.Contains($targetBlock)) {
            $appJsContent = $appJsContent.Replace($targetBlock, $replacementBlock)
            Write-Host "Successfully injected automatic migration check in loadState()."
        } else {
            Write-Warning "Migration check inject bypassed (already present or modified)."
        }
        
        # Save app.js
        [System.IO.File]::WriteAllText($appJsPath, $appJsContent, [System.Text.Encoding]::UTF8)
        Write-Host "app.js updated successfully."
    } else {
        Write-Error "app.js not found at: $appJsPath"
    }
    
    Write-Host "All tasks completed successfully."
} catch {
    Write-Error "Failed to process projects sync: $_"
    if ($excel) {
        try { $excel.Quit() } catch {}
    }
}
