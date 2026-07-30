const fs = require('fs');
const path = require('path');

// Helper to format date as YYYYMMDD
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Convert Minguo date (e.g., "1150721" or "115/07/21") to AD YYYYMMDD
function minguoToAD(minguoStr) {
  const cleanStr = minguoStr.replace(/\//g, '').trim();
  if (cleanStr.length < 6) return '';
  const mYear = parseInt(cleanStr.substring(0, cleanStr.length - 4), 10);
  const md = cleanStr.substring(cleanStr.length - 4);
  const adYear = mYear + 1911;
  return `${adYear}${md}`;
}

// Clean number strings (remove commas, parse to int)
function cleanInt(str) {
  if (!str) return 0;
  return parseInt(str.toString().replace(/,/g, '').trim(), 10) || 0;
}

// Fetch helper with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...options.headers
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Main fetch logic
async function fetchDailyData(targetDateStr) {
  console.log(`[Fetcher] Starting daily stock data fetch for: ${targetDateStr || 'Latest Available'}`);
  
  let dateToFetch = targetDateStr;
  if (!dateToFetch) {
    dateToFetch = formatDate(new Date());
  }

  let twseData = null;
  let attempts = 0;
  const maxAttempts = 7; // Try up to 7 days back if today is a holiday/weekend
  let currentDate = new Date();
  
  if (targetDateStr) {
    const y = parseInt(targetDateStr.substring(0, 4), 10);
    const m = parseInt(targetDateStr.substring(4, 6), 10) - 1;
    const d = parseInt(targetDateStr.substring(6, 8), 10);
    currentDate = new Date(y, m, d);
  }

  // Find latest available TWSE data
  while (attempts < maxAttempts) {
    const formattedDate = formatDate(currentDate);
    const url = `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=${formattedDate}&selectType=MS`;
    
    console.log(`[Fetcher] Trying to fetch TWSE margin summary for ${formattedDate}...`);
    try {
      // Add delay to prevent rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const json = await res.json();
        if (json.stat === 'OK' && json.tables && json.tables.length > 0) {
          twseData = json;
          dateToFetch = formattedDate;
          console.log(`[Fetcher] Successfully retrieved TWSE data for ${formattedDate}`);
          break;
        } else {
          console.log(`[Fetcher] No TWSE data available for ${formattedDate} (Status: ${json.stat || 'Empty response'})`);
        }
      } else {
        console.log(`[Fetcher] HTTP error ${res.status} for TWSE data on ${formattedDate}`);
      }
    } catch (err) {
      console.log(`[Fetcher] Error fetching TWSE data for ${formattedDate}:`, err.message);
    }
    
    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);
    attempts++;
  }

  if (!twseData) {
    throw new Error('[Fetcher] Failed to retrieve TWSE margin data within the last 7 days.');
  }

  // Parse TWSE Summary Data
  const table = twseData.tables[0];
  const rows = table.data;
  
  // Find Row Index for Margin (融資) and Short (融券)
  // Rows structure:
  // rows[0]: 融資(交易單位) -> [項目, 買進, 賣出, 現金償還, 前日餘額, 今日餘額]
  // rows[1]: 融券(交易單位)
  // rows[2]: 融資金額(仟元)
  
  const marginUnitsRow = rows[0];
  const shortUnitsRow = rows[1];
  const marginMoneyRow = rows[2];

  const parsedTWSE = {
    date: dateToFetch,
    // Margin (Units)
    margin_buy_units: cleanInt(marginUnitsRow[1]),
    margin_sell_units: cleanInt(marginUnitsRow[2]),
    margin_redemp_units: cleanInt(marginUnitsRow[3]),
    margin_prev_units: cleanInt(marginUnitsRow[4]),
    margin_today_units: cleanInt(marginUnitsRow[5]),
    margin_change_units: cleanInt(marginUnitsRow[5]) - cleanInt(marginUnitsRow[4]),
    
    // Short (Units)
    short_buy_units: cleanInt(shortUnitsRow[1]),
    short_sell_units: cleanInt(shortUnitsRow[2]),
    short_redemp_units: cleanInt(shortUnitsRow[3]),
    short_prev_units: cleanInt(shortUnitsRow[4]),
    short_today_units: cleanInt(shortUnitsRow[5]),
    short_change_units: cleanInt(shortUnitsRow[5]) - cleanInt(shortUnitsRow[4]),

    // Margin Money (Thousand NTD)
    margin_buy_money: cleanInt(marginMoneyRow[1]),
    margin_sell_money: cleanInt(marginMoneyRow[2]),
    margin_redemp_money: cleanInt(marginMoneyRow[3]),
    margin_prev_money: cleanInt(marginMoneyRow[4]),
    margin_today_money: cleanInt(marginMoneyRow[5]),
    margin_change_money: cleanInt(marginMoneyRow[5]) - cleanInt(marginMoneyRow[4]),
  };

  // Fetch TPEx Margin Balance (OTC Stocks)
  // Base URL is https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance
  let parsedTPEx = {
    date: dateToFetch,
    tpex_margin_buy: 0,
    tpex_margin_sell: 0,
    tpex_margin_redemp: 0,
    tpex_margin_prev: 0,
    tpex_margin_today: 0,
    tpex_margin_change: 0,
    tpex_short_buy: 0,
    tpex_short_sell: 0,
    tpex_short_redemp: 0,
    tpex_short_prev: 0,
    tpex_short_today: 0,
    tpex_short_change: 0
  };

  console.log('[Fetcher] Fetching TPEx margin balance data...');
  try {
    const tpexUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance';
    const res = await fetchWithTimeout(tpexUrl);
    if (res.ok) {
      const list = await res.json();
      if (list && list.length > 0) {
        // TPEx data date
        const tpexMinguoDate = list[0].Date;
        const tpexAdDate = minguoToAD(tpexMinguoDate);
        console.log(`[Fetcher] TPEx latest data date: ${tpexAdDate} (Minguo: ${tpexMinguoDate})`);

        // Sum up OTC margin balances
        let sumMarginBuy = 0;
        let sumMarginSell = 0;
        let sumMarginRedemp = 0;
        let sumMarginPrev = 0;
        let sumMarginToday = 0;

        let sumShortBuy = 0;
        let sumShortSell = 0;
        let sumShortRedemp = 0;
        let sumShortPrev = 0;
        let sumShortToday = 0;

        for (const item of list) {
          sumMarginBuy += cleanInt(item.MarginPurchase);
          sumMarginSell += cleanInt(item.MarginSales);
          sumMarginRedemp += cleanInt(item.CashRedemption);
          sumMarginPrev += cleanInt(item.MarginPurchaseBalancePreviousDay);
          sumMarginToday += cleanInt(item.MarginPurchaseBalance);

          sumShortBuy += cleanInt(item.ShortConvering); // Short buy (buyback to cover short)
          sumShortSell += cleanInt(item.ShortSale); // Short sell (borrow to sell)
          sumShortRedemp += cleanInt(item.StockRedemption); // Stock repayment
          sumShortPrev += cleanInt(item.ShortSaleBalancePreviousDay);
          sumShortToday += cleanInt(item.ShortSaleBalance);
        }

        // Fetch TPEx Margin Balance Money from PHP page
        let tpexMarginMoney = { prev: 0, today: 0, change: 0, buy: 0, sell: 0, redemp: 0 };
        try {
          const minguoYear = parseInt(tpexMinguoDate.substring(0, tpexMinguoDate.length - 4), 10);
          const minguoMd = tpexMinguoDate.substring(tpexMinguoDate.length - 4);
          const formattedMinguo = `${minguoYear}/${minguoMd.substring(0,2)}/${minguoMd.substring(2)}`;
          
          const phpUrl = `https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&d=${formattedMinguo}`;
          console.log(`[Fetcher] Fetching TPEx summary money from legacy endpoint: ${phpUrl}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000)); // rate limiting delay
          const phpRes = await fetchWithTimeout(phpUrl);
          if (phpRes.ok) {
            const phpJson = await phpRes.json();
            const summaryRows = phpJson.summary;
            if (summaryRows && summaryRows.length >= 2) {
              const tokens = summaryRows[1];
              if (tokens && tokens.length >= 7) {
                const cleanToken = (t) => {
                  if (!t) return 0;
                  return parseInt(t.replace(/,/g, ''), 10) || 0;
                };
                
                const prevThousand = cleanToken(tokens[2]);
                const buyThousand = cleanToken(tokens[3]);
                const sellThousand = cleanToken(tokens[4]);
                const redempThousand = cleanToken(tokens[5]);
                const todayThousand = cleanToken(tokens[6]);
                
                tpexMarginMoney = {
                  prev: prevThousand * 1000,
                  buy: buyThousand * 1000,
                  sell: sellThousand * 1000,
                  redemp: redempThousand * 1000,
                  today: todayThousand * 1000,
                  change: (todayThousand - prevThousand) * 1000
                };
                console.log(`[Fetcher] Successfully parsed TPEx money values: Today=${tpexMarginMoney.today}, Change=${tpexMarginMoney.change}`);
              }
            }
          }
        } catch (phpErr) {
          console.log('[Fetcher] Error fetching TPEx PHP summary:', phpErr.message);
        }

        parsedTPEx = {
          date: tpexAdDate,
          tpex_margin_buy: sumMarginBuy,
          tpex_margin_sell: sumMarginSell,
          tpex_margin_redemp: sumMarginRedemp,
          tpex_margin_prev: sumMarginPrev,
          tpex_margin_today: sumMarginToday,
          tpex_margin_change: sumMarginToday - sumMarginPrev,
          
          tpex_short_buy: sumShortBuy,
          tpex_short_sell: sumShortSell,
          tpex_short_redemp: sumShortRedemp,
          tpex_short_prev: sumShortPrev,
          tpex_short_today: sumShortToday,
          tpex_short_change: sumShortToday - sumShortPrev,
          
          tpex_margin_prev_money: tpexMarginMoney.prev,
          tpex_margin_today_money: tpexMarginMoney.today,
          tpex_margin_change_money: tpexMarginMoney.change,
          tpex_margin_buy_money: tpexMarginMoney.buy,
          tpex_margin_sell_money: tpexMarginMoney.sell,
          tpex_margin_redemp_money: tpexMarginMoney.redemp
        };
      }
    } else {
      console.log(`[Fetcher] TPEx API returned error: ${res.status}`);
    }
  } catch (err) {
    console.log('[Fetcher] Error fetching TPEx data:', err.message);
  }

  // Fetch Three Major Institutional Investors Buy/Sell (BFI82U)
  let parsedFund = null;
  console.log('[Fetcher] Fetching TWSE Three Major Institutional Investors data (BFI82U)...');
  try {
    const fundUrl = `https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=${dateToFetch}&type=day`;
    const res = await fetchWithTimeout(fundUrl);
    if (res.ok) {
      const json = await res.json();
      if (json.stat === 'OK' && json.data && json.data.length >= 6) {
        const cleanBillion = (str) => {
          if (!str) return 0;
          return parseFloat((parseFloat(str.toString().replace(/,/g, '').trim()) / 100000000).toFixed(2)) || 0;
        };

        const rowsBfi = json.data;
        parsedFund = {
          dealers_self: { buy: cleanBillion(rowsBfi[0][1]), sell: cleanBillion(rowsBfi[0][2]), net: cleanBillion(rowsBfi[0][3]) },
          dealers_hedge: { buy: cleanBillion(rowsBfi[1][1]), sell: cleanBillion(rowsBfi[1][2]), net: cleanBillion(rowsBfi[1][3]) },
          sitc: { buy: cleanBillion(rowsBfi[2][1]), sell: cleanBillion(rowsBfi[2][2]), net: cleanBillion(rowsBfi[2][3]) },
          foreign: { buy: cleanBillion(rowsBfi[3][1]), sell: cleanBillion(rowsBfi[3][2]), net: cleanBillion(rowsBfi[3][3]) },
          total: { buy: cleanBillion(rowsBfi[5][1]), sell: cleanBillion(rowsBfi[5][2]), net: cleanBillion(rowsBfi[5][3]) }
        };
        console.log(`[Fetcher] Successfully retrieved BFI82U data for ${dateToFetch}`);
      } else {
        console.log(`[Fetcher] No BFI82U data available for ${dateToFetch}`);
      }
    }
  } catch (err) {
    console.log('[Fetcher] Error fetching BFI82U data:', err.message);
  }

  // Combine Data into a Single Summary Node
  const finalSummary = {
    date: dateToFetch,
    twse: parsedTWSE,
    tpex: parsedTPEx,
    fund: parsedFund,
    updated_at: new Date().toISOString()
  };

  // Save to history list
  saveToHistory(finalSummary);
  
  return finalSummary;
}

// Load, update, and write history JSON file
function saveToHistory(newSummary) {
  const dataDir = path.join(__dirname, '../data');
  const historyFile = path.join(dataDir, 'history.json');
  const summaryFile = path.join(dataDir, 'summary.json');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let historyList = [];
  if (fs.existsSync(historyFile)) {
    try {
      const raw = fs.readFileSync(historyFile, 'utf8');
      historyList = JSON.parse(raw);
    } catch (e) {
      console.log('[Fetcher] Error parsing history.json, initializing fresh list.');
    }
  }

  // Remove existing entry for the same date to avoid duplicates
  historyList = historyList.filter(item => item.date !== newSummary.date);

  // Append new item
  historyList.push(newSummary);

  // Sort by date ascending
  historyList.sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10));

  // Limit to last 60 days of history (approx 3 months of trading days)
  if (historyList.length > 60) {
    historyList = historyList.slice(historyList.length - 60);
  }

  // Save back files
  fs.writeFileSync(historyFile, JSON.stringify(historyList, null, 2), 'utf8');
  fs.writeFileSync(summaryFile, JSON.stringify(newSummary, null, 2), 'utf8');
  
  console.log(`[Fetcher] Saved summary to data/summary.json`);
  console.log(`[Fetcher] Updated history in data/history.json. Total history size: ${historyList.length} days.`);
}

// Run the script directly if invoked
if (require.main === module) {
  // Can pass target date as parameter, e.g. node fetcher.js 20260720
  const args = process.argv.slice(2);
  const targetDate = args[0] || null;
  fetchDailyData(targetDate)
    .then(summary => {
      console.log(`[Fetcher] Completed successfully. Date: ${summary.date}`);
      console.log(`[Fetcher] TWSE Margin Money Change: ${summary.twse.margin_change_money.toLocaleString()} Thousand NTD`);
      console.log(`[Fetcher] TPEx Margin Change: ${summary.tpex.tpex_margin_change.toLocaleString()} units`);
    })
    .catch(err => {
      console.error('[Fetcher] Fatal Error:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchDailyData };
