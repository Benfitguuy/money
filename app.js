'use strict';
// 我們的錢包（Sarah & Ben 的記帳 App）— 從「我們的行事曆」拆出來的獨立 App
// 資料存在這支手機（localStorage：our-wallet-v1）；之後接雲端同步時只要換掉 Store。
const APP_VERSION = '1.2.0';
const WEEK = '日一二三四五六';
const NAMES = { ben: '<img class="av" src="icons/boy.svg" alt="">Ben', sarah: '<img class="av" src="icons/girl.svg" alt="">Sarah', both: '♥ 一起' };

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => { m = Math.max(0, Math.min(1439, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 資料（存取） ----------
const Store = {
  KEY: 'our-wallet-v1',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { return null; } },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { toast('存檔失敗'); } }
};
let db = Store.load() || { expenses: [], accounts: [], cats: [] };
if (!db.expenses) db.expenses = [];
const save = () => Store.save(db);

// ---------- 小工具 ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheetwrap').hidden = false; }
function closeSheet() { $('#sheetwrap').hidden = true; $('#sheet').innerHTML = ''; }

// ====================================================================
// 記帳核心
//  db.cats      ：分類（含子項目）{ k, name, icon, color, kind: expense|income, subs: [{ k, name }] }
//  db.accounts  ：帳戶 { id, name, type: credit|bank|cash, last4, init, statementDay, plans: [], rebates: [] }
//                 信用卡回饋方案 plans: { id, name, kind: cash|miles, rate(%), per(幾元 1 哩), cap(每期上限，可空), isDefault }
//                 回饋紀錄 rebates: { id, date, kind: cash|miles, value, note }
//  db.expenses  ：每一筆 { type: expense|income|transfer|adjust, amount, cat, sub, acct, toAcct, plan, date, merchant, note }
// ====================================================================
const DEFAULT_CATS = [
  ['food', '🍴', '外食', '#F6E3D6', 'expense', ['早餐', '午餐', '晚餐', '飲料', '點心']],
  ['transport', '🚗', '交通', '#DDE6F5', 'expense', ['加油', '充電', '停車', '大眾運輸', '保養維修', '車貸', '過路費']],
  ['home', '🏠', '家用', '#E7E0F5', 'expense', ['超市', '日用品', '水電瓦斯', '房租']],
  ['fun', '🎮', '娛樂', '#F5DDE5', 'expense', ['電影', '旅遊', '遊戲', '運動']],
  ['health', '➕', '醫療/保險/健身房', '#F4EED8', 'expense', ['看診', '藥品', '保險', '健身房']],
  ['net', '📶', '網路訂閱 / 手機網費', '#DFEEDD', 'expense', ['手機', '網路', '串流訂閱']],
  ['gift', '🎁', '人情', '#F1E0DC', 'expense', ['禮物', '紅包', '請客']],
  ['shopping', '🛍️', '購物', '#F7E7D3', 'expense', ['衣服', '3C', '居家用品']],
  ['work', '💼', '工作', '#E2E8EE', 'expense', []],
  ['other', '📦', '其他', '#E9E9E6', 'expense', []],
  ['salary', '💰', '薪資', '#DCEBDA', 'income', []],
  ['side', '💡', '接案', '#F4EED8', 'income', []],
  ['bonus', '🎉', '獎金', '#F5DDE5', 'income', []],
  ['refund', '↩️', '退款', '#DDE6F5', 'income', []],
  ['rebate', '💳', '信用卡回饋', '#E7E0F5', 'income', []],
  ['interest', '🏦', '利息', '#E2E8EE', 'income', []],
  ['other_in', '📦', '其他收入', '#E9E9E6', 'income', []]
];
const SPECIAL = { transfer: { icon: '⇄', name: '轉帳', color: '#E9E9E6' }, adjust: { icon: '⚖️', name: '餘額校正', color: '#E9E9E6' } };
const OLD_CAT = { grocery: ['home', '超市'], bills: ['net', ''], salary: ['salary', ''], other_in: ['other_in', ''] };   // v1.1 以前的分類代號
const ACCT_TYPES = [['credit', '💳', '信用卡'], ['bank', '🏦', '銀行'], ['cash', '💵', '現金']];
const ACCT_T = Object.fromEntries(ACCT_TYPES.map(([k, i, n]) => [k, { icon: i, name: n }]));
const CHART_COLORS = ['#7FAEE0', '#EE8E6B', '#9B86D9', '#E8B44C', '#5DBB8E', '#EE7F9C', '#6C8EAD', '#C9A227', '#A3A3A3', '#B5838D'];
const money = n => (n < 0 ? '-' : '') + 'A$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num1 = n => (Math.round(n * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 });
const txType = x => x.type || 'expense';
let moneyMonth = ymd(new Date()).slice(0, 7);
let moneyTab = 'acct', statKind = 'expense', statBy = 'cat';

// ---------- 資料整理（第一次打開、或從舊版升級） ----------
if (!db.accounts) db.accounts = [];
if (!db.catv) {
  const old = db.cats || [];                       // 舊版匯入時建的自訂分類
  db.cats = DEFAULT_CATS.map(([k, icon, name, color, kind, subs]) => ({ k, icon, name, color, kind, subs: subs.map(n => ({ k: uid() + n, name: n })) }));
  for (const c of old) {
    const same = db.cats.find(z => z.name === c.name && z.kind === c.kind);
    if (same) db.expenses.forEach(x => { if (x.cat === c.k) x.cat = same.k; });
    else db.cats.push({ k: c.k, icon: c.icon || '🏷️', name: c.name, color: '#E9E9E6', kind: c.kind, subs: [] });
  }
  db.expenses.forEach(x => {
    if (OLD_CAT[x.cat]) { const [k, subName] = OLD_CAT[x.cat]; x.cat = k; const s = subName && db.cats.find(c => c.k === k).subs.find(z => z.name === subName); if (s) x.sub = s.k; }
    if (!x.cat || (!db.cats.some(c => c.k === x.cat) && !SPECIAL[x.cat])) x.cat = txType(x) === 'income' ? 'other_in' : 'other';
    delete x.payer;
  });
  db.catv = 2; save();
}
const catsOf = kind => db.cats.filter(c => c.kind === kind);
function catInfo(k) { return SPECIAL[k] || db.cats.find(c => c.k === k) || { icon: '🏷️', name: '其他', color: '#E9E9E6', subs: [] }; }
const subName = (k, s) => { const c = catInfo(k); const z = (c.subs || []).find(q => q.k === s); return z ? z.name : ''; };
const catIcon = (k, cls = 'ci') => { const c = catInfo(k); return `<span class="${cls}" style="background:${c.color}">${c.icon}</span>`; };

// ---------- 帳戶 ----------
function acctBalance(a) {                      // 帳戶餘額：起始金額＋收入－支出±轉帳（未來日期不算）
  let b = a.init || 0;
  const today = ymd(new Date());
  for (const x of db.expenses) {
    if (x.date > today) continue;
    const t = txType(x);
    if (t === 'adjust' && x.acct === a.id) b += x.amount;
    else if (t === 'income' && x.acct === a.id) b += x.amount;
    else if (t === 'expense' && x.acct === a.id) b -= x.amount;
    else if (t === 'transfer') { if (x.acct === a.id) b -= x.amount; if (x.toAcct === a.id) b += x.amount; }
  }
  return Math.round(b * 100) / 100;
}
const acctOf = id => db.accounts.find(z => z.id === id);
const acctName = id => { const a = acctOf(id); return a ? a.name : ''; };

// 信用卡本期：上一次結算日的隔天 ～ 這一次結算日（沒設結算日就用這個月）
function cardPeriod(a, today = ymd(new Date())) {
  const d = parseYmd(today), sd = Math.min(28, a.statementDay || 0);
  if (!sd) { const s = today.slice(0, 8) + '01'; const e = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return [s, e]; }
  const end = d.getDate() <= sd ? new Date(d.getFullYear(), d.getMonth(), sd) : new Date(d.getFullYear(), d.getMonth() + 1, sd);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, sd + 1);
  return [ymd(start), ymd(end)];
}
function planValue(p, amount) {
  if (p.kind === 'cash') return amount * (p.rate || 0) / 100;
  return p.mode === 'mpd' ? amount * (p.mpd || 0) : (p.per ? amount / p.per : 0);     // mpd：每 1 元 X 哩；per：每 X 元 1 哩
}
function cardRebate(a) {                          // 本期預估回饋（依每筆記帳時套用的方案）
  const [s, e] = cardPeriod(a);
  const today = ymd(new Date());
  const rows = db.expenses.filter(x => txType(x) === 'expense' && x.acct === a.id && x.date >= s && x.date <= e && x.date <= today);
  const by = {}; let none = 0;
  for (const x of rows) {
    const p = (a.plans || []).find(q => q.id === x.plan);
    if (!p) { none += x.amount; continue; }
    (by[p.id] = by[p.id] || { p, spend: 0 }).spend += x.amount;
  }
  let cash = 0, miles = 0;
  const lines = Object.values(by).map(({ p, spend }) => {
    let v = planValue(p, spend); if (p.cap) v = Math.min(v, p.cap);
    if (p.kind === 'cash') cash += v; else miles += v;
    return { p, spend, v };
  });
  return { s, e, spend: rows.reduce((t, x) => t + x.amount, 0), lines, none, cash, miles, n: rows.length };
}
const planLabel = p => p.kind === 'cash' ? `${p.name} ${p.rate}%` : p.mode === 'mpd' ? `${p.name} 每 1 元 ${p.mpd} 哩` : `${p.name} 每 ${p.per} 元 1 哩`;
const rebateText = (cash, miles) => [cash ? money(cash) : '', miles ? num1(miles) + ' 哩' : ''].filter(Boolean).join('＋') || '—';

// ---------- 畫面 ----------
function renderMoney() {
  const [y, m] = moneyMonth.split('-').map(Number);
  const td = new Date();
  if (moneyTab === 'acct') $('#money-title').innerHTML = `歡迎回來<svg class="hello-cat" viewBox="-14 -38 40 40" aria-hidden="true"><g>${charCat('hellocatmask')}</g><path class="wave" d="M20 -14 q4 -6 2 -12" stroke="#F2C14E" stroke-width="2" fill="none" stroke-linecap="round"/><path class="wave w2" d="M24 -12 q5 -7 3 -14" stroke="#F2C14E" stroke-width="2" fill="none" stroke-linecap="round"/></svg><small class="hello-date">今天是 ${td.getMonth() + 1}月${td.getDate()}日（${'日一二三四五六'[td.getDay()]}）</small>`;
  else $('#money-title').textContent = { ins: '保險', pts: '點數', set: '設定' }[moneyTab] || `${y}年${m}月`;
  $('#money-add').hidden = moneyTab !== 'acct';                       // v1.5：只有帳戶頁有右上角「記一筆」
  $('#money-new').hidden = moneyTab !== 'ins' && moneyTab !== 'pts';  // 保險、點數的「新增」放在右上角
  $('#money-new').textContent = moneyTab === 'ins' ? '＋ 新增保單' : '＋ 新增航空公司';
  document.querySelectorAll('.mntabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === moneyTab));
  ['list', 'stat', 'acct', 'ins', 'pts', 'set'].forEach(t => $('#money-' + t).hidden = t !== moneyTab);
  $('#money-monthnav').style.visibility = moneyTab === 'list' || moneyTab === 'stat' ? 'visible' : 'hidden';
  if (moneyTab === 'ins') return renderIns();
  if (moneyTab === 'pts') return renderPts();
  if (moneyTab === 'set') return renderSet();
  const list = db.expenses.filter(x => x.date.slice(0, 7) === moneyMonth)
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.t || 0) - (a.t || 0));
  const out = list.filter(x => txType(x) === 'expense').reduce((s, x) => s + x.amount, 0);
  const inc = list.filter(x => txType(x) === 'income').reduce((s, x) => s + x.amount, 0);
  const sum = `<div class="mgrid2"><div><span>支出</span><b class="neg">${money(out)}</b></div><div><span>收入</span><b class="pos">${money(inc)}</b></div></div>
    <div class="mbal"><span>結餘</span><b class="${inc - out >= 0 ? 'pos' : 'neg'}">${inc - out >= 0 ? '+' : ''}${money(inc - out)}</b></div>`;
  if (moneyTab === 'list') {
    let h = '', last = '';
    for (const x of list) {
      if (x.date !== last) { last = x.date; const d = parseYmd(x.date); h += `<div class="mday-h">${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）</div>`; }
      const t = txType(x), c = catInfo(t === 'transfer' || t === 'adjust' ? t : x.cat), sn = subName(x.cat, x.sub);
      const sub = t === 'transfer' ? `${esc(acctName(x.acct) || '?')} → ${esc(acctName(x.toAcct) || '?')}`
        : [sn ? c.name + '・' + sn : '', acctName(x.acct), x.note && x.merchant ? x.merchant : ''].filter(Boolean).map(esc).join('・');
      h += `<button class="xrow${t === 'adjust' ? ' adj' : ''}${x.date > ymd(new Date()) ? ' future' : ''}" data-id="${x.id}">${catIcon(t === 'transfer' || t === 'adjust' ? t : x.cat)}
        <span class="xt">${esc(x.note || x.merchant || sn || c.name)}${sub ? `<small>${sub}</small>` : ''}</span>
        <b class="${t === 'income' ? 'pos' : t === 'expense' ? 'neg' : ''}">${t === 'income' ? '+' : t === 'expense' ? '-' : t === 'adjust' ? (x.amount >= 0 ? '+' : '-') : ''}${money(x.amount).replace('-', '')}</b></button>`;
    }
    $('#money-list').innerHTML = `<div class="card">${sum}</div>` + (h || '<p class="empty">這個月還沒有記帳，按右上角「＋」記第一筆吧</p>');
  } else if (moneyTab === 'stat') {
    document.querySelectorAll('.st-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === statKind));
    document.querySelectorAll('.st-by button').forEach(b => b.classList.toggle('on', b.dataset.b === statBy));
    const rows = list.filter(x => txType(x) === statKind);
    const total = rows.reduce((s, x) => s + x.amount, 0);
    const groups = {};
    rows.forEach(x => {
      const k = statBy === 'cat' ? (x.cat || 'other') : (x.acct || '_none');
      const g = (groups[k] = groups[k] || { sum: 0, n: 0, subs: {} }); g.sum += x.amount; g.n++;
      if (statBy === 'cat') { const sn = subName(x.cat, x.sub) || '（沒選子項目）'; g.subs[sn] = (g.subs[sn] || 0) + x.amount; }
    });
    const arr = Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum);
    let off = 0, ring = '';
    const C = 2 * Math.PI * 70;
    arr.forEach(([k, g], i) => {
      const len = total ? g.sum / total * C : 0;
      ring += `<circle r="70" cx="90" cy="90" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="26"
        stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
      off += len;
    });
    const label = k => statBy === 'cat' ? `${catIcon(k, 'ci sm')} ${esc(catInfo(k).name)}`
      : (k === '_none' ? '未指定帳戶' : (ACCT_T[(acctOf(k) || {}).type] || { icon: '' }).icon + ' ' + esc(acctName(k) || '（已刪除的帳戶）'));
    const subsOf = g => { const e = Object.entries(g.subs); return e.length > 1 || (e.length === 1 && e[0][0] !== '（沒選子項目）')
      ? `<div class="subsum">${e.sort((a, b) => b[1] - a[1]).map(([n, v]) => `<span>${esc(n)} ${money(v)}</span>`).join('')}</div>` : ''; };
    $('#money-stat-body').innerHTML = `<div class="card">${sum}</div>` + (arr.length ? `
      <div class="card donut"><svg viewBox="0 0 180 180" width="190" height="190"><circle r="70" cx="90" cy="90" fill="none" stroke="var(--line2)" stroke-width="26"/>${ring}</svg>
        <div class="dc"><span>${statKind === 'expense' ? '支出' : '收入'}</span><b>${money(total)}</b></div></div>
      ${arr.map(([k, g], i) => `<div class="srank"><span class="sl">${label(k)}</span><b>${money(g.sum)}</b>
        <div class="bar"><i style="width:${total ? g.sum / total * 100 : 0}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></i></div>
        <small>${g.n} 筆</small><small class="r">${total ? Math.round(g.sum / total * 100) : 0}%</small>${statBy === 'cat' ? subsOf(g) : ''}</div>`).join('')}`
      : `<p class="empty">這個月沒有${statKind === 'expense' ? '支出' : '收入'}紀錄</p>`);
  } else {
    const net = db.accounts.reduce((s, a) => s + acctBalance(a), 0);
    let h = `<div class="card"><div class="mbal" style="border:0;margin:0;padding:0"><span>淨資產（所有帳戶加總）</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b></div></div>`;
    for (const [k, icon, name] of ACCT_TYPES) {
      const as = db.accounts.filter(a => a.type === k);
      if (!as.length) continue;
      const sub = as.reduce((s, a) => s + acctBalance(a), 0);
      h += `<div class="sec acc-sec"><span>${icon} ${name}</span><span>${money(sub)}</span></div>` +
        as.map(a => {
          const b = acctBalance(a);
          const extra = k === 'credit' && (a.plans || []).length ? (() => { const r = cardRebate(a); return `・本期預估回饋 ${rebateText(r.cash, r.miles)}`; })() : '';
          return `<button class="arow" data-id="${a.id}"><span class="xt">${esc(a.name)}<small>${name}${a.last4 ? `（${esc(a.last4)}）` : ''}${extra}</small></span>
          <b class="${b < 0 ? 'neg' : ''}">${money(b)}</b><span class="chev">›</span></button>`; }).join('');
    }
    if (!db.accounts.length) h += '<p class="empty">還沒有帳戶。到最下面「設定」→「新增帳戶」，把信用卡、銀行、現金加進來，輸入現在的餘額就好。</p>';
    h += '<p class="tray-hint">新增帳戶、匯入 CSV 檔案在最下面的「設定」。</p>';
    $('#money-acct').innerHTML = renderIsland(net) + h;
    startPets();
  }
}

// ====================================================================
// 記一筆（像 DuoPurse：一行一行，點「分類 ›」「帳戶 ›」再選）
// ====================================================================
function openExpense(x) {
  const isNew = !x;
  const f = Object.assign({ type: 'expense', amount: '', cat: '', sub: '', acct: (db.accounts.find(a => a.type === 'credit') || db.accounts[0] || {}).id || '',
    toAcct: '', plan: '', date: ymd(new Date()), merchant: '', note: '' }, x || {});
  f.type = txType(f);
  if (isNew) f.cat = (catsOf('expense')[0] || {}).k;
  if (isNew) f.plan = defaultPlan(f.acct);

  const draw = () => {
    const a = acctOf(f.acct), c = catInfo(f.cat), sn = subName(f.cat, f.sub);
    const plans = a && a.type === 'credit' ? (a.plans || []) : [];
    const p = plans.find(q => q.id === f.plan);
    const est = p && parseFloat(f.amount) > 0 ? (() => { const v = planValue(p, parseFloat(f.amount)); return p.kind === 'cash' ? `約 ${money(v)}` : `約 ${num1(v)} 哩`; })() : '';
    openSheet(`
      <div class="shead"><button class="txt" id="x-cancel">取消</button><b>${isNew ? '記一筆' : '修改這筆'}</b><button class="txt strong" id="x-save">儲存</button></div>
      <div class="seg seg3 ttype">${[['expense', '支出'], ['income', '收入'], ['transfer', '轉帳']].map(([k, n]) =>
        `<button type="button" data-t="${k}" class="${k === f.type ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="amtbox"><span>A$</span><input id="x-amt" type="number" inputmode="decimal" step="0.01" min="0" value="${f.amount}" placeholder="0.00"></div>
      <div class="list">
        ${f.type === 'transfer' ? '' : `<button class="lrow" id="r-cat"><span class="lk">分類</span><span class="lv">${catIcon(f.cat, 'ci sm')} ${esc(c.name)}${sn ? ' › ' + esc(sn) : ''}</span><span class="chev">›</span></button>`}
        <button class="lrow" id="r-acct"><span class="lk">${f.type === 'income' ? '存進' : f.type === 'transfer' ? '轉出' : '帳戶'}</span><span class="lv">${a ? ACCT_T[a.type].icon + ' ' + esc(a.name) : '<em>選擇帳戶</em>'}</span><span class="chev">›</span></button>
        ${f.type === 'transfer' ? `<button class="lrow" id="r-to"><span class="lk">轉進</span><span class="lv">${acctOf(f.toAcct) ? ACCT_T[acctOf(f.toAcct).type].icon + ' ' + esc(acctName(f.toAcct)) : '<em>選擇帳戶</em>'}</span><span class="chev">›</span></button>` : ''}
        ${f.type === 'expense' && plans.length ? `<button class="lrow" id="r-plan"><span class="lk">回饋方案</span><span class="lv">${p ? esc(planLabel(p)) : '<em>不套用</em>'}${est ? `<small class="pos">${est}</small>` : ''}</span><span class="chev">›</span></button>` : ''}
        <label class="lrow"><span class="lk">日期</span><input id="x-date" type="date" value="${f.date}"></label>
        ${f.type === 'transfer' ? '' : `<label class="lrow"><span class="lk">商家</span><input id="x-merchant" value="${esc(f.merchant || '')}" placeholder="例如：Woolworths"></label>`}
        <label class="lrow"><span class="lk">備註</span><input id="x-note" value="${esc(f.note || '')}" placeholder="可以不填"></label>
      </div>
      <p class="hint pos" id="x-pts">${expensePointsHint(f)}</p>
      ${db.accounts.length ? '' : '<p class="hint">還沒有帳戶的話，先到「帳戶」新增，餘額才會自動加減。</p>'}
      <p class="err" id="x-err"></p>
      ${isNew ? '' : '<div class="btns"><button class="danger" id="x-del">刪除這筆</button></div>'}`);
    const keep = () => { f.amount = $('#x-amt').value; f.date = $('#x-date').value; f.note = $('#x-note').value; if ($('#x-merchant')) f.merchant = $('#x-merchant').value; };
    ['#x-amt', '#x-merchant', '#x-date', '#x-note'].forEach(s => { if ($(s)) $(s).addEventListener('input', () => { keep(); $('#x-pts').innerHTML = expensePointsHint(f); }); });
    $('#x-amt').oninput = () => { $('#x-err').textContent = ''; };
    $('#x-amt').onchange = () => { keep(); if (p) draw(); };
    if (isNew && !f.amount) setTimeout(() => $('#x-amt').focus(), 60);
    $('#sheet .ttype').onclick = e => { const b = e.target.closest('button'); if (!b) return; keep(); f.type = b.dataset.t;
      if (f.type !== 'transfer' && catInfo(f.cat).kind !== f.type) { f.cat = (catsOf(f.type)[0] || {}).k; f.sub = ''; } draw(); };
    if ($('#r-cat')) $('#r-cat').onclick = () => { keep(); pickCategory(f.type, f.cat, f.sub, (k, s) => { f.cat = k; f.sub = s; draw(); }, draw); };
    $('#r-acct').onclick = () => { keep(); pickAccount(f.acct, id => { f.acct = id; f.plan = defaultPlan(id); draw(); }, draw); };
    if ($('#r-to')) $('#r-to').onclick = () => { keep(); pickAccount(f.toAcct, id => { f.toAcct = id; draw(); }, draw); };
    if ($('#r-plan')) $('#r-plan').onclick = () => { keep(); pickPlan(a, f.plan, id => { f.plan = id; draw(); }, draw); };
    $('#x-cancel').onclick = closeSheet;
    $('#x-save').onclick = () => {
      keep();
      const amount = Math.round(parseFloat(f.amount) * 100) / 100;
      if (!(amount > 0)) return $('#x-err').textContent = '請輸入金額';
      if (!f.date) return $('#x-err').textContent = '請選日期';
      if (f.type === 'transfer' && (!f.acct || !f.toAcct)) return $('#x-err').textContent = '轉帳要選轉出和轉進的帳戶';
      if (f.type === 'transfer' && f.acct === f.toAcct) return $('#x-err').textContent = '轉出和轉進不能是同一個帳戶';
      const acc = acctOf(f.acct);
      const data = { type: f.type, amount, cat: f.type === 'transfer' ? 'transfer' : f.cat, sub: f.type === 'transfer' ? '' : f.sub, acct: f.acct,
        toAcct: f.type === 'transfer' ? f.toAcct : '', plan: f.type === 'expense' && acc && acc.type === 'credit' ? f.plan : '',
        date: f.date, merchant: f.type === 'transfer' ? '' : (f.merchant || '').trim(), note: (f.note || '').trim() };
      if (isNew) db.expenses.push({ id: uid(), t: Date.now(), ...data }); else Object.assign(x, data);
      save(); closeSheet(); moneyMonth = data.date.slice(0, 7); renderMoney(); toast('記好了');
    };
    if (!isNew) $('#x-del').onclick = () => {
      $('#x-del').outerHTML = '<button class="danger" id="x-del2">確定刪除</button>';
      $('#x-del2').onclick = () => { db.expenses = db.expenses.filter(z => z !== x); save(); closeSheet(); renderMoney(); toast('已刪除'); };
    };
  };
  draw();
}
const defaultPlan = id => { const a = acctOf(id); if (!a || a.type !== 'credit') return ''; const p = (a.plans || []).find(q => q.isDefault); return p ? p.id : ''; };

// ---------- 選分類（有子項目的會出現 ›，點進去再選） ----------
function pickCategory(kind, cur, curSub, done, back) {
  let open = null;                                // 正在看哪一個分類的子項目
  const draw = () => {
    if (!open) {
      openSheet(`<div class="shead"><button class="txt" id="c-back">‹ 返回</button><b>選擇${kind === 'income' ? '收入' : '消費'}分類</b><span></span></div>
        <div class="list">${catsOf(kind).map(c => `<button class="lrow cat" data-k="${c.k}">${catIcon(c.k)}<span class="lv big">${esc(c.name)}${c.k === cur && curSub ? `<small>${esc(subName(c.k, curSub))}</small>` : ''}</span>
          ${c.subs.length ? '<span class="chev">›</span>' : (c.k === cur ? '<span class="check">✓</span>' : '')}</button>`).join('')}</div>
        <div class="btns"><button id="c-new">＋ 新增分類</button></div>`);
      $('#c-back').onclick = back;
      $('#sheet .list').onclick = e => { const b = e.target.closest('.lrow'); if (!b) return; const c = catInfo(b.dataset.k);
        if (c.subs.length) { open = c; draw(); } else done(c.k, ''); };
      $('#c-new').onclick = () => { const name = prompt('新分類的名稱'); if (!name || !name.trim()) return;
        const icon = (prompt('圖示（貼一個表情符號，可以不填）', '🏷️') || '🏷️').trim().slice(0, 2);
        db.cats.push({ k: 'c_' + uid(), name: name.trim(), icon, color: '#E9E9E6', kind, subs: [] }); save(); draw(); };
    } else {
      const c = open;
      openSheet(`<div class="shead"><button class="txt" id="c-back">‹ 分類</button><b>${c.icon} ${esc(c.name)}</b><span></span></div>
        <div class="list"><button class="lrow" data-s=""><span class="lv big">只選「${esc(c.name)}」</span>${c.k === cur && !curSub ? '<span class="check">✓</span>' : ''}</button>
        ${c.subs.map(s => `<button class="lrow" data-s="${s.k}"><span class="lv big">${esc(s.name)}</span>${c.k === cur && s.k === curSub ? '<span class="check">✓</span>' : ''}</button>`).join('')}</div>
        <div class="btns"><button id="c-newsub">＋ 新增子項目</button></div>`);
      $('#c-back').onclick = () => { open = null; draw(); };
      $('#sheet .list').onclick = e => { const b = e.target.closest('.lrow'); if (b) done(c.k, b.dataset.s); };
      $('#c-newsub').onclick = () => { const name = prompt(`「${c.name}」底下的新子項目`); if (!name || !name.trim()) return;
        c.subs.push({ k: uid(), name: name.trim() }); save(); draw(); };
    }
  };
  draw();
}

function pickAccount(cur, done, back) {
  openSheet(`<div class="shead"><button class="txt" id="p-back">‹ 返回</button><b>選擇帳戶</b><span></span></div>
    ${ACCT_TYPES.map(([k, icon, n]) => { const as = db.accounts.filter(a => a.type === k); return as.length ? `<div class="sec">${icon} ${n}</div><div class="list">${as.map(a =>
      `<button class="lrow" data-id="${a.id}"><span class="lv big">${esc(a.name)}</span><small class="muted">${money(acctBalance(a))}</small>${a.id === cur ? '<span class="check">✓</span>' : ''}</button>`).join('')}</div>` : ''; }).join('')}
    ${db.accounts.length ? '' : '<p class="empty">還沒有帳戶，先到「帳戶」新增。</p>'}`);
  $('#p-back').onclick = back;
  $('#sheet').querySelectorAll('.lrow').forEach(b => b.onclick = () => done(b.dataset.id));
}

function pickPlan(a, cur, done, back) {
  openSheet(`<div class="shead"><button class="txt" id="p-back">‹ 返回</button><b>回饋方案</b><span></span></div>
    <div class="list"><button class="lrow" data-id=""><span class="lv big">不套用</span>${!cur ? '<span class="check">✓</span>' : ''}</button>
    ${(a.plans || []).map(p => `<button class="lrow" data-id="${p.id}"><span class="lv big">${esc(planLabel(p))}${p.isDefault ? '<small>預設</small>' : ''}</span>${p.id === cur ? '<span class="check">✓</span>' : ''}</button>`).join('')}</div>`);
  $('#p-back').onclick = back;
  $('#sheet').querySelectorAll('.lrow').forEach(b => b.onclick = () => done(b.dataset.id));
}

// ====================================================================
// 帳戶：新增／修改；信用卡另有「卡片詳情」（本期預估回饋、回饋方案、回饋紀錄）
// ====================================================================
function openAccount(a) {
  if (a && a.type === 'credit') return openCard(a);
  editAccount(a);
}
function editAccount(a, back) {
  const isNew = !a;
  const v = a || { name: '', type: 'bank', last4: '', statementDay: '' };
  const bal = a ? acctBalance(a) : '';
  let type = v.type;
  openSheet(`
    <div class="shead"><button class="txt" id="a-cancel">${back ? '‹ 返回' : '取消'}</button><b>${isNew ? '新增帳戶' : '修改帳戶'}</b><button class="txt strong" id="a-save">儲存</button></div>
    <label>帳戶名稱</label><input id="a-name" value="${esc(v.name)}" placeholder="例如：大白、Ubank、現金">
    <label>種類</label>
    <div class="seg seg3" id="a-type">${ACCT_TYPES.map(([k, i, n]) => `<button type="button" data-k="${k}" class="${k === v.type ? 'on' : ''}">${i} ${n}</button>`).join('')}</div>
    <label>卡號或帳號末四碼 <span class="opt-tag">可不填</span></label><input id="a-last4" inputmode="numeric" maxlength="4" value="${esc(v.last4 || '')}" placeholder="1234">
    <div id="a-cardbox"><label>每月幾號結算 <span class="opt-tag">信用卡，可不填</span></label>
      <input id="a-sd" type="number" inputmode="numeric" min="1" max="28" value="${v.statementDay || ''}" placeholder="例如：18"></div>
    <label id="a-bal-l"></label>
    <input id="a-bal" type="number" inputmode="decimal" step="0.01" value="${a ? Math.abs(v.type === 'credit' ? Math.min(0, bal) : bal) : ''}" placeholder="0.00">
    <p class="hint">${isNew ? '輸入現在的金額就好，之後每記一筆會自動加減。' : '如果跟銀行對不起來，直接改成正確金額，App 會自動校正。'}</p>
    <p class="err" id="a-err"></p>
    ${isNew ? '' : '<div class="btns"><button class="danger" id="a-del">刪除帳戶</button></div>'}`);
  const paint = () => { $('#a-bal-l').textContent = type === 'credit' ? '現在欠多少（未繳的卡費）' : '現在有多少錢'; $('#a-cardbox').hidden = type !== 'credit'; };
  paint();
  $('#a-type').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.k;
    $('#a-type').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); paint(); };
  $('#a-last4').oninput = () => { $('#a-last4').value = $('#a-last4').value.replace(/\D/g, '').slice(0, 4); };
  $('#a-cancel').onclick = back || closeSheet;
  $('#a-save').onclick = () => {
    const name = $('#a-name').value.trim();
    if (!name) return $('#a-err').textContent = '請寫帳戶名稱';
    let want = parseFloat($('#a-bal').value) || 0;
    if (type === 'credit') want = -Math.abs(want);
    const sd = parseInt($('#a-sd').value, 10);
    const acc = a || { id: uid(), init: 0, plans: [], rebates: [] };
    Object.assign(acc, { name, type, last4: $('#a-last4').value, statementDay: type === 'credit' && sd >= 1 && sd <= 28 ? sd : '' });
    if (!a) db.accounts.push(acc);
    acc.init = 0; acc.init = Math.round((want - acctBalance(acc)) * 100) / 100;
    save(); toast('已儲存');
    if (type === 'credit' && !isNew) openCard(acc); else { closeSheet(); renderMoney(); }
  };
  if (!isNew) $('#a-del').onclick = () => {
    const n = db.expenses.filter(x => x.acct === a.id || x.toAcct === a.id).length;
    $('#a-del').outerHTML = `<button class="danger" id="a-del2">確定刪除${n ? `（${n} 筆紀錄會變成「未指定帳戶」）` : ''}</button>`;
    $('#a-del2').onclick = () => {
      db.expenses.forEach(x => { if (x.acct === a.id) x.acct = ''; if (x.toAcct === a.id) x.toAcct = ''; });
      db.accounts = db.accounts.filter(z => z !== a); save(); closeSheet(); renderMoney(); toast('已刪除');
    };
  };
}

function openCard(a) {
  a.plans = a.plans || []; a.rebates = a.rebates || [];
  const r = cardRebate(a), bal = acctBalance(a);
  const fmt = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const got = a.rebates.slice().sort((p, q) => p.date < q.date ? 1 : -1);
  openSheet(`
    <div class="shead"><button class="txt" id="k-close">關閉</button><b>${esc(a.name)}</b><button class="txt strong" id="k-edit">編輯</button></div>
    <div class="card"><div class="mbal" style="border:0;margin:0;padding:0"><span>目前欠款</span><b class="${bal < 0 ? 'neg' : ''}">${money(Math.min(0, bal))}</b></div>
      <div class="mbal"><span>本期消費（${fmt(r.s)}–${fmt(r.e)}${a.statementDay ? '' : '，沒設結算日先用整個月'}）</span><b>${money(r.spend)}</b></div>
      <p class="hint">${r.n} 筆</p></div>
    <div class="card">
      <div class="mbal" style="border:0;margin:0;padding:0"><span>本期預估回饋</span><b class="pos">${rebateText(r.cash, r.miles)}</b></div>
      ${r.lines.map(l => `<div class="pline"><span>${esc(planLabel(l.p))}<small>消費 ${money(l.spend)}${l.p.cap ? `・上限 ${l.p.kind === 'cash' ? money(l.p.cap) : num1(l.p.cap) + ' 哩'}` : ''}</small></span>
        <b>${l.p.kind === 'cash' ? money(l.v) : num1(l.v) + ' 哩'}</b></div>${l.p.kind === 'miles' && l.v > 0 ? (() => { const nt = `${r.e.slice(5).replace('-', '/')} 期 ${l.p.name}`;
          return a.rebates.some(g => g.note === nt) ? '<p class="hint" style="text-align:right">✓ 這期已存入</p>'
            : `<button class="txt strong tomiles" data-plan2="${l.p.id}" data-v="${Math.floor(l.v)}" data-note="${esc(nt)}">✈️ 存入${progOf(l.p.prog) ? ' ' + esc(progOf(l.p.prog).airline) : '航空點數'}（${num1(Math.floor(l.v))} 點）</button>`; })() : ''}`).join('')}
      ${r.none ? `<div class="pline"><span>未套用方案</span><b class="muted">消費 ${money(r.none)}</b></div>` : ''}
      <p class="hint">依記帳時套用的方案估算，僅供參考；實際回饋以銀行入帳為準。</p></div>
    <div class="sec acc-sec"><span>回饋方案</span><button class="txt strong" id="k-addplan">＋ 新增</button></div>
    <div class="list">${a.plans.length ? a.plans.map(p => `<button class="lrow" data-plan="${p.id}"><span class="lv big">${esc(planLabel(p))}${p.isDefault ? '<small>預設</small>' : ''}${p.cap ? `<small>每期上限 ${p.kind === 'cash' ? money(p.cap) : p.cap + ' 哩'}</small>` : ''}</span><span class="chev">›</span></button>`).join('')
      : '<p class="empty" style="padding:10px 12px">還沒有回饋方案，按「＋ 新增」設定這張卡的回饋。</p>'}</div>
    <div class="sec acc-sec"><span>回饋紀錄（實際拿到的）</span><button class="txt strong" id="k-addreb">＋ 記一筆</button></div>
    <div class="list">${got.length ? got.map(g => `<button class="lrow" data-reb="${g.id}"><span class="lv big">${g.kind === 'cash' ? money(g.value) : num1(g.value) + ' 哩'}<small>${g.date}${g.note ? '・' + esc(g.note) : ''}${g.kind === 'miles' && progOf(g.prog) ? '・已存入 ' + esc(progOf(g.prog).airline) : ''}</small></span><span class="chev">›</span></button>`).join('')
      : '<p class="empty" style="padding:10px 12px">銀行回饋入帳後記在這裡。</p>'}</div>
    ${got.length ? `<p class="hint">累計拿到：${rebateText(got.filter(g => g.kind === 'cash').reduce((s, g) => s + g.value, 0), got.filter(g => g.kind === 'miles').reduce((s, g) => s + g.value, 0))}</p>` : ''}`);
  $('#k-close').onclick = () => { closeSheet(); renderMoney(); };
  $('#k-edit').onclick = () => editAccount(a, () => openCard(a));
  $('#k-addplan').onclick = () => editPlan(a, null);
  $('#k-addreb').onclick = () => editRebate(a, null);
  $('#sheet').querySelectorAll('.tomiles').forEach(b => b.onclick = () => { const p = a.plans.find(q => q.id === b.dataset.plan2);
    editRebate(a, null, { kind: 'miles', value: +b.dataset.v, prog: p && p.prog, note: b.dataset.note }); });
  $('#sheet').querySelectorAll('[data-plan]').forEach(b => b.onclick = () => editPlan(a, a.plans.find(p => p.id === b.dataset.plan)));
  $('#sheet').querySelectorAll('[data-reb]').forEach(b => b.onclick = () => editRebate(a, a.rebates.find(g => g.id === b.dataset.reb)));
}

function editPlan(a, p) {
  const isNew = !p;
  const v = p || { name: '', kind: 'cash', rate: '', per: '', cap: '', isDefault: !a.plans.some(q => q.isDefault) };
  let kind = v.kind, mode = v.mode || 'per';
  openSheet(`
    <div class="shead"><button class="txt" id="q-cancel">取消</button><b>${isNew ? '新增回饋方案' : '修改回饋方案'}</b><button class="txt strong" id="q-save">儲存</button></div>
    <label>方案名稱</label><input id="q-name" value="${esc(v.name)}" placeholder="例如：一般消費、海外、串流">
    <label>回饋型態</label>
    <div class="seg seg2" id="q-kind"><button type="button" data-k="cash" class="${kind === 'cash' ? 'on' : ''}">現金回饋</button><button type="button" data-k="miles" class="${kind === 'miles' ? 'on' : ''}">里程回饋</button></div>
    <div id="q-cash"><label>回饋比例</label><div class="inl"><input id="q-rate" type="number" inputmode="decimal" step="0.01" value="${v.rate}" placeholder="例如：1.5"><span>%</span></div></div>
    <div id="q-miles"><label>累積算法</label>
      <div class="seg seg2" id="q-mode"><button type="button" data-m="per" class="${mode === 'per' ? 'on' : ''}">每花多少錢 1 哩</button><button type="button" data-m="mpd" class="${mode === 'mpd' ? 'on' : ''}">每 1 元幾哩</button></div>
      <div class="inl" id="q-perbox"><span>每花 A$</span><input id="q-per" type="number" inputmode="decimal" step="0.01" value="${v.per}" placeholder="2.5"><span>累積 1 哩</span></div>
      <div class="inl" id="q-mpdbox"><span>每 A$1 累積</span><input id="q-mpd" type="number" inputmode="decimal" step="0.01" value="${v.mpd || ''}" placeholder="0.4"><span>哩</span></div>
      <p class="hint">例如「每 A$2.5 一哩」選左邊填 2.5；「每 A$1 = 0.4 哩」選右邊填 0.4（兩個其實一樣）。</p>
      <label>里程存到哪個航空點數</label><select id="q-prog">${progOptions(v.prog, PTS().length ? '先不選' : '（還沒有，先到「點數」頁新增）')}</select></div>
    <label class="check"><input type="checkbox" id="q-capon"${v.cap ? ' checked' : ''}> 每期回饋上限</label>
    <div id="q-capbox"><div class="inl"><input id="q-cap" type="number" inputmode="decimal" step="0.01" value="${v.cap}" placeholder="上限"><span id="q-capu"></span></div></div>
    <label class="check"><input type="checkbox" id="q-def"${v.isDefault ? ' checked' : ''}> 設為預設方案</label>
    <p class="hint">記帳選這張卡時自動套用預設方案，仍可逐筆改選其他方案。</p>
    <p class="err" id="q-err"></p>
    ${isNew ? '' : '<div class="btns"><button class="danger" id="q-del">刪除這個方案</button></div>'}`);
  const paint = () => { $('#q-cash').hidden = kind !== 'cash'; $('#q-miles').hidden = kind !== 'miles';
    $('#q-perbox').hidden = mode !== 'per'; $('#q-mpdbox').hidden = mode !== 'mpd';
    $('#q-capbox').hidden = !$('#q-capon').checked; $('#q-capu').textContent = kind === 'cash' ? 'A$' : '哩'; };
  paint();
  $('#q-kind').onclick = e => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k;
    $('#q-kind').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); paint(); };
  $('#q-capon').onchange = paint;
  $('#q-mode').onclick = e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m;
    $('#q-mode').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); paint(); };
  $('#q-cancel').onclick = () => openCard(a);
  $('#q-save').onclick = () => {
    const name = $('#q-name').value.trim() || (kind === 'cash' ? '現金回饋' : '里程回饋');
    const rate = parseFloat($('#q-rate').value), per = parseFloat($('#q-per').value), cap = $('#q-capon').checked ? parseFloat($('#q-cap').value) : '';
    if (kind === 'cash' && !(rate > 0)) return $('#q-err').textContent = '請填回饋比例';
    const mpd = parseFloat($('#q-mpd').value);
    if (kind === 'miles' && mode === 'per' && !(per > 0)) return $('#q-err').textContent = '請填每花多少錢累積 1 哩';
    if (kind === 'miles' && mode === 'mpd' && !(mpd > 0)) return $('#q-err').textContent = '請填每 1 元累積幾哩';
    const plan = p || { id: uid() };
    Object.assign(plan, { name, kind, rate: kind === 'cash' ? rate : '', mode, per: kind === 'miles' && mode === 'per' ? per : '', mpd: kind === 'miles' && mode === 'mpd' ? mpd : '', prog: kind === 'miles' ? $('#q-prog').value : '', cap: cap > 0 ? cap : '', isDefault: $('#q-def').checked });
    if (isNew) a.plans.push(plan);
    if (plan.isDefault) a.plans.forEach(q => { if (q !== plan) q.isDefault = false; });
    save(); toast('已儲存'); openCard(a);
  };
  if (!isNew) $('#q-del').onclick = () => {
    db.expenses.forEach(x => { if (x.plan === p.id) x.plan = ''; });
    a.plans = a.plans.filter(q => q !== p); save(); toast('已刪除'); openCard(a);
  };
}

function editRebate(a, g, preset) {
  const isNew = !g;
  const dp = a.plans.find(q => q.isDefault) || a.plans[0] || { kind: 'cash' };
  const v = g || Object.assign({ date: ymd(new Date()), kind: dp.kind, value: '', note: '', prog: dp.prog || '' }, preset || {});
  let kind = v.kind;
  openSheet(`
    <div class="shead"><button class="txt" id="g-cancel">取消</button><b>${isNew ? '記一筆回饋' : '修改回饋'}</b><button class="txt strong" id="g-save">儲存</button></div>
    <div class="seg seg2" id="g-kind"><button type="button" data-k="cash" class="${kind === 'cash' ? 'on' : ''}">現金回饋</button><button type="button" data-k="miles" class="${kind === 'miles' ? 'on' : ''}">里程</button></div>
    <label id="g-vl"></label><input id="g-val" type="number" inputmode="decimal" step="0.01" value="${v.value}" class="big">
    <label>日期</label><input id="g-date" type="date" value="${v.date}">
    <div id="g-progbox"><label>存到哪個航空點數</label><select id="g-prog">${progOptions(v.prog, '不存入（只記在這張卡）')}</select></div>
    <label>備註</label><input id="g-note" value="${esc(v.note || '')}" placeholder="例如：11 月帳單回饋">
    <p class="hint" id="g-hint"></p>
    <p class="err" id="g-err"></p>
    ${isNew ? '' : '<div class="btns"><button class="danger" id="g-del">刪除</button></div>'}`);
  const paint = () => { $('#g-vl').textContent = kind === 'cash' ? '回饋金額（A$）' : '拿到幾哩';
    $('#g-hint').textContent = kind === 'cash' ? '現金回饋會自動記成這張卡的一筆「收入・信用卡回饋」，欠款會跟著減少。' : '里程不影響帳戶餘額；選了航空點數，會自動加到那裡的點數並留紀錄。'; $('#g-progbox').hidden = kind !== 'miles'; };
  paint();
  $('#g-kind').onclick = e => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k;
    $('#g-kind').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); paint(); };
  $('#g-cancel').onclick = () => openCard(a);
  $('#g-save').onclick = () => {
    const value = Math.round(parseFloat($('#g-val').value) * 100) / 100;
    if (!(value > 0)) return $('#g-err').textContent = '請填數字';
    const reb = g || { id: uid() };
    if (reb.tx) db.expenses = db.expenses.filter(x => x.id !== reb.tx);          // 修改時先拿掉舊的那筆收入
    Object.assign(reb, { kind, value, date: $('#g-date').value || ymd(new Date()), note: $('#g-note').value.trim(), tx: '', prog: kind === 'miles' ? $('#g-prog').value : '' });
    syncPointLog(['reb', reb.id], kind === 'miles' ? value : 0, reb.prog, { date: reb.date, src: 'card', note: reb.note });
    if (kind === 'cash') { const id = uid(); reb.tx = id;
      db.expenses.push({ id, t: Date.now(), type: 'income', amount: value, cat: 'rebate', sub: '', acct: a.id, date: reb.date, merchant: '', note: reb.note || `${a.name} 回饋` }); }
    if (isNew) a.rebates.push(reb);
    save(); toast('已記錄回饋'); openCard(a);
  };
  if (!isNew) $('#g-del').onclick = () => {
    if (g.tx) db.expenses = db.expenses.filter(x => x.id !== g.tx);
    syncPointLog(['reb', g.id], 0, '', {});
    a.rebates = a.rebates.filter(z => z !== g); save(); toast('已刪除'); openCard(a);
  };
}

// ---------- 餘額校正（匯入時用來對齊帳戶餘額；不算進收支統計） ----------
function openAdjust(x) {
  openSheet(`<div class="shead"><button class="txt" id="j-close">關閉</button><b>⚖️ 餘額校正</b><span></span></div>
    <p class="hint">這筆是用來把「${esc(acctName(x.acct) || '帳戶')}」的餘額對齊用的，不算支出也不算收入，統計裡不會出現。</p>
    <div class="summary"><div><span>金額</span><b>${x.amount >= 0 ? '+' : ''}${money(x.amount)}</b></div><div><span>日期</span><b>${x.date}</b></div></div>
    <div class="btns"><button class="danger" id="j-del">刪除這筆</button></div>`);
  $('#j-close').onclick = closeSheet;
  $('#j-del').onclick = () => { db.expenses = db.expenses.filter(z => z !== x); save(); closeSheet(); renderMoney(); toast('已刪除'); };
}

// ---------- 從 DuoPurse 匯入 CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const CAT_ALIAS = { '薪水': '薪資', '餐飲': '外食', '居家': '家用', '醫療': '醫療/保險/健身房', '網路訂閱/手機網費': '網路訂閱 / 手機網費', '其他': null };
const CAT_ICON = { '台灣副卡': '💳' };
function guessAcctType(name) { return /現金|cash/i.test(name) ? 'cash' : /結算|繳費|信用卡|卡|visa|master|amex/i.test(name) ? 'credit' : 'bank'; }
function catByName(name, kind) {                  // 用名字找分類，找不到就新增
  if (!name || name === '其他') return kind === 'income' ? 'other_in' : 'other';
  const nm = CAT_ALIAS[name] || name;
  let c = db.cats.find(z => z.name === nm && z.kind === kind);
  if (!c) { c = { k: 'c_' + uid(), name: nm, icon: CAT_ICON[nm] || '🏷️', color: '#E9E9E6', kind, subs: [] }; db.cats.push(c); }
  return c.k;
}
function subByName(catK, name) {
  if (!name) return '';
  const c = catInfo(catK); if (!c.subs) return '';
  let s = c.subs.find(z => z.name === name);
  if (!s) { s = { k: uid(), name }; c.subs.push(s); }
  return s.k;
}

function importCSV(text) {
  const rows = parseCSV(text);
  const head = rows.shift() || [];
  const col = n => head.indexOf(n);
  if (['日期', '類型', '金額', '帳戶'].some(n => col(n) < 0)) { toast('看不懂這個檔案，請確認是記帳 App 匯出的 CSV 檔案'); return; }
  const get = (r, n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
  const seen = {}, keyOf = r => { const k = head.map((h, i) => r[i]).join('|'); seen[k] = (seen[k] || 0) + 1; return k + '#' + seen[k]; };
  const have = new Set(db.expenses.filter(x => x.src).map(x => x.src));
  const acctNames = new Set(), items = [];
  for (const r of rows) {
    const date = get(r, '日期'), amt = parseFloat(get(r, '金額')), local = parseFloat(get(r, '本幣金額'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amt >= 0)) continue;
    const src = 'duo:' + keyOf(r);
    const it = { date, time: get(r, '時間'), t: get(r, '類型'), amt, local: isNaN(local) ? amt : local, acct: get(r, '帳戶'), to: get(r, '轉入帳戶'),
      cat: get(r, '分類'), sub: get(r, '子分類'), item: get(r, '品項'), merchant: get(r, '商家'), note: get(r, '備註'), src, dup: have.has(src) };
    if (it.acct) acctNames.add(it.acct); if (it.to) acctNames.add(it.to);
    items.push(it);
  }
  const fresh = items.filter(i => !i.dup);
  const newAccts = [...acctNames].filter(n => !db.accounts.some(a => a.name === n));
  openSheet(`<div class="shead"><button class="txt" id="i-no">取消</button><b>匯入 CSV 檔案</b><span></span></div>
    <div class="summary"><div><span>紀錄</span><b>${items.length} 筆${items.length - fresh.length ? `（${items.length - fresh.length} 筆已經匯入過，會跳過）` : ''}</b></div>
      <div><span>帳戶</span><b>${[...acctNames].map(esc).join('、') || '—'}</b></div>
      ${newAccts.length ? `<div><span>新帳戶</span><b>會自動新增 ${newAccts.length} 個</b></div>` : ''}</div>
    <p class="hint">沒有分類的「支出」（通常是用來調整餘額的）會變成「餘額校正」，不算進收支統計。匯入後會請你確認每個帳戶現在的餘額。</p>
    <div class="btns"><button class="primary" id="i-ok"${fresh.length ? '' : ' disabled'}>匯入 ${fresh.length} 筆</button></div>`);
  $('#i-no').onclick = closeSheet;
  $('#i-ok').onclick = () => {
    const idOf = name => {
      if (!name) return '';
      let a = db.accounts.find(z => z.name === name);
      if (!a) { const sd = (name.match(/(\d{1,2})號/) || [])[1]; a = { id: uid(), name, type: guessAcctType(name), last4: '', init: 0, statementDay: sd && +sd <= 28 ? +sd : '', plans: [], rebates: [] }; db.accounts.push(a); }
      return a.id;
    };
    let n = 0;
    for (const i of fresh) {
      const base = { id: uid(), t: Date.parse(i.date + 'T' + (i.time || '00:00')) || Date.now(), date: i.date, src: i.src,
        acct: idOf(i.acct), merchant: i.merchant, note: [i.item, i.note].filter(Boolean).join('・'), sub: '', plan: '' };
      let x;
      if (i.t === '轉帳') x = { ...base, type: 'transfer', amount: i.amt, cat: 'transfer', toAcct: idOf(i.to) };
      else if (i.t === '收入') { const k = catByName(i.cat, 'income'); x = { ...base, type: 'income', amount: i.amt, cat: k, sub: subByName(k, i.sub) }; }
      else if (i.t === '退款') x = { ...base, type: 'income', amount: i.amt, cat: 'refund', note: base.note || (i.cat ? i.cat + '退款' : '') };
      else if (!i.cat) x = { ...base, type: 'adjust', amount: i.local, cat: 'adjust' };
      else { const k = catByName(i.cat, 'expense'); x = { ...base, type: 'expense', amount: i.amt, cat: k, sub: subByName(k, i.sub) }; }
      db.expenses.push(x); n++;
    }
    save(); toast(`匯入了 ${n} 筆`);
    reconcileAccounts();
  };
}

function reconcileAccounts() {
  openSheet(`<div class="shead"><button class="txt" id="r-skip">先不用</button><b>確認帳戶餘額</b><button class="txt strong" id="r-ok">確定</button></div>
    <p class="hint">下面是照紀錄算出來的餘額。請對照原本的記帳 App 或網銀，把不一樣的改成正確金額（信用卡欠款請填負數，例如 -691.84）。</p>
    ${db.accounts.map(a => `<label>${ACCT_T[a.type].icon} ${esc(a.name)}</label><input type="number" inputmode="decimal" step="0.01" data-a="${a.id}" value="${acctBalance(a)}">`).join('')}`);
  $('#r-skip').onclick = () => { closeSheet(); moneyTab = 'acct'; renderMoney(); };
  $('#r-ok').onclick = () => {
    $('#sheet').querySelectorAll('input[data-a]').forEach(inp => {
      const a = acctOf(inp.dataset.a), want = parseFloat(inp.value);
      if (a && !isNaN(want)) a.init = Math.round(((a.init || 0) + want - acctBalance(a)) * 100) / 100;
    });
    save(); closeSheet(); moneyTab = 'acct'; renderMoney(); toast('帳戶餘額已更新');
  };
}

// ---------- 島上的小動物自由走動（布偶貓、卡爾比犬） ----------
let petRaf = 0;
function walkable(x, y) {
  if (Math.abs(x - 190) / 160 + Math.abs(y - 121) / 86 > 0.8) return false;          // 島的邊緣
  if (((x - 271) / 48) ** 2 + ((y - 128) / 32) ** 2 < 1) return false;               // 池塘
  if (x > 148 && x < 184 && y > 74 && y < 94) return false;                           // 花草叢
  if (x > 76 && x < 132 && y > 108 && y < 142) return false;                          // 車子
  return true;
}
function randomSpot() { for (let i = 0; i < 60; i++) { const x = 50 + Math.random() * 280, y = 60 + Math.random() * 130; if (walkable(x, y)) return [x, y]; } return [190, 170]; }
function startPets() {         // v2.0：貓、狗、Ben、Sarah 都在島上自由走動；Ben 和 Sarah 偶爾走到彼此旁邊冒愛心
  cancelAnimationFrame(petRaf);
  const cfg = [['pet-cat', 150, 150, 14, .95], ['pet-dog', 230, 160, 22, 1.1], ['p-ben', 140, 172, 11, 1, 1], ['p-sarah', 168, 178, 11, 1, 1]];
  const all = cfg.map(([id, x, y, speed, size, person]) => {
    const el = document.getElementById(id); if (!el) return null;
    return { id, el, x, y, tx: x, ty: y, wait: 800 + Math.random() * 2500, speed, dir: 1, size, person: !!person };
  }).filter(Boolean);
  if (!all.length) return;
  const ben = all.find(p => p.id === 'p-ben'), sarah = all.find(p => p.id === 'p-sarah'), heart = document.getElementById('isl-heart');
  let nextMeet = performance.now() + 9000 + Math.random() * 8000, meeting = null;
  let last = performance.now();
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.body.contains(all[0].el)) return;          // 換頁後就停
    // 互動：其中一個走去找另一個，碰到就面對面、冒愛心
    if (ben && sarah && !meeting && now > nextMeet) {
      const [a, b] = Math.random() < .5 ? [sarah, ben] : [ben, sarah];
      const side = b.x > 190 ? -16 : 16;
      if (walkable(b.x + side, b.y + 2)) { meeting = { a, b, t0: now }; a.tx = b.x + side; a.ty = b.y + 2; a.wait = 0; b.wait = 99999; }
      nextMeet = now + 14000 + Math.random() * 12000;
    }
    if (meeting) {
      const { a, b } = meeting;
      if (Math.hypot(a.x - a.tx, a.y - a.ty) < 1.2 && !meeting.met) {
        meeting.met = now; a.wait = b.wait = 2800; a.dir = b.x > a.x ? 1 : -1; b.dir = -a.dir;
        if (heart) { heart.setAttribute('transform', `translate(${((a.x + b.x) / 2).toFixed(1)},${(Math.min(a.y, b.y) - 58).toFixed(1)})`); heart.classList.remove('pop'); void heart.getBBox(); heart.classList.add('pop'); }
      }
      if (meeting.met && now - meeting.met > 2900) meeting = null;
      else if (!meeting.met && now - meeting.t0 > 12000) { b.wait = 500; meeting = null; }     // 走太久就算了
    }
    for (const p of all) {
      if (p.wait > 0) { p.wait -= dt * 1000; p.el.classList.remove('moving'); }
      else {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < 1) { if (!meeting || meeting.a !== p) { [p.tx, p.ty] = randomSpot(); p.wait = (p.person ? 2500 : 800) + Math.random() * 3000; } }
        else {
          const v = Math.min(d, p.speed * dt), nx = p.x + dx / d * v, ny = p.y + dy / d * v;
          if (walkable(nx, ny) || !walkable(p.x, p.y)) { p.x = nx; p.y = ny; } else { [p.tx, p.ty] = randomSpot(); if (meeting && meeting.a === p) { meeting.b.wait = 500; meeting = null; } }
          if (Math.abs(dx) > 0.5) p.dir = dx > 0 ? 1 : -1;
          p.el.classList.add('moving');
        }
      }
      p.el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      p.el.firstElementChild.setAttribute('transform', `scale(${p.dir * p.size},${p.size})`);
    }
    // 前後順序：越下面的越靠前
    const svg = all[0].el.ownerSVGElement;
    [...svg.querySelectorAll('.pet,.person,.car')].sort((a, b) => yOf(a) - yOf(b)).forEach(n => svg.appendChild(n));
    if (heart) svg.appendChild(heart);
    petRaf = requestAnimationFrame(step);
  };
  petRaf = requestAnimationFrame(step);
}
const yOf = el => { const m = /translate\([^,]+,([\d.]+)\)/.exec(el.getAttribute('transform') || ''); return m ? +m[1] : 0; };

// ---------- 帳戶頁上方的小島（會動的雲、水、兩個人；顯示淨資產） ----------
function renderIsland(net) {
  const mon = ymd(new Date()).slice(0, 7);
  const tx = db.expenses.filter(x => x.date.slice(0, 7) === mon);
  const bal = tx.filter(x => txType(x) === 'income').reduce((s, x) => s + x.amount, 0) - tx.filter(x => txType(x) === 'expense').reduce((s, x) => s + x.amount, 0);
  const status = net < 0 ? ['透支中，加油', 'bad'] : bal >= 0 ? ['穩定累積中', 'good'] : ['這個月花比賺多', 'warn'];
  const trees = net > 10000 ? 5 : net > 3000 ? 4 : net > 0 ? 3 : 2;     // 淨資產越多，島上的樹越多
  const T = [[104, 92], [262, 92], [306, 126], [66, 120], [232, 68]].slice(0, trees)
    .map(([x, y]) => `<g transform="translate(${x},${y})"><g class="tree"><rect x="-2.5" y="0" width="5" height="12" rx="2" fill="#8B6B4A"/><ellipse cx="0" cy="-4" rx="11" ry="14" fill="#7FB07A"/><ellipse cx="-3" cy="-8" rx="4" ry="5" fill="#9CC896" opacity=".8"/></g></g>`).join('');
  return `<div class="island card"><svg viewBox="0 0 380 230" role="img" aria-label="我們的小島"><defs><radialGradient id="ragmask" cx="50%" cy="58%" r="55%"><stop offset="0" stop-color="#5E4232" stop-opacity=".95"/><stop offset=".6" stop-color="#7A5A48" stop-opacity=".6"/><stop offset="1" stop-color="#8A6A55" stop-opacity="0"/></radialGradient></defs>
    <g class="cloud c1"><ellipse cx="60" cy="34" rx="26" ry="11" fill="#fff"/><ellipse cx="74" cy="27" rx="15" ry="11" fill="#fff"/></g>
    <g class="cloud c2"><ellipse cx="300" cy="26" rx="30" ry="12" fill="#fff"/><ellipse cx="316" cy="18" rx="17" ry="12" fill="#fff"/></g>
    <path d="M30 128 Q30 112 48 104 L172 48 Q190 40 208 48 L332 104 Q350 112 350 128 L350 146 Q350 160 332 168 L208 222 Q190 230 172 222 L48 168 Q30 160 30 146Z" fill="#E9D8B8"/>
    <path d="M30 128 Q30 112 48 104 L172 48 Q190 40 208 48 L332 104 Q350 112 350 128 L350 138 Q350 152 332 160 L208 214 Q190 222 172 214 L48 160 Q30 152 30 138Z" fill="#A8C98F"/>
    <path d="M30 122 Q30 106 48 98 L172 42 Q190 34 208 42 L332 98 Q350 106 350 122 Q350 136 332 144 L208 200 Q190 208 172 200 L48 144 Q30 136 30 122Z" fill="#C3DFA8"/>
    <defs><clipPath id="pondclip"><path d="M232 120 Q236 104 258 104 L300 112 Q318 118 310 134 L290 150 Q276 160 256 152 L238 140 Q228 132 232 120Z"/></clipPath></defs>
    <path d="M232 120 Q236 104 258 104 L300 112 Q318 118 310 134 L290 150 Q276 160 256 152 L238 140 Q228 132 232 120Z" fill="#8FC2D8" stroke="#D9CDB7" stroke-width="5" stroke-linejoin="round"/>
    <path class="water" d="M232 120 Q236 104 258 104 L300 112 Q318 118 310 134 L290 150 Q276 160 256 152 L238 140 Q228 132 232 120Z" fill="#9CC9DE"/>
    <g clip-path="url(#pondclip)">
      <path d="M240 140 Q262 150 290 146" stroke="#86BBD2" stroke-width="6" fill="none" opacity=".6"/>
      <g><path d="M5 0 Q2 -3 -3 -2.2 L-7 -4 L-6 0 L-7 4 L-3 2.2 Q2 3 5 0Z" fill="#F28C52"/><circle cx="1" cy="-.6" r="1.1" fill="#fff" opacity=".8"/>
        <animateMotion dur="12s" repeatCount="indefinite" rotate="auto" path="M248 126 C258 112 296 114 302 126 C308 140 276 150 258 143 C244 138 242 132 248 126Z"/></g>
      <g><path d="M4.4 0 Q2 -2.6 -2.6 -2 L-6 -3.4 L-5.2 0 L-6 3.4 L-2.6 2 Q2 2.6 4.4 0Z" fill="#FFF4EA"/><circle cx="0" cy="0" r="1.4" fill="#F06E4A"/>
        <animateMotion dur="9s" begin="-4s" repeatCount="indefinite" rotate="auto" path="M296 132 C288 146 258 146 252 134 C248 122 272 116 286 120 C296 123 300 128 296 132Z"/></g>
      <circle cx="270" cy="128" r="3" fill="none" stroke="#E6F4FA" stroke-width="1"><animate attributeName="r" values="1;9" dur="3.5s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="3.5s" repeatCount="indefinite"/></circle>
    </g>
    <path class="shine" d="M250 116 h12 M280 140 h14" stroke="#E6F4FA" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M241 128 a7 4.5 0 1 1 6 3.6 l-5 -2.4z" fill="#86BE7E"/>
    <path d="M296 141 a9 5.5 0 1 1 7 4.4 l-6.5 -3z" fill="#7DB476"/><circle cx="305" cy="139" r="2.2" fill="#F6B6C8"/>
    <g class="frog" transform="translate(290,140)">
      <ellipse cx="0" cy="0" rx="5.5" ry="3.6" fill="#7CC36B"/><ellipse cx="0" cy="1" rx="3.6" ry="2.2" fill="#B9E3A6"/>
      <circle cx="-2.6" cy="-3.2" r="2" fill="#7CC36B"/><circle cx="2.6" cy="-3.2" r="2" fill="#7CC36B"/>
      <circle cx="-2.6" cy="-3.4" r="1" fill="#fff"/><circle cx="2.6" cy="-3.4" r="1" fill="#fff"/>
      <circle cx="-2.5" cy="-3.3" r=".55" fill="#2E2A2A"/><circle cx="2.7" cy="-3.3" r=".55" fill="#2E2A2A"/>
      <path d="M-1.6 -.6 Q0 .6 1.6 -.6" stroke="#3F7A35" stroke-width=".6" fill="none" stroke-linecap="round"/></g>
    <path d="M150 196 Q170 160 200 150 Q216 146 228 136" stroke="#EADCC0" stroke-width="14" fill="none" stroke-linecap="round"/>
    ${T}
    <g transform="translate(166,84)"><ellipse cx="0" cy="6" rx="16" ry="5" fill="#9CC48A"/><circle cx="-7" cy="0" r="7" fill="#86BE7E"/><circle cx="5" cy="-2" r="8" fill="#9CCD93"/>
      <circle cx="-6" cy="-3" r="2" fill="#F6B6C8"/><circle cx="6" cy="-6" r="2" fill="#FBD98A"/><circle cx="2" cy="2" r="2" fill="#F6B6C8"/></g>
    <g class="car" transform="translate(104,126)">
      <ellipse cx="0" cy="13" rx="24" ry="4" fill="#000" opacity=".12"/>
      <path d="M-22 6 Q-22 -2 -14 -3 L-9 -11 Q-6 -15 0 -15 L9 -15 Q14 -15 17 -10 L20 -3 Q24 -2 24 6 L24 9 Q24 11 22 11 L-20 11 Q-22 11 -22 9Z" fill="#6FA8DC"/>
      <path d="M-7 -10 Q-5 -12 -2 -12 L2 -12 L2 -4 L-11 -4Z M5 -12 L9 -12 Q12 -12 14 -9 L16 -4 L5 -4Z" fill="#DDEFFB"/>
      <rect x="-22" y="2" width="5" height="3" rx="1.5" fill="#FBD98A"/><circle cx="-12" cy="11" r="5" fill="#3E3236"/><circle cx="13" cy="11" r="5" fill="#3E3236"/>
      <circle cx="-12" cy="11" r="2" fill="#C9C9C9"/><circle cx="13" cy="11" r="2" fill="#C9C9C9"/></g>
    <g class="person" id="p-ben" transform="translate(140,172)"><g class="flip"><g class="bob b1">${charBen()}</g></g></g>
    <g class="person" id="p-sarah" transform="translate(168,178)"><g class="flip"><g class="bob b2">${charSarah()}</g></g></g>
    <g id="pet-cat" class="pet"><g class="flip"><g class="walk">${charCat('isl-catmask')}</g></g></g>
    <g id="pet-dog" class="pet"><g class="flip"><g class="walk">
      <ellipse cx="0" cy="0" rx="13" ry="2.8" fill="#000" opacity=".12"/>
      <path d="M-12 -12 Q-20 -10 -21 -3" stroke="#2E2A2A" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect class="leg l1" x="-10" y="-7" width="4" height="7" rx="2" fill="#C98A4B"/><rect class="leg l2" x="5" y="-7" width="4" height="7" rx="2" fill="#C98A4B"/>
      <ellipse cx="-2" cy="-11" rx="13" ry="6.5" fill="#2E2A2A"/><ellipse cx="7" cy="-9" rx="4" ry="4" fill="#C98A4B"/>
      <path d="M8 -22 L9 -32 L13 -24Z M14 -24 L18 -33 L19 -23Z" fill="#2E2A2A"/>
      <ellipse cx="14" cy="-19" rx="7" ry="6.5" fill="#2E2A2A"/><path d="M15 -17 Q22 -17 23 -14 Q20 -12 15 -13Z" fill="#C98A4B"/>
      <circle cx="22.5" cy="-15" r="1.3" fill="#1A1515"/><circle cx="13" cy="-21" r="1" fill="#C98A4B"/><circle cx="14.5" cy="-20" r="1.2" fill="#fff"/><circle cx="14.7" cy="-20" r=".7" fill="#1A1515"/></g></g></g>
    <g id="isl-heart" class="isl-emote" opacity="0"><path d="M0 0 c-3 -5 -10 -3 -9 3 c1 4 9 9 9 9 s8 -5 9 -9 c1 -6 -6 -8 -9 -3z" fill="#F28CA8" transform="translate(0,-8)"/></g>
  </svg>
  <div class="isl-net"><span>我們的淨資產</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b><em class="${status[1]}">${status[0]}</em></div></div>`;
}


// ---------- 事件綁定 ----------
function bindMoney() {
  $('#money-prev').onclick = () => { const [y, m] = moneyMonth.split('-').map(Number); moneyMonth = ymd(new Date(y, m - 2, 1)).slice(0, 7); renderMoney(); };
  $('#money-next').onclick = () => { const [y, m] = moneyMonth.split('-').map(Number); moneyMonth = ymd(new Date(y, m, 1)).slice(0, 7); renderMoney(); };
  $('#money-add').onclick = () => openExpense(null);
  $('#money-new').onclick = () => moneyTab === 'ins' ? editIns(null) : (typeof ptsTab !== 'undefined' && ptsTab === 'promo') ? editPromo(null) : editProg(null);
  $('#money-list').onclick = e => { const b = e.target.closest('.xrow'); if (!b) return; const x = db.expenses.find(z => z.id === b.dataset.id); if (!x) return;
    if (txType(x) === 'adjust') openAdjust(x); else openExpense(x); };
  document.querySelectorAll('.mntabs button').forEach(b => b.onclick = () => { moneyTab = b.dataset.tab; renderMoney(); $('.mscroll').scrollTop = 0; });
  document.querySelectorAll('.st-kind button').forEach(b => b.onclick = () => { statKind = b.dataset.k; renderMoney(); });
  document.querySelectorAll('.st-by button').forEach(b => b.onclick = () => { statBy = b.dataset.b; renderMoney(); });
  $('#money-acct').onclick = e => { const b = e.target.closest('.arow'); if (b) openAccount(db.accounts.find(a => a.id === b.dataset.id)); };
  $('#csv-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) f.text().then(importCSV); };
  $('#sheetwrap').addEventListener('click', e => { if (e.target.id === 'sheetwrap') closeSheet(); });
}

bindMoney(); renderMoney();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
