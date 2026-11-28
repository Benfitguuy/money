// 我們的錢包 v1.4：保險、航空點數（v1.5：使用紀錄、週繳／雙週繳、每期保費含附約、分類設定）（在 app.js 之前載入；裡面的函式只在畫面需要時才被呼叫）
//  db.points：航空點數 [{ id, airline, member, init, log: [{ id, date, value(+/-), src, note, reb?, ins? }] }]
//             src：manual 手動、card 信用卡回饋（reb＝回饋紀錄 id）、ins 保險活動（ins＝保單 id）
//  db.ins   ：保單 [{ id, name, company, insured, premium, freq, riders: [{ name, premium }], start,
//                    promo: { months, points, prog, weeks, text, logId }, note }]
const FREQ = [['week', '週繳', 52], ['fortnight', '雙週繳', 26], ['month', '月繳', 12], ['year', '年繳', 1],
  ['quarter', '季繳', 4], ['half', '半年繳', 2], ['once', '躉繳', 0]];          // 畫面只給前四個選（v1.5 Sarah 指定），後三個是舊資料相容
const FREQ_SHOW = 4;
const USES = ['換機票', '升等', '換購物／禮品卡', '轉點', '點數過期'];
const AIRLINES = ['Everyday Rewards', 'Flybuys', 'Qantas Frequent Flyer', 'Virgin Australia Velocity', '長榮航空 無限萬哩遊', '中華航空 華夏會員', 'Singapore KrisFlyer', 'Cathay Asia Miles'];
const PTS = () => db.points || (db.points = []);
const INS = () => db.ins || (db.ins = []);
const progOf = id => PTS().find(p => p.id === id);
// v1.8 消費自動累積：p.rule = { on, rate(每 A$1 幾點), kw, cat, sub, since }；從記帳紀錄算，不另存
function ruleMatch(rule, x) {
  if (txType(x) !== 'expense') return false;
  const text = ((x.merchant || '') + ' ' + (x.note || '')).toLowerCase();
  if ((rule.kw || '').split(/[,，、]/).map(k => k.trim().toLowerCase()).filter(Boolean).some(k => text.includes(k))) return true;
  return !!rule.cat && x.cat === rule.cat && (!rule.sub || x.sub === rule.sub);
}
const earnOf = (rule, amount) => Math.floor(amount * (rule.rate || 0));
function autoEarned(p) {
  const r = p.rule; if (!r || !r.on || !(r.rate > 0)) return { rows: [], total: 0 };
  const today = ymd(new Date());
  const rows = db.expenses.filter(x => x.date >= (r.since || '0000') && x.date <= today && ruleMatch(r, x)).map(x => ({ x, pts: earnOf(r, x.amount) }))
    .sort((a, b) => a.x.date < b.x.date ? 1 : -1);
  return { rows, total: rows.reduce((t, z) => t + z.pts, 0) };
}
const ptsBal = p => Math.round(((p.init || 0) + (p.log || []).reduce((s, l) => s + l.value, 0) + autoEarned(p).total) * 10) / 10;
function expensePointsHint(f) {          // 記一筆時：這筆會累積哪些點數
  const amt = parseFloat(f.amount); if (f.type !== 'expense' || !(amt > 0)) return '';
  const hits = PTS().filter(p => p.rule && p.rule.on && p.rule.rate > 0 && ruleMatch(p.rule, { ...f, type: 'expense' }) && f.date >= (p.rule.since || '0000'))
    .map(p => `${esc(p.airline)} +${num1(earnOf(p.rule, amt))} 點`);
  return hits.length ? '🎯 這筆會累積：' + hits.join('、') : '';
}
const pts = n => num1(n) + ' 點';
const freqName = k => (FREQ.find(f => f[0] === k) || FREQ[2])[1];
const insPer = i => (i.premium || 0) + (i.riders || []).reduce((s, r) => s + (r.premium || 0), 0);   // 每期保費＝主約＋附約
const insYear = i => (FREQ.find(z => z[0] === i.freq) || FREQ[2])[2] * insPer(i);
const addMonths = (s, m) => { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + m, d.getDate())); };
const progOptions = (cur, none = '不存入') => `<option value="">${none}</option>` +
  PTS().map(p => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.airline)}</option>`).join('');

// 從別的地方（信用卡回饋、保險活動）存點數進來：同一個來源只會有一筆，改了就更新
function syncPointLog(key, val, progId, entry) {   // key: ['reb', id] 或 ['ins', id]
  PTS().forEach(p => p.log = (p.log || []).filter(l => l[key[0]] !== key[1]));
  const p = progOf(progId); if (!p || !(val > 0)) return '';
  const l = Object.assign({ id: uid(), value: val, [key[0]]: key[1] }, entry); p.log.push(l); return l.id;
}

// ---------- 航空點數頁 ----------
let ptsTab = 'prog';
function renderPts() {
  const seg = `<div class="mtabs ptabs"><button data-pt="prog" class="${ptsTab === 'prog' ? 'on' : ''}">✈️ 點數</button><button data-pt="promo" class="${ptsTab === 'promo' ? 'on' : ''}">🛒 超市活動</button></div>`;
  $('#money-new').textContent = ptsTab === 'promo' ? '＋ 新增活動' : '＋ 新增點數帳戶';
  if (ptsTab === 'promo') { renderPromos(seg); bindPtTabs(); return; }
  const list = PTS();
  let h = list.map(p => {
    const last = (p.log || []).slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
    return `<button class="pcard" data-prog="${p.id}"><span class="pc-top"><span class="pc-ic">${/rewards|flybuys|超市|woolworths|coles/i.test(p.airline) ? '🛒' : '✈️'}</span><span class="pc-n">${esc(p.airline)}${p.member ? `<small>會員 ${esc(p.member)}</small>` : ''}</span><span class="chev">›</span></span>
      <b class="pc-bal">${num1(ptsBal(p))}<small> 點</small></b>
      ${p.rule && p.rule.on ? `<small class="pc-last">🎯 消費自動累積 ${num1(autoEarned(p).total)} 點</small>` : ''}<small class="pc-last">${last ? `最近：${last.date}　${last.value > 0 ? '+' : ''}${num1(last.value)}　${esc(srcName(last))}` : '還沒有紀錄'}</small></button>`;
  }).join('');
  if (!list.length) h = '<div class="card"><p class="empty" style="margin:0">還沒有點數帳戶。按右上角「＋ 新增點數帳戶」，輸入現在有幾點就好。<br>信用卡的里程回饋、保險活動送的點數，都可以直接存進來。</p></div>';
  const uses = list.flatMap(p => (p.log || []).filter(l => l.value < 0).map(l => ({ p, l }))).sort((a, b) => a.l.date < b.l.date ? 1 : -1);
  if (list.length) h += `<div class="sec acc-sec"><span>使用紀錄</span><button class="txt strong" id="use-add">－ 記一筆使用</button></div>
    <div class="list">${uses.length ? uses.map(({ p, l }) => `<button class="lrow" data-use="${p.id}|${l.id}"><span class="lv big">${esc(l.use || l.note || '使用點數')}<small>${l.date}・${esc(p.airline)}${l.use && l.note ? '・' + esc(l.note) : ''}</small></span><b class="neg">${num1(l.value)}</b><span class="chev">›</span></button>`).join('')
      : '<p class="empty" style="padding:10px 12px">換機票、升等、兌換用掉的點數記在這裡。</p>'}</div>`;
  $('#money-pts').innerHTML = seg + h; bindPtTabs();
  if ($('#use-add')) $('#use-add').onclick = () => list.length === 1 ? editLog(list[0], null, -1, true) : pickProg(p => editLog(p, null, -1, true));
  $('#money-pts').querySelectorAll('[data-use]').forEach(b => b.onclick = () => { const [pid, lid] = b.dataset.use.split('|'); const p = progOf(pid); editLog(p, p.log.find(z => z.id === lid), -1, true); });
  $('#money-pts').querySelectorAll('[data-prog]').forEach(b => b.onclick = () => openProg(progOf(b.dataset.prog)));
}
function bindPtTabs() { $('#money-pts').querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { ptsTab = b.dataset.pt; renderPts(); }); }
function pickProg(done) {
  openSheet(`<div class="shead"><button class="txt" id="pp-back">取消</button><b>用哪一家的點數？</b><span></span></div>
    <div class="list">${PTS().map(p => `<button class="lrow" data-id="${p.id}"><span class="lv big">${esc(p.airline)}</span><small class="muted">${pts(ptsBal(p))}</small></button>`).join('')}</div>`);
  $('#pp-back').onclick = () => { closeSheet(); renderMoney(); };
  $('#sheet').querySelectorAll('[data-id]').forEach(b => b.onclick = () => done(progOf(b.dataset.id)));
}
function srcName(l) {
  if (l.src === 'card') { const a = db.accounts.find(z => (z.rebates || []).some(r => r.id === l.reb)); return (a ? a.name + ' ' : '') + '信用卡回饋' + (l.note ? '・' + l.note : ''); }
  if (l.src === 'ins') { const i = INS().find(z => z.id === l.ins); return '保險活動' + (i ? '・' + i.name : ''); }
  if (l.src === 'promo') { const pr = PROMOS().find(z => z.id === l.promo); return '超市活動' + (pr ? '・' + pr.title : ''); }
  if (l.value < 0) return l.use || l.note || '使用點數';
  return l.note || '手動加點';
}
function openProg(p) {
  const log = (p.log || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  const earn = log.filter(l => l.value > 0), used = log.filter(l => l.value < 0);
  const row = l => `<button class="lrow" data-log="${l.id}"><span class="lv big">${esc(srcName(l))}<small>${l.date}${l.use && l.note ? '・' + esc(l.note) : ''}</small></span><b class="${l.value < 0 ? 'neg' : 'pos'}">${l.value > 0 ? '+' : ''}${num1(l.value)}</b>${l.src === 'manual' || !l.src ? '<span class="chev">›</span>' : ''}</button>`;
  openSheet(`<div class="shead"><button class="txt" id="p-close">關閉</button><b>${esc(p.airline)}</b><button class="txt strong" id="p-edit">編輯</button></div>
    <div class="card"><div class="mbal" style="border:0;margin:0;padding:0"><span>目前點數</span><b class="pos">${pts(ptsBal(p))}</b></div>
      ${p.member ? `<p class="hint">會員編號 ${esc(p.member)}</p>` : ''}
      <div class="row2" style="margin-top:10px"><button class="pill2" id="p-earn">＋ 賺到點數</button><button class="pill2" id="p-use">－ 使用點數</button></div></div>
    <div class="sec acc-sec"><span>使用紀錄（已用 ${num1(Math.abs(used.reduce((s, l) => s + l.value, 0)))} 點）</span></div>
    <div class="list">${used.length ? used.map(row).join('') : '<p class="empty" style="padding:10px 12px">換機票、升等等用掉的點數記在這裡。</p>'}</div>
    ${(() => { const a = autoEarned(p); if (!p.rule || !p.rule.on) return ''; const mon = ymd(new Date()).slice(0, 7), m = a.rows.filter(z => z.x.date.slice(0, 7) === mon);
      return `<div class="sec acc-sec"><span>🎯 消費自動累積（共 ${num1(a.total)} 點・本月 ${num1(m.reduce((t, z) => t + z.pts, 0))} 點）</span></div>
      <div class="list">${a.rows.length ? a.rows.slice(0, 30).map(z => `<div class="lrow"><span class="lv big">${esc(z.x.merchant || catInfo(z.x.cat).name)}<small>${z.x.date}・消費 ${money(z.x.amount)}</small></span><b class="pos">+${num1(z.pts)}</b></div>`).join('')
        : `<p class="empty" style="padding:10px 12px">${p.rule.since} 之後還沒有符合的消費。記帳時商家寫「${esc((p.rule.kw || '').split(/[,，]/)[0] || '…')}」就會算進來。</p>`}</div>`; })()}
    <div class="sec acc-sec"><span>累積紀錄</span></div>
    <div class="list">${earn.length ? earn.map(row).join('') : '<p class="empty" style="padding:10px 12px">賺到的點數記在這裡。信用卡回饋和保險活動存進來的也會出現。</p>'}</div>
    <p class="hint">從信用卡或保險存進來的紀錄，要到那張卡或那張保單裡修改。</p>`);
  $('#p-close').onclick = () => { closeSheet(); renderMoney(); };
  $('#p-edit').onclick = () => editProg(p);
  $('#p-earn').onclick = () => editLog(p, null, 1);
  $('#p-use').onclick = () => editLog(p, null, -1);
  $('#sheet').querySelectorAll('[data-log]').forEach(b => b.onclick = () => { const l = p.log.find(z => z.id === b.dataset.log); if (l && (l.src === 'manual' || !l.src)) editLog(p, l); });
}
function editProg(p) {
  const isNew = !p, v = p || { airline: '', member: '' };
  openSheet(`<div class="shead"><button class="txt" id="e-cancel">取消</button><b>${isNew ? '新增點數帳戶' : '修改'}</b><button class="txt strong" id="e-save">儲存</button></div>
    <label>航空公司／會員計畫（超市點數像 Everyday Rewards、Flybuys 也可以）</label><input id="e-air" list="e-airs" value="${esc(v.airline)}" placeholder="例如：Qantas Frequent Flyer">
    <datalist id="e-airs">${AIRLINES.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <label>現在有幾點</label><input id="e-bal" type="number" inputmode="decimal" step="any" value="${isNew ? '' : ptsBal(p)}" class="big" placeholder="0">
    <label>會員編號（可不填，只記末幾碼也行）</label><input id="e-mem" value="${esc(v.member || '')}">
    <div class="fsec">從消費自動累積點數</div>
    <label class="check"><input type="checkbox" id="e-on"${v.rule && v.rule.on ? ' checked' : ''}> 記帳時自動算點數（例如 Everyday Rewards 每 A$1 得 1 點）</label>
    <div id="e-rule">
      <div class="inl"><span>每花 A$1 得</span><input id="e-rate" type="number" inputmode="decimal" step="any" value="${(v.rule && v.rule.rate) || 1}"><span>點</span></div>
      <label>商家或備註包含（用逗號分開）</label><input id="e-kw" value="${esc((v.rule && v.rule.kw) || '')}" placeholder="例如：Woolworths, Woolies, BIG W">
      <label>或是這個分類</label><select id="e-cat">${ruleCatOpts(v.rule || {})}</select>
      <label>從哪一天開始算</label><input id="e-since" type="date" value="${(v.rule && v.rule.since) || ymd(new Date())}">
      <p class="hint">記帳時商家寫對，點數就會自動加上（每筆照金額無條件捨去）。只是估算，實際以會員 App 為準。</p></div>
    <p class="hint">改「現在有幾點」不會動到下面的紀錄，只會把起始點數調整到對。</p>
    <p class="err" id="e-err"></p>
    ${isNew ? '' : '<div class="btns"><button class="danger" id="e-del">刪除這個航空公司</button></div>'}`);
  const paintRule = () => $('#e-rule').hidden = !$('#e-on').checked; paintRule(); $('#e-on').onchange = paintRule;
  $('#e-cancel').onclick = () => isNew ? (closeSheet(), renderMoney()) : openProg(p);
  $('#e-save').onclick = () => {
    const airline = $('#e-air').value.trim(), bal = parseFloat($('#e-bal').value) || 0;
    if (!airline) return $('#e-err').textContent = '請寫名稱';
    const prog = p || { id: uid(), init: 0, log: [] };
    prog.airline = airline; prog.member = $('#e-mem').value.trim();
    const [rc, rs] = $('#e-cat').value.split('|');
    prog.rule = { on: $('#e-on').checked, rate: parseFloat($('#e-rate').value) || 0, kw: $('#e-kw').value.trim(), cat: rc || '', sub: rs || '', since: $('#e-since').value || ymd(new Date()) };
    prog.init = Math.round((bal - (ptsBal(prog) - (prog.init || 0))) * 10) / 10;
    if (isNew) PTS().push(prog);
    save(); toast('已儲存'); openProg(prog);
  };
  if (!isNew) $('#e-del').onclick = () => {
    if (!confirmDel('刪除後這個航空公司的點數紀錄都會不見，確定嗎？')) return;
    db.points = PTS().filter(z => z !== p);
    db.accounts.forEach(a => (a.plans || []).forEach(q => { if (q.prog === p.id) q.prog = ''; }));
    save(); closeSheet(); renderMoney(); toast('已刪除');
  };
}
const ruleCatOpts = r => `<option value="">不用分類比對</option>` + catsOf('expense').map(c => `<option value="${c.k}|"${r.cat === c.k && !r.sub ? ' selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>` +
  c.subs.map(sb => `<option value="${c.k}|${sb.k}"${r.cat === c.k && r.sub === sb.k ? ' selected' : ''}>　${esc(c.name)} › ${esc(sb.name)}</option>`).join('')).join('');
function confirmDel(msg) { const b = $('#sheet .danger'); if (b && b.dataset.sure) return true; if (b) { b.dataset.sure = 1; b.textContent = '再按一次確定刪除'; } toast(msg); return false; }
function editLog(p, l, sign0 = 1, fromList = false) {
  const isNew = !l, v = l || { value: '', date: ymd(new Date()), note: '', use: '' };
  let sign = l ? (v.value < 0 ? -1 : 1) : sign0;
  const back = () => fromList ? (closeSheet(), renderMoney()) : openProg(p);
  openSheet(`<div class="shead"><button class="txt" id="l-cancel">取消</button><b>${isNew ? (sign < 0 ? '記一筆使用' : '記一筆點數') : '修改紀錄'}</b><button class="txt strong" id="l-save">儲存</button></div>
    <p class="hint" style="margin-top:0">${esc(p.airline)}・現在 ${pts(ptsBal(p))}</p>
    <div class="seg seg2" id="l-sign"><button type="button" data-s="1" class="${sign > 0 ? 'on' : ''}">賺到</button><button type="button" data-s="-1" class="${sign < 0 ? 'on' : ''}">使用</button></div>
    <div id="l-usebox"><label>用途</label><input id="l-use" list="l-uses" value="${esc(v.use || '')}" placeholder="例如：換機票"><datalist id="l-uses">${USES.map(u => `<option value="${u}">`).join('')}</datalist></div>
    <label>幾點</label><input id="l-val" type="number" inputmode="decimal" step="any" value="${v.value ? Math.abs(v.value) : ''}" class="big">
    <label>日期</label><input id="l-date" type="date" value="${v.date}">
    <label>備註</label><input id="l-note" value="${esc(v.note || '')}" placeholder="例如：墨爾本→台北 經濟艙">
    <p class="err" id="l-err"></p>${isNew ? '' : '<div class="btns"><button class="danger" id="l-del">刪除</button></div>'}`);
  const paint = () => $('#l-usebox').hidden = sign > 0; paint();
  $('#l-sign').onclick = e => { const b = e.target.closest('button'); if (!b) return; sign = +b.dataset.s;
    $('#l-sign').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); paint(); };
  $('#l-cancel').onclick = back;
  $('#l-save').onclick = () => {
    const n = parseFloat($('#l-val').value); if (!(n > 0)) return $('#l-err').textContent = '請填點數';
    const row = l || { id: uid(), src: 'manual' };
    if (sign < 0 && n > ptsBal(p) + (l && l.value < 0 ? -l.value : 0) && !$('#l-err').dataset.warned) { $('#l-err').dataset.warned = 1; return $('#l-err').textContent = '用的比現在的點數多，確定的話再按一次儲存'; }
    Object.assign(row, { value: sign * n, date: $('#l-date').value || ymd(new Date()), note: $('#l-note').value.trim(), use: sign < 0 ? $('#l-use').value.trim() : '' });
    if (isNew) p.log.push(row); save(); toast('已記錄'); back();
  };
  if (!isNew) $('#l-del').onclick = () => { p.log = p.log.filter(z => z !== l); save(); toast('已刪除'); back(); };
}

// ---------- 保險頁 ----------
function renderIns() {
  const list = INS().slice().sort((a, b) => (a.start || '') < (b.start || '') ? 1 : -1);
  const year = list.reduce((s, i) => s + insYear(i), 0);
  let h = `<div class="card"><div class="mgrid2"><div><span>每年保費合計</span><b>${money(year)}</b></div><div><span>平均每月</span><b>${money(year / 12)}</b></div></div>
    <p class="hint">${list.length} 張保單（主約＋附約一起算）</p></div>`;
  h += list.map(i => {
    const pr = i.promo || {}, due = pr.points && i.start && pr.months ? addMonths(i.start, +pr.months) : '';
    const promo = pr.points ? (pr.logId ? `<em class="tag ok">✈️ ${num1(pr.points)} 點已存入</em>` : `<em class="tag">✈️ ${due ? due + ' 可得' : '可得'} ${num1(pr.points)} 點</em>`) : '';
    return `<button class="pcard" data-ins="${i.id}"><span class="pc-top"><span class="pc-ic">🛡️</span><span class="pc-n">${esc(i.name)}<small>${[i.company, i.insured && '被保險人 ' + i.insured].filter(Boolean).map(esc).join('・')}</small></span><span class="chev">›</span></span>
      <span class="pc-row"><b>${money(insPer(i))}</b><small>／${freqName(i.freq)}${(i.riders || []).length ? `（含附約 ${i.riders.length} 個）` : ''}</small><span class="sp"></span><small>${i.start ? i.start + ' 開始' : ''}</small></span>
      ${promo || pr.weeks ? `<span class="pc-row">${promo}${pr.weeks ? `<em class="tag">🎁 ${pr.weeks} 週免費</em>` : ''}</span>` : ''}</button>`;
  }).join('');
  if (!list.length) h += '<p class="empty">還沒有保單，按右上角「＋ 新增保單」。</p>';
  $('#money-ins').innerHTML = h;
  $('#money-ins').querySelectorAll('[data-ins]').forEach(b => b.onclick = () => editIns(INS().find(z => z.id === b.dataset.ins)));
}
function editIns(src) {
  const isNew = !src;
  const v = JSON.parse(JSON.stringify(src || { name: '', company: '', insured: '', premium: '', freq: 'month', riders: [], start: ymd(new Date()), promo: {}, note: '' }));
  v.promo = v.promo || {}; v.riders = v.riders || [];
  const read = () => {            // 把畫面上填的先收起來（新增附約時要重畫）
    if (!$('#i-name')) return;
    Object.assign(v, { name: $('#i-name').value.trim(), company: $('#i-co').value.trim(), insured: $('#i-who').value.trim(),
      premium: parseFloat($('#i-prem').value) || '', start: $('#i-start').value, note: $('#i-note').value.trim() });
    v.riders = [...$('#sheet').querySelectorAll('.rider')].map(r => ({ name: r.querySelector('.r-n').value.trim(), premium: parseFloat(r.querySelector('.r-p').value) || '' }));
    Object.assign(v.promo, { months: parseFloat($('#i-pm').value) || '', points: parseFloat($('#i-pp').value) || '', prog: $('#i-pg').value,
      weeks: parseFloat($('#i-pw').value) || '', text: $('#i-pt').value.trim() });
  };
  const draw = () => {
    const pr = v.promo, due = pr.points && v.start && pr.months ? addMonths(v.start, +pr.months) : '';
    openSheet(`<div class="shead"><button class="txt" id="i-cancel">取消</button><b>${isNew ? '新增保單' : '修改保單'}</b><button class="txt strong" id="i-save">儲存</button></div>
      <div class="fsec">基本資料</div>
      <label>保單名字</label><input id="i-name" value="${esc(v.name)}" placeholder="例如：醫療險、車險">
      <label>保險公司</label><input id="i-co" value="${esc(v.company)}" placeholder="例如：Bupa、NRMA">
      <label>被保險人</label><input id="i-who" list="i-whos" value="${esc(v.insured)}" placeholder="例如：Sarah"><datalist id="i-whos"><option value="Ben"><option value="Sarah"><option value="Ben、Sarah"></datalist>
      <div class="fsec">保費</div>
      <div class="row2"><div><label>保費（A$）</label><input id="i-prem" type="number" inputmode="decimal" step="0.01" value="${v.premium}"></div>
        <div><label>開始日期</label><input id="i-start" type="date" value="${v.start || ''}"></div></div>
      <label>繳費方式</label><div class="seg seg4" id="i-freq">${FREQ.filter((f, n) => n < FREQ_SHOW || f[0] === v.freq).map(([k, n]) => `<button type="button" data-f="${k}" class="${v.freq === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="fsec">附約 <button class="txt strong" id="i-addr" type="button">＋ 新增附約</button></div>
      ${v.riders.map((r, n) => `<div class="rider"><input class="r-n" value="${esc(r.name)}" placeholder="附約名稱"><input class="r-p" type="number" inputmode="decimal" step="0.01" value="${r.premium}" placeholder="保費"><button type="button" class="r-x" data-n="${n}" aria-label="刪除附約">✕</button></div>`).join('')
        || '<p class="hint" style="margin-top:0">沒有附約就不用填。附約保費跟主約一樣的繳費方式。</p>'}
      <div class="ptotal"><span>每期保費合計（主約＋附約）</span><b id="i-total">${money(insPer(v))}</b></div>
      <div class="fsec">保險活動</div>
      <div class="inl"><span>保滿</span><input id="i-pm" type="number" inputmode="decimal" value="${pr.months || ''}" placeholder="12"><span>個月，可得</span><input id="i-pp" type="number" inputmode="decimal" value="${pr.points || ''}" placeholder="點數"><span>點</span></div>
      <label>點數存到</label><select id="i-pg">${progOptions(pr.prog, PTS().length ? '先不選' : '（還沒有航空點數，先到「點數」頁新增）')}</select>
      <div class="inl"><span>前</span><input id="i-pw" type="number" inputmode="decimal" value="${pr.weeks || ''}" placeholder="0"><span>週免費</span></div>
      <label>活動說明</label><input id="i-pt" value="${esc(pr.text || '')}" placeholder="例如：新保單保滿一年送 10,000 Qantas 點">
      ${pr.points ? `<p class="hint">${due ? `預計 ${due} 可以拿到點數。` : ''}${pr.logId ? '✅ 點數已存入航空點數。' : ''}</p>
        ${pr.prog ? `<div class="btns"><button id="i-got" type="button">${pr.logId ? '取消「已存入」' : '✈️ 點數拿到了，存入航空點數'}</button></div>` : ''}` : ''}
      <div class="fsec">備註</div><textarea id="i-note" rows="3" placeholder="例如：理賠電話、保單號碼末幾碼">${esc(v.note || '')}</textarea>
      <p class="err" id="i-err"></p>
      ${isNew ? '' : '<div class="btns"><button class="danger" id="i-del">刪除這張保單</button></div>'}`);
    $('#i-freq').onclick = e => { const b = e.target.closest('button'); if (!b) return; v.freq = b.dataset.f;
      $('#i-freq').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); };
    $('#i-addr').onclick = () => { read(); v.riders.push({ name: '', premium: '' }); draw(); };
    $('#sheet').oninput = e => { if (e.target.id === 'i-prem' || e.target.classList.contains('r-p')) { read(); $('#i-total').textContent = money(insPer(v)); } };
    $('#sheet').querySelectorAll('.r-x').forEach(b => b.onclick = () => { read(); v.riders.splice(+b.dataset.n, 1); draw(); });
    ['#i-pm', '#i-pp', '#i-pg', '#i-start'].forEach(s => $(s).onchange = () => { read(); draw(); });
    $('#i-cancel').onclick = () => { closeSheet(); renderMoney(); };
    if ($('#i-got')) $('#i-got').onclick = () => { read(); v.promo.logId = v.promo.logId ? '' : 'pending'; draw(); };
    $('#i-save').onclick = () => {
      read();
      if (!v.name) return $('#i-err').textContent = '請寫保單名字';
      v.riders = v.riders.filter(r => r.name || r.premium);
      const ins = src || { id: uid() };
      Object.assign(ins, v);
      // 保險活動的點數：勾了「已存入」就在航空點數記一筆（改了點數或航空公司會跟著更新）
      ins.promo.logId = ins.promo.logId ? syncPointLog(['ins', ins.id], ins.promo.points, ins.promo.prog,
        { date: ins.start && ins.promo.months ? addMonths(ins.start, +ins.promo.months) : ymd(new Date()), src: 'ins', note: ins.promo.text || '' }) : syncPointLog(['ins', ins.id], 0, '', {});
      if (isNew) INS().push(ins);
      save(); closeSheet(); renderMoney(); toast('已儲存');
    };
    if (!isNew) $('#i-del').onclick = () => {
      if (!confirmDel('刪除保單（存入的點數紀錄也會一起拿掉），確定嗎？')) return;
      syncPointLog(['ins', src.id], 0, '', {}); db.ins = INS().filter(z => z !== src);
      save(); closeSheet(); renderMoney(); toast('已刪除');
    };
  };
  draw();
}

// ---------- 設定頁（v1.5）：帳戶（新增、匯入 CSV）、收入分類、支出分類（v2.1 改名＋小花） ----------
const FLOWERS = (n = 7, h = 34) => `<svg class="flowers" viewBox="0 0 ${n * 30} ${h}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${Array.from({ length: n }, (_, i) => {
  const x = 15 + i * 30, c = ['#F6B6C8', '#FBD98A', '#C9B6EA', '#F8F0E3', '#F7A8A0', '#B9DDF2'][i % 6], t = 6 + (i * 7) % 10;
  return `<g class="sway" style="animation-delay:${-i * .37}s;transform-origin:${x}px ${h}px"><path d="M${x} ${h} Q${x - 2} ${h - 10} ${x} ${t + 6}" stroke="#7DB476" stroke-width="1.6" fill="none"/>
    <ellipse cx="${x - 4}" cy="${h - 8}" rx="3.5" ry="1.6" fill="#8CC383" transform="rotate(-30 ${x - 4} ${h - 8})"/>
    ${[0, 72, 144, 216, 288].map(a => `<ellipse cx="${x}" cy="${t}" rx="2.6" ry="4.2" fill="${c}" transform="rotate(${a} ${x} ${t + 4}) translate(0 0)"/>`).join('')}<circle cx="${x}" cy="${t + 4}" r="2.2" fill="#F2C14E"/></g>`; }).join('')}</svg>`;
const CAT_ICONS = ['🍴', '☕', '🛒', '🏠', '🚗', '⛽', '🚌', '✈️', '🎮', '🎬', '🏋️', '➕', '💊', '📶', '📱', '🎁', '🛍️', '👗', '💼', '🐱', '🐶', '👶', '📚', '💡', '💰', '🎉', '↩️', '💳', '🏦', '📦', '🏷️'];
const CAT_COLORS = ['#F6E3D6', '#DDE6F5', '#E7E0F5', '#F5DDE5', '#F4EED8', '#DFEEDD', '#F1E0DC', '#F7E7D3', '#E2E8EE', '#E9E9E6', '#DCEBDA'];
const LOCKED = ['other', 'other_in', 'rebate'];          // 系統會用到，不能刪（可以改名）
function renderSet() {
  const n = kind => catsOf(kind).length;
  $('#money-set').innerHTML = `
    <div class="sec">帳戶</div>
    <div class="list"><button class="lrow" id="set-acct"><span class="ci">➕</span><span class="lv big">新增帳戶<small>信用卡、銀行、現金</small></span><span class="chev">›</span></button>
      <button class="lrow" id="set-csv"><span class="ci">📄</span><span class="lv big">匯入 CSV 檔案<small>從原本的記帳 App 匯出的檔案</small></span><span class="chev">›</span></button></div>
    <div class="sec sec-fl"><span>🌼 分類</span>${FLOWERS(5, 26)}</div>
    <div class="list"><button class="lrow" id="set-inc"><span class="ci" style="background:#DCEBDA">💰</span><span class="lv big">收入分類<small>${n('income')} 個</small></span><span class="chev">›</span></button>
      <button class="lrow" id="set-exp"><span class="ci" style="background:#F6E3D6">🍴</span><span class="lv big">支出分類<small>${n('expense')} 個</small></span><span class="chev">›</span></button></div>
    <div class="sec">其他</div>
    <div class="list"><button class="lrow" id="set-shop"><span class="ci">🏪</span><span class="lv big">商店<small>${SHOPS().length} 家・記一筆時可以選</small></span><span class="chev">›</span></button>
      <button class="lrow" id="set-me"><span class="ci">📱</span><span class="lv big">這支手機是誰的<small>${getMe() ? (getMe() === 'ben' ? 'Ben' : 'Sarah') : '還沒設定'}</small></span><span class="chev">›</span></button></div>
    <p class="tray-hint">卡號只要記末四碼就好，不要輸入完整卡號或密碼。資料只存在這支手機。</p>`;
  $('#set-acct').onclick = () => openAccount(null);
  $('#set-shop').onclick = () => manageStores();
  $('#set-me').onclick = () => askMe(() => { closeSheet(); renderSet(); });
  $('#set-csv').onclick = () => $('#csv-file').click();
  $('#set-exp').onclick = () => manageCats('expense');
  $('#set-inc').onclick = () => manageCats('income');
}
function manageCats(kind) {
  const used = k => db.expenses.filter(x => x.cat === k).length;
  const list = catsOf(kind);
  openSheet(`<div class="shead"><button class="txt" id="m-close">完成</button><b>${kind === 'income' ? '收入' : '支出'}分類</b><button class="txt strong" id="m-add">＋ 新增</button></div>
    <div class="flower-strip">${FLOWERS(9, 36)}</div>
    <div class="list">${list.map((c, n) => `<div class="lrow catm"><button class="cm-main" data-k="${c.k}">${catIcon(c.k)}<span class="lv big">${esc(c.name)}<small>${c.subs.length ? c.subs.length + ' 個子項目・' : ''}${used(c.k)} 筆</small></span></button>
      <span class="cm-grip" aria-hidden="true">≡</span></div>`).join('')}</div>
    <p class="hint">🌷 點分類可以改名字、圖示、顏色、子項目。<b>久按一下再上下拖</b>可以排順序（記一筆時照這個順序）。</p>`);
  $('#m-close').onclick = () => { closeSheet(); renderMoney(); };
  $('#m-add').onclick = () => editCat(kind, null);
  let justDragged = 0;
  $('#sheet').querySelectorAll('.cm-main').forEach(b => b.onclick = () => { if (Date.now() < justDragged) return; editCat(kind, catInfo(b.dataset.k)); });
  // 久按 0.4 秒 → 浮起來 → 上下拖 → 放開存順序（跟行事曆久按移動行程一樣的手勢）
  const box = $('#sheet .list'); let pend = null, drag = null;
  const xy = e => e.touches ? e.touches[0] : e;
  const start = e => { const row = e.target.closest('.catm'); if (!row) return; const p = xy(e);
    pend = { row, x: p.clientX, y: p.clientY, t: setTimeout(() => { drag = { row }; row.classList.add('lift'); box.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(10); }, 400) }; };
  const move = e => { if (!pend) return; const p = xy(e);
    if (!drag) { if (Math.hypot(p.clientX - pend.x, p.clientY - pend.y) > 8) { clearTimeout(pend.t); pend = null; } return; }
    e.preventDefault();
    const rows = [...box.querySelectorAll('.catm')], t = rows.find(r => { if (r === drag.row) return false; const b = r.getBoundingClientRect(); return p.clientY > b.top && p.clientY < b.bottom; });
    if (t) { const b = t.getBoundingClientRect(); box.insertBefore(drag.row, p.clientY < b.top + b.height / 2 ? t : t.nextSibling); } };
  const end = () => { if (!pend) return; clearTimeout(pend.t); pend = null; if (!drag) return;
    drag.row.classList.remove('lift'); box.classList.remove('dragging'); drag = null; justDragged = Date.now() + 400;
    const keys = [...box.querySelectorAll('.cm-main')].map(b => b.dataset.k); let i = 0;
    db.cats = db.cats.map(c => c.kind === kind ? catInfo(keys[i++]) : c); save(); toast('已排好順序'); };
  box.addEventListener('touchstart', start, { passive: true }); box.addEventListener('touchmove', move, { passive: false }); box.addEventListener('touchend', end); box.addEventListener('touchcancel', end);
  box.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  box.addEventListener('contextmenu', e => e.preventDefault());
}
function editCat(kind, c) {
  const isNew = !c;
  const v = c ? { name: c.name, icon: c.icon, color: c.color, subs: c.subs.map(s => ({ ...s })) } : { name: '', icon: '🏷️', color: CAT_COLORS[0], subs: [] };
  const read = () => { if (!$('#c-name')) return; v.name = $('#c-name').value.trim();
    const ic = $('#c-icon').value.trim(); if (ic) v.icon = [...ic].slice(0, 2).join('');
    v.subs = [...$('#sheet').querySelectorAll('.subr input')].map(i => ({ k: i.dataset.k || uid(), name: i.value.trim() })); };
  const draw = () => {
    openSheet(`<div class="shead"><button class="txt" id="c-cancel">取消</button><b>${isNew ? '新增' : '修改'}${kind === 'income' ? '收入' : '支出'}分類</b><button class="txt strong" id="c-save">儲存</button></div>
      <div class="catprev"><span class="ci big" style="background:${v.color}">${v.icon}</span><b>${esc(v.name) || '（名稱）'}</b></div>
      <label>名稱</label><input id="c-name" value="${esc(v.name)}" placeholder="例如：寵物">
      <label>圖示（點一個，或在右邊貼任何表情符號）</label>
      <div class="icongrid">${CAT_ICONS.map(i => `<button type="button" class="${i === v.icon ? 'on' : ''}">${i}</button>`).join('')}<input id="c-icon" class="iconin" value="" placeholder="貼上"></div>
      <label>顏色</label><div class="colors">${CAT_COLORS.map(col => `<button type="button" data-c="${col}" class="${col === v.color ? 'on' : ''}" style="background:${col}"></button>`).join('')}</div>
      <div class="fsec">子項目 <button class="txt strong" id="c-addsub" type="button">＋ 新增子項目</button></div>
      ${v.subs.map((s, n) => `<div class="rider subr"><input data-k="${s.k}" value="${esc(s.name)}" placeholder="子項目名稱"><span></span><button type="button" class="r-x" data-n="${n}" aria-label="刪除">✕</button></div>`).join('')
        || '<p class="hint" style="margin-top:0">沒有子項目也可以。</p>'}
      <p class="err" id="c-err"></p>
      ${isNew || LOCKED.includes(c.k) ? '' : `<div class="btns"><button class="danger" id="c-del">刪除這個分類</button></div><p class="hint">刪除後，用這個分類記的 ${db.expenses.filter(x => x.cat === c.k).length} 筆會改成「${kind === 'income' ? '其他收入' : '其他'}」。</p>`}`);
    $('#sheet .icongrid').onclick = e => { const b = e.target.closest('button'); if (!b) return; read(); v.icon = b.textContent; draw(); };
    $('#sheet .colors').onclick = e => { const b = e.target.closest('button'); if (!b) return; read(); v.color = b.dataset.c; draw(); };
    $('#c-addsub').onclick = () => { read(); v.subs.push({ k: uid(), name: '' }); draw(); const ins = $('#sheet').querySelectorAll('.subr input'); ins[ins.length - 1].focus(); };
    $('#sheet').querySelectorAll('.subr .r-x').forEach(b => b.onclick = () => { read(); v.subs.splice(+b.dataset.n, 1); draw(); });
    $('#c-cancel').onclick = () => manageCats(kind);
    $('#c-save').onclick = () => {
      read(); if (!v.name) return $('#c-err').textContent = '請寫名稱';
      if (catsOf(kind).some(z => z.name === v.name && z !== c)) return $('#c-err').textContent = '已經有同名的分類';
      const subs = v.subs.filter(s => s.name);
      if (isNew) db.cats.push({ k: 'c_' + uid(), kind, name: v.name, icon: v.icon, color: v.color, subs });
      else {
        const gone = c.subs.filter(s => !subs.some(z => z.k === s.k)).map(s => s.k);       // 刪掉的子項目：那幾筆只留大分類
        db.expenses.forEach(x => { if (x.cat === c.k && gone.includes(x.sub)) x.sub = ''; });
        Object.assign(c, { name: v.name, icon: v.icon, color: v.color, subs });
      }
      save(); toast('已儲存'); manageCats(kind);
    };
    if ($('#c-del')) $('#c-del').onclick = () => {
      if (!confirmDel('確定刪除這個分類嗎？')) return;
      const to = kind === 'income' ? 'other_in' : 'other';
      db.expenses.forEach(x => { if (x.cat === c.k) { x.cat = to; x.sub = ''; } });
      db.cats = db.cats.filter(z => z !== c); save(); toast('已刪除'); manageCats(kind);
    };
  };
  draw();
}

// ---------- 超市活動（v1.6）：每週都要花滿／期間累積花滿／買指定商品 → 得點數；從記帳紀錄自動算進度 ----------
//  db.promos：[{ id, title, store, kind: weekly|total|item, start, weeks, target, points, prog, kw, cat, sub, items, done, logId, note }]
const STORES = ['Woolworths', 'Coles', 'ALDI', 'IGA', 'Costco'];
const PROMOS = () => db.promos || (db.promos = []);
const PKIND = { weekly: '每週都要花滿', total: '期間內累積花滿', item: '買指定商品' };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const md = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
function promoMatch(pr, x) {                       // 這筆消費算不算這個活動的？
  if (txType(x) !== 'expense') return false;
  const text = ((x.merchant || '') + ' ' + (x.note || '')).toLowerCase();
  const kws = (pr.kw || '').split(/[,，、]/).map(k => k.trim().toLowerCase()).filter(Boolean);
  if (kws.some(k => text.includes(k))) return true;
  return !!pr.cat && x.cat === pr.cat && (!pr.sub || x.sub === pr.sub);
}
function promoStatus(pr) {
  const today = ymd(new Date()), weeks = Math.max(1, +pr.weeks || 1), end = addDays(pr.start, weeks * 7 - 1);
  const spentIn = (s, e) => { const rows = db.expenses.filter(x => x.date >= s && x.date <= e && promoMatch(pr, x)); return { rows, sum: rows.reduce((t, x) => t + x.amount, 0) }; };
  if (pr.kind === 'item') return { end, done: !!pr.done, failed: !pr.done && today > end, weeksInfo: [] };
  if (pr.kind === 'total') {
    const { rows, sum } = spentIn(pr.start, end), left = Math.max(0, (pr.target || 0) - sum);
    return { end, rows, sum, left, done: left <= 0 && sum > 0, failed: left > 0 && today > end, daysLeft: daysBetween(today, end) + 1 };
  }
  const weeksInfo = [];
  for (let w = 0; w < weeks; w++) {
    const s = addDays(pr.start, w * 7), e = addDays(s, 6), { rows, sum } = spentIn(s, e), left = Math.max(0, (pr.target || 0) - sum);
    const state = left <= 0 && sum > 0 ? 'done' : today > e ? 'fail' : today >= s ? 'now' : 'later';
    weeksInfo.push({ n: w + 1, s, e, rows, sum, left, state, daysLeft: daysBetween(today, e) + 1 });
  }
  return { end, weeksInfo, done: weeksInfo.every(w => w.state === 'done'), failed: weeksInfo.some(w => w.state === 'fail') };
}
function ring(pct, size = 54) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E4E8E2" stroke-width="7"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#6E9478" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * Math.min(1, pct)).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function promoBody(pr, st, detail) {
  if (pr.kind === 'item') return `<div class="pr-item">${pr.items ? `<p>要買：${esc(pr.items)}</p>` : ''}<p class="hint" style="margin:0">${md(pr.start)}–${md(st.end)}</p>
    <button class="pill2 pr-check" data-done="${pr.id}">${pr.done ? '✅ 已經買了' : '⬜ 買了就點這裡'}</button></div>`;
  if (pr.kind === 'total') return `<div class="pr-now">${ring(pr.target ? st.sum / pr.target : 0)}<div><b>${st.done ? '達成了！' : st.failed ? '沒有達成' : money(st.left)}</b>
    <small>${st.done || st.failed ? `共花 ${money(st.sum)}` : `還差多少（已花 ${money(st.sum)}／${money(pr.target)}）・剩 ${st.daysLeft} 天`}</small></div></div>
    ${detail ? rowsList(st.rows) : ''}`;
  return st.weeksInfo.map(w => {
    const icon = w.state === 'done' ? '<span class="wk ok">✓</span>' : w.state === 'fail' ? '<span class="wk no">✕</span>' : w.state === 'now' ? '<span class="wk wk-now"></span>' : '<span class="wk"></span>';
    const right = w.state === 'done' ? `完成・花 ${money(w.sum)}` : w.state === 'fail' ? `沒達成・花 ${money(w.sum)}` : w.state === 'now' ? `剩 ${w.daysLeft} 天` : `${md(w.s)} 開始`;
    const now = w.state === 'now' ? `<div class="pr-now">${ring(pr.target ? w.sum / pr.target : 0)}<div><b>${money(w.left)}</b><small>還差多少（已花 ${money(w.sum)}／${money(pr.target)}）</small></div></div>` : '';
    return `<div class="wkrow">${icon}<span>第 ${w.n} 週 <small>${md(w.s)}–${md(w.e)}</small></span><em>${right}</em></div>${now}${detail && w.rows.length ? rowsList(w.rows) : ''}`;
  }).join('');
}
const rowsList = rows => rows.length ? `<div class="pr-rows">${rows.map(x => `<div><span>${md(x.date)} ${esc(x.merchant || subName(x.cat, x.sub) || catInfo(x.cat).name)}</span><b>${money(x.amount)}</b></div>`).join('')}</div>` : '';
function promoCard(pr, detail) {
  const st = promoStatus(pr);
  const badge = st.done ? '<em class="tag ok">已達成</em>' : st.failed ? '<em class="tag no">沒達成</em>' : '<em class="tag">進行中</em>';
  const reward = st.done && pr.points ? (pr.logId ? `<p class="hint">✅ ${num1(pr.points)} 點已存入 ${esc((progOf(pr.prog) || {}).airline || '')}</p>`
    : `<button class="txt strong pr-save" data-save="${pr.id}">✈️ 把 ${num1(pr.points)} 點存入${progOf(pr.prog) ? ' ' + esc(progOf(pr.prog).airline) : '點數帳戶'}</button>`) : '';
  return `<div class="pcard prc" data-promo="${pr.id}"><span class="pc-top"><span class="pc-ic">🛒</span><span class="pc-n">${esc(pr.title || '超市活動')}<small>${esc(pr.store || '')}・${PKIND[pr.kind]}${pr.kind !== 'item' ? ' ' + money(pr.target || 0) : ''}${pr.points ? `・得 ${num1(pr.points)} 點` : ''}</small></span>${badge}</span>
    ${promoBody(pr, st, detail)}${reward}</div>`;
}
function renderPromos(seg) {
  const today = ymd(new Date());
  const list = PROMOS().slice().sort((a, b) => a.start < b.start ? 1 : -1);
  const active = list.filter(pr => { const st = promoStatus(pr); return !st.done && !st.failed && today <= st.end; });
  const past = list.filter(pr => !active.includes(pr));
  let h = seg + (list.length ? '' : `<div class="card"><p class="empty" style="margin:0">像「連續 4 週每週在 Woolworths 花滿 $120 送 10,000 點」這種活動，按右上角「＋ 新增活動」記下來。<br>
    App 會從你的記帳紀錄（商家名稱或分類）自動算每週花了多少、還差多少。</p></div>`);
  if (active.length) h += `<div class="sec">進行中</div>` + active.map(pr => promoCard(pr)).join('');
  if (past.length) h += `<div class="sec">已結束</div>` + past.map(pr => promoCard(pr)).join('');
  $('#money-pts').innerHTML = h;
  bindPromoButtons($('#money-pts'), () => renderPts());
  $('#money-pts').querySelectorAll('.prc').forEach(b => b.onclick = e => { if (e.target.closest('button')) return; openPromo(PROMOS().find(z => z.id === b.dataset.promo)); });
}
function bindPromoButtons(root, redraw) {
  root.querySelectorAll('[data-done]').forEach(b => b.onclick = () => { const pr = PROMOS().find(z => z.id === b.dataset.done); pr.done = !pr.done; save(); redraw(); });
  root.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const pr = PROMOS().find(z => z.id === b.dataset.save);
    const go = p => { pr.prog = p.id; pr.logId = syncPointLog(['promo', pr.id], pr.points, p.id, { date: ymd(new Date()), src: 'promo', note: pr.title }); save(); toast('已存入點數'); closeSheet(); renderMoney(); };
    if (progOf(pr.prog)) go(progOf(pr.prog)); else if (PTS().length === 1) go(PTS()[0]); else if (PTS().length) pickProg(go);
    else toast('先在「點數」新增一個點數帳戶（例如 Everyday Rewards）');
  });
}
function openPromo(pr) {
  openSheet(`<div class="shead"><button class="txt" id="o-close">關閉</button><b>${esc(pr.title || '超市活動')}</b><button class="txt strong" id="o-edit">編輯</button></div>
    ${promoCard(pr, true)}
    <p class="hint">算進來的消費：${pr.kw ? `商家或備註有「${esc(pr.kw)}」` : ''}${pr.kw && pr.cat ? '，或' : ''}${pr.cat ? `分類是「${esc(catInfo(pr.cat).name)}${pr.sub ? '›' + esc(subName(pr.cat, pr.sub)) : ''}」` : ''}${!pr.kw && !pr.cat ? '（還沒設定比對方式）' : ''}。記帳時商家寫對，就會自動算進來。</p>
    ${pr.note ? `<p class="hint">備註：${esc(pr.note)}</p>` : ''}`);
  $('#o-close').onclick = () => { closeSheet(); renderMoney(); };
  $('#o-edit').onclick = () => editPromo(pr);
  bindPromoButtons($('#sheet'), () => openPromo(pr));
}
function editPromo(src) {
  const isNew = !src;
  const v = Object.assign({ title: '', store: 'Woolworths', kind: 'weekly', start: ymd(new Date()), weeks: 4, target: '', points: '', prog: '', kw: 'Woolworths, Woolies', cat: '', sub: '', items: '', note: '' }, src || {});
  const read = () => { if (!$('#r-title')) return;
    Object.assign(v, { title: $('#r-title').value.trim(), store: $('#r-store').value.trim(), start: $('#r-start').value || v.start, weeks: parseFloat($('#r-weeks').value) || 1,
      target: parseFloat(($('#r-target') || {}).value) || '', points: parseFloat($('#r-points').value) || '', prog: $('#r-prog').value,
      kw: ($('#r-kw') || {}).value === undefined ? v.kw : $('#r-kw').value.trim(), items: ($('#r-items') || {}).value === undefined ? v.items : $('#r-items').value.trim(), note: $('#r-note').value.trim() });
    if ($('#r-cat')) { const [c, sb] = $('#r-cat').value.split('|'); v.cat = c || ''; v.sub = sb || ''; } };
  const catOpts = () => `<option value="">不用分類比對</option>` + catsOf('expense').map(c => `<option value="${c.k}|"${v.cat === c.k && !v.sub ? ' selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>` +
    c.subs.map(sb => `<option value="${c.k}|${sb.k}"${v.cat === c.k && v.sub === sb.k ? ' selected' : ''}>　${esc(c.name)} › ${esc(sb.name)}</option>`).join('')).join('');
  const draw = () => {
    openSheet(`<div class="shead"><button class="txt" id="r-cancel">取消</button><b>${isNew ? '新增超市活動' : '修改活動'}</b><button class="txt strong" id="r-save">儲存</button></div>
      <label>活動名稱</label><input id="r-title" value="${esc(v.title)}" placeholder="例如：Boosted 4 週拿 10,000 點">
      <label>超市</label><input id="r-store" list="r-stores" value="${esc(v.store)}"><datalist id="r-stores">${STORES.map(x => `<option value="${x}">`).join('')}</datalist>
      <label>活動類型</label><div class="seg seg3" id="r-kind">${Object.entries(PKIND).map(([k, n]) => `<button type="button" data-k="${k}" class="${v.kind === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="row2"><div><label>開始日期</label><input id="r-start" type="date" value="${v.start}"></div><div><label>活動幾週</label><input id="r-weeks" type="number" inputmode="numeric" min="1" value="${v.weeks}"></div></div>
      ${v.kind === 'item' ? `<label>要買的商品</label><input id="r-items" value="${esc(v.items)}" placeholder="例如：任 2 件 Cadbury 巧克力">`
        : `<label>${v.kind === 'weekly' ? '每週要花滿（A$）' : '期間內總共要花滿（A$）'}</label><input id="r-target" type="number" inputmode="decimal" step="0.01" value="${v.target}" placeholder="120">`}
      <div class="row2"><div><label>可得點數</label><input id="r-points" type="number" inputmode="numeric" value="${v.points}" placeholder="10000"></div>
        <div><label>點數存到</label><select id="r-prog">${progOptions(v.prog, '先不選')}</select></div></div>
      ${v.kind === 'item' ? '' : `<div class="fsec">從記帳紀錄抓哪些消費</div>
        <label>商家或備註包含（用逗號分開）</label><input id="r-kw" value="${esc(v.kw)}" placeholder="Woolworths, Woolies">
        <label>或是這個分類</label><select id="r-cat">${catOpts()}</select>
        <p class="hint">兩個條件有一個符合就算。例如記帳時商家寫「Woolworths」，或分類選「家用 › 超市」。</p>`}
      <label>備註</label><input id="r-note" value="${esc(v.note)}" placeholder="例如：要先在 App 按 Boost">
      <p class="err" id="r-err"></p>${isNew ? '' : '<div class="btns"><button class="danger" id="r-del">刪除這個活動</button></div>'}`);
    $('#r-kind').onclick = e => { const b = e.target.closest('button'); if (!b) return; read(); v.kind = b.dataset.k; draw(); };
    $('#r-store').onchange = () => { const old = v.store; read(); if (!v.kw || v.kw.toLowerCase().startsWith((old || '').toLowerCase())) { v.kw = v.store + (v.store === 'Woolworths' ? ', Woolies' : ''); draw(); } };
    $('#r-cancel').onclick = () => isNew ? (closeSheet(), renderMoney()) : openPromo(src);
    $('#r-save').onclick = () => {
      read();
      if (v.kind !== 'item' && !(v.target > 0)) return $('#r-err').textContent = '請填要花滿多少錢';
      if (v.kind !== 'item' && !v.kw && !v.cat) return $('#r-err').textContent = '請設定要抓哪些消費（商家關鍵字或分類）';
      const pr = src || { id: uid(), done: false, logId: '' };
      Object.assign(pr, v, { title: v.title || `${v.store} ${PKIND[v.kind]}` });
      if (pr.logId) pr.logId = syncPointLog(['promo', pr.id], pr.points, pr.prog, { date: ymd(new Date()), src: 'promo', note: pr.title });
      if (isNew) PROMOS().push(pr);
      save(); toast('已儲存'); isNew ? (closeSheet(), renderMoney()) : openPromo(pr);
    };
    if (!isNew) $('#r-del').onclick = () => { if (!confirmDel('刪除活動（存入的點數紀錄也會拿掉），確定嗎？')) return;
      syncPointLog(['promo', src.id], 0, '', {}); db.promos = PROMOS().filter(z => z !== src); save(); closeSheet(); renderMoney(); toast('已刪除'); };
  };
  draw();
}

// ====================================================================
// v2.4：誰記的、這支手機是誰的、商店（v2.2 的 app.js 已經在用，這裡補上）
//  每筆記帳 x.by：ben | sarah | import | shortcut（之後 iPhone 捷徑記帳寫入時要帶 by:'shortcut'）
//  「這支手機是誰的」存在 localStorage our-wallet-me（只在這支手機，不同步）
//  db.stores：[{ id, name }]
// ====================================================================
const BY_NAME = { ben: 'Ben 記', sarah: 'Sarah 記', import: 'CSV 匯入', shortcut: '捷徑記帳' };
const ME_KEY = 'our-wallet-me';
function getMe() { try { const v = localStorage.getItem(ME_KEY); return v === 'ben' || v === 'sarah' ? v : ''; } catch (e) { return ''; } }
function setMe(v) { try { localStorage.setItem(ME_KEY, v); } catch (e) { } }
function byOf(x) { if (!x) return ''; if (BY_NAME[x.by]) return x.by; return x.src ? 'import' : ''; }
function byTag(x) { const k = byOf(x); return k ? `<em class="bytag by-${k}">${BY_NAME[k]}</em>` : ''; }
const whoSvg = who => `<svg viewBox="-18 -58 36 62" aria-hidden="true">${who === 'ben' ? charBen() : charSarah()}</svg>`;
function askMe(next, back) {
  const cur = getMe();
  openSheet(`<div class="shead"><button class="txt" id="me-back">${back ? '‹ 返回' : '取消'}</button><b>這支手機是誰的？</b><span></span></div>
    <p class="hint">選一次就好，之後在這支手機記的帳都會標上名字。之後可以在「設定」改。</p>
    <div class="who2"><button data-me="ben" class="${cur === 'ben' ? 'on' : ''}">${whoSvg('ben')}Ben</button><button data-me="sarah" class="${cur === 'sarah' ? 'on' : ''}">${whoSvg('sarah')}Sarah</button></div>`);
  $('#me-back').onclick = () => back ? back() : closeSheet();
  $('#sheet').querySelectorAll('[data-me]').forEach(b => b.onclick = () => { setMe(b.dataset.me); toast(`這支手機是 ${b.dataset.me === 'ben' ? 'Ben' : 'Sarah'} 的`); next ? next() : closeSheet(); });
}
const DEFAULT_SHOPS = ['Woolworths', 'Coles', 'ALDI', 'IGA', 'Costco', 'Kmart', 'Bunnings', 'Chemist Warehouse', 'Big W', 'Target'];
function SHOPS() { if (!Array.isArray(db.stores)) db.stores = DEFAULT_SHOPS.map(name => ({ id: uid(), name })); return db.stores; }
const shopUse = () => { const m = {}; db.expenses.forEach(x => { if (x.merchant) { const k = x.merchant.toLowerCase(); m[k] = (m[k] || 0) + 1; } }); return m; };
// 選商店：常去的排前面；done(名字)，done(null)＝自己打
function pickStore(cur, done, back) {
  const use = shopUse(), list = SHOPS().slice().sort((a, b) => (use[b.name.toLowerCase()] || 0) - (use[a.name.toLowerCase()] || 0));
  openSheet(`<div class="shead"><button class="txt" id="s-back">‹ 返回</button><b>選擇商店</b><span></span></div>
    <div class="list"><button class="lrow" data-i="-1"><span class="ci">✏️</span><span class="lv big">自己打</span></button>
    ${list.map((s, i) => `<button class="lrow" data-i="${i}"><span class="ci">🏪</span><span class="lv big">${esc(s.name)}${use[s.name.toLowerCase()] ? `<small>${use[s.name.toLowerCase()]} 筆</small>` : ''}</span>${cur && cur.toLowerCase() === s.name.toLowerCase() ? '<span class="check">✓</span>' : ''}</button>`).join('')}</div>`);
  $('#s-back').onclick = back;
  $('#sheet').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; done(i < 0 ? null : list[i].name); });
}
// 設定 › 商店：新增、改名（可連以前的帳一起改）、刪除
function manageStores() {
  const use = shopUse();
  openSheet(`<div class="shead"><button class="txt" id="st-close">完成</button><b>商店</b><button class="txt strong" id="st-add">＋ 新增</button></div>
    <div class="list">${SHOPS().map(s => `<button class="lrow" data-id="${s.id}"><span class="ci">🏪</span><span class="lv big">${esc(s.name)}<small>${use[s.name.toLowerCase()] || 0} 筆</small></span><span class="chev">›</span></button>`).join('')}</div>
    <p class="hint">記一筆時「商家」可以直接打字，打了新的商店會自動加進來。</p>`);
  $('#st-close').onclick = () => { closeSheet(); renderMoney(); };
  $('#st-add').onclick = () => { const n = (prompt('新商店的名字') || '').trim(); if (!n) return;
    if (SHOPS().some(s => s.name.toLowerCase() === n.toLowerCase())) return toast('已經有這家了');
    SHOPS().push({ id: uid(), name: n }); save(); manageStores(); };
  $('#sheet .list').onclick = e => { const b = e.target.closest('.lrow'); if (!b) return; const s = SHOPS().find(z => z.id === b.dataset.id); if (s) editStore(s); };
}
function editStore(s) {
  const n = db.expenses.filter(x => x.merchant && x.merchant.toLowerCase() === s.name.toLowerCase()).length;
  openSheet(`<div class="shead"><button class="txt" id="st-back">‹ 商店</button><b>修改商店</b><button class="txt strong" id="st-save">儲存</button></div>
    <label>名字</label><input id="st-name" value="${esc(s.name)}">
    ${n ? `<label class="lrow"><input type="checkbox" id="st-old" checked style="width:auto;margin:0"> 以前的 ${n} 筆帳也一起改名</label>` : ''}
    <div class="btns"><button class="danger" id="st-del">刪除這家商店</button></div><p class="hint">刪除只會從清單拿掉，以前的帳不會被刪。</p>`);
  $('#st-back').onclick = manageStores;
  $('#st-save').onclick = () => { const v = $('#st-name').value.trim(); if (!v) return;
    if ($('#st-old') && $('#st-old').checked) db.expenses.forEach(x => { if (x.merchant && x.merchant.toLowerCase() === s.name.toLowerCase()) x.merchant = v; });
    s.name = v; save(); toast('已儲存'); manageStores(); };
  $('#st-del').onclick = () => { $('#st-del').outerHTML = '<button class="danger" id="st-del2">確定刪除</button>';
    $('#st-del2').onclick = () => { db.stores = SHOPS().filter(z => z !== s); save(); toast('已刪除'); manageStores(); }; };
}
