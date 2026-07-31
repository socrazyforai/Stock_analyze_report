// Global chart instances reference
let marginChart = null;
let stockDetailChart = null;
let stockVolumeChart = null;
let rawHistoryData = [];

// Screener Data Series
let stockDailyDataSeries = {}; // Key: YYYYMMDD, Value: { "2330": { ... }, ... }
let datesList = [];
let isScreenerInitialized = false;

// Helper to format date string YYYYMMDD to YYYY/MM/DD
function formatDateString(str) {
  if (!str || str.length !== 8) return str;
  return `${str.substring(0, 4)}/${str.substring(4, 6)}/${str.substring(6, 8)}`;
}

// Format numbers to readable Chinese text (e.g. 123456789 -> 1.23 億)
function formatToBillion(valThousand) {
  const valBillion = valThousand / 100000;
  return `${valBillion.toFixed(2)} 億`;
}

// Format units to readable text
function formatUnits(valUnits) {
  if (Math.abs(valUnits) >= 10000) {
    return `${(valUnits / 10000).toFixed(2)} 萬張`;
  }
  return `${valUnits.toLocaleString()} 張`;
}

// Update UI elements with latest data
function updateDashboard(latest) {
  if (!latest) return;

  // 1. Update Date
  document.getElementById('update-date').innerText = formatDateString(latest.date);

  // 2. TWSE Money Card
  const twse = latest.twse;
  const moneyValEl = document.getElementById('twse-money-val');
  const moneyChangeEl = document.getElementById('twse-money-change');
  
  moneyValEl.innerText = formatToBillion(twse.margin_today_money);
  
  const mChangeBillion = twse.margin_change_money / 100000;
  const mChangePercent = (twse.margin_change_money / (twse.margin_prev_money || 1)) * 100;
  const mSignText = mChangeBillion >= 0 ? '資增' : '資減';
  
  moneyChangeEl.className = 'stat-change ' + (mChangeBillion >= 0 ? 'up' : 'down');
  moneyChangeEl.querySelector('.arrow').innerText = '';
  moneyChangeEl.querySelector('.change-num').innerText = `${mSignText} ${Math.abs(mChangeBillion).toFixed(2)} 億 (${mChangeBillion >= 0 ? '+' : ''}${mChangePercent.toFixed(2)}%)`;

  document.getElementById('twse-money-buy').innerText = formatToBillion(twse.margin_buy_money);
  document.getElementById('twse-money-sell').innerText = formatToBillion(twse.margin_sell_money);
  document.getElementById('twse-money-redemp').innerText = formatToBillion(twse.margin_redemp_money);

  // 3. TWSE Short Units Card
  const shortValEl = document.getElementById('twse-short-val');
  const shortChangeEl = document.getElementById('twse-short-change');
  
  shortValEl.innerText = formatUnits(twse.short_today_units || 0);
  
  const sChange = twse.short_change_units || 0;
  const sSignText = sChange >= 0 ? '券增' : '券減';
  
  shortChangeEl.className = 'stat-change ' + (sChange >= 0 ? 'up' : 'down');
  shortChangeEl.querySelector('.arrow').innerText = '';
  shortChangeEl.querySelector('.change-num').innerText = `${sSignText} ${Math.abs(sChange).toLocaleString()} 張`;

  document.getElementById('twse-short-buy').innerText = formatUnits(twse.short_buy_units || 0);
  document.getElementById('twse-short-sell').innerText = formatUnits(twse.short_sell_units || 0);
  document.getElementById('twse-short-redemp').innerText = formatUnits(twse.short_redemp_units || 0);

  // 4. TPEx Margin Units Card
  const tpex = latest.tpex;
  const tpexMarginValEl = document.getElementById('tpex-margin-val');
  const tpexMarginChangeEl = document.getElementById('tpex-margin-change');
  
  const tpexTodayMoneyBillion = (tpex.tpex_margin_today_money || 0) / 100000000;
  const tpexChangeMoneyBillion = (tpex.tpex_margin_change_money || 0) / 100000000;
  const tpexPrevMoney = tpex.tpex_margin_prev_money || 1;
  const tpexChangePercent = ((tpex.tpex_margin_change_money || 0) / tpexPrevMoney) * 100;
  
  tpexMarginValEl.innerText = `${tpexTodayMoneyBillion.toFixed(2)} 億`;
  
  const txMarginSignText = tpexChangeMoneyBillion >= 0 ? '資增' : '資減';
  
  tpexMarginChangeEl.className = 'stat-change ' + (tpexChangeMoneyBillion >= 0 ? 'up' : 'down');
  tpexMarginChangeEl.querySelector('.arrow').innerText = '';
  tpexMarginChangeEl.querySelector('.change-num').innerText = `${txMarginSignText} ${Math.abs(tpexChangeMoneyBillion).toFixed(2)} 億 (${tpexChangeMoneyBillion >= 0 ? '+' : ''}${tpexChangePercent.toFixed(2)}%)`;

  document.getElementById('tpex-margin-buy').innerText = formatToBillion(tpex.tpex_margin_buy_money || 0);
  document.getElementById('tpex-margin-sell').innerText = formatToBillion(tpex.tpex_margin_sell_money || 0);
  document.getElementById('tpex-margin-redemp').innerText = formatToBillion(tpex.tpex_margin_redemp_money || 0);

  // 5. TPEx Short Units Card
  const tpexShortValEl = document.getElementById('tpex-short-val');
  const tpexShortChangeEl = document.getElementById('tpex-short-change');
  
  tpexShortValEl.innerText = formatUnits(tpex.tpex_short_today || 0);
  
  const txShortChange = tpex.tpex_short_change || 0;
  const txShortSignText = txShortChange >= 0 ? '券增' : '券減';
  
  tpexShortChangeEl.className = 'stat-change ' + (txShortChange >= 0 ? 'up' : 'down');
  tpexShortChangeEl.querySelector('.arrow').innerText = '';
  tpexShortChangeEl.querySelector('.change-num').innerText = `${txShortSignText} ${Math.abs(txShortChange).toLocaleString()} 張`;

  document.getElementById('tpex-short-buy').innerText = formatUnits(tpex.tpex_short_buy || 0);
  document.getElementById('tpex-short-sell').innerText = formatUnits(tpex.tpex_short_sell || 0);
  document.getElementById('tpex-short-redemp').innerText = formatUnits(tpex.tpex_short_redemp || 0);

  // 6. Three Major Institutional Investors Table
  const fund = latest.fund;
  if (fund) {
    const updateFundRow = (prefix, data) => {
      const buyEl = document.getElementById(`fund-${prefix}-buy`);
      const sellEl = document.getElementById(`fund-${prefix}-sell`);
      const netEl = document.getElementById(`fund-${prefix}-net`);
      
      if (buyEl && data) buyEl.innerText = data.buy.toFixed(2);
      if (sellEl && data) sellEl.innerText = data.sell.toFixed(2);
      if (netEl && data) {
        const netVal = data.net;
        const sign = netVal >= 0 ? '+' : '';
        netEl.innerText = `${sign}${netVal.toFixed(2)}`;
        netEl.className = 'net-val ' + (netVal >= 0 ? 'up-text' : 'down-text');
      }
    };

    updateFundRow('ds', fund.dealers_self);
    updateFundRow('dh', fund.dealers_hedge);
    updateFundRow('sitc', fund.sitc);
    updateFundRow('foreign', fund.foreign);
    updateFundRow('total', fund.total);
  } else {
    const clearFundRow = (prefix) => {
      const buyEl = document.getElementById(`fund-${prefix}-buy`);
      const sellEl = document.getElementById(`fund-${prefix}-sell`);
      const netEl = document.getElementById(`fund-${prefix}-net`);
      if (buyEl) buyEl.innerText = '--';
      if (sellEl) sellEl.innerText = '--';
      if (netEl) {
        netEl.innerText = '--';
        netEl.className = 'net-val';
      }
    };
    ['ds', 'dh', 'sitc', 'foreign', 'total'].forEach(clearFundRow);
  }

  // 7. Update AI Analyst Insight
  updateAnalystCommentary(latest);
}

// Generate dynamic expert commentary based on latest data
function updateAnalystCommentary(latest) {
  const twse = latest.twse;
  const changeMoney = twse.margin_change_money / 100000; // in Billion NTD
  
  const sentimentBadge = document.getElementById('sentiment-badge');
  const insightText = document.getElementById('insight-text');
  
  const shortChangeUnits = twse.short_change_units || 0;
  const shortSign = shortChangeUnits >= 0 ? '+' : '';
  document.getElementById('insight-short-change').innerText = `${shortSign}${shortChangeUnits.toLocaleString()} 張`;
  
  const ratio = (twse.margin_buy_money / (twse.margin_sell_money + twse.margin_redemp_money || 1) * 100).toFixed(1);
  document.getElementById('insight-money-ratio').innerText = `${ratio}%`;

  if (changeMoney <= -50) {
    sentimentBadge.className = 'insight-badge bullish';
    sentimentBadge.innerText = '市場情緒：恐慌洗盤 (籌碼快速沉澱)';
    insightText.innerHTML = `今日大盤融資金額出現<strong>劇烈減肥</strong>，一日大減了 <span class="down-text">${Math.abs(changeMoney).toFixed(2)} 億元</span>。這通常代表市場短線出現恐慌性殺低或斷頭潮，融資散戶被迫出場。從籌碼面來看，浮額在此時被大幅清洗，籌碼重回中長線大戶手中，非常有利於股價落底與隨後的反彈行情。`;
  } else if (changeMoney <= -10) {
    sentimentBadge.className = 'insight-badge bullish';
    sentimentBadge.innerText = '市場情緒：資減拉回 (有利多方打底)';
    insightText.innerHTML = `今日融資金額減少了 <span class="down-text">${Math.abs(changeMoney).toFixed(2)} 億元</span>，資券互抵比率為 <strong>${ratio}%</strong>。融資持續退場代表短線的跟風浮額逐漸沈澱，這是一種健康的拉回整理結構。當融資減少、籌碼穩定度提升時，市場賣壓減輕，盤勢將更容易在此進行築底。`;
  } else if (changeMoney >= 50) {
    sentimentBadge.className = 'insight-badge bearish';
    sentimentBadge.innerText = '市場情緒：融資暴增 (籌碼面過熱)';
    insightText.innerHTML = `注意！今日大盤融資金額出現<strong>暴增</strong>，高達 <span class="up-text">+${changeMoney.toFixed(2)} 億元</span>。散戶進場槓桿開大，這會使得市場籌碼迅速變得混亂。若股價沒有同步強勢上攻，融資暴增會轉為極大的潛在賣壓。一旦主力高檔倒貨，很容易引發急跌。`;
  } else if (changeMoney >= 10) {
    sentimentBadge.className = 'insight-badge bearish';
    sentimentBadge.innerText = '市場情緒：資增追價 (考驗主力抗壓)';
    insightText.innerHTML = `今日融資小幅增加 <span class="up-text">${changeMoney.toFixed(2)} 億元</span>。在股價上攻過程中融資增加屬於常見人氣指標，但亦代表籌碼面的融資比率攀升。需密切觀察三大法人是否持續買超。`;
  } else {
    sentimentBadge.className = 'insight-badge neutral';
    sentimentBadge.innerText = '市場情緒：籌碼膠著 (區間觀望)';
    insightText.innerHTML = `今日融資金額變化極小（變動僅 <span class="neutral-text">${changeMoney.toFixed(2)} 億元</span>），多空交投清淡。市場參與者目前處於觀望態度，籌碼面無明顯方向。`;
  }
}

// Draw/Redraw Chart.js Chart
function drawChart(type) {
  const canvas = document.getElementById('margin-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if (marginChart) {
    marginChart.destroy();
  }

  const labels = rawHistoryData.map(item => formatDateString(item.date).substring(5)); // Show MM/DD
  let dataPoints = [];
  let labelText = '';
  let neonColor = '';
  let shadowColor = '';

  if (type === 'money') {
    dataPoints = rawHistoryData.map(item => item.twse.margin_today_money / 100000); // Billion
    labelText = '上市融資金額 (億元)';
    neonColor = '#00e5ff';
    shadowColor = 'rgba(0, 229, 255, 0.4)';
  } else if (type === 'short') {
    dataPoints = rawHistoryData.map(item => item.twse.short_today_units || 0);
    labelText = '上市融券張數 (張)';
    neonColor = '#ff3860';
    shadowColor = 'rgba(255, 56, 96, 0.4)';
  } else if (type === 'tpex') {
    dataPoints = rawHistoryData.map(item => (item.tpex.tpex_margin_today_money || 0) / 100000000);
    labelText = '上櫃融資金額 (億元)';
    neonColor = '#10b981';
    shadowColor = 'rgba(16, 185, 129, 0.4)';
  } else if (type === 'tpex-short') {
    dataPoints = rawHistoryData.map(item => item.tpex.tpex_short_today || 0);
    labelText = '上櫃融券張數 (張)';
    neonColor = '#bd00ff';
    shadowColor = 'rgba(189, 0, 255, 0.4)';
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 350);
  gradient.addColorStop(0, shadowColor.replace('0.4', '0.2'));
  gradient.addColorStop(1, 'rgba(7, 9, 19, 0)');

  marginChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: labelText,
        data: dataPoints,
        borderColor: neonColor,
        borderWidth: 3,
        pointBackgroundColor: neonColor,
        pointHoverRadius: 7,
        pointRadius: 2,
        fill: true,
        backgroundColor: gradient,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#9ca3af',
            font: { family: "'Inter', sans-serif", size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 22, 42, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: neonColor,
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          displayColors: false,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              if (type === 'money' || type === 'tpex') {
                return `餘額: ${val.toFixed(2)} 億元`;
              }
              return `餘額: ${val.toLocaleString()} 張`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false },
          ticks: { color: '#6b7280', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false },
          ticks: {
            color: '#6b7280',
            font: { size: 10 },
            callback: function(value) {
              if (type === 'money' || type === 'tpex') return value + ' 億';
              if (value >= 1000000) return (value / 1000000) + 'M';
              if (value >= 1000) return (value / 1000) + 'K';
              return value;
            }
          }
        }
      }
    }
  });
}

// Generate Mock Data if no local history.json is available
function generateMockHistory() {
  console.log('[App] Generating mock history for preview...');
  const mockData = [];
  const baseDate = new Date();
  
  let twseBaseMoney = 320000000;
  let twseBaseUnits = 8500000;
  let twseBaseShort = 220000;
  let tpexBaseUnits = 1800000;
  let tpexBaseShort = 30000;
  
  for (let i = 35; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    
    const formattedDate = formatDateString(formatDate(d)).replace(/\//g, '');
    const twseChangeMoney = (Math.random() - 0.55) * 4000000;
    const twseChangeUnits = (Math.random() - 0.55) * 80000;
    const twseChangeShort = (Math.random() - 0.52) * 5000;
    const tpexChangeUnits = (Math.random() - 0.53) * 20000;
    const tpexChangeShort = (Math.random() - 0.51) * 800;
    
    twseBaseMoney += twseChangeMoney;
    twseBaseUnits += twseChangeUnits;
    twseBaseShort += twseChangeShort;
    tpexBaseUnits += tpexChangeUnits;
    tpexBaseShort += tpexChangeShort;

    mockData.push({
      date: formattedDate,
      twse: {
        date: formattedDate,
        margin_today_money: twseBaseMoney,
        margin_prev_money: twseBaseMoney - twseChangeMoney,
        margin_change_money: twseChangeMoney,
        margin_buy_money: twseBaseMoney * 0.05,
        margin_sell_money: twseBaseMoney * 0.05 - twseChangeMoney * 0.8,
        margin_redemp_money: Math.abs(twseChangeMoney * 0.2),
        margin_today_units: twseBaseUnits,
        margin_prev_units: twseBaseUnits - twseChangeUnits,
        margin_change_units: twseChangeUnits,
        margin_buy_units: twseBaseUnits * 0.04,
        margin_sell_units: twseBaseUnits * 0.04 - twseChangeUnits * 0.8,
        margin_redemp_units: Math.abs(twseChangeUnits * 0.2),
        short_today_units: twseBaseShort,
        short_prev_units: twseBaseShort - twseChangeShort,
        short_change_units: twseChangeShort,
        short_buy_units: twseBaseShort * 0.08,
        short_sell_units: twseBaseShort * 0.08 - twseChangeShort * 0.7,
        short_redemp_units: Math.abs(twseChangeShort * 0.3)
      },
      tpex: {
        date: formattedDate,
        tpex_margin_today: tpexBaseUnits,
        tpex_margin_prev: tpexBaseUnits - tpexChangeUnits,
        tpex_margin_change: tpexChangeUnits,
        tpex_margin_buy: tpexBaseUnits * 0.06,
        tpex_margin_sell: tpexBaseUnits * 0.06 - tpexChangeUnits * 0.8,
        tpex_margin_redemp: Math.abs(tpexChangeUnits * 0.2),
        tpex_short_today: tpexBaseShort,
        tpex_short_prev: tpexBaseShort - tpexChangeShort,
        tpex_short_change: tpexChangeShort,
        tpex_short_buy: tpexBaseShort * 0.09,
        tpex_short_sell: tpexBaseShort * 0.09 - tpexChangeShort * 0.8,
        tpex_short_redemp: Math.abs(tpexChangeShort * 0.1),
        tpex_margin_today_money: tpexBaseUnits * 1000 * 85,
        tpex_margin_prev_money: (tpexBaseUnits - tpexChangeUnits) * 1000 * 85,
        tpex_margin_change_money: tpexChangeUnits * 1000 * 85,
        tpex_margin_buy_money: (tpexBaseUnits * 0.06) * 1000 * 85,
        tpex_margin_sell_money: (tpexBaseUnits * 0.06 - tpexChangeUnits * 0.8) * 1000 * 85,
        tpex_margin_redemp_money: Math.abs(tpexChangeUnits * 0.2) * 1000 * 85
      },
      fund: (function() {
        const dsBuy = 10 + Math.random() * 10;
        const dsSell = 10 + Math.random() * 10;
        const dhBuy = 50 + Math.random() * 30;
        const dhSell = 50 + Math.random() * 30;
        const sitcBuy = 20 + Math.random() * 15;
        const sitcSell = 20 + Math.random() * 15;
        const foreignBuy = 300 + Math.random() * 200;
        const foreignSell = 300 + Math.random() * 200;
        return {
          dealers_self: { buy: dsBuy, sell: dsSell, net: dsBuy - dsSell },
          dealers_hedge: { buy: dhBuy, sell: dhSell, net: dhBuy - dhSell },
          sitc: { buy: sitcBuy, sell: sitcSell, net: sitcBuy - sitcSell },
          foreign: { buy: foreignBuy, sell: foreignSell, net: foreignBuy - foreignSell },
          total: { 
            buy: dsBuy + dhBuy + sitcBuy + foreignBuy, 
            sell: dsSell + dhSell + sitcSell + foreignSell, 
            net: (dsBuy - dsSell) + (dhBuy - dhSell) + (sitcBuy - sitcSell) + (foreignBuy - foreignSell)
          }
        };
      })()
    });
  }
  return mockData;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Load data from static file on server
async function loadData() {
  try {
    const res = await fetch('data/history.json');
    if (res.ok) {
      rawHistoryData = await res.json();
      console.log(`[App] Successfully loaded ${rawHistoryData.length} days of historical data.`);
    } else {
      console.warn('[App] Could not load data/history.json. Falling back to mock.');
      rawHistoryData = generateMockHistory();
    }
  } catch (err) {
    console.error('[App] Network error fetching history.json:', err);
    rawHistoryData = generateMockHistory();
  }

  if (rawHistoryData && rawHistoryData.length > 0) {
    const latest = rawHistoryData[rawHistoryData.length - 1];
    updateDashboard(latest);
    drawChart('money');
  }
}

// Event Listeners for Tab Buttons (Market View)
document.querySelectorAll('.btn-tab').forEach(button => {
  button.addEventListener('click', (e) => {
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const chartType = e.target.getAttribute('data-chart-type');
    drawChart(chartType);
  });
});

// Event Listeners for Main Nav Tabs (Market vs. Screener)
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
    
    e.currentTarget.classList.add('active');
    const targetId = e.currentTarget.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');
    
    if (targetId === 'screener-view') {
      initScreener();
    }
  });
});


// ==========================================================================
// 🎯 Individual Stock Screener Logic
// ==========================================================================

// Deterministic mock stocks data generator for fallback/offline mode
function generateMockStocksForDate(date) {
  const mockSymbols = [
    { code: '2330', name: '台積電', basePrice: 950 },
    { code: '2317', name: '鴻海', basePrice: 200 },
    { code: '2454', name: '聯發科', basePrice: 1200 },
    { code: '8069', name: '元太', basePrice: 240 },
    { code: '2603', name: '長榮', basePrice: 180 },
    { code: '3231', name: '緯創', basePrice: 110 },
    { code: '2382', name: '廣達', basePrice: 280 },
    { code: '3037', name: '欣興', basePrice: 160 },
    { code: '2303', name: '聯電', basePrice: 50 },
    { code: '2609', name: '陽明', basePrice: 65 }
  ];
  
  const daily = {};
  mockSymbols.forEach(s => {
    const hash = (parseInt(s.code) * 17 + parseInt(date.substring(4))) % 97;
    // Generate simulated price changes (-5% to +5%)
    const pctChange = (hash % 100 - 50) / 1000;
    const close = s.basePrice * (1 + pctChange);
    const open = close * (1 - (hash % 40 - 20) / 1000);
    const high = Math.max(open, close) * (1 + (hash % 15) / 1000);
    const low = Math.min(open, close) * (1 - (hash % 15) / 1000);
    const volume = 300 + (hash * 47) % 8000;
    
    const marginToday = 4000 + (hash * 13) % 6000;
    const marginChange = (hash % 2 === 0 ? 1 : -1) * (hash * 3 % 400);
    const foreignNet = (hash % 2 === 0 ? 1 : -1) * (hash * 7 % 800);
    const sitcNet = (hash % 3 === 0 ? 1 : -1) * (hash * 2 % 300);
    const dealersNet = (hash % 5 === 0 ? 1 : -1) * (hash % 150);

    daily[s.code] = {
      symbol: s.code,
      name: s.name,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: volume,
      change: parseFloat((close - open).toFixed(2)),
      margin_buy: Math.round(volume * 0.1),
      margin_sell: Math.round(volume * 0.08),
      margin_today: marginToday,
      margin_change: marginChange,
      foreign_net: foreignNet,
      sitc_net: sitcNet,
      dealers_net: dealersNet
    };
  });
  return daily;
}

// Load daily stocks JSON files for the last 30 days in parallel (to calculate MA20 & BB)
async function initScreener() {
  if (isScreenerInitialized) return;
  
  const loadingEl = document.getElementById('screener-loading');
  loadingEl.style.display = 'flex';
  
  datesList = rawHistoryData.map(item => item.date.replace(/-/g, '').replace(/\//g, '').trim()).slice(-30);
  
  try {
    const promises = datesList.map(async date => {
      try {
        const res = await fetch(`data/daily_stocks/${date}.json`);
        if (res.ok) {
          const data = await res.json();
          stockDailyDataSeries[date] = data;
        } else {
          stockDailyDataSeries[date] = generateMockStocksForDate(date);
        }
      } catch (e) {
        stockDailyDataSeries[date] = generateMockStocksForDate(date);
      }
    });
    
    await Promise.all(promises);
    console.log(`[Screener] Successfully loaded ${Object.keys(stockDailyDataSeries).length} trading days.`);
    isScreenerInitialized = true;
  } catch (err) {
    console.error('[Screener] Failed loading stock data series:', err);
  } finally {
    loadingEl.style.display = 'none';
    runStrategy('strategy1'); // Run first strategy by default
  }
}

// Strategy selection button handler
document.querySelectorAll('.strategy-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    const strategy = e.currentTarget.getAttribute('data-strategy');
    const titleText = e.currentTarget.querySelector('.strat-title').innerText;
    document.getElementById('screener-title').innerText = `篩選結果：${titleText}`;
    
    runStrategy(strategy);
  });
});

// Run quantitative screening algorithms
function runStrategy(strategyId) {
  const latestDate = datesList[datesList.length - 1];
  if (!stockDailyDataSeries[latestDate]) return;

  const allCodes = Object.keys(stockDailyDataSeries[latestDate]);
  const matchingStocks = [];

  allCodes.forEach(code => {
    // Reconstruct history series for this stock
    const history = [];
    datesList.forEach(d => {
      const dayData = stockDailyDataSeries[d];
      if (dayData && dayData[code]) {
        history.push(dayData[code]);
      }
    });

    if (history.length < 5) return;

    let isMatch = false;
    try {
      isMatch = checkStrategy(strategyId, history);
    } catch (e) {
      console.error(`Check strategy failed for code ${code}:`, e);
    }

    if (isMatch) {
      matchingStocks.push(history[history.length - 1]);
    }
  });

  renderScreenerTable(matchingStocks, allCodes.length);
}

// Render filtered stocks to main table
function renderScreenerTable(stocksList, totalAnalyzed) {
  const tbody = document.getElementById('screener-table-body');
  document.getElementById('screener-count').innerText = `符合 ${stocksList.length} 檔 / 已分析 ${totalAnalyzed} 檔`;
  
  tbody.innerHTML = '';
  
  if (stocksList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">今日無符合此籌碼選股條件的活躍個股</td></tr>`;
    return;
  }

  stocksList.forEach(s => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-code', s.symbol);
    
    const pctChange = s.open > 0 ? ((s.close - s.open) / s.open * 100) : 0;
    const changeClass = s.change >= 0 ? 'up-text' : 'down-text';
    const changeSign = s.change >= 0 ? '+' : '';

    tr.innerHTML = `
      <td class="stock-code">${s.symbol}</td>
      <td><strong>${s.name}</strong></td>
      <td>${s.close.toFixed(2)}</td>
      <td class="${changeClass}">${changeSign}${pctChange.toFixed(2)}%</td>
      <td>${s.volume.toLocaleString()}</td>
      <td class="${s.foreign_net >= 0 ? 'up-text' : 'down-text'}">${s.foreign_net >= 0 ? '+' : ''}${s.foreign_net.toLocaleString()}</td>
      <td class="${s.sitc_net >= 0 ? 'up-text' : 'down-text'}">${s.sitc_net >= 0 ? '+' : ''}${s.sitc_net.toLocaleString()}</td>
      <td class="${s.margin_change >= 0 ? 'up-text' : 'down-text'}">${s.margin_change >= 0 ? '+' : ''}${s.margin_change.toLocaleString()}</td>
    `;
    
    tr.addEventListener('click', () => {
      openStockDrawer(s.symbol);
    });
    tbody.appendChild(tr);
  });
}

// 6 Core Quantitative Screening Formulas
function checkStrategy(strategyId, history) {
  // Slice to last 21 days to ensure a constant window size (20 days consolidation + today)
  const targetHistory = history.slice(-21);
  const today = targetHistory[targetHistory.length - 1];
  const n = targetHistory.length;
  
  if (strategyId === 'strategy1') {
    // 1. 光頭大紅K 盤整突破
    const prevDays = targetHistory.slice(0, n - 1);
    const closes = prevDays.map(h => h.close);
    const maxClose = Math.max(...closes);
    const minClose = Math.min(...closes);
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
    const isConsolidating = (maxClose - minClose) / (avgClose || 1) < 0.08;
    
    const isBigRed = today.close > today.open && (today.close - today.open) / today.open >= 0.045;
    const isHairless = (today.high - today.close) / (today.close - today.open || 1) < 0.12;
    
    const avgVol = prevDays.reduce((a, b) => a + b.volume, 0) / prevDays.length;
    const isVolumeSurge = today.volume > avgVol * 1.8;

    return isConsolidating && isBigRed && isHairless && isVolumeSurge;
  }
  
  if (strategyId === 'strategy2') {
    // 2. 夾 雙線發動 (布林突破)
    if (n < 10) return false;
    const bb = getBollingerBands(targetHistory, n - 1, 10);
    const prevBB = getBollingerBands(targetHistory, n - 2, 10);
    
    const isBandNarrow = prevBB.width < 0.12;
    const isBreakout = today.close > bb.upper;
    const isUpperSlopeUp = bb.upper > prevBB.upper;
    
    return isBandNarrow && isBreakout && isUpperSlopeUp;
  }
  
  if (strategyId === 'strategy3') {
    // 3. 聰明融資抄底 (籌碼洗淨)
    const lastCloses = targetHistory.slice(-4).map(h => h.close);
    const priceFlat = (Math.max(...lastCloses) - Math.min(...lastCloses)) / lastCloses[0] < 0.035;
    
    const marginDecrease = today.margin_change < 0 && targetHistory[n-2].margin_change < 0;
    const instBuy = (today.foreign_net + today.sitc_net) > 50;
    
    return priceFlat && marginDecrease && instBuy;
  }
  
  if (strategyId === 'strategy4') {
    // 4. 可轉債轉換價黃金交叉
    const ma20 = getMA(targetHistory, n - 1, Math.min(n, 20));
    const crossMA20 = today.close > ma20 && targetHistory[n-2].close <= ma20;
    const isDoubleLeverage = today.margin_change > 50 && today.foreign_net > 100;
    
    return crossMA20 && isDoubleLeverage;
  }
  
  if (strategyId === 'strategy5') {
    // 5. 隔日沖避雷預警
    const isBreakout = today.close > today.open && (today.close - today.open) / today.open >= 0.065;
    const daytraderBuy = today.dealers_net > 150 || today.foreign_net > 500;
    
    return isBreakout && daytraderBuy;
  }
  
  if (strategyId === 'strategy6') {
    // 6. 乖離率極端超跌反彈
    const ma20 = getMA(targetHistory, n - 1, Math.min(n, 20));
    const bias = ma20 > 0 ? ((today.close - ma20) / ma20 * 100) : 0;
    const isOversold = bias < -15;
    
    const isVolumeStop = today.volume > getMA(targetHistory, n - 1, 5) * 1.5;
    const isRedOrShadow = today.close > today.open || (today.close - today.low) / (today.high - today.low || 1) > 0.5;
    
    return isOversold && isVolumeStop && isRedOrShadow;
  }
  
  return false;
}

// Math Helpers for Indicators
function getMA(history, index, period) {
  if (index < period - 1) return 0;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += history[i].close;
  }
  return sum / period;
}

function getBollingerBands(history, index, period) {
  if (index < period - 1) return { mean: 0, upper: 0, lower: 0, width: 0 };
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += history[i].close;
  }
  const mean = sum / period;
  
  let varianceSum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    varianceSum += Math.pow(history[i].close - mean, 2);
  }
  const stdDev = Math.sqrt(varianceSum / period);
  return {
    mean: mean,
    upper: mean + 2 * stdDev,
    lower: mean - 2 * stdDev,
    width: mean > 0 ? (4 * stdDev) / mean : 0
  };
}

// Custom Candlestick Wick drawing plugin for Chart.js
const candlestickPlugin = {
  id: 'candlestick',
  beforeDatasetsDraw(chart, args, options) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (dataset.label === 'K線') {
        const meta = chart.getDatasetMeta(datasetIndex);
        meta.data.forEach((bar, index) => {
          const raw = dataset.data[index];
          if (!raw) return;
          const high = raw.h;
          const low = raw.l;
          
          const yScale = chart.scales.y;
          const x = bar.x;
          const yHigh = yScale.getPixelForValue(high);
          const yLow = yScale.getPixelForValue(low);
          
          ctx.save();
          ctx.strokeStyle = bar.options.backgroundColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.stroke();
          ctx.restore();
        });
      }
    });
  }
};

// Global visibility toggle helper for Drawer Chart
function updateDatasetVisibility() {
  if (!stockDetailChart) return;
  
  const showMA5 = document.getElementById('chk-ma5').checked;
  const showMA10 = document.getElementById('chk-ma10').checked;
  const showMA20 = document.getElementById('chk-ma20').checked;
  const showBB = document.getElementById('chk-bb').checked;
  
  stockDetailChart.data.datasets.forEach(ds => {
    if (ds.label === 'MA5') ds.hidden = !showMA5;
    if (ds.label === 'MA10') ds.hidden = !showMA10;
    if (ds.label === 'MA20') ds.hidden = !showMA20;
    if (ds.label.includes('BB')) ds.hidden = !showBB;
  });
  stockDetailChart.update();
}

// Bind indicators checkboxes change listeners for drawer
['chk-ma5', 'chk-ma10', 'chk-ma20', 'chk-bb'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', updateDatasetVisibility);
  }
});

// Stacking Subcharts Variables
let currentAnalysisHistory = [];
let analysisVolumeChart = null;
let analysisInstChart = null;
let analysisMarginChart = null;
let analysisKdChart = null;

// Bind Subchart checkbox change listeners
['subchart-chk-volume', 'subchart-chk-inst', 'subchart-chk-margin', 'subchart-chk-kd'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => {
      drawAnalysisSubCharts();
    });
  }
});

// Back Button Navigation for analysis view
const btnBack = document.getElementById('btn-back-to-screener');
if (btnBack) {
  btnBack.addEventListener('click', () => {
    document.getElementById('stock-analysis-view').classList.remove('active');
    document.getElementById('screener-view').classList.add('active');
  });
}

// Open dedicated full-screen Stock Analysis View
function openStockAnalysis(code) {
  // Toggle views
  document.getElementById('screener-view').classList.remove('active');
  document.getElementById('stock-analysis-view').classList.add('active');
  
  const history = [];
  datesList.forEach(d => {
    const dayData = stockDailyDataSeries[d];
    if (dayData && dayData[code]) {
      history.push({ date: d, data: dayData[code] });
    }
  });

  if (history.length === 0) return;
  
  currentAnalysisHistory = history;
  const latest = history[history.length - 1].data;
  
  // Set Stock Title
  document.getElementById('analysis-stock-title').innerText = `${latest.symbol} ${latest.name}`;
  
  // Set Metrics Panel
  const pctChange = latest.open > 0 ? ((latest.close - latest.open) / latest.open * 100) : 0;
  const changeSign = latest.change >= 0 ? '+' : '';
  const changeColor = latest.change >= 0 ? 'up-text' : 'down-text';
  
  document.getElementById('analysis-open-close').innerText = `${latest.open.toFixed(2)} / ${latest.close.toFixed(2)}`;
  document.getElementById('analysis-high-low').innerText = `${latest.high.toFixed(2)} / ${latest.low.toFixed(2)}`;
  
  const pctEl = document.getElementById('analysis-change-percent');
  pctEl.innerText = `${changeSign}${pctChange.toFixed(2)}% (${changeSign}${latest.change.toFixed(2)})`;
  pctEl.className = 'val ' + changeColor;
  
  document.getElementById('analysis-volume').innerText = latest.volume.toLocaleString();
  
  const formatInstVal = (val) => {
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toLocaleString()}`;
  };
  
  const fEl = document.getElementById('analysis-foreign-net');
  fEl.innerText = formatInstVal(latest.foreign_net);
  fEl.className = 'val ' + (latest.foreign_net >= 0 ? 'up-text' : 'down-text');
  
  const sEl = document.getElementById('analysis-sitc-net');
  sEl.innerText = formatInstVal(latest.sitc_net);
  sEl.className = 'val ' + (latest.sitc_net >= 0 ? 'up-text' : 'down-text');
  
  const dEl = document.getElementById('analysis-dealers-net');
  dEl.innerText = formatInstVal(latest.dealers_net);
  dEl.className = 'val ' + (latest.dealers_net >= 0 ? 'up-text' : 'down-text');
  
  const marginSign = latest.margin_change >= 0 ? '+' : '';
  document.getElementById('analysis-margin-bal').innerText = `${latest.margin_today.toLocaleString()} / ${marginSign}${latest.margin_change.toLocaleString()}`;
  document.getElementById('analysis-margin-bal').className = 'val ' + (latest.margin_change >= 0 ? 'up-text' : 'down-text');

  // Draw Charts
  drawAnalysisPriceChart();
  drawAnalysisSubCharts();
}

// Draw K-Line Price Chart in full screen view using official TradingView Widget
function drawAnalysisPriceChart() {
  const latest = currentAnalysisHistory[currentAnalysisHistory.length - 1].data;
  const code = latest.symbol;
  const marketType = (latest.market === 'TWO' || latest.market === 'TPEX') ? 'TPEX' : 'TWSE';
  
  if (typeof TradingView !== 'undefined') {
    new TradingView.widget({
      "autosize": true,
      "symbol": `${marketType}:${code}`,
      "interval": "D",
      "timezone": "Asia/Taipei",
      "theme": "light",
      "style": "1",
      "locale": "zh_TW",
      "enable_publishing": false,
      "hide_side_toolbar": true,
      "allow_symbol_change": false,
      "container_id": "analysis-price-chart",
      "studies": [
        "MASimple@tv-basicstudies",
        "MASimple@tv-basicstudies",
        "MASimple@tv-basicstudies",
        "BB@tv-basicstudies"
      ]
    });
  } else {
    document.getElementById('analysis-price-chart').innerHTML = 
      `<div class="loading-overlay" style="background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; height:100%;"><p>正在載入 TradingView 雲端 K 線圖...</p></div>`;
  }
}

// Draw stacked Subcharts based on user indicator checkboxes selection
function drawAnalysisSubCharts() {
  const history = currentAnalysisHistory;
  if (!history || history.length === 0) return;
  const labels = history.map(h => formatDateString(h.date).substring(5));

  // 1. Volume Subchart
  const showVol = document.getElementById('subchart-chk-volume').checked;
  const volContainer = document.getElementById('container-sub-volume');
  if (showVol) {
    volContainer.style.display = 'block';
    const ctx = document.getElementById('analysis-sub-chart-volume').getContext('2d');
    if (analysisVolumeChart) analysisVolumeChart.destroy();

    const volumes = history.map(h => h.data.volume);
    const volColors = history.map(h => h.data.close >= h.data.open ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)');
    const volBorderColors = history.map(h => h.data.close >= h.data.open ? '#ef4444' : '#22c55e');

    analysisVolumeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '成交量',
          data: volumes,
          backgroundColor: volColors,
          borderColor: volBorderColors,
          borderWidth: 1,
          barPercentage: 0.65
        }]
      },
      options: getSubchartOptions('成交量', true)
    });
  } else {
    volContainer.style.display = 'none';
    if (analysisVolumeChart) { analysisVolumeChart.destroy(); analysisVolumeChart = null; }
  }

  // 2. Institutions Subchart
  const showInst = document.getElementById('subchart-chk-inst').checked;
  const instContainer = document.getElementById('container-sub-inst');
  if (showInst) {
    instContainer.style.display = 'block';
    const ctx = document.getElementById('analysis-sub-chart-inst').getContext('2d');
    if (analysisInstChart) analysisInstChart.destroy();

    const instNet = history.map(h => h.data.foreign_net + h.data.sitc_net + h.data.dealers_net);
    const instColors = instNet.map(v => v >= 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)');
    const instBorderColors = instNet.map(v => v >= 0 ? '#ef4444' : '#22c55e');

    analysisInstChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '法人買賣超',
          data: instNet,
          backgroundColor: instColors,
          borderColor: instBorderColors,
          borderWidth: 1,
          barPercentage: 0.65
        }]
      },
      options: getSubchartOptions('法人買賣超', true)
    });
  } else {
    instContainer.style.display = 'none';
    if (analysisInstChart) { analysisInstChart.destroy(); analysisInstChart = null; }
  }

  // 3. Margin Subchart
  const showMargin = document.getElementById('subchart-chk-margin').checked;
  const marginContainer = document.getElementById('container-sub-margin');
  if (showMargin) {
    marginContainer.style.display = 'block';
    const ctx = document.getElementById('analysis-sub-chart-margin').getContext('2d');
    if (analysisMarginChart) analysisMarginChart.destroy();

    const marginNet = history.map(h => h.data.margin_change);
    const marginColors = marginNet.map(v => v >= 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)');
    const marginBorderColors = marginNet.map(v => v >= 0 ? '#ef4444' : '#22c55e');

    analysisMarginChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '融資增減',
          data: marginNet,
          backgroundColor: marginColors,
          borderColor: marginBorderColors,
          borderWidth: 1,
          barPercentage: 0.65
        }]
      },
      options: getSubchartOptions('融資增減', true)
    });
  } else {
    marginContainer.style.display = 'none';
    if (analysisMarginChart) { analysisMarginChart.destroy(); analysisMarginChart = null; }
  }

  // 4. KD Subchart
  const showKD = document.getElementById('subchart-chk-kd').checked;
  const kdContainer = document.getElementById('container-sub-kd');
  if (showKD) {
    kdContainer.style.display = 'block';
    const ctx = document.getElementById('analysis-sub-chart-kd').getContext('2d');
    if (analysisKdChart) analysisKdChart.destroy();

    const kd = calculateKD(history);

    analysisKdChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'K值',
            data: kd.k,
            borderColor: '#f59e0b',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.2
          },
          {
            label: 'D值',
            data: kd.d,
            borderColor: '#3b82f6',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.2
          }
        ]
      },
      options: getSubchartOptions('KD(9,3,3)', false, true)
    });
  } else {
    kdContainer.style.display = 'none';
    if (analysisKdChart) { analysisKdChart.destroy(); analysisKdChart = null; }
  }
}

// Helper to generate clean, consistent options for stacked subcharts
function getSubchartOptions(title, isVolumeFormat, showLegend = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: showLegend },
      title: {
        display: true,
        text: title,
        align: 'start',
        color: '#64748b',
        font: { size: 10, weight: 'bold' },
        padding: { top: 2, bottom: 2 }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          label: function(context) {
            const val = context.parsed.y;
            if (isVolumeFormat) {
              return `${context.dataset.label}: ${val.toLocaleString()} 張`;
            }
            return `${context.dataset.label}: ${val.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 9 } }
      },
      y: {
        position: 'left',
        grid: { color: 'rgba(15, 23, 42, 0.04)' },
        ticks: {
          color: '#64748b',
          font: { size: 8 },
          callback: function(value) {
            if (!isVolumeFormat) return value;
            if (Math.abs(value) >= 1000) return (value / 1000) + 'K';
            return value;
          }
        }
      }
    }
  };
}

// Calculate KD(9, 3, 3) indicator arrays
function calculateKD(history) {
  const k = [];
  const d = [];
  
  let currentK = 50;
  let currentD = 50;
  
  for (let i = 0; i < history.length; i++) {
    if (i < 8) {
      k.push(null);
      d.push(null);
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - 8; j <= i; j++) {
        if (history[j].data.high > highestHigh) highestHigh = history[j].data.high;
        if (history[j].data.low < lowestLow) lowestLow = history[j].data.low;
      }
      
      const close = history[i].data.close;
      const rsv = highestHigh === lowestLow ? 50 : ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
      
      currentK = (2 / 3) * currentK + (1 / 3) * rsv;
      currentD = (2 / 3) * currentD + (1 / 3) * currentK;
      
      k.push(parseFloat(currentK.toFixed(2)));
      d.push(parseFloat(currentD.toFixed(2)));
    }
  }
  
  return { k, d };
}

// Keep old Drawer function just in case
function openStockDrawer(code) {
  openStockAnalysis(code); // Redirect to the upgraded fullscreen analytical view!
}

// Drawer close buttons
document.getElementById('btn-close-drawer').addEventListener('click', () => {
  document.getElementById('stock-detail-drawer').classList.remove('open');
});

// Initial Setup
window.addEventListener('DOMContentLoaded', () => {
  loadData();
});
