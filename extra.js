// 我們的錢包 v1.4：保險、航空點數（在 app.js 之前載入；裡面的函式只在畫面需要時才被呼叫）
//  db.points：航空點數 [{ id, airline, member, init, log: [{ id, date, value(+/-), src, note, reb?, ins? }] }]
//             src：manual 手動、card 信用卡回饋（reb＝回饋紀錄 id）、ins 保險活動（ins＝保單 id）
//  db.ins   ：保單 [{ id, name, company, insured, premium, freq, riders: [{ name, premium }], start,
//                    promo: { months, points, prog, weeks, text, logId }, note }]
const FREQ = [['month', '月繳', 12], ['quarter', '季繳', 4], ['half', '半年繳', 2], ['year', '年繳', 1], ['once', '躉繳', 0]];
const AIRLINES = ['Qantas Frequent Flyer', 'Virgin Australia Velocity', '長榮航空 無限萬哩遊', '中華航空 華夏會員', 'Singapore KrisFlyer', 'Cathay Asia Miles'];
const PTS = () => db.points || (db.points = []);
const INS = () => db.ins || (db.ins = []);
const progOf = id => PTS().find(p => p.id === id);
const ptsBal = p => Math.round(((p.init || 0) + (p.log || []).reduce((s, l) => s + l.value, 0)) * 10) / 10;
const pts = n => num1(n) + ' 點';
const freqName = k => (FREQ.find(f => f[0] === k) || FREQ[3])[1];
const insYear = i => { const f = (FREQ.find(z => z[0] === i.freq) || FREQ[3])[2];
  return f * ((i.premium || 0) + (i.riders || []).reduce((s, r) => s + (r.premium || 0), 0)); };
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
function renderPts() {
  const list = PTS();
  let h = list.map(p => {
    const last = (p.log || []).slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
    return `<button class="pcard" data-prog="${p.id}"><span class="pc-top"><span class="pc-ic">✈️</span><span class="pc-n">${esc(p.airline)}${p.member ? `<small>會員 ${esc(p.member)}</small>` : ''}</span><span class="chev">›</span></span>
      <b class="pc-bal">${num1(ptsBal(p))}<small> 點</small></b>
      <small class="pc-last">${last ? `最近：${last.date}　${last.value > 0 ? '+' : ''}${num1(last.value)}　${esc(srcName(last))}` : '還沒有紀錄'}</small></button>`;
  }).join('');
  if (!list.length) h = '<div class="card"><p class="empty" style="margin:0">還沒有航空點數。按下面「＋ 新增航空公司」，輸入現在有幾點就好。<br>信用卡的里程回饋、保險活動送的點數，都可以直接存進來。</p></div>';
  h += '<div class="btns"><button class="primary" id="prog-add">＋ 新增航空公司</button></div>';
  $('#money-pts').innerHTML = h;
  $('#prog-add').onclick = () => editProg(null);
  $('#money-pts').querySelectorAll('[data-prog]').forEach(b => b.onclick = () => openProg(progOf(b.dataset.prog)));
}
function srcName(l) {
  if (l.src === 'card') { const a = db.accounts.find(z => (z.rebates || []).some(r => r.id === l.reb)); return (a ? a.name + ' ' : '') + '信用卡回饋' + (l.note ? '・' + l.note : ''); }
  if (l.src === 'ins') { const i = INS().find(z => z.id === l.ins); return '保險活動' + (i ? '・' + i.name : ''); }
  return l.note || (l.value < 0 ? '使用／兌換' : '手動加點');
}
function openProg(p) {
  const log = (p.log || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  openSheet(`<div class="shead"><button class="txt" id="p-close">關閉</button><b>${esc(p.airline)}</b><button class="txt strong" id="p-edit">編輯</button></div>
    <div class="card"><div class="mbal" style="border:0;margin:0;padding:0"><span>目前點數</span><b class="pos">${pts(ptsBal(p))}</b></div>
      ${p.member ? `<p class="hint">會員編號 ${esc(p.member)}</p>` : ''}</div>
    <div class="sec acc-sec"><span>點數紀錄</span><button class="txt strong" id="p-addlog">＋ 記一筆</button></div>
    <div class="list">${log.length ? log.map(l => `<button class="lrow" data-log="${l.id}"><span class="lv big">${esc(srcName(l))}<small>${l.date}</small></span><b class="${l.value < 0 ? 'neg' : 'pos'}">${l.value > 0 ? '+' : ''}${num1(l.value)}</b>${l.src === 'manual' || !l.src ? '<span class="chev">›</span>' : ''}</button>`).join('')
      : '<p class="empty" style="padding:10px 12px">賺到或用掉點數時記在這裡。信用卡回饋和保險活動存進來的也會出現。</p>'}</div>
    <p class="hint">從信用卡或保險存進來的紀錄，要到那張卡或那張保單裡修改。</p>`);
  $('#p-close').onclick = () => { closeSheet(); renderMoney(); };
  $('#p-edit').onclick = () => editProg(p);
  $('#p-addlog').onclick = () => editLog(p, null);
  $('#sheet').querySelectorAll('[data-log]').forEach(b => b.onclick = () => { const l = p.log.find(z => z.id === b.dataset.log); if (l && (l.src === 'manual' || !l.src)) editLog(p, l); });
}
function editProg(p) {
  const isNew = !p, v = p || { airline: '', member: '' };
  openSheet(`<div class="shead"><button class="txt" id="e-cancel">取消</button><b>${isNew ? '新增航空公司' : '修改'}</b><button class="txt strong" id="e-save">儲存</button></div>
    <label>航空公司／會員計畫</label><input id="e-air" list="e-airs" value="${esc(v.airline)}" placeholder="例如：Qantas Frequent Flyer">
    <datalist id="e-airs">${AIRLINES.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <label>現在有幾點</label><input id="e-bal" type="number" inputmode="decimal" step="any" value="${isNew ? '' : ptsBal(p)}" class="big" placeholder="0">
    <label>會員編號（可不填，只記末幾碼也行）</label><input id="e-mem" value="${esc(v.member || '')}">
    <p class="hint">改「現在有幾點」不會動到下面的紀錄，只會把起始點數調整到對。</p>
    <p class="err" id="e-err"></p>
    ${isNew ? '' : '<div class="btns"><button class="danger" id="e-del">刪除這個航空公司</button></div>'}`);
  $('#e-cancel').onclick = () => isNew ? (closeSheet(), renderMoney()) : openProg(p);
  $('#e-save').onclick = () => {
    const airline = $('#e-air').value.trim(), bal = parseFloat($('#e-bal').value) || 0;
    if (!airline) return $('#e-err').textContent = '請寫航空公司';
    const prog = p || { id: uid(), init: 0, log: [] };
    prog.airline = airline; prog.member = $('#e-mem').value.trim();
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
function confirmDel(msg) { const b = $('#sheet .danger'); if (b && b.dataset.sure) return true; if (b) { b.dataset.sure = 1; b.textContent = '再按一次確定刪除'; } toast(msg); return false; }
function editLog(p, l) {
  const isNew = !l, v = l || { value: '', date: ymd(new Date()), note: '' };
  let sign = v.value < 0 ? -1 : 1;
  openSheet(`<div class="shead"><button class="txt" id="l-cancel">取消</button><b>${isNew ? '記一筆點數' : '修改紀錄'}</b><button class="txt strong" id="l-save">儲存</button></div>
    <div class="seg seg2" id="l-sign"><button type="button" data-s="1" class="${sign > 0 ? 'on' : ''}">賺到</button><button type="button" data-s="-1" class="${sign < 0 ? 'on' : ''}">用掉／兌換</button></div>
    <label>幾點</label><input id="l-val" type="number" inputmode="decimal" step="any" value="${v.value ? Math.abs(v.value) : ''}" class="big">
    <label>日期</label><input id="l-date" type="date" value="${v.date}">
    <label>備註</label><input id="l-note" value="${esc(v.note || '')}" placeholder="例如：搭機累積、換機票">
    <p class="err" id="l-err"></p>${isNew ? '' : '<div class="btns"><button class="danger" id="l-del">刪除</button></div>'}`);
  $('#l-sign').onclick = e => { const b = e.target.closest('button'); if (!b) return; sign = +b.dataset.s;
    $('#l-sign').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); };
  $('#l-cancel').onclick = () => openProg(p);
  $('#l-save').onclick = () => {
    const n = parseFloat($('#l-val').value); if (!(n > 0)) return $('#l-err').textContent = '請填點數';
    const row = l || { id: uid(), src: 'manual' };
    Object.assign(row, { value: sign * n, date: $('#l-date').value || ymd(new Date()), note: $('#l-note').value.trim() });
    if (isNew) p.log.push(row); save(); toast('已記錄'); openProg(p);
  };
  if (!isNew) $('#l-del').onclick = () => { p.log = p.log.filter(z => z !== l); save(); toast('已刪除'); openProg(p); };
}

// ---------- 保險頁 ----------
function renderIns() {
  const list = INS().slice().sort((a, b) => (a.start || '') < (b.start || '') ? 1 : -1);
  const year = list.reduce((s, i) => s + insYear(i), 0);
  let h = `<div class="card"><div class="mgrid2"><div><span>每年保費合計</span><b>${money(year)}</b></div><div><span>平均每月</span><b>${money(year / 12)}</b></div></div>
    <p class="hint">${list.length} 張保單（含附約；躉繳不算進每年）</p></div>`;
  h += list.map(i => {
    const pr = i.promo || {}, due = pr.points && i.start && pr.months ? addMonths(i.start, +pr.months) : '';
    const promo = pr.points ? (pr.logId ? `<em class="tag ok">✈️ ${num1(pr.points)} 點已存入</em>` : `<em class="tag">✈️ ${due ? due + ' 可得' : '可得'} ${num1(pr.points)} 點</em>`) : '';
    return `<button class="pcard" data-ins="${i.id}"><span class="pc-top"><span class="pc-ic">🛡️</span><span class="pc-n">${esc(i.name)}<small>${[i.company, i.insured && '被保險人 ' + i.insured].filter(Boolean).map(esc).join('・')}</small></span><span class="chev">›</span></span>
      <span class="pc-row"><b>${money(i.premium || 0)}</b><small>／${freqName(i.freq)}${(i.riders || []).length ? `＋附約 ${i.riders.length}` : ''}</small><span class="sp"></span><small>${i.start ? i.start + ' 開始' : ''}</small></span>
      ${promo || pr.weeks ? `<span class="pc-row">${promo}${pr.weeks ? `<em class="tag">🎁 ${pr.weeks} 週免費</em>` : ''}</span>` : ''}</button>`;
  }).join('');
  if (!list.length) h += '<p class="empty">還沒有保單，按下面「＋ 新增保單」。</p>';
  h += '<div class="btns"><button class="primary" id="ins-add">＋ 新增保單</button></div>';
  $('#money-ins').innerHTML = h;
  $('#ins-add').onclick = () => editIns(null);
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
      <label>繳費方式</label><div class="seg seg5" id="i-freq">${FREQ.map(([k, n]) => `<button type="button" data-f="${k}" class="${v.freq === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="fsec">附約 <button class="txt strong" id="i-addr" type="button">＋ 新增附約</button></div>
      ${v.riders.map((r, n) => `<div class="rider"><input class="r-n" value="${esc(r.name)}" placeholder="附約名稱"><input class="r-p" type="number" inputmode="decimal" step="0.01" value="${r.premium}" placeholder="保費"><button type="button" class="r-x" data-n="${n}" aria-label="刪除附約">✕</button></div>`).join('')
        || '<p class="hint" style="margin-top:0">沒有附約就不用填。附約保費跟主約一樣的繳費方式。</p>'}
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
