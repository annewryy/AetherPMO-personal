# PowerShell script to read project sheet using Excel COM object (ASCII wildcards only)
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Resolve the path using purely ASCII wildcard characters
$wildcardPath = "C:\Users\$env:USERNAME\OneDrive*\00. *\2. *\*260313.xlsx"
Write-Host "Resolving wildcard path: $wildcardPath"

$resolved = Resolve-Path $wildcardPath -ErrorAction SilentlyContinue
if (-not $resolved) {
    Write-Error "No file matched the wildcard pattern: $wildcardPath"
    exit 1
}

$filePath = $resolved[0].Path
Write-Host "Resolved file path: $filePath"

try {
    Write-Host "Creating Excel COM Object..."
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    
    Write-Host "Opening workbook..."
    $workbook = $excel.Workbooks.Open($filePath, [Type]::Missing, $true) # open read-only
    $sheet = $workbook.Sheets.Item(1)
    
    Write-Host "Sheet name: $($sheet.Name)"
    Write-Host "Reading rows..."
    
    # Read first 100 rows, first 15 columns
    for ($r = 1; $r -le 100; $r++) {
        $rowData = @()
        $hasValue = $false
        for ($c = 1; $c -le 15; $c++) {
            $val = $sheet.Cells.Item($r, $c).Text
            if (-not [string]::IsNullOrWhiteSpace($val)) {
                $hasValue = $true
            }
            $rowData += $val
        }
        if ($hasValue) {
            # Print row format: RowIndex::Col1||Col2||Col3...
            Write-Output "$r`::$( $rowData -join '||' )"
        }
    }
    
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    Write-Host "Completed successfully."
} catch {
    Write-Error "Excel COM processing failed: $_"
    if ($excel) {
        try { $excel.Quit() } catch {}
    }
}
