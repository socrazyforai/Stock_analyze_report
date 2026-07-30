# PowerShell script to fetch stock data for a specific date and add it to the history
param(
    [string]$dateStr
)

if (!$dateStr) {
    Write-Host "Please specify a date (YYYYMMDD)."
    exit 1
}

$dataDir = Join-Path $PSScriptRoot "../data"
$historyFile = Join-Path $dataDir "history.json"
$summaryFile = Join-Path $dataDir "summary.json"

# Clean int helper
$cleanVal = {
    param($val)
    if (!$val) { return 0 }
    $str = $val.ToString().Replace(",", "").Trim()
    if ($str -match "^\d+(\.\d+)?$") {
        return [double]$str
    }
    return 0
}

# Fetch TWSE
$twseUrl = "https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=$dateStr&selectType=MS"
Write-Host "Fetching TWSE for $dateStr..."
$resTwse = Invoke-RestMethod -Uri $twseUrl -UseBasicParsing
if ($resTwse.stat -ne "OK" -or !$resTwse.tables -or $resTwse.tables.Length -eq 0) {
    Write-Host "No TWSE data for $dateStr (Weekend or Holiday)."
    exit 0
}

$rows = $resTwse.tables[0].data
$marginUnits = $rows[0]
$shortUnits = $rows[1]
$marginMoney = $rows[2]

$parsedTWSE = @{
    date = $dateStr
    margin_buy_units = &$cleanVal $marginUnits[1]
    margin_sell_units = &$cleanVal $marginUnits[2]
    margin_redemp_units = &$cleanVal $marginUnits[3]
    margin_prev_units = &$cleanVal $marginUnits[4]
    margin_today_units = &$cleanVal $marginUnits[5]
    margin_change_units = (&$cleanVal $marginUnits[5]) - (&$cleanVal $marginUnits[4])
    
    short_buy_units = &$cleanVal $shortUnits[1]
    short_sell_units = &$cleanVal $shortUnits[2]
    short_redemp_units = &$cleanVal $shortUnits[3]
    short_prev_units = &$cleanVal $shortUnits[4]
    short_today_units = &$cleanVal $shortUnits[5]
    short_change_units = (&$cleanVal $shortUnits[5]) - (&$cleanVal $shortUnits[4])

    margin_buy_money = &$cleanVal $marginMoney[1]
    margin_sell_money = &$cleanVal $marginMoney[2]
    margin_redemp_money = &$cleanVal $marginMoney[3]
    margin_prev_money = &$cleanVal $marginMoney[4]
    margin_today_money = &$cleanVal $marginMoney[5]
    margin_change_money = (&$cleanVal $marginMoney[5]) - (&$cleanVal $marginMoney[4])
}

# Fetch TPEx from legacy PHP
$y = [int]$dateStr.Substring(0, 4)
$m = $dateStr.Substring(4, 2)
$d = $dateStr.Substring(6, 2)
$minguoYear = $y - 1911
$formattedMinguo = "$minguoYear/$m/$d"
$tpexUrl = "https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&d=$formattedMinguo"

Write-Host "Fetching TPEx for $dateStr..."
$resTpex = Invoke-RestMethod -Uri $tpexUrl -UseBasicParsing
if (!$resTpex -or !$resTpex.tables -or $resTpex.tables.Length -eq 0 -or !$resTpex.tables[0].summary) {
    Write-Host "Failed to fetch TPEx for $dateStr."
    exit 1
}

$summaryRows = $resTpex.tables[0].summary
$unitsTokens = $summaryRows[0]
$moneyTokens = $summaryRows[1]

$parsedTPEx = @{
    date = $dateStr
    tpex_margin_prev = &$cleanVal $unitsTokens[2]
    tpex_margin_buy = &$cleanVal $unitsTokens[3]
    tpex_margin_sell = &$cleanVal $unitsTokens[4]
    tpex_margin_redemp = &$cleanVal $unitsTokens[5]
    tpex_margin_today = &$cleanVal $unitsTokens[6]
    tpex_margin_change = (&$cleanVal $unitsTokens[6]) - (&$cleanVal $unitsTokens[2])
    
    tpex_short_prev = &$cleanVal $unitsTokens[10]
    tpex_short_buy = &$cleanVal $unitsTokens[11]
    tpex_short_sell = &$cleanVal $unitsTokens[12]
    tpex_short_redemp = &$cleanVal $unitsTokens[13]
    tpex_short_today = &$cleanVal $unitsTokens[14]
    tpex_short_change = (&$cleanVal $unitsTokens[14]) - (&$cleanVal $unitsTokens[10])
    
    tpex_margin_prev_money = (&$cleanVal $moneyTokens[2]) * 1000
    tpex_margin_buy_money = (&$cleanVal $moneyTokens[3]) * 1000
    tpex_margin_sell_money = (&$cleanVal $moneyTokens[4]) * 1000
    tpex_margin_redemp_money = (&$cleanVal $moneyTokens[5]) * 1000
    tpex_margin_today_money = (&$cleanVal $moneyTokens[6]) * 1000
    tpex_margin_change_money = ((&$cleanVal $moneyTokens[6]) - (&$cleanVal $moneyTokens[2])) * 1000
}

# Fetch Fund (BFI82U)
$fundObj = $null
$fundUrl = "https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=$dateStr&type=day"
Write-Host "Fetching BFI82U for $dateStr..."
try {
    $resFund = Invoke-RestMethod -Uri $fundUrl -UseBasicParsing
    if ($resFund.stat -eq "OK" -and $resFund.data -and $resFund.data.Length -ge 6) {
        $rowsBfi = $resFund.data
        $cleanBillion = {
            param($val)
            if (!$val) { return 0.0 }
            $num = [double]($val.ToString().Replace(",", "").Trim())
            return [math]::Round($num / 100000000.0, 2)
        }
        $fundObj = @{
            dealers_self = @{ buy = &$cleanBillion $rowsBfi[0][1]; sell = &$cleanBillion $rowsBfi[0][2]; net = &$cleanBillion $rowsBfi[0][3] }
            dealers_hedge = @{ buy = &$cleanBillion $rowsBfi[1][1]; sell = &$cleanBillion $rowsBfi[1][2]; net = &$cleanBillion $rowsBfi[1][3] }
            sitc = @{ buy = &$cleanBillion $rowsBfi[2][1]; sell = &$cleanBillion $rowsBfi[2][2]; net = &$cleanBillion $rowsBfi[2][3] }
            foreign = @{ buy = &$cleanBillion $rowsBfi[3][1]; sell = &$cleanBillion $rowsBfi[3][2]; net = &$cleanBillion $rowsBfi[3][3] }
            total = @{ buy = &$cleanBillion $rowsBfi[5][1]; sell = &$cleanBillion $rowsBfi[5][2]; net = &$cleanBillion $rowsBfi[5][3] }
        }
    }
} catch {
    Write-Host "Failed to fetch BFI82U for $dateStr."
}

# Merge into history
$historyList = New-Object System.Collections.Generic.List[Object]
if (Test-Path $historyFile) {
    $rawHistory = Get-Content -Raw -Path $historyFile
    $parsedHistory = ConvertFrom-Json $rawHistory
    if ($parsedHistory) {
        if ($parsedHistory -is [array]) {
            foreach ($x in $parsedHistory) { [void]$historyList.Add($x) }
        } else {
            [void]$historyList.Add($parsedHistory)
        }
    }
}

# Remove existing entry for same date
$toRemove = $null
foreach ($x in $historyList) {
    if ($x.date -eq $dateStr) {
        $toRemove = $x
    }
}
if ($toRemove -ne $null) {
    [void]$historyList.Remove($toRemove)
}

$summary = @{
    date = $dateStr
    twse = $parsedTWSE
    tpex = $parsedTPEx
    fund = $fundObj
    updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
}

[void]$historyList.Add($summary)

# Sort history by date
$sortedHistory = $historyList | Sort-Object { [int]$_.date }
$history = @($sortedHistory)

if ($history.Count -gt 60) {
    $history = $history[-60..-1]
}

# Save back (UTF-8 without BOM)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$historyJson = $history | ConvertTo-Json -Depth 5
$summaryJson = $history[-1] | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($historyFile, $historyJson, $utf8NoBom)
[System.IO.File]::WriteAllText($summaryFile, $summaryJson, $utf8NoBom)

Write-Host "Successfully fetched and saved $dateStr."
