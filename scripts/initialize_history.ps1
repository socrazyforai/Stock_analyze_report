# Scripts to pull initial history from TWSE using PowerShell
$dates = @("20260714", "20260715", "20260716", "20260717", "20260720", "20260721", "20260722")
$history = @()

Write-Host "Initializing historical data from TWSE..."

# Create data directory if not exists
$dataDir = Join-Path $PSScriptRoot "../data"
if (!(Test-Path $dataDir)) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

foreach ($date in $dates) {
    $url = "https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=$date&selectType=MS"
    Write-Host "Fetching TWSE data for $date..."
    try {
        Start-Sleep -Seconds 2 # Rate limiting safety
        $res = Invoke-RestMethod -Uri $url -UseBasicParsing
        if ($res.stat -eq "OK" -and $res.tables -and $res.tables.Length -gt 0) {
            $rows = $res.tables[0].data
            
            $marginUnits = $rows[0]
            $shortUnits = $rows[1]
            $marginMoney = $rows[2]

            $cleanInt = {
                param($val)
                if (!$val) { return 0 }
                return [int]($val.ToString().Replace(",", "").Trim())
            }

            # Map the parsed TWSE fields
            $parsedTWSE = @{
                date = $date
                margin_buy_units = &$cleanInt $marginUnits[1]
                margin_sell_units = &$cleanInt $marginUnits[2]
                margin_redemp_units = &$cleanInt $marginUnits[3]
                margin_prev_units = &$cleanInt $marginUnits[4]
                margin_today_units = &$cleanInt $marginUnits[5]
                margin_change_units = (&$cleanInt $marginUnits[5]) - (&$cleanInt $marginUnits[4])
                
                short_buy_units = &$cleanInt $shortUnits[1]
                short_sell_units = &$cleanInt $shortUnits[2]
                short_redemp_units = &$cleanInt $shortUnits[3]
                short_prev_units = &$cleanInt $shortUnits[4]
                short_today_units = &$cleanInt $shortUnits[5]
                short_change_units = (&$cleanInt $shortUnits[5]) - (&$cleanInt $shortUnits[4])

                margin_buy_money = &$cleanInt $marginMoney[1]
                margin_sell_money = &$cleanInt $marginMoney[2]
                margin_redemp_money = &$cleanInt $marginMoney[3]
                margin_prev_money = &$cleanInt $marginMoney[4]
                margin_today_money = &$cleanInt $marginMoney[5]
                margin_change_money = (&$cleanInt $marginMoney[5]) - (&$cleanInt $marginMoney[4])
            }

            # We can't fetch TPEx historical data easily from their openapi, so we initialize it with 0
            $parsedTPEx = @{
                date = $date
                tpex_margin_buy = 0
                tpex_margin_sell = 0
                tpex_margin_redemp = 0
                tpex_margin_prev = 0
                tpex_margin_today = 0
                tpex_margin_change = 0
                tpex_short_buy = 0
                tpex_short_sell = 0
                tpex_short_redemp = 0
                tpex_short_prev = 0
                tpex_short_today = 0
                tpex_short_change = 0
            }

            $summary = @{
                date = $date
                twse = $parsedTWSE
                tpex = $parsedTPEx
                updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }

            $history += $summary
            Write-Host "Success for $date"
        } else {
            Write-Host "No data for $date"
        }
    } catch {
        Write-Host "Error fetching $date : $_"
    }
}

if ($history.Count -gt 0) {
    $historyFile = Join-Path $dataDir "history.json"
    $summaryFile = Join-Path $dataDir "summary.json"
    
    $history | ConvertTo-Json -Depth 5 | Out-File -FilePath $historyFile -Encoding utf8
    $history[-1] | ConvertTo-Json -Depth 5 | Out-File -FilePath $summaryFile -Encoding utf8
    
    Write-Host "History initialized successfully with $($history.Count) days of data."
} else {
    Write-Host "Failed to fetch any historical data."
}
