const fs = require('fs');
const path = require('path');

// Helper: Parse number from string, handle commas and empty values
function parseNumber(val) {
    if (val === null || val === undefined) return 0;
    let clean = val.toString().replace(/,/g, '').replace(/\s+/g, '').trim();
    if (clean === '--' || clean === '' || clean === 'nil') return 0;
    let num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
}

// Get Date from arguments or default to today
let dateStr = process.argv[2];
if (!dateStr) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateStr = `${yyyy}${mm}${dd}`;
}

console.log(`Start fetching stocks data for date: ${dateStr}`);

const year = parseInt(dateStr.substring(0, 4));
const mm = dateStr.substring(4, 6);
const dd = dateStr.substring(6, 8);
const rocYear = year - 1911;
const rocDate = `${rocYear}/${mm}/${dd}`;

const targetDir = path.join(__dirname, '../data/daily_stocks');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}
const outputFile = path.join(targetDir, `${dateStr}.json`);

const stocks = {};

// Helper: Safe HTTP fetch with JSON return
async function fetchJson(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.warn(`Fetch failed for URL: ${url}`, e.message);
        return null;
    }
}

async function run() {
    // ==========================================
    // 1. TWSE Data
    // ==========================================
    console.log('>>> Downloading TWSE MI_INDEX...');
    const twseIndexUrl = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateStr}&type=ALLBUT0999`;
    const twseIndex = await fetchJson(twseIndexUrl);
    if (twseIndex && twseIndex.stat === 'OK') {
        const table = twseIndex.tables.find(t => t.fields && t.fields.length === 16);
        if (table && table.data) {
            table.data.forEach(row => {
                const code = row[0].trim();
                const name = row[1].trim();
                // Only keep 4-digit stock symbols
                if (/^\d{4}$/.test(code)) {
                    const dirHtml = row[9];
                    const changeVal = parseNumber(row[10]);
                    let change = changeVal;
                    if (dirHtml.includes('color:green')) {
                        change = -changeVal;
                    }

                    stocks[code] = {
                        symbol: code,
                        name: name,
                        open: parseNumber(row[5]),
                        high: parseNumber(row[6]),
                        low: parseNumber(row[7]),
                        close: parseNumber(row[8]),
                        volume: Math.round(parseNumber(row[2]) / 1000), // convert to shares/1000 (張)
                        change: change,
                        margin_buy: 0,
                        margin_sell: 0,
                        margin_today: 0,
                        margin_change: 0,
                        foreign_net: 0,
                        sitc_net: 0,
                        dealers_net: 0
                    };
                }
            });
        }
    } else {
        console.warn('TWSE Quotes not available (probably non-trading day)');
    }

    console.log('>>> Downloading TWSE MI_MARGN...');
    const twseMarginUrl = `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=${dateStr}&selectType=ALL`;
    const twseMargin = await fetchJson(twseMarginUrl);
    if (twseMargin && twseMargin.stat === 'OK') {
        const table = twseMargin.tables.find(t => t.fields && t.fields.length === 16);
        if (table && table.data) {
            table.data.forEach(row => {
                const code = row[0].trim();
                if (stocks[code]) {
                    const marginToday = parseNumber(row[6]);
                    const marginPrev = parseNumber(row[5]);
                    stocks[code].margin_today = marginToday;
                    stocks[code].margin_change = marginToday - marginPrev;
                    stocks[code].margin_buy = parseNumber(row[2]);
                    stocks[code].margin_sell = parseNumber(row[3]);
                }
            });
        }
    }

    console.log('>>> Downloading TWSE T86...');
    const twseT86Url = `https://www.twse.com.tw/fund/T86?response=json&date=${dateStr}&selectType=ALL`;
    const twseT86 = await fetchJson(twseT86Url);
    if (twseT86 && twseT86.stat === 'OK' && twseT86.data) {
        twseT86.data.forEach(row => {
            const code = row[0].trim();
            if (stocks[code]) {
                stocks[code].foreign_net = Math.round(parseNumber(row[4]) / 1000);
                stocks[code].sitc_net = Math.round(parseNumber(row[10]) / 1000);
                stocks[code].dealers_net = Math.round(parseNumber(row[11]) / 1000);
            }
        });
    }

    // ==========================================
    // 2. TPEx Data
    // ==========================================
    console.log('>>> Downloading TPEx Quotes...');
    const tpexQuotesUrl = `https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&o=json&d=${rocDate}`;
    const tpexQuotes = await fetchJson(tpexQuotesUrl);
    if (tpexQuotes && tpexQuotes.stat === 'ok' && tpexQuotes.tables && tpexQuotes.tables[0]) {
        const table = tpexQuotes.tables[0];
        if (table.data) {
            table.data.forEach(row => {
                const code = row[0].trim();
                const name = row[1].trim();
                if (/^\d{4}$/.test(code)) {
                    const change = parseNumber(row[3]);
                    stocks[code] = {
                        symbol: code,
                        name: name,
                        open: parseNumber(row[4]),
                        high: parseNumber(row[5]),
                        low: parseNumber(row[6]),
                        close: parseNumber(row[2]),
                        volume: Math.round(parseNumber(row[8]) / 1000),
                        change: change,
                        margin_buy: 0,
                        margin_sell: 0,
                        margin_today: 0,
                        margin_change: 0,
                        foreign_net: 0,
                        sitc_net: 0,
                        dealers_net: 0
                    };
                }
            });
        }
    }

    console.log('>>> Downloading TPEx Margin...');
    const tpexMarginUrl = `https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&o=json&d=${rocDate}`;
    const tpexMargin = await fetchJson(tpexMarginUrl);
    if (tpexMargin && tpexMargin.stat === 'ok' && tpexMargin.tables && tpexMargin.tables[0]) {
        const table = tpexMargin.tables[0];
        if (table.data) {
            table.data.forEach(row => {
                const code = row[0].trim();
                if (stocks[code]) {
                    const marginToday = parseNumber(row[6]);
                    const marginPrev = parseNumber(row[2]);
                    stocks[code].margin_today = marginToday;
                    stocks[code].margin_change = marginToday - marginPrev;
                    stocks[code].margin_buy = parseNumber(row[3]);
                    stocks[code].margin_sell = parseNumber(row[4]);
                }
            });
        }
    }

    console.log('>>> Downloading TPEx T86...');
    const tpexT86Url = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&d=${rocDate}&se=EW`;
    const tpexT86 = await fetchJson(tpexT86Url);
    if (tpexT86 && tpexT86.stat === 'ok' && tpexT86.tables && tpexT86.tables[0]) {
        const table = tpexT86.tables[0];
        if (table.data) {
            table.data.forEach(row => {
                const code = row[0].trim();
                if (stocks[code]) {
                    stocks[code].foreign_net = Math.round(parseNumber(row[4]) / 1000);
                    stocks[code].sitc_net = Math.round(parseNumber(row[13]) / 1000);
                    stocks[code].dealers_net = Math.round(parseNumber(row[22]) / 1000);
                }
            });
        }
    }

    // ==========================================
    // 3. Filter and save
    // ==========================================
    const filteredStocks = {};
    Object.keys(stocks).forEach(code => {
        const s = stocks[code];
        if (s.close > 0 && s.volume >= 300) {
            filteredStocks[code] = s;
        }
    });

    const activeCount = Object.keys(filteredStocks).length;
    console.log(`Filtered active stocks count: ${activeCount}`);

    if (activeCount > 0) {
        fs.writeFileSync(outputFile, JSON.stringify(filteredStocks, null, 4), 'utf8');
        console.log(`Successfully wrote file: ${outputFile}`);
    } else {
        console.warn('No active stocks found, skip writing.');
    }

    // ==========================================
    // 4. Cleanup old files
    // ==========================================
    const historyFile = path.join(__dirname, '../data/history.json');
    if (fs.existsSync(historyFile)) {
        try {
            const historyList = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            const validDates = {};
            historyList.forEach(h => {
                const d = h.date.replace(/-/g, '').replace(/\//g, '').trim();
                validDates[d] = true;
            });

            const files = fs.readdirSync(targetDir);
            files.forEach(f => {
                const fName = path.basename(f, '.json');
                if (!validDates[fName] && fName !== dateStr) {
                    console.log(`Cleanup old file: ${f}`);
                    fs.unlinkSync(path.join(targetDir, f));
                }
            });
        } catch (err) {
            console.warn('Failed to cleanup old files:', err.message);
        }
    }
}

run();
