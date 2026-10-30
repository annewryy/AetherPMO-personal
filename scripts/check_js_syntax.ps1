$baseDir = Split-Path $PSScriptRoot -Parent
Set-Location $baseDir

$files = @(
    "api/ai/chat.js",
    "api/ai/health.js",
    "ai-automation.js",
    "build-config.js",
    "app.js",
    "sw.js",
    "api/ai/security/data-classifier.js",
    "api/ai/security/deidentifier.js",
    "api/ai/security/prompt-whitelist.js",
    "api/ai/security/text-sanitizer.js",
    "api/ai/security/gateway.js",
    "api/ai/security/audit-guard.js",
    "api/ai/security/index.js"
)

foreach ($f in $files) {
    $fullPath = Join-Path $baseDir $f
    if (-not (Test-Path $fullPath)) {
        Write-Host "File not found: $fullPath" -ForegroundColor Red
        continue
    }
    $content = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
    $stack = New-Object System.Collections.Generic.Stack[string]
    $inStr = $false
    $strChar = ""
    $inRegex = $false
    $inBlockComment = $false
    $inLineComment = $false
    $line = 1
    $col = 0
    $len = $content.Length
    $i = 0
    $hasError = $false
    $lastNonWhitespaceChar = ''

    while ($i -lt $len) {
        $ch = $content[$i]
        $col++
        if ($ch -eq "`n") { $line++; $col = 0; $inLineComment = $false; $i++; continue }
        if ($inLineComment) { $i++; continue }

        if ($inBlockComment) {
            if ($ch -eq '*' -and ($i + 1 -lt $len) -and $content[$i+1] -eq '/') {
                $inBlockComment = $false
                $i += 2; $col++; continue
            }
            $i++; continue
        }

        if ($inStr) {
            if ($ch -eq '\') {
                $i += 2; $col++; continue
            }
            if ($ch -eq $strChar) {
                $inStr = $false
                $lastNonWhitespaceChar = $ch
            }
            $i++; continue
        }

        if ($inRegex) {
            if ($ch -eq '\') {
                $i += 2; $col++; continue
            }
            if ($ch -eq '/') {
                $inRegex = $false
                $lastNonWhitespaceChar = '/'
            }
            $i++; continue
        }

        # check comments
        if ($ch -eq '/' -and ($i + 1 -lt $len)) {
            $next = $content[$i+1]
            if ($next -eq '/') { $inLineComment = $true; $i += 2; $col++; continue }
            if ($next -eq '*') { $inBlockComment = $true; $i += 2; $col++; continue }
        }

        # check regex literal vs division:
        # A slash is a regex literal if it follows an operator, punctuation, or start of line
        if ($ch -eq '/') {
            $isRegexContext = ($lastNonWhitespaceChar -eq '' -or
                               $lastNonWhitespaceChar -eq '(' -or
                               $lastNonWhitespaceChar -eq ',' -or
                               $lastNonWhitespaceChar -eq '=' -or
                               $lastNonWhitespaceChar -eq ':' -or
                               $lastNonWhitespaceChar -eq '[' -or
                               $lastNonWhitespaceChar -eq '!' -or
                               $lastNonWhitespaceChar -eq '&' -or
                               $lastNonWhitespaceChar -eq '|' -or
                               $lastNonWhitespaceChar -eq '?' -or
                               $lastNonWhitespaceChar -eq '{' -or
                               $lastNonWhitespaceChar -eq ';' -or
                               $lastNonWhitespaceChar -eq '~' -or
                               $lastNonWhitespaceChar -eq '^' -or
                               $lastNonWhitespaceChar -eq '+' -or
                               $lastNonWhitespaceChar -eq '-')
            if ($isRegexContext) {
                $inRegex = $true
                $i++
                continue
            }
        }

        # check string literals
        if ($ch -eq '"' -or $ch -eq "'" -or $ch -eq '`') {
            $inStr = $true
            $strChar = $ch
            $i++; continue
        }

        # check brackets
        if ($ch -eq '(' -or $ch -eq '{' -or $ch -eq '[') {
            $tag = [string]$ch + "_" + [string]$line + "_" + [string]$col
            $stack.Push($tag)
        } elseif ($ch -eq ')' -or $ch -eq '}' -or $ch -eq ']') {
            if ($stack.Count -eq 0) {
                Write-Host ("SYNTAX ERROR in " + $f + " at line " + $line + " col " + $col + ": unmatched " + $ch) -ForegroundColor Red
                $hasError = $true
                break
            }
            $top = $stack.Pop()
            $topChar = $top.Substring(0, 1)
            if (($ch -eq ')' -and $topChar -ne '(') -or
                ($ch -eq '}' -and $topChar -ne '{') -or
                ($ch -eq ']' -and $topChar -ne '[')) {
                Write-Host ("SYNTAX ERROR in " + $f + " at line " + $line + " col " + $col + ": mismatched " + $ch + ", expected " + $topChar + " from " + $top) -ForegroundColor Red
                $hasError = $true
                break
            }
        }

        if (-not [char]::IsWhiteSpace($ch)) {
            $lastNonWhitespaceChar = $ch
        }
        $i++
    }

    if ($inStr) {
        Write-Host ("SYNTAX ERROR in " + $f + ": unclosed string literal (" + $strChar + ")") -ForegroundColor Red
        $hasError = $true
    }
    if ($inRegex) {
        Write-Host ("SYNTAX ERROR in " + $f + ": unclosed regex literal") -ForegroundColor Red
        $hasError = $true
    }
    if ($inBlockComment) {
        Write-Host ("SYNTAX ERROR in " + $f + ": unclosed block comment") -ForegroundColor Red
        $hasError = $true
    }
    if ($stack.Count -gt 0 -and -not $hasError) {
        $rem = $stack.Pop()
        Write-Host ("SYNTAX ERROR in " + $f + ": unclosed bracket " + $rem) -ForegroundColor Red
        $hasError = $true
    }

    if (-not $hasError) {
        Write-Host ("PASS: " + $f + " (" + $len + " chars, " + $line + " lines)") -ForegroundColor Green
    }
}
