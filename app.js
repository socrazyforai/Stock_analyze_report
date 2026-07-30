// Global chart instance reference
let marginChart = null;
let rawHistoryData = [];

// Helper to format date string YYYYMMDD to YYYY/MM/DD
function formatDateString(str) {
  if (!str || str.length !== 8) return str;
  return `${str.substring(0, 4)}/${str.substring(4, 6)}/${str.substring(6, 8)}`;
}

// Format numbers to readable Chinese text (e.g. 123456789 -> 1.23 億)
function formatToBillion(valThousand) {
  // valThousand is in "Thousand NTD"
  const valBillion = valThousand / 100000; // 1 Billion NTD = 100,000 Thousand NTD
  return `${valBillion.toFixed(2)} 億`;
}

// Format units (thousands of shares) to readable text
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

  // 2. TWSE Money Card (上市融資金額)
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

  // 3. TWSE Short Units Card (上市融券數量)
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

  // 4. TPEx Margin Units Card (上櫃融資數量)
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

  // 5. TPEx Short Units Card (上櫃融券數量)
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
  const changePercent = (twse.margin_change_money / (twse.margin_prev_money || 1)) * 100;
  
  const sentimentBadge = document.getElementById('sentiment-badge');
  const insightText = document.getElementById('insight-text');
  
  // Empty ratio indicator
  const shortChangeUnits = twse.short_change_units || 0;
  const shortSign = shortChangeUnits >= 0 ? '+' : '';
  document.getElementById('insight-short-change').innerText = `${shortSign}${shortChangeUnits.toLocaleString()} 張`;
  
  // Calculate margins offset ratio
  const ratio = (twse.margin_buy_money / (twse.margin_sell_money + twse.margin_redemp_money || 1) * 100).toFixed(1);
  document.getElementById('insight-money-ratio').innerText = `${ratio}%`;

  // Commentary Logic
  if (changeMoney <= -50) {
    // Margin decrease >= 5B (Severe wash)
    sentimentBadge.className = 'insight-badge bullish';
    sentimentBadge.innerText = '市場情緒：恐慌洗盤 (籌碼快速沉澱)';
    insightText.innerHTML = `今日大盤融資金額出現<strong>劇烈減肥</strong>，一日大減了 <span class="down-text">${Math.abs(changeMoney).toFixed(2)} 億元</span>。這通常代表市場短線出現恐慌性殺低或斷頭潮，融資散戶被迫出場。從籌碼面來看，浮額在此時被大幅清洗，籌碼重回中長線大戶手中，非常有利於股價落底與隨後的反彈行情。建議投資人此時不宜盲目悲觀，反可留意績優股的超跌佈局機會。`;
  } else if (changeMoney <= -10) {
    // Margin decrease 1B to 5B (Healthy consolidation)
    sentimentBadge.className = 'insight-badge bullish';
    sentimentBadge.innerText = '市場情緒：資減拉回 (有利多方打底)';
    insightText.innerHTML = `今日融資金額減少了 <span class="down-text">${Math.abs(changeMoney).toFixed(2)} 億元</span>，資券互抵比率為 <strong>${ratio}%</strong>。融資持續退場代表短線的跟風浮額逐漸沈澱，這是一種健康的拉回整理結構。當融資減少、籌碼穩定度提升時，市場賣壓減輕，盤勢將更容易在此進行築底，屬於短空長多的健康信號。`;
  } else if (changeMoney >= 50) {
    // Margin increase >= 5B (Overheating warning)
    sentimentBadge.className = 'insight-badge bearish';
    sentimentBadge.innerText = '市場情緒：融資暴增 (籌碼面過熱)';
    insightText.innerHTML = `注意！今日大盤融資金額出現<strong>暴增</strong>，高達 <span class="up-text">+${changeMoney.toFixed(2)} 億元</span>。散戶進場槓桿開大，這會使得市場籌碼迅速變得混亂。若股價沒有同步強勢上攻，融資暴增會轉為極大的潛在賣壓。一旦主力高檔倒貨，很容易引發短線多殺多的急跌。建議此時切勿追高，需嚴防短線拉回風險。`;
  } else if (changeMoney >= 10) {
    // Margin increase 1B to 5B (Active retail participation)
    sentimentBadge.className = 'insight-badge bearish';
    sentimentBadge.innerText = '市場情緒：資增追價 (考驗主力抗壓)';
    insightText.innerHTML = `今日融資小幅增加 <span class="up-text">${changeMoney.toFixed(2)} 億元</span>。在股價上攻過程中融資增加屬於常見人氣指標，但亦代表籌碼面的融資比率攀升。需密切觀察主力三大法人是否持續買超，若法人轉買為賣而融資仍持續增加，則需警惕散戶套在高點的風險。`;
  } else {
    // Minor changes
    sentimentBadge.className = 'insight-badge neutral';
    sentimentBadge.innerText = '市場情緒：籌碼膠著 (區間觀望)';
    insightText.innerHTML = `今日融資金額變化極小（變動僅 <span class="neutral-text">${changeMoney.toFixed(2)} 億元</span>），多空交投清淡。市場參與者目前處於觀望態度，籌碼面無明顯方向。盤勢預計將延續區間震盪，等待新的利多或利空訊號來打破僵局。`;
  }
}

// Draw/Redraw Chart.js Chart
function drawChart(type) {
  const ctx = document.getElementById('margin-chart').getContext('2d');
  
  // Destroy existing chart if present
  if (marginChart) {
    marginChart.destroy();
  }

  // Extract data for chart
  const labels = rawHistoryData.map(item => formatDateString(item.date).substring(5)); // Show MM/DD
  let dataPoints = [];
  let labelText = '';
  let neonColor = '';
  let shadowColor = '';

  if (type === 'money') {
    dataPoints = rawHistoryData.map(item => item.twse.margin_today_money / 100000); // convert to Billion
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

  // Create gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 350);
  gradient.addColorStop(0, shadowColor.replace('0.4', '0.2'));
  gradient.addColorStop(1, 'rgba(7, 9, 19, 0)');

  // Config Chart
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
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            drawBorder: false
          },
          ticks: {
            color: '#6b7280',
            font: { size: 10 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            drawBorder: false
          },
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

// Generate Mock Data if no local history.json is available (For preview/failsafe)
function generateMockHistory() {
  console.log('[App] Generating mock history for preview...');
  const mockData = [];
  const baseDate = new Date();
  
  let twseBaseMoney = 320000000; // ~3200 億
  let twseBaseUnits = 8500000; // ~850 萬張
  let twseBaseShort = 220000; // ~22 萬張
  let tpexBaseUnits = 1800000; // ~180 萬張
  let tpexBaseShort = 30000;  // ~3 萬張
  
  // Generate 25 days of mock data
  for (let i = 25; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    // skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    
    const formattedDate = formatDateString(formatDate(d)).replace(/\//g, '');
    
    // Add random walk changes
    const twseChangeMoney = (Math.random() - 0.55) * 4000000; // slight downward bias
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
    // Try to fetch real history data
    const res = await fetch('data/history.json');
    if (res.ok) {
      rawHistoryData = await res.json();
      console.log(`[App] Successfully loaded ${rawHistoryData.length} days of historical data.`);
    } else {
      console.warn('[App] Could not load data/history.json (HTTP ' + res.status + '). Falling back to mock data.');
      rawHistoryData = generateMockHistory();
    }
  } catch (err) {
    console.error('[App] Network error fetching history.json:', err);
    rawHistoryData = generateMockHistory();
  }

  if (rawHistoryData && rawHistoryData.length > 0) {
    const latest = rawHistoryData[rawHistoryData.length - 1];
    updateDashboard(latest);
    drawChart('money'); // Default view:上市金額
  }
}

// Event Listeners for Tab Buttons
document.querySelectorAll('.btn-tab').forEach(button => {
  button.addEventListener('click', (e) => {
    // Deactivate other tabs
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    // Activate clicked tab
    e.target.classList.add('active');
    
    const chartType = e.target.getAttribute('data-chart-type');
    drawChart(chartType);
  });
});

// Initial Setup
window.addEventListener('DOMContentLoaded', () => {
  loadData();
});
