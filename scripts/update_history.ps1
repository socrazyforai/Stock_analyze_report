# PowerShell script to update stock history with missing dates and push to GitHub
$dates = @("20260722", "20260723", "20260724", "20260727", "20260728")
$dataDir = Join-Path $PSScriptRoot "../data"
$historyFile = Join-Path $dataDir "history.json"
$summaryFile = Join-Path $dataDir "summary.json"

# Load existing history
$history = @()
if (Test-Path $historyFile) {
    try {
        $raw = Get-Content -Raw -Path $historyFile
        $history = ConvertFrom-Json $raw
        # Ensure it is an array
        if ($history -isnot [array]) {
            $history = @($history)
        }
        Write-Host "Loaded existing history with $($history.Count) entries."
    } catch {
        Write-Host "Error loading history.json: $_"
    }
}

$cleanInt = {
    param($val)
    if (!$val) { return 0 }
    return [int]($val.ToString().Replace(",", "").Trim())
}

$cleanBillion = {
    param($val)
    if (!$val) { return 0.0 }
    $num = [double]($val.ToString().Replace(",", "").Trim())
    return [math]::Round($num / 100000000.0, 2)
}

# Fetch TPEx data for the latest day (which is 20260728)
$latestTpexData = $null
try {
    Write-Host "Fetching latest TPEx data from OpenAPI..."
    $tpexRes = Invoke-RestMethod -Uri "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance" -UseBasicParsing
    if ($tpexRes -and $tpexRes.Length -gt 0) {
        # Sum up
        $sumMarginBuy = 0; $sumMarginSell = 0; $sumMarginRedemp = 0; $sumMarginPrev = 0; $sumMarginToday = 0;
        $sumShortBuy = 0; $sumShortSell = 0; $sumShortRedemp = 0; $sumShortPrev = 0; $sumShortToday = 0;
        
        foreach ($item in $tpexRes) {
            $sumMarginBuy += &$cleanInt $item.MarginPurchase
            $sumMarginSell += &$cleanInt $item.MarginSales
            $sumMarginRedemp += &$cleanInt $item.CashRedemption
            $sumMarginPrev += &$cleanInt $item.MarginPurchaseBalancePreviousDay
            $sumMarginToday += &$cleanInt $item.MarginPurchaseBalance
            
            $sumShortBuy += &$cleanInt $item.ShortConvering
            $sumShortSell += &$cleanInt $item.ShortSale
            $sumShortRedemp += &$cleanInt $item.StockRedemption
            $sumShortPrev += &$cleanInt $item.ShortSaleBalancePreviousDay
            $sumShortToday += &$cleanInt $item.ShortSaleBalance
        }

        $latestTpexData = @{
            date = "20260728"
            tpex_margin_buy = $sumMarginBuy
            tpex_margin_sell = $sumMarginSell
            tpex_margin_redemp = $sumMarginRedemp
            tpex_margin_prev = $sumMarginPrev
            tpex_margin_today = $sumMarginToday
            tpex_margin_change = $sumMarginToday - $sumMarginPrev
            tpex_short_buy = $sumShortBuy
            tpex_short_sell = $sumShortSell
            tpex_short_redemp = $sumShortRedemp
            tpex_short_prev = $sumShortPrev
            tpex_short_today = $sumShortToday
            tpex_short_change = $sumShortToday - $sumShortPrev
        }
        Write-Host "Successfully summed TPEx data for the latest day (Margin Today: $sumMarginToday, Short Today: $sumShortToday)"
    }
} catch {
    Write-Host "Error fetching TPEx: $_"
}

foreach ($date in $dates) {
    # Skip if already exists in history
    $exists = $false
    foreach ($item in $history) {
        if ($item.date -eq $date) {
            $exists = $true
            break
        }
    }
    if ($exists) {
        Write-Host "Date $date already exists in history. Skipping."
        continue
    }

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

            # Use real TPEx data if available for 20260728, otherwise use 0 placeholder for past days
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

            if ($date -eq "20260728" -and $latestTpexData -ne $null) {
                $parsedTPEx = $latestTpexData
            }

            # Fetch BFI82U for the same date
            $fundObj = $null
            $fundUrl = "https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=$date&type=day"
            Write-Host "Fetching BFI82U data for $date..."
            try {
                Start-Sleep -Seconds 2
                $fundRes = Invoke-RestMethod -Uri $fundUrl -UseBasicParsing
                if ($fundRes.stat -eq "OK" -and $fundRes.data -and $fundRes.data.Length -ge 6) {
                    $rowsBfi = $fundRes.data
                    $fundObj = @{
                        dealers_self = @{ buy = &$cleanBillion $rowsBfi[0][1]; sell = &$cleanBillion $rowsBfi[0][2]; net = &$cleanBillion $rowsBfi[0][3] }
                        dealers_hedge = @{ buy = &$cleanBillion $rowsBfi[1][1]; sell = &$cleanBillion $rowsBfi[1][2]; net = &$cleanBillion $rowsBfi[1][3] }
                        sitc = @{ buy = &$cleanBillion $rowsBfi[2][1]; sell = &$cleanBillion $rowsBfi[2][2]; net = &$cleanBillion $rowsBfi[2][3] }
                        foreign = @{ buy = &$cleanBillion $rowsBfi[3][1]; sell = &$cleanBillion $rowsBfi[3][2]; net = &$cleanBillion $rowsBfi[3][3] }
                        total = @{ buy = &$cleanBillion $rowsBfi[5][1]; sell = &$cleanBillion $rowsBfi[5][2]; net = &$cleanBillion $rowsBfi[5][3] }
                    }
                }
            } catch {
                Write-Host "Error fetching BFI82U for $date: $_"
            }

            $summary = @{
                date = $date
                twse = $parsedTWSE
                tpex = $parsedTPEx
                fund = $fundObj
                updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }

            $history += $summary
            Write-Host "Successfully added $date"
        } else {
            Write-Host "No data for $date (Weekend or Holiday)"
        }
    } catch {
        Write-Host "Error fetching $date : $_"
    }
}

# Sort history by date
$history = $history | Sort-Object { [int]$_.date }

# Limit to last 60 days
if ($history.Count -gt 60) {
    $history = $history[-60..-1]
}

# Save files
$history | ConvertTo-Json -Depth 5 | Out-File -FilePath $historyFile -Encoding utf8
$history[-1] | ConvertTo-Json -Depth 5 | Out-File -FilePath $summaryFile -Encoding utf8

Write-Host "Local history updated. Total entries: $($history.Count)."

# Push to GitHub
Write-Host "Pushing updated data files to GitHub..."
git add data/history.json data/summary.json
git commit -m "data: update stock history to 20260728 [skip ci]"
git push origin main
Write-Host "Data pushed successfully! GitHub Pages should update in a minute."
