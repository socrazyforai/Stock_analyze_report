param(
    [string]$Date
)

$OutputEncoding = [System.Text.Encoding]::UTF8

# Helper: Parse numbers, handle commas and empty values
function Parse-Number ($val) {
    if ($null -eq $val) { return 0 }
    $clean = $val.ToString().Replace(",", "").Replace(" ", "").Trim()
    if ($clean -eq "--" -or $clean -eq "" -or $clean -eq "nil") { return 0 }
    
    $num = $clean -as [double]
    if ($null -ne $num) {
        return $num
    }
    return 0
}

# Default to today
if ([string]::IsNullOrEmpty($Date)) {
    $Date = (Get-Date).ToString("yyyyMMdd")
}

Write-Host "Start fetching stocks data, date: $Date"

# Create target directory
$targetDir = Join-Path $PSScriptRoot "../data/daily_stocks"
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
}

$outputFile = Join-Path $targetDir "$Date.json"

# ROC date conversion
$year = [int]$Date.Substring(0, 4)
$rocYear = $year - 1911
$rocDate = "$rocYear/" + $Date.Substring(4, 2) + "/" + $Date.Substring(6, 2)

# Initialize stocks map
$stocks = @{}

# ==========================================
# 1. TWSE Data
# ==========================================
Write-Host ">>> Downloading TWSE MI_INDEX..."
$twseIndexUrl = "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=$Date&type=ALLBUT0999"
try {
    $res = Invoke-WebRequest -Uri $twseIndexUrl -UseBasicParsing -TimeoutSec 15
    $json = $res.Content | ConvertFrom-Json
    if ($json.stat -eq "OK") {
        $t = $json.tables | Where-Object { $_.fields.Count -eq 16 } | Select-Object -First 1
        if ($null -ne $t) {
            foreach ($row in $t.data) {
                $code = $row[0].Trim()
                $name = $row[1].Trim()
                # Keep only 4-digit stock symbols
                if ($code -match '^\d{4}$') {
                    # Handle price change direction
                    $dirHtml = $row[9]
                    $changeVal = Parse-Number $row[10]
                    $change = $changeVal
                    if ($dirHtml -like "*color:green*") {
                        $change = -$changeVal
                    }
                    
                    $stocks[$code] = @{
                        "symbol"        = $code
                        "name"          = $name
                        "open"          = (Parse-Number $row[5])
                        "high"          = (Parse-Number $row[6])
                        "low"           = (Parse-Number $row[7])
                        "close"         = (Parse-Number $row[8])
                        "volume"        = ([Math]::Round((Parse-Number $row[2]) / 1000)) # to shares/1000
                        "change"        = $change
                        "margin_buy"    = 0
                        "margin_sell"   = 0
                        "margin_today"  = 0
                        "margin_change" = 0
                        "foreign_net"   = 0
                        "sitc_net"      = 0
                        "dealers_net"   = 0
                    }
                }
            }
        }
    } else {
        Write-Warning "No TWSE quote data (probably non-trading day)"
    }
} catch {
    Write-Error "Failed to download TWSE MI_INDEX: $_"
}

Write-Host ">>> Downloading TWSE MI_MARGN..."
$twseMarginUrl = "https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=$Date&selectType=ALL"
try {
    $res = Invoke-WebRequest -Uri $twseMarginUrl -UseBasicParsing -TimeoutSec 15
    $json = $res.Content | ConvertFrom-Json
    if ($json.stat -eq "OK") {
        $t = $json.tables | Where-Object { $_.fields.Count -eq 16 } | Select-Object -First 1
        if ($null -ne $t) {
            foreach ($row in $t.data) {
                $code = $row[0].Trim()
                if ($stocks.ContainsKey($code)) {
                    $marginToday = Parse-Number $row[6]
                    $marginPrev = Parse-Number $row[5]
                    $stocks[$code]["margin_today"]  = $marginToday
                    $stocks[$code]["margin_change"] = ($marginToday - $marginPrev)
                    $stocks[$code]["margin_buy"]    = (Parse-Number $row[2])
                    $stocks[$code]["margin_sell"]   = (Parse-Number $row[3])
                }
            }
        }
    }
} catch {
    Write-Warning "Failed to download TWSE MI_MARGN: $_"
}

Write-Host ">>> Downloading TWSE T86..."
$twseT86Url = "https://www.twse.com.tw/fund/T86?response=json&date=$Date&selectType=ALL"
try {
    $res = Invoke-WebRequest -Uri $twseT86Url -UseBasicParsing -TimeoutSec 15
    $json = $res.Content | ConvertFrom-Json
    if ($json.stat -eq "OK") {
        foreach ($row in $json.data) {
            $code = $row[0].Trim()
            if ($stocks.ContainsKey($code)) {
                $stocks[$code]["foreign_net"] = ([Math]::Round((Parse-Number $row[4]) / 1000))
                $stocks[$code]["sitc_net"]    = ([Math]::Round((Parse-Number $row[10]) / 1000))
                $stocks[$code]["dealers_net"] = ([Math]::Round((Parse-Number $row[11]) / 1000))
            }
        }
    }
} catch {
    Write-Warning "Failed to download TWSE T86: $_"
}


# ==========================================
# 2. TPEx Data
# ==========================================
Write-Host ">>> Downloading TPEx Quotes..."
$tpexQuotesUrl = "https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&o=json&d=$rocDate"
try {
    $res = Invoke-WebRequest -Uri $tpexQuotesUrl -UseBasicParsing -TimeoutSec 15
    $json = $res.Content | ConvertFrom-Json
    if ($json.stat -eq "ok") {
        $t = $json.tables[0]
        if ($null -ne $t) {
            foreach ($row in $t.data) {
                $code = $row[0].Trim()
                $name = $row[1].Trim()
                if ($code -match '^\d{4}$') {
                    $changeStr = $row[3].ToString().Trim()
                    $change = Parse-Number $changeStr
                    
                    $stocks[$code] = @{
                        "symbol"        = $code
                        "name"          = $name
                        "open"          = (Parse-Number $row[4])
                        "high"          = (Parse-Number $row[5])
                        "low"           = (Parse-Number $row[6])
                        "close"         = (Parse-Number $row[2])
                        "volume"        = ([Math]::Round((Parse-Number $row[8]) / 1000))
                        "change"        = $change
                        "margin_buy"    = 0
                        "margin_sell"   = 0
                        "margin_today"  = 0
                        "margin_change" = 0
                        "foreign_net"   = 0
                        "sitc_net"      = 0
                        "dealers_net"   = 0
                    }
                }
            }
        }
    }
} catch {
    Write-Error "Failed to download TPEx Quotes: $_"
}

Write-Host ">>> Downloading TPEx Margin..."
$tpexMarginUrl = "https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&o=json&d=$rocDate"
try {
    $res = Invoke-WebRequest -Uri $tpexMarginUrl -UseBasicParsing -TimeoutSec 15
    $json = $res.Content | ConvertFrom-Json
    if ($json.stat -eq "ok") {
        $t = $json.tables[0]
        if ($null -ne $t) {
            foreach ($row in $t.data) {
                $code = $row[0].Trim()
                if ($stocks.ContainsKey($code)) {
                    $marginToday = Parse-Number $row[6]
                    $marginPrev = Parse-Number $row[2]
                    $stocks[$code]["margin_today"]  = $marginToday
                    $stocks[$code]["margin_change"] = ($marginToday - $marginPrev)
                    $stocks[$code]["margin_buy"]    = (Parse-Number $row[3])
                    $stocks[$code]["margin_sell"]   = (Parse-Number $row[4])
                }
            }
        }
    }
} catch {
    Write-Warning "Failed to download TPEx Margin: $_"
}

Write-Host ">>> Downloading TPEx T86..."
$tpexT86Url = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&d=$rocDate&se=EW"
try {
    $res = Invoke-WebRequest -Uri $tpexT86Url -UseBasicParsing -TimeoutSec 15
    $json = $res.Content | ConvertFrom-Json
    if ($json.stat -eq "ok") {
        $t = $json.tables[0]
        if ($null -ne $t) {
            foreach ($row in $t.data) {
                $code = $row[0].Trim()
                if ($stocks.ContainsKey($code)) {
                    $stocks[$code]["foreign_net"] = ([Math]::Round((Parse-Number $row[4]) / 1000))
                    $stocks[$code]["sitc_net"]    = ([Math]::Round((Parse-Number $row[13]) / 1000))
                    $stocks[$code]["dealers_net"] = ([Math]::Round((Parse-Number $row[22]) / 1000))
                }
            }
        }
    }
} catch {
    Write-Warning "Failed to download TPEx T86: $_"
}


# ==========================================
# 3. Filter and save
# ==========================================
$filteredStocks = @{}
foreach ($key in $stocks.Keys) {
    $s = $stocks[$key]
    if ($s["close"] -gt 0 -and $s["volume"] -ge 300) {
        $filteredStocks[$key] = $s
    }
}

Write-Host "Filtered active stocks count: $($filteredStocks.Count)"

if ($filteredStocks.Count -gt 0) {
    $jsonText = $filteredStocks | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($outputFile, $jsonText, $utf8NoBom)
    Write-Host "Successfully wrote file: $outputFile"
} else {
    Write-Warning "No active stocks found, skip writing."
}

# ==========================================
# 4. Cleanup old files
# ==========================================
$historyFile = Join-Path $PSScriptRoot "../data/history.json"
if (Test-Path $historyFile) {
    try {
        $historyList = Get-Content -Raw -Path $historyFile | ConvertFrom-Json
        $validDates = @{}
        foreach ($h in $historyList) {
            $d = $h.date.Replace("-", "").Replace("/", "").Trim()
            $validDates[$d] = $true
        }
        
        $files = Get-ChildItem -Path $targetDir -Filter "*.json"
        foreach ($f in $files) {
            $fName = $f.BaseName
            if (!$validDates.ContainsKey($fName) -and $fName -ne $Date) {
                Write-Host "Cleanup old file: $($f.Name)"
                Remove-Item -Path $f.FullName -Force
            }
        }
    } catch {
        Write-Warning "Failed to cleanup: $_"
    }
}
