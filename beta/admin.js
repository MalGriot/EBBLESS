// EBBLESS admin: browse and lightly edit the beta Google Sheet.
// Talks only to the worker's /admin/* routes (worker/src/admin.js), which
// need the ADMIN_TOKEN secret. Nothing here is secret; the token is typed in
// and kept in sessionStorage (or localStorage with "Remember").
// Every value from the Sheet is untrusted (it's what people typed into the
// signup form), so it is only ever set with textContent.
(function(){
  const BACKENDS = {
    prod: 'https://spotify-youtube-search.malgriot.workers.dev',
    staging: 'https://spotify-youtube-search-staging.malgriot.workers.dev',
    local: 'http://localhost:8787',
  };
  const LS_BACKEND = 'ebbless_beta_backend';   // shared with the other beta pages
  const K_TOKEN = 'ebbless_admin_token';
  const K_TAB = 'ebbless_admin_tab';
  const K_COLS = 'ebbless_admin_cols:';
  const K_SORT = 'ebbless_admin_sort:';
  const store = (s) => ({
    get(k){ try { return s.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch(e){} },
  });
  let ls, ss;
  try { ls = store(localStorage); } catch(e){ ls = { get(){ return null; }, set(){} }; }
  try { ss = store(sessionStorage); } catch(e){ ss = { get(){ return null; }, set(){} }; }

  const q = new URLSearchParams(location.search);
  const qb = q.get('backend');
  if (qb && BACKENDS[qb]) ls.set(LS_BACKEND, qb === 'prod' ? null : qb);
  const which = BACKENDS[ls.get(LS_BACKEND)] ? ls.get(LS_BACKEND) : 'prod';
  const BACKEND = BACKENDS[which];

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function status(node, text, kind){ node.textContent = text || ''; node.className = 'status' + (kind ? ' ' + kind : ''); }

  // ---------- tabs and columns ----------

  const TABS = {
    Testers: {
      key: 'tester_id', statusCol: 'tester_status', noun: 'testers',
      defaults: ['name', 'tester_number', 'email', 'tester_status', 'last_active', 'sessions', 'feedback_count', 'bug_count', 'notes'],
      title: r => r.name || r.tester_number || r.tester_id, label: r => r.tester_number || '',
    },
    Applicants: {
      key: 'applicant_id', statusCol: 'applicant_status', noun: 'applicants',
      defaults: ['name', 'applicant_id', 'email', 'applicant_status', 'signup_timestamp', 'device', 'music_platform', 'tester_number', 'notes'],
      title: r => r.name || r.applicant_id, label: r => r.applicant_id || '',
    },
  };
  const NICE = { feedback_count: 'feedback', bug_count: 'bugs', exclude_from_analytics: 'exclude from analytics' };
  const nice = (k) => NICE[k] || k.replace(/_/g, ' ');

  const state = {
    data: null, editable: {}, cap: 50,
    tab: TABS[ls.get(K_TAB)] ? ls.get(K_TAB) : 'Testers',
    search: '', filter: '', sortCol: '', sortDir: 1,
    rows: [], cols: [], detailId: null,
  };

  function tabRows(name){ const t = state.data && state.data.tabs[name]; return t ? t.rows : []; }
  function tabHeaders(name){ const t = state.data && state.data.tabs[name]; return t ? t.headers : []; }
  function index(rows, key){ const m = new Map(); rows.forEach(r => { if (r[key] !== '' && r[key] != null) m.set(String(r[key]), r); }); return m; }
  function countBy(rows, key){ const m = new Map(); rows.forEach(r => { const k = String(r[key] || ''); m.set(k, (m.get(k) || 0) + 1); }); return m; }

  // Rows for the current tab, each joined with the other tabs it points at.
  // cols: [{ key, src }] in sheet order, base tab first.
  function build(){
    const name = state.tab, cols = [], seen = new Set();
    const add = (key, src) => { if (!seen.has(key)) { seen.add(key); cols.push({ key, src }); } };
    tabHeaders(name).forEach(h => add(h, name));
    const apps = index(tabRows('Applicants'), 'applicant_id');
    let rows;
    if (name === 'Testers') {
      const ana = index(tabRows('Analytics'), 'tester_id');
      const fb = countBy(tabRows('Feedback'), 'tester_id'), bugs = countBy(tabRows('Bug Reports'), 'tester_id');
      tabHeaders('Applicants').forEach(h => add(h, 'Applicants'));
      tabHeaders('Analytics').filter(h => h !== 'active_days').forEach(h => add(h, 'Analytics'));
      add('feedback_count', 'computed'); add('bug_count', 'computed');
      rows = tabRows('Testers').map(t => {
        const r = {};
        const a = apps.get(String(t.applicant_id)) || {}, n = ana.get(String(t.tester_id)) || {};
        cols.forEach(c => { r[c.key] = c.src === 'Applicants' ? a[c.key] : c.src === 'Analytics' ? n[c.key] : t[c.key]; });
        r.feedback_count = fb.get(String(t.tester_id)) || 0;
        r.bug_count = bugs.get(String(t.tester_id)) || 0;
        r._base = t;
        return r;
      });
    } else {
      const testers = index(tabRows('Testers'), 'applicant_id');
      add('tester_number', 'Testers'); add('tester_status', 'Testers');
      rows = tabRows('Applicants').map(a => {
        const t = testers.get(String(a.applicant_id)) || {};
        const r = {};
        cols.forEach(c => { r[c.key] = c.src === 'Testers' ? t[c.key] : a[c.key]; });
        r._base = a;
        return r;
      });
    }
    state.rows = rows;
    state.cols = cols;
  }

  // Saved column choice for this tab: [{ key, on }] in display order.
  function colPrefs(){
    const avail = state.cols.map(c => c.key);
    let saved = null;
    try { saved = JSON.parse(ls.get(K_COLS + state.tab) || 'null'); } catch(e){}
    if (!Array.isArray(saved)) {
      const d = TABS[state.tab].defaults.filter(k => avail.includes(k));
      return d.map(key => ({ key, on: true })).concat(avail.filter(k => !d.includes(k)).map(key => ({ key, on: false })));
    }
    const out = saved.filter(p => p && avail.includes(p.key)).map(p => ({ key: p.key, on: !!p.on }));
    avail.forEach(k => { if (!out.some(p => p.key === k)) out.push({ key: k, on: false }); });
    return out;
  }
  function saveColPrefs(prefs){ ls.set(K_COLS + state.tab, JSON.stringify(prefs)); }
  const visibleCols = () => colPrefs().filter(p => p.on).map(p => p.key);

  // ---------- values ----------

  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  const pad = (n) => String(n).padStart(2, '0');
  function fmt(v){
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    if (v == null || v === '') return '';
    if (typeof v === 'string' && ISO.test(v)) {
      const d = new Date(v);
      if (!isNaN(d)) return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return String(v);
  }
  function cmp(a, b){
    const ea = a == null || a === '', eb = b == null || b === '';
    if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;   // blanks last either way
    const na = typeof a === 'number' ? a : (/^-?\d+(\.\d+)?$/.test(String(a)) ? Number(a) : NaN);
    const nb = typeof b === 'number' ? b : (/^-?\d+(\.\d+)?$/.test(String(b)) ? Number(b) : NaN);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }
  // A value cell: status pills, links for http(s) URLs, plain text otherwise.
  function valueNode(key, v){
    const s = fmt(v);
    if (key === 'tester_status' || key === 'applicant_status') {
      return el('span', 'pill' + (s === 'Active' || s === 'Accepted' ? ' on' : s === 'Inactive' || s === 'Rejected' ? ' off' : ''), s || '-');
    }
    if (typeof v === 'string' && /^https?:\/\/\S+$/.test(v)) {
      const a = el('a', null, s);
      a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.addEventListener('click', e => e.stopPropagation());
      return a;
    }
    return el('span', s ? null : 'muted', s || '-');
  }

  // ---------- table ----------

  function filtered(){
    const term = state.search.trim().toLowerCase();
    const sc = TABS[state.tab].statusCol;
    let rows = state.rows.filter(r => !state.filter || String(r[sc] || '') === state.filter);
    if (term) rows = rows.filter(r => Object.keys(r).some(k => k !== '_base' && fmt(r[k]).toLowerCase().includes(term)));
    if (state.sortCol) rows = rows.slice().sort((a, b) => {
      const c = cmp(a[state.sortCol], b[state.sortCol]);
      const blank = a[state.sortCol] == null || a[state.sortCol] === '' || b[state.sortCol] == null || b[state.sortCol] === '';
      return blank ? c : c * state.sortDir;
    });
    return rows;
  }

  function renderTabs(){
    const box = $('tabs');
    box.textContent = '';
    Object.keys(TABS).forEach(name => {
      const b = el('button', 'adm-tab', name);
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(name === state.tab));
      b.appendChild(el('span', 'n tnum', String(tabRows(name).length)));
      b.addEventListener('click', () => { if (name !== state.tab) switchTab(name); });
      box.appendChild(b);
    });
  }

  function renderToolbar(){
    const t = TABS[state.tab], f = $('filter');
    const opts = (state.editable[state.tab] && state.editable[state.tab].cols[t.statusCol] || {}).options || [];
    f.textContent = '';
    f.appendChild(new Option('All ' + t.noun, ''));
    opts.forEach(o => f.appendChild(new Option(o, o)));
    if (!opts.includes(state.filter)) state.filter = '';
    f.value = state.filter;
    const s = $('sortCol');
    s.textContent = '';
    s.appendChild(new Option('Sheet order', ''));
    state.cols.forEach(c => s.appendChild(new Option('Sort: ' + nice(c.key), c.key)));
    s.value = state.sortCol;
    $('sortDir').textContent = state.sortDir > 0 ? 'Asc' : 'Desc';
    $('sortDir').disabled = !state.sortCol;
  }

  function renderStats(){
    const testers = tabRows('Testers'), apps = tabRows('Applicants');
    const active = testers.filter(t => t.tester_status === 'Active').length;
    const items = [
      [active + ' / ' + state.cap, 'active testers'],
      [String(testers.length - active), 'inactive'],
      [String(apps.filter(a => a.applicant_status === 'Pending').length), 'pending applicants'],
      [String(tabRows('Feedback').length), 'feedback'],
      [String(tabRows('Bug Reports').length), 'bug reports'],
    ];
    const box = $('stats');
    box.textContent = '';
    items.forEach(([v, l]) => { const d = el('div', 'adm-stat'); d.appendChild(el('b', null, v)); d.appendChild(el('span', null, l)); box.appendChild(d); });
  }

  function renderTable(){
    const cols = visibleCols(), rows = filtered(), key = TABS[state.tab].key;
    const thead = $('table').tHead, tbody = $('table').tBodies[0];
    thead.textContent = ''; tbody.textContent = '';
    const hr = thead.insertRow();
    cols.forEach(k => {
      const th = el('th', k === state.sortCol ? 'sorted' : null, nice(k) + (k === state.sortCol ? (state.sortDir > 0 ? ' ↑' : ' ↓') : ''));
      th.scope = 'col';
      th.addEventListener('click', () => {
        if (state.sortCol === k) state.sortDir = -state.sortDir; else { state.sortCol = k; state.sortDir = 1; }
        saveSort(); renderToolbar(); renderTable();
      });
      hr.appendChild(th);
    });
    rows.forEach(r => {
      const tr = tbody.insertRow();
      tr.tabIndex = 0;
      cols.forEach(k => { const td = tr.insertCell(); td.dataset.label = nice(k); td.appendChild(valueNode(k, r[k])); });
      const open = () => openDetail(String(r._base[key]));
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    $('empty').hidden = rows.length > 0;
    $('count').textContent = rows.length === state.rows.length ? rows.length + ' ' + TABS[state.tab].noun : rows.length + ' of ' + state.rows.length + ' ' + TABS[state.tab].noun;
  }

  function renderCols(){
    const list = $('colsList'), prefs = colPrefs();
    const src = new Map(state.cols.map(c => [c.key, c.src]));
    list.textContent = '';
    prefs.forEach((p, i) => {
      const li = el('li');
      const lab = el('label');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = p.on;
      cb.addEventListener('change', () => { prefs[i].on = cb.checked; saveColPrefs(prefs); renderTable(); });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, nice(p.key)));
      if (src.get(p.key) !== state.tab) lab.appendChild(el('span', 'src', src.get(p.key) === 'computed' ? 'count' : src.get(p.key)));
      li.appendChild(lab);
      [['↑', -1], ['↓', 1]].forEach(([sym, d]) => {
        const b = el('button', 'adm-mv', sym); b.type = 'button';
        b.setAttribute('aria-label', 'Move ' + nice(p.key) + (d < 0 ? ' up' : ' down'));
        b.disabled = i + d < 0 || i + d >= prefs.length;
        b.addEventListener('click', () => {
          const [m] = prefs.splice(i, 1); prefs.splice(i + d, 0, m);
          saveColPrefs(prefs); renderCols(); renderTable();
          const again = $('colsList').children[i + d]; if (again) again.querySelectorAll('.adm-mv')[d < 0 ? 0 : 1].focus();
        });
        li.appendChild(b);
      });
      list.appendChild(li);
    });
  }

  function saveSort(){ ls.set(K_SORT + state.tab, JSON.stringify({ col: state.sortCol, dir: state.sortDir })); }
  function loadSort(){
    let s = null;
    try { s = JSON.parse(ls.get(K_SORT + state.tab) || 'null'); } catch(e){}
    state.sortCol = s && state.cols.some(c => c.key === s.col) ? s.col : '';
    state.sortDir = s && s.dir < 0 ? -1 : 1;
  }

  function renderAll(){ build(); loadSort(); renderStats(); renderTabs(); renderToolbar(); renderTable(); if (!$('colsPanel').hidden) renderCols(); }
  function switchTab(name){ state.tab = name; state.filter = ''; ls.set(K_TAB, name); renderAll(); }

  // ---------- detail ----------

  function findRow(id){ return state.rows.find(r => String(r._base[TABS[state.tab].key]) === id); }

  function kvList(pairs, editableFor){
    const dl = el('dl', 'adm-kv');
    pairs.forEach(([k, v]) => {
      dl.appendChild(el('dt', null, nice(k)));
      const dd = el('dd');
      if (editableFor && editableFor.cols[k]) dd.appendChild(editableCell(k, v, editableFor.cols[k]));
      else dd.appendChild(valueNode(k, v));
      dl.appendChild(dd);
    });
    return dl;
  }
  function section(title, child){
    const s = el('section', 'adm-sec');
    s.appendChild(el('h3', null, title));
    s.appendChild(child);
    return s;
  }

  function openDetail(id){
    state.detailId = id;
    const r = findRow(id);
    if (!r) { closeDetail(); return; }
    const t = TABS[state.tab], base = r._base, body = $('detailBody');
    $('detailLabel').textContent = t.label(base);
    $('detailTitle').textContent = t.title(base);
    body.textContent = '';
    const editable = state.editable[state.tab];
    body.appendChild(section(state.tab === 'Testers' ? 'Tester' : 'Application', kvList(tabHeaders(state.tab).map(h => [h, base[h]]), editable)));
    if (state.tab === 'Testers') {
      const app = tabRows('Applicants').find(a => String(a.applicant_id) === String(base.applicant_id));
      if (app) body.appendChild(section('Application', kvList(tabHeaders('Applicants').filter(h => !['name', 'email', 'applicant_id'].includes(h)).map(h => [h, app[h]]))));
      const ana = tabRows('Analytics').find(a => String(a.tester_id) === String(base.tester_id));
      body.appendChild(section('Usage', ana ? kvList(tabHeaders('Analytics').filter(h => !['tester_id', 'tester_number', 'active_days'].includes(h)).map(h => [h, ana[h]])) : el('p', 'adm-none', 'Hasn\'t opened the app yet (or excluded from analytics).')));
      body.appendChild(reports('Feedback', 'feedback_id', base.tester_id, ['category', 'first_impression', 'what_happened']));
      body.appendChild(reports('Bug Reports', 'bug_id', base.tester_id, ['area', 'what_went_wrong']));
    } else {
      const tester = tabRows('Testers').find(x => String(x.applicant_id) === String(base.applicant_id));
      if (tester) body.appendChild(section('Tester', kvList(['tester_number', 'tester_status', 'accepted_timestamp'].map(h => [h, tester[h]]))));
    }
    $('scrim').hidden = false;
    const d = $('detail');
    if (d.hidden) { d.hidden = false; $('detailClose').focus(); status($('detailStatus'), ''); }
    document.body.style.overflow = 'hidden';
  }
  function closeDetail(){
    state.detailId = null;
    $('detail').hidden = true; $('scrim').hidden = true;
    document.body.style.overflow = '';
  }

  // A tester's Feedback / Bug Reports rows, newest first, each expandable.
  function reports(tab, idKey, testerId, summaryKeys){
    const rows = tabRows(tab).filter(r => String(r.tester_id) === String(testerId))
      .sort((a, b) => String(b.submitted_timestamp || '').localeCompare(String(a.submitted_timestamp || '')));
    const box = el('div');
    if (!rows.length) box.appendChild(el('p', 'adm-none', 'None yet.'));
    const skip = new Set(['tester_id', 'tester_number', idKey]);
    rows.forEach(r => {
      const det = el('details', 'adm-item');
      const sum = el('summary');
      const firstText = summaryKeys.map(k => r[k]).find(v => v) || '';
      sum.appendChild(el('span', null, (r[idKey] || '') + (firstText ? ': ' + String(firstText).slice(0, 80) : '')));
      sum.appendChild(el('span', 'when', fmt(r.submitted_timestamp)));
      det.appendChild(sum);
      det.appendChild(kvList(tabHeaders(tab).filter(h => !skip.has(h) && r[h] !== '' && r[h] != null).map(h => [h, r[h]])));
      box.appendChild(det);
    });
    return section(tab + ' (' + rows.length + ')', box);
  }

  // ---------- editing ----------

  function warning(col, value){
    if (col === 'applicant_status' && value === 'Accepted') return 'Accepting creates their tester record and emails them the invite.';
    if (col === 'tester_status' && value === 'Inactive') return 'Their tester link stops working.';
    if (col === 'tester_status' && value === 'Active') return 'Their link works again (only if there\'s room under ' + state.cap + ').';
    return '';
  }

  function editableCell(col, value, spec){
    const wrap = el('div');
    const show = () => {
      wrap.textContent = '';
      const row = el('div', 'adm-edit-row');
      const v = el('div', 'val'); v.appendChild(valueNode(col, value));
      const b = el('button', 'btn sm', 'Edit'); b.type = 'button';
      b.setAttribute('aria-label', 'Edit ' + nice(col));
      b.addEventListener('click', edit);
      row.appendChild(v); row.appendChild(b);
      wrap.appendChild(row);
    };
    const edit = () => {
      wrap.textContent = '';
      const form = el('div', 'adm-edit');
      let input, read;
      if (spec.options) {
        input = el('select');
        const opts = spec.options.includes(value) ? spec.options : [String(value || '')].concat(spec.options);
        opts.forEach(o => input.appendChild(new Option(o || '(blank)', o)));
        input.value = String(value || '');
        read = () => input.value;
      } else if (spec.bool) {
        const lab = el('label', 'check');
        input = el('input'); input.type = 'checkbox'; input.checked = value === true;
        lab.appendChild(input); lab.appendChild(el('span', null, nice(col)));
        form.appendChild(lab);
        read = () => input.checked;
      } else {
        input = col === 'notes' ? el('textarea') : el('input');
        if (col !== 'notes') input.type = spec.email ? 'email' : 'text';
        input.value = value == null ? '' : String(value);
        if (spec.max) input.maxLength = spec.max;
        read = () => input.value.trim();
      }
      if (!spec.bool) form.appendChild(input);
      const warn = el('p', 'adm-warn');
      const upd = () => { warn.textContent = warning(col, read()); };
      input.addEventListener('change', upd); upd();
      form.appendChild(warn);
      const btns = el('div', 'btns');
      const save = el('button', 'btn sm primary', 'Save'); save.type = 'button';
      const cancel = el('button', 'btn sm', 'Cancel'); cancel.type = 'button';
      cancel.addEventListener('click', () => { status($('detailStatus'), ''); show(); });
      save.addEventListener('click', async () => {
        const next = read();
        const same = spec.bool ? next === (value === true) : String(next) === String(value == null ? '' : value);
        if (same) { show(); return; }
        const who = TABS[state.tab].title(findRow(state.detailId)._base);
        const msg = 'Change ' + nice(col) + ' for ' + who + '?\n\nFrom: ' + (fmt(value) || '(blank)') + '\nTo: ' + (fmt(next) || '(blank)') + (warning(col, next) ? '\n\n' + warning(col, next) : '');
        if (!confirm(msg)) return;
        save.disabled = cancel.disabled = true; save.textContent = 'Saving...';
        try {
          const out = await api('/admin/update', { tab: state.tab, id: state.detailId, column: col, value: next, prev: value == null ? '' : value });
          applyRecord(out.record);
          status($('detailStatus'), 'Saved to the Sheet.' + (out.message ? ' ' + out.message : ''), 'ok');
          // Accepting adds a Testers row; reactivating may be reverted: reload everything.
          if (col.endsWith('_status')) await load(true);
          else renderAll();
          if (state.detailId) openDetail(state.detailId);
        } catch (e) {
          status($('detailStatus'), e.message + (e.data && 'current' in e.data ? ' Current value in the Sheet: ' + (fmt(e.data.current) || '(blank)') + '.' : ''), 'err');
          save.disabled = cancel.disabled = false; save.textContent = 'Save';
        }
      });
      btns.appendChild(save); btns.appendChild(cancel);
      form.appendChild(btns);
      wrap.appendChild(form);
      input.focus();
    };
    show();
    return wrap;
  }

  function applyRecord(rec){
    if (!rec) return;
    const key = TABS[state.tab].key, rows = tabRows(state.tab);
    const i = rows.findIndex(r => String(r[key]) === String(rec[key]));
    if (i >= 0) rows[i] = rec;
  }

  // ---------- network / auth ----------

  function getToken(){ return ss.get(K_TOKEN) || ls.get(K_TOKEN) || ''; }
  function setToken(t, remember){
    ss.set(K_TOKEN, null); ls.set(K_TOKEN, null);
    if (t) (remember ? ls : ss).set(K_TOKEN, t);
  }

  async function api(path, body){
    let res;
    try {
      res = await fetch(BACKEND + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: Object.assign({ Authorization: 'Bearer ' + getToken() }, body === undefined ? {} : { 'Content-Type': 'application/json' }),
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
    } catch(e){ throw new Error('Couldn\'t reach the worker. Check your connection.'); }
    let data = {};
    try { data = await res.json(); } catch(e){}
    if (res.status === 401) { setToken(null); showLogin('That token didn\'t work. Paste it again.'); }
    if (!res.ok) throw Object.assign(new Error(data.error || ('Something broke (HTTP ' + res.status + ').')), { status: res.status, data });
    return data;
  }

  async function load(quiet){
    if (!quiet) status($('mainStatus'), 'Loading the Sheet...');
    $('refreshBtn').disabled = true;
    try {
      const out = await api('/admin/testers');
      state.data = { tabs: out.tabs || {} };
      state.editable = out.editable || {};
      state.cap = out.cap || 50;
      $('login').hidden = true; $('app').hidden = false;
      $('refreshBtn').hidden = false; $('lockBtn').hidden = false;
      status($('mainStatus'), '');
      renderAll();
      return true;
    } catch(e){
      if (e.status !== 401) status($('mainStatus'), e.message, 'err');
      return false;
    } finally { $('refreshBtn').disabled = false; }
  }

  function showLogin(msg){
    closeDetail();
    state.data = null;
    $('app').hidden = true; $('login').hidden = false;
    $('refreshBtn').hidden = true; $('lockBtn').hidden = true;
    status($('mainStatus'), '');
    status($('loginStatus'), msg || '', msg ? 'err' : '');
    $('tokenInput').value = '';
    $('tokenInput').focus();
  }

  // ---------- wiring ----------

  if (which !== 'prod') $('backendTag').textContent = 'Admin · ' + which;

  $('loginBtn').addEventListener('click', async () => {
    const t = $('tokenInput').value.trim();
    if (!t) { status($('loginStatus'), 'Paste the token first.', 'err'); return; }
    setToken(t, $('rememberInput').checked);
    $('loginBtn').disabled = true;
    status($('loginStatus'), 'Checking...');
    const ok = await load(true);
    $('loginBtn').disabled = false;
    if (ok) $('tokenInput').value = '';
    else if (getToken()) status($('loginStatus'), $('mainStatus').textContent || 'Couldn\'t load.', 'err');
  });
  $('tokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
  $('lockBtn').addEventListener('click', () => { setToken(null); showLogin(''); });
  $('refreshBtn').addEventListener('click', async () => { await load(); if (state.detailId) openDetail(state.detailId); });

  let searchT = 0;
  $('search').addEventListener('input', e => { clearTimeout(searchT); searchT = setTimeout(() => { state.search = e.target.value; renderTable(); }, 120); });
  $('filter').addEventListener('change', e => { state.filter = e.target.value; renderTable(); });
  $('sortCol').addEventListener('change', e => { state.sortCol = e.target.value; state.sortDir = 1; saveSort(); renderToolbar(); renderTable(); });
  $('sortDir').addEventListener('click', () => { state.sortDir = -state.sortDir; saveSort(); renderToolbar(); renderTable(); });
  $('colsBtn').addEventListener('click', () => {
    const p = $('colsPanel'); p.hidden = !p.hidden;
    $('colsBtn').setAttribute('aria-expanded', String(!p.hidden));
    if (!p.hidden) renderCols();
  });
  $('colsReset').addEventListener('click', () => { ls.set(K_COLS + state.tab, null); renderCols(); renderTable(); });
  $('detailClose').addEventListener('click', closeDetail);
  $('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('detail').hidden) closeDetail(); });

  if (getToken()) load(); else showLogin('');
})();
