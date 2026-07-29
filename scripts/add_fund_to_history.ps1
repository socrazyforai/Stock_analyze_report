# PowerShell script to retroactively add Three Major Institutional Investors data to all history entries
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

$cleanBillion = {
    param($val)
    if (!$val) { return 0.0 }
    $num = [double]($val.ToString().Replace(",", "").Trim())
    return [math]::Round($num / 100000000.0, 2)
}

Write-Host "Updating $($history.Count) history entries with BFI82U data..."

$updatedCount = 0
for ($i = 0; $i -lt $history.Count; $i++) {
    $item = $history[$i]
    $date = $item.date
    
    # We always re-fetch or fetch if missing
    Write-Host "Fetching BFI82U for date $date..."
    $url = "https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=$date&type=day"
    try {
        Start-Sleep -Seconds 2 # Rate limit safety
        $res = Invoke-RestMethod -Uri $url -UseBasicParsing
        if ($res.stat -eq "OK" -and $res.data -and $res.data.Length -ge 6) {
            $rows = $res.data
            
            $fundObj = @{
                dealers_self = @{ 
                    buy = &$cleanBillion $rows[0][1]
                    sell = &$cleanBillion $rows[0][2]
                    net = &$cleanBillion $rows[0][3]
                }
                dealers_hedge = @{ 
                    buy = &$cleanBillion $rows[1][1]
                    sell = &$cleanBillion $rows[1][2]
                    net = &$cleanBillion $rows[1][3]
                }
                sitc = @{ 
                    buy = &$cleanBillion $rows[2][1]
                    sell = &$cleanBillion $rows[2][2]
                    net = &$cleanBillion $rows[2][3]
                }
                foreign = @{ 
                    buy = &$cleanBillion $rows[3][1]
                    sell = &$cleanBillion $rows[3][2]
                    net = &$cleanBillion $rows[3][3]
                }
                total = @{ 
                    buy = &$cleanBillion $rows[5][1]
                    sell = &$cleanBillion $rows[5][2]
                    net = &$cleanBillion $rows[5][3]
                }
            }

            # Inject fund into the PSCustomObject
            if ($item.PSObject.Properties['fund']) {
                $item.fund = $fundObj
            } else {
                $item | Add-Member -MemberType NoteProperty -Name "fund" -Value $fundObj -Force
            }
            $updatedCount++
            Write-Host "Success for $date"
        } else {
            Write-Host "No BFI82U data for $date"
        }
    } catch {
        Write-Host "Error updating BFI82U for $date : $_"
    }
}

if ($updatedCount -gt 0) {
    # Save back
    $history | ConvertTo-Json -Depth 5 | Out-File -FilePath $historyFile -Encoding utf8
    $history[-1] | ConvertTo-Json -Depth 5 | Out-File -FilePath $summaryFile -Encoding utf8
    Write-Host "Successfully retroactively added BFI82U data to $updatedCount entries."
} else {
    Write-Host "No entries were updated."
}
