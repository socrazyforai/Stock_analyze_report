# 股市每日資訊與策略選股系統 - 實作紀錄 (Walkthrough)

本專案已完成「上櫃融資餘額（金額化）」的功能擴充與底層穩定性優化，並同步補齊了近期的歷史數據。

---

## 🚀 已完成功能與變更

### 1. 上櫃融資金額化顯示 (OTC Margin Money Alignment)
* **指標卡片更新 ([index.html](file:///d:/AI/Stock/index.html))**：
  * 卡片 3 標題由「上櫃融資餘額 (張數)」改為「上櫃融資餘額 (金額)」。
  * 原本的「張數」展示改為「億元」，例如：`1674.09 億`、`資減 135.75 億 (-7.50%)`。
  * 卡片底部的「買進 / 賣出 / 現償」細部指標亦改為「億元」呈現。
* **數據圖表更新 ([app.js](file:///d:/AI/Stock/app.js))**：
  * 點選「上櫃融資 (億元)」分頁時，折線圖自動切換讀取 `tpex_margin_today_money` 並除以 $10^8$ 轉為億元。
  * 更新圖表懸停 Tooltip 及 Y 軸標籤格式，使大盤與上櫃融資的金額皆統一以「億元」呈現。
  * `generateMockHistory` 模擬函數補上 TPEx Money 欄位，確保本機測試也能正常對齊。

### 2. 爬蟲解析核心修復與穩定性優化
* **核心爬蟲腳本 ([fetcher.js](file:///d:/AI/Stock/scripts/fetcher.js))**：
  * **避開文字編碼衝突**：TPEx legacy PHP 回傳 JSON 中，`summary` 為巢狀字串陣列。為了解決 PowerShell 終端或 GitHub Actions 環境與 API 網頁之間 multi-byte 字元編碼不一致導致 `-like` / `.includes()` 文字匹配失誤的 Bug，直接改用陣列索引抓取 `summaryRows[1]` (金額列) 與 `summaryRows[0]` (張數列)。
  * **修正陣列索引定位**：配合 Nesting 格式修正 JavaScript & PowerShell 上的 tokens 解析偏移問題，精準提取金額與張數。
* **通用歷史補抓腳本 ([fetch_date.ps1](file:///d:/AI/Stock/scripts/fetch_date.ps1)) [新建立]**：
  * 提供傳入任意日期參數即可一鍵補齊當日所有大盤、三大法人、上櫃信用交易金額的通用化 CLI 工具。
* **歷史回補腳本 ([repopulate_tpex_data.ps1](file:///d:/AI/Stock/scripts/repopulate_tpex_data.ps1))**：
  * 修復 legacy API 欄位解析 Bug，完成 11 天歷史數據的校正。
* **消除 UTF-8 BOM 編碼衝突**：
  * Windows PowerShell 預設輸出的 `utf8` 帶有 BOM，這會導致 Node.js 的 `JSON.parse` 無法讀取 `history.json`，因而在 GitHub Actions 執行自動抓取時，舊歷史數據被重設清除。
  * 所有 PowerShell 腳本寫入 JSON 時，全面改用 .NET `[System.IO.File]::WriteAllText` 並傳入 `New-Object System.Text.UTF8Encoding($false)`，強制輸出**無 BOM 的 UTF-8** 純文字檔，完美相容 GitHub Actions 自動更新機制！

---

## 🧪 驗證與部署

1. **歷史數據與最新數據完整回補**：
   - 執行 `fetch_date.ps1` 依序回補從 7/14 到 7/29 的完整歷史。
   - `data/history.json` 與 `data/summary.json` 完美回歸為 **無 BOM UTF-8** 編碼。
   - 上櫃融資金額（例如 7/29）正確錄入為 `167,408,880,000` (1674.09 億元) 與 `-13,574,977,000` (資減 135.75 億元)，數值完全對齊。
2. **Git 推送與 GitHub Pages 觸發**：
   - 已完成所有變更的 Git Commit 與 Push。
   - 網頁已順利部署上線。
