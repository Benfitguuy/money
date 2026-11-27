'use strict';
// 我們的錢包（Sarah & Ben 的記帳 App）— 從「我們的行事曆」拆出來的獨立 App
// 資料存在這支手機（localStorage：our-wallet-v1）；之後接雲端同步時只要換掉 Store。
const APP_VERSION = '1.1.0';
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
// 記帳（兩人共用；之後接同步時跟行程一起上傳）
//  db.accounts：帳戶（信用卡／銀行／現金），餘額＝起始金額＋所有交易加減
//  db.expenses：每一筆交易 { type: expense|income|transfer, amount, cat, acct, toAcct, payer, date, note }
//               （舊資料沒有 type ＝ 支出、沒有 acct ＝ 不指定帳戶）
// ====================================================================
const CATS = [['food', '🍜', '餐飲'], ['grocery', '🛒', '買菜'], ['transport', '🚗', '交通'], ['home', '🏠', '居家'],
  ['shopping', '🛍️', '購物'], ['fun', '🎉', '娛樂'], ['health', '💊', '醫療'], ['bills', '🧾', '帳單'], ['other', '📦', '其他']];
const INCATS = [['salary', '💼', '薪水'], ['bonus', '🎁', '獎金'], ['refund', '↩️', '退款'], ['interest', '🏦', '利息'],
  ['side', '💡', '副業'], ['other_in', '💰', '其他收入']];
const CAT = Object.fromEntries([...CATS, ...INCATS].map(([k, i, n]) => [k, { icon: i, name: n }]));
CAT.transfer = { icon: '⇄', name: '轉帳' };
CAT.adjust = { icon: '⚖️', name: '餘額校正' };
// 自訂分類（例如從 DuoPurse 匯入的「外食」「人情」），存在 db.cats
function allCats(kind) {
  return (kind === 'income' ? INCATS : CATS).concat((db.cats || []).filter(c => c.kind === kind).map(c => [c.k, c.icon, c.name]));
}
function catInfo(k) {
  if (CAT[k]) return CAT[k];
  const c = (db.cats || []).find(z => z.k === k);
  return c ? { icon: c.icon, name: c.name } : { icon: '🏷️', name: '其他' };
}
const PAYER = { ben: 'Ben 付', sarah: 'Sarah 付', both: '一起付' };
const ACCT_TYPES = [['credit', '💳', '信用卡'], ['bank', '🏦', '銀行'], ['cash', '💵', '現金']];
const ACCT_T = Object.fromEntries(ACCT_TYPES.map(([k, i, n]) => [k, { icon: i, name: n }]));
const CHART_COLORS = ['#7FAEE0', '#EE8E6B', '#9B86D9', '#E8B44C', '#5DBB8E', '#EE7F9C', '#6C8EAD', '#C9A227', '#A3A3A3', '#B5838D'];
if (!db.accounts) { db.accounts = []; save(); }
const money = n => (n < 0 ? '-' : '') + 'A$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const txType = x => x.type || 'expense';
let moneyMonth = ymd(new Date()).slice(0, 7);
let moneyTab = 'acct', statKind = 'expense', statBy = 'cat';

function acctBalance(a) {                      // 帳戶餘額：起始金額＋收入－支出±轉帳
  let b = a.init || 0;
  const today = ymd(new Date());
  for (const x of db.expenses) {
    if (x.date > today) continue;                // 未來日期的（預先排好的扣款）還不算進餘額
    const t = txType(x);
    if (t === 'adjust' && x.acct === a.id) { b += x.amount; continue; }   // 餘額校正：金額有正有負
    if (t === 'income' && x.acct === a.id) b += x.amount;
    else if (t === 'expense' && x.acct === a.id) b -= x.amount;
    else if (t === 'transfer') { if (x.acct === a.id) b -= x.amount; if (x.toAcct === a.id) b += x.amount; }
  }
  return Math.round(b * 100) / 100;
}
const acctName = id => { const a = db.accounts.find(z => z.id === id); return a ? a.name : ''; };

function renderMoney() {
  const [y, m] = moneyMonth.split('-').map(Number);
  $('#money-title').textContent = `${y}年${m}月`;
  document.querySelectorAll('.mntabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === moneyTab));
  ['list', 'stat', 'acct'].forEach(t => $('#money-' + t).hidden = t !== moneyTab);
  $('#money-monthnav').style.visibility = moneyTab === 'acct' ? 'hidden' : 'visible';
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
      const t = txType(x), c = t === 'transfer' ? CAT.transfer : t === 'adjust' ? CAT.adjust : catInfo(x.cat);
      const sub = t === 'transfer' ? `${esc(acctName(x.acct) || '?')} → ${esc(acctName(x.toAcct) || '?')}`
        : [acctName(x.acct), x.note && x.merchant ? x.merchant : '', x.payer && t === 'expense' ? PAYER[x.payer] : ''].filter(Boolean).map(esc).join('・');
      h += `<button class="xrow${t === 'adjust' ? ' adj' : ''}${x.date > ymd(new Date()) ? ' future' : ''}" data-id="${x.id}"><span class="ci">${c.icon}</span>
        <span class="xt">${esc(x.note || x.merchant || c.name)}${sub ? `<small>${sub}</small>` : ''}</span>
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
      (groups[k] = groups[k] || { sum: 0, n: 0 }); groups[k].sum += x.amount; groups[k].n++;
    });
    const arr = Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum);
    // 甜甜圈圖
    let off = 0, ring = '';
    const C = 2 * Math.PI * 70;
    arr.forEach(([k, g], i) => {
      const len = total ? g.sum / total * C : 0;
      ring += `<circle r="70" cx="90" cy="90" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="26"
        stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
      off += len;
    });
    const label = k => statBy === 'cat' ? `${catInfo(k).icon} ${esc(catInfo(k).name)}`
      : (k === '_none' ? '未指定帳戶' : (ACCT_T[(db.accounts.find(a => a.id === k) || {}).type] || { icon: '' }).icon + ' ' + esc(acctName(k) || '（已刪除的帳戶）'));
    $('#money-stat-body').innerHTML = `<div class="card">${sum}</div>` + (arr.length ? `
      <div class="card donut"><svg viewBox="0 0 180 180" width="190" height="190"><circle r="70" cx="90" cy="90" fill="none" stroke="var(--line2)" stroke-width="26"/>${ring}</svg>
        <div class="dc"><span>${statKind === 'expense' ? '支出' : '收入'}</span><b>${money(total)}</b></div></div>
      ${arr.map(([k, g], i) => `<div class="srank"><span class="sl">${label(k)}</span><b>${money(g.sum)}</b>
        <div class="bar"><i style="width:${total ? g.sum / total * 100 : 0}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></i></div>
        <small>${g.n} 筆</small><small class="r">${total ? Math.round(g.sum / total * 100) : 0}%</small></div>`).join('')}`
      : `<p class="empty">這個月沒有${statKind === 'expense' ? '支出' : '收入'}紀錄</p>`);
  } else {
    const net = db.accounts.reduce((s, a) => s + acctBalance(a), 0);
    let h = `<div class="card"><div class="mbal" style="border:0;margin:0;padding:0"><span>淨資產（所有帳戶加總）</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b></div></div>`;
    for (const [k, icon, name] of ACCT_TYPES) {
      const as = db.accounts.filter(a => a.type === k);
      if (!as.length) continue;
      const sub = as.reduce((s, a) => s + acctBalance(a), 0);
      h += `<div class="sec acc-sec"><span>${icon} ${name}</span><span>${money(sub)}</span></div>` +
        as.map(a => { const b = acctBalance(a); return `<button class="arow" data-id="${a.id}"><span class="xt">${esc(a.name)}${a.last4 ? `<small>${name}（${esc(a.last4)}）</small>` : `<small>${name}</small>`}</span>
          <b class="${b < 0 ? 'neg' : ''}">${money(b)}</b></button>`; }).join('');
    }
    if (!db.accounts.length) h += '<p class="empty">還沒有帳戶。按下面「＋ 新增帳戶」，把信用卡、銀行、現金加進來，輸入現在的餘額就好。</p>';
    h += '<div class="btns"><button class="primary" id="acct-add">＋ 新增帳戶</button><button id="csv-btn">從 DuoPurse 匯入（CSV 檔）</button></div><p class="tray-hint">卡號只要記末四碼就好，不要輸入完整卡號或密碼。</p>';
    $('#money-acct').innerHTML = renderIsland(net) + h;
    startPets();
    $('#acct-add').onclick = () => openAccount(null);
    $('#csv-btn').onclick = () => $('#csv-file').click();
  }
}

function acctOptions(sel, allowNone) {
  return (allowNone ? `<option value="">（不指定）</option>` : '') +
    ACCT_TYPES.map(([k, , n]) => { const as = db.accounts.filter(a => a.type === k); return as.length ? `<optgroup label="${n}">${as.map(a =>
      `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` : ''; }).join('');
}

function openExpense(x) {
  const isNew = !x;
  const v = x || { type: 'expense', amount: '', cat: 'food', payer: '', date: ymd(new Date()), note: '', acct: (db.accounts[0] || {}).id || '' };
  let type = txType(v);
  const catGrid = (list, cur) => list.map(([k, i, n]) => `<button type="button" data-cat="${k}" class="${k === cur ? 'on' : ''}">${i}<span>${n}</span></button>`).join('');
  openSheet(`
    <h3>${isNew ? '記一筆' : '修改這筆'}</h3>
    <div class="seg seg3 ttype">${[['expense', '支出'], ['income', '收入'], ['transfer', '轉帳']].map(([k, n]) =>
      `<button type="button" data-t="${k}" class="${k === type ? 'on' : ''}">${n}</button>`).join('')}</div>
    <label>多少錢？</label><input id="x-amt" type="number" inputmode="decimal" step="0.01" min="0" value="${v.amount}" placeholder="0.00" class="big">
    <div id="x-catbox"><label>類別</label><div class="catgrid" id="x-cats"></div></div>
    <label id="x-acct-l">${type === 'income' ? '存進哪個帳戶' : type === 'transfer' ? '從哪個帳戶轉出' : '用哪個帳戶付'}</label>
    <select id="x-acct">${acctOptions(v.acct, true)}</select>
    <div id="x-tobox"><label>轉進哪個帳戶</label><select id="x-to">${acctOptions(v.toAcct, true)}</select>
      <p class="hint">例如：用銀行帳戶繳信用卡費，就是「銀行 → 信用卡」。</p></div>
    <div id="x-payerbox"><label>誰付的？<span class="opt-tag">可不選</span></label>
      <div class="seg seg3" id="x-payer">${['ben', 'sarah', 'both'].map(o => `<button type="button" class="${o}${o === v.payer ? ' on' : ''}" data-owner="${o}">${NAMES[o]}</button>`).join('')}</div></div>
    <label>日期</label><input id="x-date" type="date" value="${v.date}">
    <label>備註（可以不填）</label><input id="x-note" value="${esc(v.note || '')}" placeholder="例如：Woolworths、和朋友吃飯">
    ${db.accounts.length ? '' : '<p class="hint">還沒有帳戶的話，先到記帳的「帳戶」分頁新增，餘額才會自動加減。</p>'}
    <p class="err" id="x-err"></p>
    <div class="btns"><button class="primary" id="x-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="x-del">刪除</button>'}<button id="x-cancel">取消</button></div>`);
  let cat = v.cat;
  const paint = () => {
    document.querySelectorAll('.ttype button').forEach(b => b.classList.toggle('on', b.dataset.t === type));
    $('#x-catbox').hidden = type === 'transfer';
    $('#x-tobox').hidden = type !== 'transfer';
    $('#x-payerbox').hidden = type !== 'expense';
    $('#x-acct-l').textContent = type === 'income' ? '存進哪個帳戶' : type === 'transfer' ? '從哪個帳戶轉出' : '用哪個帳戶付';
    const list = allCats(type);
    if (!list.some(([k]) => k === cat)) cat = list[0][0];
    $('#x-cats').innerHTML = catGrid(list, cat);
  };
  paint();
  if (isNew) setTimeout(() => $('#x-amt').focus(), 50);
  $('#sheet .ttype').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; paint(); };
  $('#x-cats').onclick = e => { const b = e.target.closest('button'); if (!b) return; cat = b.dataset.cat; paint(); };
  $('#x-payer').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    const on = !b.classList.contains('on'); $('#x-payer').querySelectorAll('button').forEach(z => z.classList.remove('on')); if (on) b.classList.add('on'); };
  $('#x-amt').oninput = () => $('#x-err').textContent = '';
  $('#x-cancel').onclick = closeSheet;
  $('#x-save').onclick = () => {
    const amount = Math.round(parseFloat($('#x-amt').value) * 100) / 100;
    if (!(amount > 0)) return $('#x-err').textContent = '請輸入金額';
    if (!$('#x-date').value) return $('#x-err').textContent = '請選日期';
    const acct = $('#x-acct').value, toAcct = $('#x-to').value;
    if (type === 'transfer' && (!acct || !toAcct)) return $('#x-err').textContent = '轉帳要選轉出和轉進的帳戶';
    if (type === 'transfer' && acct === toAcct) return $('#x-err').textContent = '轉出和轉進不能是同一個帳戶';
    const pb = $('#x-payer .on');
    const data = { type, amount, cat: type === 'transfer' ? 'transfer' : cat, acct, toAcct: type === 'transfer' ? toAcct : '',
      payer: type === 'expense' && pb ? pb.dataset.owner : '', date: $('#x-date').value, note: $('#x-note').value.trim() };
    if (isNew) db.expenses.push({ id: uid(), t: Date.now(), ...data }); else Object.assign(x, data);
    save(); closeSheet(); moneyMonth = data.date.slice(0, 7); renderMoney(); toast('記好了');
  };
  if (!isNew) $('#x-del').onclick = () => {
    $('#x-del').outerHTML = '<button class="danger" id="x-del2">確定刪除</button>';
    $('#x-del2').onclick = () => { db.expenses = db.expenses.filter(z => z !== x); save(); closeSheet(); renderMoney(); toast('已刪除'); };
  };
}

function openAccount(a) {
  const isNew = !a;
  const v = a || { name: '', type: 'bank', last4: '' };
  const bal = a ? acctBalance(a) : '';
  openSheet(`
    <h3>${isNew ? '新增帳戶' : '修改帳戶'}</h3>
    <label>帳戶名稱</label><input id="a-name" value="${esc(v.name)}" placeholder="例如：NAB 信用卡、Ubank、現金">
    <label>種類</label>
    <div class="seg seg3" id="a-type">${ACCT_TYPES.map(([k, i, n]) => `<button type="button" data-k="${k}" class="${k === v.type ? 'on' : ''}">${i} ${n}</button>`).join('')}</div>
    <label>卡號或帳號末四碼 <span class="opt-tag">可不填</span></label><input id="a-last4" inputmode="numeric" maxlength="4" value="${esc(v.last4 || '')}" placeholder="1234">
    <label id="a-bal-l">${v.type === 'credit' ? '現在欠多少（未繳的卡費）' : '現在有多少錢'}</label>
    <input id="a-bal" type="number" inputmode="decimal" step="0.01" value="${a ? Math.abs(v.type === 'credit' ? Math.min(0, bal) : bal) : ''}" placeholder="0.00">
    <p class="hint" id="a-hint">${isNew ? '輸入現在的金額就好，之後每記一筆會自動加減。' : '如果跟銀行對不起來，直接改成正確金額，App 會自動校正。'}</p>
    <p class="err" id="a-err"></p>
    <div class="btns"><button class="primary" id="a-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="a-del">刪除帳戶</button>'}<button id="a-cancel">取消</button></div>`);
  let type = v.type;
  $('#a-type').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.k;
    $('#a-type').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b));
    $('#a-bal-l').textContent = type === 'credit' ? '現在欠多少（未繳的卡費）' : '現在有多少錢'; };
  $('#a-last4').oninput = () => { $('#a-last4').value = $('#a-last4').value.replace(/\D/g, '').slice(0, 4); };
  $('#a-cancel').onclick = closeSheet;
  $('#a-save').onclick = () => {
    const name = $('#a-name').value.trim();
    if (!name) return $('#a-err').textContent = '請寫帳戶名稱';
    let want = parseFloat($('#a-bal').value) || 0;
    if (type === 'credit') want = -Math.abs(want);             // 信用卡：欠款記成負數
    const acc = a || { id: uid(), init: 0 };
    Object.assign(acc, { name, type, last4: $('#a-last4').value });
    if (!a) db.accounts.push(acc);
    acc.init = 0; acc.init = Math.round((want - acctBalance(acc)) * 100) / 100;   // 讓「現在餘額」剛好等於輸入的金額
    save(); closeSheet(); renderMoney(); toast('已儲存');
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

// ---------- 餘額校正（匯入時用來對齊帳戶餘額；不算進收支統計） ----------
function openAdjust(x) {
  openSheet(`<h3>⚖️ 餘額校正</h3>
    <p class="hint">這筆是用來把「${esc(acctName(x.acct) || '帳戶')}」的餘額對齊用的，不算支出也不算收入，統計裡不會出現。</p>
    <div class="summary"><div><span>金額</span><b>${x.amount >= 0 ? '+' : ''}${money(x.amount)}</b></div><div><span>日期</span><b>${x.date}</b></div></div>
    <div class="btns"><button class="danger" id="j-del">刪除這筆</button><button id="j-close">關閉</button></div>`);
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
const CAT_MAP = { '交通': 'transport', '其他': 'other', '買菜': 'grocery', '購物': 'shopping', '娛樂': 'fun', '帳單': 'bills' };
const INCAT_MAP = { '薪資': 'salary', '薪水': 'salary', '獎金': 'bonus', '退款': 'refund', '利息': 'interest', '其他': 'other_in' };
const CAT_ICON = { '外食': '🍜', '家用': '🏠', '工作': '💼', '人情': '🎁', '台灣副卡': '💳', '醫療/保險/健身房': '💊', '接案': '💡' };
function guessAcctType(name) { return /現金|cash/i.test(name) ? 'cash' : /結算|繳費|信用卡|卡|visa|master|amex/i.test(name) ? 'credit' : 'bank'; }

function importCSV(text) {
  const rows = parseCSV(text);
  const head = rows.shift() || [];
  const col = n => head.indexOf(n);
  const need = ['日期', '類型', '金額', '帳戶'];
  if (need.some(n => col(n) < 0)) { toast('看不懂這個檔案，請用 DuoPurse 匯出的 CSV'); return; }
  const get = (r, n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
  const seen = {}, keyOf = r => { const k = head.map((h, i) => r[i]).join('|'); seen[k] = (seen[k] || 0) + 1; return k + '#' + seen[k]; };
  const have = new Set(db.expenses.filter(x => x.src).map(x => x.src));
  const acctNames = new Set(), items = [];
  for (const r of rows) {
    const date = get(r, '日期'), t = get(r, '類型'), amt = parseFloat(get(r, '金額')), local = parseFloat(get(r, '本幣金額'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amt >= 0)) continue;
    const src = 'duo:' + keyOf(r);
    const it = { date, time: get(r, '時間'), t, amt, local: isNaN(local) ? amt : local, acct: get(r, '帳戶'), to: get(r, '轉入帳戶'),
      cat: get(r, '分類'), item: get(r, '品項'), merchant: get(r, '商家'), note: get(r, '備註'), who: get(r, '記錄者'), src, dup: have.has(src) };
    if (it.acct) acctNames.add(it.acct); if (it.to) acctNames.add(it.to);
    items.push(it);
  }
  const fresh = items.filter(i => !i.dup);
  const newAccts = [...acctNames].filter(n => !db.accounts.some(a => a.name === n));
  openSheet(`<h3>從 DuoPurse 匯入</h3>
    <div class="summary"><div><span>紀錄</span><b>${items.length} 筆${items.length - fresh.length ? `（${items.length - fresh.length} 筆已經匯入過，會跳過）` : ''}</b></div>
      <div><span>帳戶</span><b>${[...acctNames].map(esc).join('、') || '—'}</b></div>
      ${newAccts.length ? `<div><span>新帳戶</span><b>會自動新增 ${newAccts.length} 個</b></div>` : ''}</div>
    <p class="hint">沒有分類的「支出」（DuoPurse 用來調整餘額的）會變成「餘額校正」，不算進收支統計。匯入後會請你確認每個帳戶現在的餘額。</p>
    <div class="btns"><button class="primary" id="i-ok"${fresh.length ? '' : ' disabled'}>匯入 ${fresh.length} 筆</button><button id="i-no">取消</button></div>`);
  $('#i-no').onclick = closeSheet;
  $('#i-ok').onclick = () => {
    db.cats = db.cats || [];
    const idOf = name => {
      if (!name) return '';
      let a = db.accounts.find(z => z.name === name);
      if (!a) { a = { id: uid(), name, type: guessAcctType(name), last4: (name.match(/\((\d{4})\)/) || [])[1] || '', init: 0 }; db.accounts.push(a); }
      return a.id;
    };
    const catKey = (name, kind) => {
      if (!name) return kind === 'income' ? 'other_in' : 'other';
      const m = (kind === 'income' ? INCAT_MAP : CAT_MAP)[name]; if (m) return m;
      let c = db.cats.find(z => z.name === name && z.kind === kind);
      if (!c) { c = { k: 'c_' + uid(), name, icon: CAT_ICON[name] || '🏷️', kind }; db.cats.push(c); }
      return c.k;
    };
    let n = 0;
    for (const i of fresh) {
      const base = { id: uid(), t: Date.parse(i.date + 'T' + (i.time || '00:00')) || Date.now(), date: i.date, src: i.src,
        acct: idOf(i.acct), merchant: i.merchant, note: [i.item, i.note].filter(Boolean).join('・'),
        payer: i.who === 'Ben' ? 'ben' : i.who === 'Sarah' ? 'sarah' : '' };
      let x;
      if (i.t === '轉帳') x = { ...base, type: 'transfer', amount: i.amt, cat: 'transfer', toAcct: idOf(i.to) };
      else if (i.t === '收入') x = { ...base, type: 'income', amount: i.amt, cat: catKey(i.cat, 'income') };
      else if (i.t === '退款') x = { ...base, type: 'income', amount: i.amt, cat: 'refund', note: base.note || (i.cat ? i.cat + '退款' : '') };
      else if (!i.cat) x = { ...base, type: 'adjust', amount: i.local, cat: 'adjust' };     // 沒分類的支出＝餘額校正
      else x = { ...base, type: 'expense', amount: i.amt, cat: catKey(i.cat, 'expense') };
      db.expenses.push(x); n++;
    }
    save(); toast(`匯入了 ${n} 筆`);
    reconcileAccounts();
  };
}

function reconcileAccounts() {     // 匯入後確認每個帳戶現在的實際餘額
  openSheet(`<h3>確認帳戶餘額</h3>
    <p class="hint">下面是照紀錄算出來的餘額。請對照 DuoPurse 或網銀，把不一樣的改成正確金額（信用卡欠款請填負數，例如 -691.84）。</p>
    ${db.accounts.map(a => `<label>${ACCT_T[a.type].icon} ${esc(a.name)}</label><input type="number" inputmode="decimal" step="0.01" data-a="${a.id}" value="${acctBalance(a)}">`).join('')}
    <div class="btns"><button class="primary" id="r-ok">確定</button><button id="r-skip">先不用</button></div>`);
  $('#r-skip').onclick = () => { closeSheet(); moneyTab = 'acct'; renderMoney(); };
  $('#r-ok').onclick = () => {
    $('#sheet').querySelectorAll('input[data-a]').forEach(inp => {
      const a = db.accounts.find(z => z.id === inp.dataset.a), want = parseFloat(inp.value);
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
  if (x > 140 && x < 206 && y > 80 && y < 128) return false;                          // 房子
  if (x > 76 && x < 132 && y > 108 && y < 142) return false;                          // 車子
  return true;
}
function randomSpot() { for (let i = 0; i < 60; i++) { const x = 50 + Math.random() * 280, y = 60 + Math.random() * 130; if (walkable(x, y)) return [x, y]; } return [190, 170]; }
function startPets() {
  cancelAnimationFrame(petRaf);
  const pets = ['pet-cat', 'pet-dog'].map((id, i) => {
    const el = document.getElementById(id); if (!el) return null;
    const [x, y] = i ? [230, 160] : [150, 150];
    return { el, x, y, tx: x, ty: y, wait: 500 + i * 900, speed: i ? 22 : 14, dir: 1 };
  }).filter(Boolean);
  let last = performance.now();
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.body.contains(pets[0] && pets[0].el)) return;          // 換頁後就停
    for (const p of pets) {
      if (p.wait > 0) { p.wait -= dt * 1000; p.el.classList.remove('moving'); }
      else {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < 1) { [p.tx, p.ty] = randomSpot(); p.wait = 800 + Math.random() * 2500; }
        else {
          const v = Math.min(d, p.speed * dt), nx = p.x + dx / d * v, ny = p.y + dy / d * v;
          if (walkable(nx, ny) || !walkable(p.x, p.y)) { p.x = nx; p.y = ny; } else { [p.tx, p.ty] = randomSpot(); }
          if (Math.abs(dx) > 0.5) p.dir = dx > 0 ? 1 : -1;
          p.el.classList.add('moving');
        }
      }
      p.el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      p.el.firstElementChild.setAttribute('transform', `scale(${p.dir},1)`);
    }
    // 前後順序：越下面的越靠前
    const svg = pets[0].el.ownerSVGElement;
    [...svg.querySelectorAll('.pet,.person,.car')].sort((a, b) => yOf(a) - yOf(b)).forEach(n => svg.appendChild(n));
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
  const T = [[118, 96], [262, 92], [300, 128], [92, 132], [228, 70]].slice(0, trees)
    .map(([x, y]) => `<g transform="translate(${x},${y})"><g class="tree"><rect x="-2.5" y="0" width="5" height="12" rx="2" fill="#8B6B4A"/><ellipse cx="0" cy="-4" rx="11" ry="14" fill="#7FB07A"/><ellipse cx="-3" cy="-8" rx="4" ry="5" fill="#9CC896" opacity=".8"/></g></g>`).join('');
  return `<div class="island card"><svg viewBox="0 0 380 230" role="img" aria-label="我們的小島">
    <g class="cloud c1"><ellipse cx="60" cy="34" rx="26" ry="11" fill="#fff"/><ellipse cx="74" cy="27" rx="15" ry="11" fill="#fff"/></g>
    <g class="cloud c2"><ellipse cx="300" cy="26" rx="30" ry="12" fill="#fff"/><ellipse cx="316" cy="18" rx="17" ry="12" fill="#fff"/></g>
    <path d="M30 128 Q30 112 48 104 L172 48 Q190 40 208 48 L332 104 Q350 112 350 128 L350 146 Q350 160 332 168 L208 222 Q190 230 172 222 L48 168 Q30 160 30 146Z" fill="#E9D8B8"/>
    <path d="M30 128 Q30 112 48 104 L172 48 Q190 40 208 48 L332 104 Q350 112 350 128 L350 138 Q350 152 332 160 L208 214 Q190 222 172 214 L48 160 Q30 152 30 138Z" fill="#A8C98F"/>
    <path d="M30 122 Q30 106 48 98 L172 42 Q190 34 208 42 L332 98 Q350 106 350 122 Q350 136 332 144 L208 200 Q190 208 172 200 L48 144 Q30 136 30 122Z" fill="#C3DFA8"/>
    <path class="water" d="M232 120 Q236 104 258 104 L300 112 Q318 118 310 134 L290 150 Q276 160 256 152 L238 140 Q228 132 232 120Z" fill="#9CC9DE"/>
    <path class="shine" d="M250 122 h18 M262 134 h22" stroke="#E6F4FA" stroke-width="3" stroke-linecap="round"/>
    <path d="M150 196 Q170 160 200 150 Q216 146 228 136" stroke="#EADCC0" stroke-width="14" fill="none" stroke-linecap="round"/>
    ${T}
    <g transform="translate(150,70)"><rect x="0" y="22" width="44" height="30" rx="4" fill="#fff" stroke="#E2CDB4" stroke-width="2"/>
      <path d="M-6 25 Q-6 22 -3 20 L19 4 Q22 1 25 4 L47 20 Q50 22 50 25Z" fill="#A9CDF0"/><path d="M4 14 L19 4 Q22 1 25 4 L40 14Z" fill="#FBD98A"/><path d="M12 8.6 L19 4 Q22 1 25 4 L32 8.6Z" fill="#F7B6C8"/>
      <rect x="17" y="34" width="10" height="18" rx="2" fill="#F7B6C8"/><rect x="5" y="30" width="8" height="8" rx="2" fill="#A9CDF0"/><rect x="31" y="30" width="8" height="8" rx="2" fill="#FBD98A"/></g>
    <g class="car" transform="translate(104,126)">
      <ellipse cx="0" cy="13" rx="24" ry="4" fill="#000" opacity=".12"/>
      <path d="M-22 6 Q-22 -2 -14 -3 L-9 -11 Q-6 -15 0 -15 L9 -15 Q14 -15 17 -10 L20 -3 Q24 -2 24 6 L24 9 Q24 11 22 11 L-20 11 Q-22 11 -22 9Z" fill="#6FA8DC"/>
      <path d="M-7 -10 Q-5 -12 -2 -12 L2 -12 L2 -4 L-11 -4Z M5 -12 L9 -12 Q12 -12 14 -9 L16 -4 L5 -4Z" fill="#DDEFFB"/>
      <rect x="-22" y="2" width="5" height="3" rx="1.5" fill="#FBD98A"/><circle cx="-12" cy="11" r="5" fill="#3E3236"/><circle cx="13" cy="11" r="5" fill="#3E3236"/>
      <circle cx="-12" cy="11" r="2" fill="#C9C9C9"/><circle cx="13" cy="11" r="2" fill="#C9C9C9"/></g>
    <g class="person" transform="translate(178,156)"><g class="bob b1">
      <ellipse cx="0" cy="0" rx="9" ry="2.5" fill="#000" opacity=".12"/>
      <rect x="-5" y="-12" width="4" height="12" rx="2" fill="#5A4048"/><rect x="1" y="-12" width="4" height="12" rx="2" fill="#5A4048"/>
      <path d="M-9 -12 Q-9 -26 0 -26 Q9 -26 9 -12Z" fill="#9A93DE"/>
      <image href="icons/boy.svg" x="-14" y="-50" width="28" height="28"/></g></g>
    <g class="person" transform="translate(206,158)"><g class="bob b2">
      <ellipse cx="0" cy="0" rx="9" ry="2.5" fill="#000" opacity=".12"/>
      <rect x="-4.5" y="-10" width="3.5" height="10" rx="1.75" fill="#F2D4BF"/><rect x="1" y="-10" width="3.5" height="10" rx="1.75" fill="#F2D4BF"/>
      <path d="M-10 -9 Q-7 -26 0 -26 Q7 -26 10 -9Z" fill="#9CC76E"/>
      <image href="icons/girl.svg" x="-14" y="-50" width="28" height="28"/></g></g>
    <g id="pet-cat" class="pet"><g class="flip"><g class="walk">
      <ellipse cx="0" cy="0" rx="11" ry="2.5" fill="#000" opacity=".12"/>
      <path d="M-10 -9 Q-20 -12 -18 -22 Q-17 -26 -14 -24" stroke="#6B4C3B" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <rect class="leg l1" x="-8" y="-6" width="3.5" height="6" rx="1.7" fill="#6B4C3B"/><rect class="leg l2" x="4" y="-6" width="3.5" height="6" rx="1.7" fill="#6B4C3B"/>
      <ellipse cx="-1" cy="-9" rx="12" ry="6.5" fill="#F6EEE2"/><ellipse cx="-3" cy="-6" rx="7" ry="3" fill="#FFFFFF"/>
      <path d="M6 -22 L8 -29 L11 -23Z M13 -23 L17 -29 L17 -21Z" fill="#6B4C3B"/>
      <circle cx="12" cy="-16" r="7.5" fill="#F6EEE2"/><ellipse cx="13" cy="-15" rx="4.5" ry="4" fill="#8A6A55" opacity=".75"/>
      <circle cx="10.5" cy="-17" r="1.5" fill="#6FA8DC"/><circle cx="15.5" cy="-17" r="1.5" fill="#6FA8DC"/><circle cx="13" cy="-14" r=".9" fill="#3E2C30"/></g></g></g>
    <g id="pet-dog" class="pet"><g class="flip"><g class="walk">
      <ellipse cx="0" cy="0" rx="13" ry="2.8" fill="#000" opacity=".12"/>
      <path d="M-12 -12 Q-20 -10 -21 -3" stroke="#2E2A2A" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect class="leg l1" x="-10" y="-7" width="4" height="7" rx="2" fill="#C98A4B"/><rect class="leg l2" x="5" y="-7" width="4" height="7" rx="2" fill="#C98A4B"/>
      <ellipse cx="-2" cy="-11" rx="13" ry="6.5" fill="#2E2A2A"/><ellipse cx="7" cy="-9" rx="4" ry="4" fill="#C98A4B"/>
      <path d="M8 -22 L9 -32 L13 -24Z M14 -24 L18 -33 L19 -23Z" fill="#2E2A2A"/>
      <ellipse cx="14" cy="-19" rx="7" ry="6.5" fill="#2E2A2A"/><path d="M15 -17 Q22 -17 23 -14 Q20 -12 15 -13Z" fill="#C98A4B"/>
      <circle cx="22.5" cy="-15" r="1.3" fill="#1A1515"/><circle cx="13" cy="-21" r="1" fill="#C98A4B"/><circle cx="14.5" cy="-20" r="1.2" fill="#fff"/><circle cx="14.7" cy="-20" r=".7" fill="#1A1515"/></g></g></g>
  </svg>
  <div class="isl-net"><span>我們的淨資產</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b><em class="${status[1]}">${status[0]}</em></div></div>`;
}


// ---------- 事件綁定 ----------
function bindMoney() {
  $('#money-prev').onclick = () => { const [y, m] = moneyMonth.split('-').map(Number); moneyMonth = ymd(new Date(y, m - 2, 1)).slice(0, 7); renderMoney(); };
  $('#money-next').onclick = () => { const [y, m] = moneyMonth.split('-').map(Number); moneyMonth = ymd(new Date(y, m, 1)).slice(0, 7); renderMoney(); };
  $('#money-add').onclick = () => openExpense(null);
  $('#money-list').onclick = e => { const b = e.target.closest('.xrow'); if (!b) return; const x = db.expenses.find(z => z.id === b.dataset.id); if (!x) return;
    if (txType(x) === 'adjust') openAdjust(x); else openExpense(x); };
  document.querySelectorAll('.mntabs button').forEach(b => b.onclick = () => { moneyTab = b.dataset.tab; renderMoney(); });
  document.querySelectorAll('.st-kind button').forEach(b => b.onclick = () => { statKind = b.dataset.k; renderMoney(); });
  document.querySelectorAll('.st-by button').forEach(b => b.onclick = () => { statBy = b.dataset.b; renderMoney(); });
  $('#money-acct').onclick = e => { const b = e.target.closest('.arow'); if (b) openAccount(db.accounts.find(a => a.id === b.dataset.id)); };
  $('#csv-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) f.text().then(importCSV); };
  $('#sheetwrap').addEventListener('click', e => { if (e.target.id === 'sheetwrap') closeSheet(); });
}

bindMoney(); renderMoney();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
