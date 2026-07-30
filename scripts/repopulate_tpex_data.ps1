# PowerShell script to repopulate all historical entries with real TPEx margin/short units and money data
$dataDir = Join-Path $PSScriptRoot "../data"
$historyFile = Join-Path $dataDir "history.json"
$summaryFile = Join-Path $dataDir "summary.json"

if (!(Test-Path $historyFile)) {
    Write-Host "No history.json found to update."
    exit 1
}

$raw = Get-Content -Raw -Path $historyFile
$history = ConvertFrom-Json $raw
if ($history -isnot [array]) {
    $history = @($history)
}

$cleanVal = {
    param($val)
    if (!$val) { return 0 }
    $str = $val.ToString().Replace(",", "").Trim()
    if ($str -match "^\d+(\.\d+)?$") {
        return [double]$str
    }
    return 0
}

Write-Host "Repopulating TPEx units and money data for $($history.Count) history entries..."

$updatedCount = 0
for ($i = 0; $i -lt $history.Count; $i++) {
    $item = $history[$i]
    $dateStr = $item.date
    
    Write-Host "Fetching TPEx PHP data for date $dateStr..."
    
    $y = [int]$dateStr.Substring(0, 4)
    $m = $dateStr.Substring(4, 2)
    $d = $dateStr.Substring(6, 2)
    $minguoYear = $y - 1911
    $formattedMinguo = "$minguoYear/$m/$d"
    
    $url = "https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&d=$formattedMinguo"
    try {
        Start-Sleep -Seconds 2 # Rate limit safety
        $res = Invoke-RestMethod -Uri $url -UseBasicParsing
        if ($res -and $res.tables -and $res.tables.Length -gt 0 -and $res.tables[0].summary) {
            $summaryRows = $res.tables[0].summary
            
            # Select by index (0: units, 1: money)
            # summaryRows[0] is the units string array, summaryRows[1] is the money string array
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

            # Overwrite TPEx data in history entry
            $item.tpex = $parsedTPEx
            $updatedCount++
            Write-Host "Success for $dateStr - Margin Money Today: $($parsedTPEx.tpex_margin_today_money), Change: $($parsedTPEx.tpex_margin_change_money)"
        } else {
            Write-Host "No data returned for $dateStr"
        }
    } catch {
        Write-Host "Error updating TPEx for $dateStr : $_"
    }
}

if ($updatedCount -gt 0) {
    # Save back (UTF-8 without BOM)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $historyJson = $history | ConvertTo-Json -Depth 5
    $summaryJson = $history[-1] | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($historyFile, $historyJson, $utf8NoBom)
    [System.IO.File]::WriteAllText($summaryFile, $summaryJson, $utf8NoBom)
    Write-Host "Successfully repopulated TPEx data for $updatedCount entries."
} else {
    Write-Host "No entries were updated."
}
