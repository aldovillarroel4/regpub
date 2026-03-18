/* app.js - Registro de personas con persistencia en localStorage
   Added an Activity view mode with editable activity fields per person.
*/
const LS_KEY = 'people_registry_v1';
const BANNER_TITLE_KEY = 'people_registry_banner_title_v1';

const $ = sel => document.querySelector(sel);
const tbody = $('#tbody');
const addBtn = $('#addPersonBtn');

const exportBtn = $('#exportBtn');
const importBtn = $('#importBtn');
const importFile = $('#importFile');
const backupBtn = $('#backupBtn');
const backupMenu = $('#backupMenu');
const modal = $('#modal');
const closeModal = $('#closeModal');
const cancelBtn = $('#cancelBtn');
const form = $('#personForm');
const personId = $('#personId');
const searchInput = $('#search');
const clearSearchBtn = $('#clearSearchBtn');
const actividadBtn = $('#actividadBtn');
const registroBtn = $('#registroBtn');

let people = load();
let activityMode = false; // false = normal registry, true = activity view
// track currently selected person's id so options bar can react reliably
let selectedId = null;

// per-column filters for registry view: keys are COLUMN_KEYS entries -> string filter (case-insensitive)
let columnFilters = {};

// date range controls for activity expanded view
let activityRangeActive = false;
let activityRangeFrom = null; // YYYY-MM
let activityRangeTo = null;   // YYYY-MM

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return [];}
}

function save(){
  localStorage.setItem(LS_KEY, JSON.stringify(people));
}

/* Persist column widths separately for registry and activity views */
const COLS_KEY_REG = 'people_registry_cols_registry_v1';
const COLS_KEY_ACT = 'people_registry_cols_activity_v1';
function getColsKey(){
  // use activityMode global to choose correct storage key
  return activityMode ? COLS_KEY_ACT : COLS_KEY_REG;
}
function saveColWidths(){
  const cols = Array.from(document.querySelectorAll('#cols col')).map(c => c.style.width || c.getAttribute('style') || '');
  try{
    localStorage.setItem(getColsKey(), JSON.stringify(cols));
  }catch(e){}
}
function loadColWidths(){
  try{
    const raw = localStorage.getItem(getColsKey());
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

/* column mapping in table order for sorting (only used in registry view) */
const COLUMN_KEYS = [
  'congName', 'firstName', 'lastNameP', 'lastNameM', 'group', 'privilege',
  'designation', 'sex', 'esp', 'birthDate', 'baptismDate', 'address', 'phone', 'emergencyContact'
];

// Activity view column keys (used for per-column filtering in activity mode)
const ACT_COLUMN_KEYS = [
  'congName',       // 0
  'activityMonth',  // 1 (month selector / derived from activities._lastMonth)
  'group',          // 2
  'privilege',      // 3
  'designation',    // 4
  'aux',            // 5 (boolean inside activities)
  'hours',          // 6 (inside activities)
  'studies',        // 7 (inside activities)
  'comments'        // 8 (inside activities)
];

/* current sort state */
let sortState = { idx: null, dir: 1 }; // dir: 1 asc, -1 desc

function openModal(mode='add', data=null){
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if(mode === 'add'){
    $('#modalTitle').textContent = 'Agregar Persona';
    form.reset();
    personId.value = '';
  } else {
    $('#modalTitle').textContent = 'Editar Persona';
    personId.value = data.id;
    $('#congName').value = data.congName || '';
    $('#firstName').value = data.firstName || '';
    $('#lastNameP').value = data.lastNameP || '';
    $('#lastNameM').value = data.lastNameM || '';
    $('#group').value = data.group || '';
    $('#privilege').value = data.privilege || '';
    $('#designation').value = data.designation || '';
    $('#sex').value = data.sex || '';
    $('#esp').value = data.esp || '';
    $('#birthDate').value = data.birthDate || '';
    $('#baptismDate').value = data.baptismDate || '';
    $('#address').value = data.address || '';
    $('#phone').value = data.phone || '';
    $('#emergencyContact').value = data.emergencyContact || '';
  }
  $('#firstName').focus();
}

function close(){
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

/* sorts people array by column index (toggles asc/desc if same column clicked) */
function sortByColumn(idx){
  if(typeof idx !== 'number' || idx < 0 || idx >= COLUMN_KEYS.length) return;
  if(sortState.idx === idx){
    sortState.dir = -sortState.dir; // toggle
  } else {
    sortState.idx = idx;
    sortState.dir = 1;
  }

  const key = COLUMN_KEYS[idx];
  people.sort((a,b) => {
    let va = a[key] ?? '';
    let vb = b[key] ?? '';
    // normalize for comparison
    // for dates, compare actual date values so sorting is chronological (empty last)
    if(key === 'birthDate' || key === 'baptismDate'){
      const da = va ? new Date(va) : null;
      const db = vb ? new Date(vb) : null;
      if((da && isNaN(da)) || (db && isNaN(db))){
        // fallback to string compare
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      } else {
        if(da === null && db === null) return 0;
        if(da === null) return 1 * sortState.dir; // empty go last
        if(db === null) return -1 * sortState.dir;
        return (da - db) * sortState.dir;
      }
    } else {
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
    }

    if(va < vb) return -1 * sortState.dir;
    if(va > vb) return 1 * sortState.dir;
    return 0;
  });

  save();
  render(searchInput.value);
}

/* Render table - supports normal registry and activity mode */
function render(filter=''){
  tbody.innerHTML = '';

  // adjust headers & colgroup depending on mode
  const theadRow = document.querySelector('#peopleTable thead tr');
  const colgroup = document.getElementById('cols');
  if(activityMode){
    // set headers for activity view (each header gets a filter button like in Registry)
    theadRow.innerHTML = `
      <th>Nombre (Cong.) <button class="col-filter" data-idx="0" title="Filtrar columna">🔍</button></th>
      <th>Fecha <button class="col-filter" data-idx="1" title="Filtrar columna">🔍</button></th>
      <th>Grupo <button class="col-filter" data-idx="2" title="Filtrar columna">🔍</button></th>
      <th>Privilegio <button class="col-filter" data-idx="3" title="Filtrar columna">🔍</button></th>
      <th>Designación <button class="col-filter" data-idx="4" title="Filtrar columna">🔍</button></th>
      <th>Aux. Mes <button class="col-filter" data-idx="5" title="Filtrar columna">🔍</button></th>
      <th>Horas <button class="col-filter" data-idx="6" title="Filtrar columna">🔍</button></th>
      <th>Estudios <button class="col-filter" data-idx="7" title="Filtrar columna">🔍</button></th>
      <th>Comentarios <button class="col-filter" data-idx="8" title="Filtrar columna">🔍</button></th>
    `;
    // ensure colgroup has 9 cols (added Privilegio)
    colgroup.innerHTML = '';
    const widths = ['240px','130px','100px','110px','130px','90px','90px','130px','220px'];
    widths.forEach(w => {
      const c = document.createElement('col');
      c.style.width = w;
      colgroup.appendChild(c);
    });
  } else {
    // restore original registry headers
    // registry headers with per-column filter buttons (only shown/used in registry mode)
    theadRow.innerHTML = `
      <th>Nombre (Cong.) <button class="col-filter" data-idx="0" title="Filtrar columna">🔍</button></th>
      <th>Nombre <button class="col-filter" data-idx="1" title="Filtrar columna">🔍</button></th>
      <th>Apellido Paterno <button class="col-filter" data-idx="2" title="Filtrar columna">🔍</button></th>
      <th>Apellido Materno <button class="col-filter" data-idx="3" title="Filtrar columna">🔍</button></th>
      <th>Grupo <button class="col-filter" data-idx="4" title="Filtrar columna">🔍</button></th>
      <th>Privilegio <button class="col-filter" data-idx="5" title="Filtrar columna">🔍</button></th>
      <th>Designación <button class="col-filter" data-idx="6" title="Filtrar columna">🔍</button></th>
      <th>Sexo <button class="col-filter" data-idx="7" title="Filtrar columna">🔍</button></th>
      <th>Esp <button class="col-filter" data-idx="8" title="Filtrar columna">🔍</button></th>
      <th>Fecha Nacimiento <button class="col-filter" data-idx="9" title="Filtrar columna">🔍</button></th>
      <th>Fecha Bautismo <button class="col-filter" data-idx="10" title="Filtrar columna">🔍</button></th>
      <th>Dirección <button class="col-filter" data-idx="11" title="Filtrar columna">🔍</button></th>
      <th>Teléfono <button class="col-filter" data-idx="12" title="Filtrar columna">🔍</button></th>
      <th>Contacto Emergencia <button class="col-filter" data-idx="13" title="Filtrar columna">🔍</button></th>
    `;
    // restore original colgroup sizing if none persisted
    colgroup.innerHTML = '';
    const original = ['160px','140px','160px','140px','100px','110px','140px','64px','64px','120px','120px','220px','120px','180px'];
    original.forEach(w => {
      const c = document.createElement('col');
      c.style.width = w;
      colgroup.appendChild(c);
    });
  }

  // restore saved col widths after adjusting columns
  const saved = loadColWidths();
  if(saved && saved.length){
    for(let i=0;i<colgroup.children.length && i<saved.length;i++){
      if(saved[i]) colgroup.children[i].style.width = saved[i];
    }
  }

  const q = filter.trim().toLowerCase();
  // base filtering by global search text
  let list = people.filter(p => {
    if(!q) return true;
    return [
      p.congName, p.firstName, p.lastNameP, p.lastNameM, p.group, p.privilege,
      p.designation, p.sex, p.esp, p.birthDate, p.baptismDate,
      p.address, p.phone, p.emergencyContact
    ].join(' ').toLowerCase().includes(q);
  });

  // apply per-column filters: support both registry and activity modes.
  if(Object.keys(columnFilters).length){
    for(const [key, val] of Object.entries(columnFilters)){
      if(!val) continue;
      const needle = String(val).trim().toLowerCase();

      list = list.filter(p => {
        // registry keys live on person object directly
        if(!activityMode){
          const v = (p[key] || '').toString().toLowerCase();
          return v.includes(needle);
        }

        // activityMode: handle activity-derived keys
        switch(key){
          case 'congName':
            return (p.congName || '').toString().toLowerCase().includes(needle);
          case 'activityMonth': {
            const m = (p.activities && p.activities._lastMonth) ? p.activities._lastMonth : new Date().toISOString().slice(0,7);
            return String(m).toLowerCase().includes(needle);
          }
          case 'group':
          case 'privilege':
          case 'designation':
            return ((p[key] || '') + '').toLowerCase().includes(needle);
          case 'aux': {
            // match 'true'/'false' or user-friendly values like 'sí' / 'si' / 'no'
            const actKey = (p.activities && p.activities._lastMonth) ? p.activities._lastMonth : new Date().toISOString().slice(0,7);
            const a = (p.activities && p.activities[actKey] && p.activities[actKey].aux) ? 'true' : 'false';
            // also allow matching 'si'/'sí' or 'no'
            const alt = a === 'true' ? 'si' : 'no';
            return a.includes(needle) || alt.indexOf(needle) !== -1;
          }
          case 'hours':
          case 'studies': {
            const actKey = (p.activities && p.activities._lastMonth) ? p.activities._lastMonth : new Date().toISOString().slice(0,7);
            const v = (p.activities && p.activities[actKey] && typeof p.activities[actKey][key] !== 'undefined') ? String(p.activities[actKey][key]) : '';
            return v.toLowerCase().includes(needle);
          }
          case 'comments': {
            const actKey = (p.activities && p.activities._lastMonth) ? p.activities._lastMonth : new Date().toISOString().slice(0,7);
            const v = (p.activities && p.activities[actKey] && p.activities[actKey].comments) ? p.activities[actKey].comments : '';
            return v.toString().toLowerCase().includes(needle);
          }
          default:
            // fallback to scanning person fields
            return Object.values(p).join(' ').toLowerCase().includes(needle);
        }
      });
    }
  }

  if(list.length === 0){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = activityMode ? 9 : 14;
    td.style.padding = '20px';
    td.style.textAlign = 'center';
    td.style.color = '#9aa0a6';
    td.textContent = 'No hay registros';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Helper: iterate months between from..to inclusive, format YYYY-MM
  function monthsBetween(from, to){
    const res = [];
    if(!from || !to) return res;
    const [yf,mf] = from.split('-').map(Number);
    const [yt,mt] = to.split('-').map(Number);
    let y = yf, m = mf;
    while(y < yt || (y === yt && m <= mt)){
      res.push(`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}`);
      m++;
      if(m > 12){ m = 1; y++; }
      if(y > yt + 5) break; // safety cap
    }
    return res;
  }

  list.forEach((p) => {
    // if there is an active range AND a search query present, expand each person into multiple rows (one per month)
    if(activityMode && activityRangeActive && searchInput.value.trim()){
      // determine months array from activityRangeFrom/to (fallback to lastMonth or current month if missing)
      const from = activityRangeFrom || p.activities && p.activities._lastMonth || new Date().toISOString().slice(0,7);
      const to = activityRangeTo || p.activities && p.activities._lastMonth || new Date().toISOString().slice(0,7);
      const months = monthsBetween(from, to);
      months.forEach(monthKey => {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        const act = (p.activities && p.activities[monthKey]) ? p.activities[monthKey] : { aux:false, hours:'', studies:'', comments:'' };
        tr.innerHTML = `
          <td class="cong-cell">${escapeHtml(p.congName || '')}</td>
          <td><input type="month" class="act-month" value="${escapeHtml(monthKey)}" style="width:100%"/></td>
          <td>${escapeHtml(p.group || '')}</td>
          <td>${escapeHtml(p.privilege || '')}</td>
          <td>${escapeHtml(p.designation || '')}</td>
          <td style="text-align:center"><input type="checkbox" class="act-aux" ${act.aux ? 'checked': ''} /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-hours num-input" value="${escapeHtml(act.hours || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-studies num-input" value="${escapeHtml(act.studies || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td><div contenteditable="true" class="act-comments" data-placeholder="Comentarios">${escapeHtml(act.comments || '')}</div></td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id; // attach id to row for easy lookup

      if(activityMode){
        // ensure an activities container exists on person
        if(!p.activities) p.activities = {}; // keyed by month (YYYY-MM)
        // use last selected month for this person if any, else current month
        const monthKey = p.activities._lastMonth || new Date().toISOString().slice(0,7);
        const act = p.activities[monthKey] || {
          aux:false, hours:'', studies:'', comments:''
        };

        tr.innerHTML = `
          <td class="cong-cell">${escapeHtml(p.congName || '')}</td>
          <td><input type="month" class="act-month" value="${escapeHtml(monthKey)}" style="width:100%"/></td>
          <td>${escapeHtml(p.group || '')}</td>
          <td>${escapeHtml(p.privilege || '')}</td>
          <td>${escapeHtml(p.designation || '')}</td>
          <td style="text-align:center"><input type="checkbox" class="act-aux" ${act.aux ? 'checked': ''} /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-hours num-input" value="${escapeHtml(act.hours || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-studies num-input" value="${escapeHtml(act.studies || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td><div contenteditable="true" class="act-comments" data-placeholder="Comentarios">${escapeHtml(act.comments || '')}</div></td>
        `;
      } else {
        const bAge = calcAge(p.birthDate);
        const baAge = calcAge(p.baptismDate);
        const birthHtml = escapeHtml(p.birthDate || '') + (bAge !== null ? ` <strong>(${bAge} años)</strong>` : '');
        const baptismHtml = escapeHtml(p.baptismDate || '') + (baAge !== null ? ` <strong>(${baAge} años)</strong>` : '');
        tr.innerHTML = `
          <td class="cong-cell">${escapeHtml(p.congName || '')}</td>
          <td>${escapeHtml(p.firstName)}</td>
          <td>${escapeHtml(p.lastNameP)}</td>
          <td>${escapeHtml(p.lastNameM || '')}</td>
          <td>${escapeHtml(p.group || '')}</td>
          <td>${escapeHtml(p.privilege || '')}</td>
          <td>${escapeHtml(p.designation || '')}</td>
          <td>${escapeHtml(p.sex || '')}</td>
          <td>${escapeHtml(p.esp || '')}</td>
          <td>${birthHtml}</td>
          <td>${baptismHtml}</td>
          <td>${escapeHtml(p.address || '')}</td>
          <td>${escapeHtml(p.phone || '')}</td>
          <td>${escapeHtml(p.emergencyContact || '')}</td>
        `;
      }

      tbody.appendChild(tr);
    }
  });

  // after rows inserted, attach single correct listeners for activity controls if in activityMode
  if(activityMode){
    tbody.querySelectorAll('tr').forEach(tr => {
      const id = tr.dataset.id;
      const p = people.find(x => x.id === id);
      if(!p) return;

      const monthInput = tr.querySelector('.act-month');
      const aux = tr.querySelector('.act-aux');
      const hours = tr.querySelector('.act-hours'); // input[type=number]
      const studies = tr.querySelector('.act-studies'); // input[type=number]
      const comments = tr.querySelector('.act-comments'); // contenteditable div

      // ensure activities container
      if(!p.activities) p.activities = {};
      // initialize lastMonth if absent
      if(!p.activities._lastMonth) p.activities._lastMonth = monthInput.value;

      function saveActivityFor(month){
        if(!p.activities) p.activities = {};
        p.activities._lastMonth = month;
        const cur = p.activities[month] || { aux:false, hours:'', studies:'', comments:'' };
        // read values live from DOM (inputs use .value)
        cur.aux = !!aux.checked;
        cur.hours = (hours && typeof hours.value !== 'undefined') ? String(hours.value).trim() : '';
        cur.studies = (studies && typeof studies.value !== 'undefined') ? String(studies.value).trim() : '';
        cur.comments = (comments && comments.textContent) ? comments.textContent.trim() : '';
        p.activities[month] = cur;
        save();
      }

      monthInput.addEventListener('change', (e) => {
        // save previous month state first
        const prevMonth = p.activities._lastMonth || e.target.value;
        saveActivityFor(prevMonth);
        // switch view to new month value
        const newM = e.target.value;
        p.activities._lastMonth = newM;
        const act = p.activities[newM] || { aux:false, hours:'', studies:'', comments:'' };
        aux.checked = !!act.aux;
        if(hours) hours.value = act.hours || '';
        if(studies) studies.value = act.studies || '';
        if(comments) comments.textContent = act.comments || '';
        save();
      });

      aux.addEventListener('change', () => {
        saveActivityFor(monthInput.value);
      });

      // inputs: live save (debounced) on number inputs
      [hours, studies].forEach(el => {
        if(!el) return;
        el.addEventListener('input', () => {
          clearTimeout(el._t);
          el._t = setTimeout(() => saveActivityFor(monthInput.value), 300);
        });
        el.addEventListener('change', () => saveActivityFor(monthInput.value));
        el.addEventListener('blur', () => saveActivityFor(monthInput.value));
      });

      // comments contenteditable handling
      if(comments){
        comments.addEventListener('input', () => {
          clearTimeout(comments._t);
          comments._t = setTimeout(() => saveActivityFor(monthInput.value), 400);
        });
        comments.addEventListener('blur', () => saveActivityFor(monthInput.value));
      }
    });
  }

  // reapply selection if a row id is stored (keep single-selection state across renders)
  if(selectedId){
    const selRow = tbody.querySelector(`tr[data-id="${selectedId}"]`);
    if(selRow){
      // clear any other selections then mark this one
      tbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
      selRow.classList.add('selected');
    } else {
      // if previously selected id no longer present, clear stored selection
      selectedId = null;
    }
  }

  // Reinitialize header sorting and column resizers after changing table structure
  // (safe to call repeatedly)
  setTimeout(() => {
    initHeaderSorting();
    initResizableColumns();
  }, 0);
}

/* simple escape */
function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

/* calculate whole years since a date string (YYYY-MM-DD). returns null if invalid */
function calcAge(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr);
  if(isNaN(d)) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if(m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

/* Events */
addBtn.addEventListener('click', () => openModal('add'));
closeModal.addEventListener('click', close);
cancelBtn.addEventListener('click', close);
modal.addEventListener('click', (e) => { if(e.target === modal) close(); });

/* Update the contextual options bar depending on current mode */
function updateOptionsBar(){
  const bar = document.querySelector('.options-bar');
  if(!bar) return;
  bar.innerHTML = '';
  if(activityMode){
    // Activity: show a global month picker that changes the month for all rows
    bar.classList.remove('has-registry-actions');

    // create container elements
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    wrap.style.color = '#e6e9ee';

    // determine initial value: prefer previously used month (if any person has _lastMonth), else current month
    const any = people.find(p => p.activities && p.activities._lastMonth);
    const init = any ? any.activities._lastMonth : new Date().toISOString().slice(0,7);

    // Global month input (hidden visually until used) - reused by both "Mes general" and "Seleccionar mes"
    const input = document.createElement('input');
    input.type = 'month';
    input.id = 'globalActivityMonth';
    input.style.padding = '8px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid rgba(255,255,255,0.08)';
    input.style.background = '#373a3f';
    input.style.color = '#fff';
    input.value = init;

    // when changed, update every person's _lastMonth and update DOM rows to reflect the chosen month
    input.addEventListener('change', (e) => {
      const val = e.target.value;
      if(!val) return;
      // set the selected month for every person (force the month even if already set)
      people.forEach(p => {
        if(!p.activities) p.activities = {};
        p.activities._lastMonth = val;
      });
      save();
      // update every visible row's month input and always dispatch change so per-row handlers reload data
      tbody.querySelectorAll('tr').forEach(tr => {
        const monthInput = tr.querySelector('.act-month');
        if(!monthInput) return;
        monthInput.value = val;
        // dispatch change so per-row handlers update aux/hours/studies/comments from saved data
        monthInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });



    // If there is no selected row, show a "Seleccionar mes" button (per request)
    // Use a live DOM query to ensure current selection state is respected.
    const anySelected = !!document.querySelector('#tbody tr.selected');
    if(!anySelected){
      const selectMonthBtn = document.createElement('button');
      selectMonthBtn.className = 'secondary';
      selectMonthBtn.textContent = 'Seleccionar mes';
      selectMonthBtn.title = 'Seleccionar mes para todo el registro';
      selectMonthBtn.style.marginLeft = '8px';
      selectMonthBtn.style.position = 'relative';

      // when clicked, toggle a small "tab" panel under the button with a month picker + apply
      let tab;
      selectMonthBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if(tab){
          tab.remove();
          tab = null;
          return;
        }
        // build tab
        tab = document.createElement('div');
        tab.className = 'month-tab';
        const mInput = document.createElement('input');
        mInput.type = 'month';
        mInput.value = input.value || init;
        mInput.className = 'month-tab-input';

        // apply immediately when the month is changed
        mInput.addEventListener('change', () => {
          if(!mInput.value) return;
          input.value = mInput.value;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          tab.remove();
          tab = null;
        });

        // assemble tab (no separate "Aplicar" button)
        tab.appendChild(mInput);

        // position tab under the button using absolute page coords
        document.body.appendChild(tab);
        const rect = selectMonthBtn.getBoundingClientRect();
        tab.style.position = 'absolute';
        tab.style.left = (rect.left + window.scrollX) + 'px';
        tab.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        tab.style.zIndex = 9999;

        // close tab if clicking elsewhere
        setTimeout(() => {
          const onDocClick = (ev) => {
            if(!tab) return;
            if(!tab.contains(ev.target) && ev.target !== selectMonthBtn){
              tab.remove();
              tab = null;
              document.removeEventListener('click', onDocClick);
            }
          };
          document.addEventListener('click', onDocClick);
        }, 0);

        mInput.focus();
      });

      wrap.appendChild(selectMonthBtn);
    }

    // show range selector button only when a search query is present
    if(searchInput.value.trim()){
      const rangeBtn = document.createElement('button');
      rangeBtn.className = 'secondary';
      rangeBtn.textContent = 'Seleccionar Rango';
      rangeBtn.style.marginLeft = '10px';
      rangeBtn.addEventListener('click', () => {
        activityRangeActive = !activityRangeActive;
        // if deactivating, clear stored range
        if(!activityRangeActive){
          activityRangeFrom = null;
          activityRangeTo = null;
        } else {
          // initialize defaults to current or previously selected
          const anym = people.find(p => p.activities && p.activities._lastMonth);
          const cur = anym ? anym.activities._lastMonth : new Date().toISOString().slice(0,7);
          activityRangeFrom = activityRangeFrom || cur;
          activityRangeTo = activityRangeTo || cur;
        }
        updateOptionsBar();
        render(searchInput.value);
      });
      wrap.appendChild(rangeBtn);

      if(activityRangeActive){
        const from = document.createElement('input');
        from.type = 'month';
        from.value = activityRangeFrom || init;
        from.style.marginLeft = '8px';
        from.addEventListener('change', (e) => {
          activityRangeFrom = e.target.value;
        });

        const to = document.createElement('input');
        to.type = 'month';
        to.value = activityRangeTo || init;
        to.style.marginLeft = '6px';
        to.addEventListener('change', (e) => {
          activityRangeTo = e.target.value;
        });

        const apply = document.createElement('button');
        apply.className = 'primary';
        apply.textContent = 'Aplicar Rango';
        apply.style.marginLeft = '8px';
        apply.addEventListener('click', () => {
          if(!activityRangeFrom || !activityRangeTo){
            alert('Seleccione ambos meses: desde y hasta.');
            return;
          }
          // basic validation: ensure from <= to
          if(activityRangeFrom > activityRangeTo){
            alert('El mes "desde" debe ser anterior o igual al mes "hasta".');
            return;
          }
          // keep activityRangeActive true and re-render rows
          render(searchInput.value);
        });

        wrap.appendChild(from);
        wrap.appendChild(to);
        wrap.appendChild(apply);
      }
    }

    bar.appendChild(wrap);
  } else {
    // Registry: add "Borrar Selección" red button
    bar.classList.add('has-registry-actions');
    const btn = document.createElement('button');
    btn.id = 'clearSelectionBtn';
    btn.className = 'danger';
    btn.textContent = 'Borrar Selección';
    btn.title = 'Borrar el registro seleccionado';
    btn.addEventListener('click', () => {
      const sel = tbody.querySelector('tr.selected');
      if(!sel){
        alert('No hay registro seleccionado.');
        return;
      }
      const id = sel.dataset.id;
      if(!id) return;
      if(confirm('¿Eliminar registro seleccionado?')){
        people = people.filter(p => p.id !== id);
        save();
        render(searchInput.value);
        // refresh options bar (remain in registry mode)
        updateOptionsBar();
      }
    });
    bar.appendChild(btn);
  }
}

/* Toggle activity mode */
actividadBtn.addEventListener('click', () => {
  activityMode = true;
  // visually indicate active state
  actividadBtn.classList.toggle('active', activityMode);
  if(registroBtn) registroBtn.classList.toggle('active', !activityMode);
  updateOptionsBar();
  render(searchInput.value);
});

/* Show registry (general) view when "Registro" pressed */
if(registroBtn){
  registroBtn.addEventListener('click', () => {
    activityMode = false;
    registroBtn.classList.toggle('active', !activityMode);
    if(actividadBtn) actividadBtn.classList.toggle('active', activityMode);
    updateOptionsBar();
    render(searchInput.value);
  });
}



/* Export registry to a .json file */
exportBtn.addEventListener('click', (ev) => {
  // hide menu after action if visible
  if(backupMenu && !backupMenu.classList.contains('hidden')){
    backupMenu.classList.add('hidden');
    if(backupBtn) backupBtn.setAttribute('aria-expanded','false');
  }
  try{
    const blob = new Blob([JSON.stringify(people, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'people_registry.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(err){
    alert('Error al exportar: ' + (err && err.message ? err.message : err));
  }
});

/* Import registry from a .json file (replaces current registry) */
importBtn.addEventListener('click', (ev) => {
  // hide menu before opening file picker
  if(backupMenu && !backupMenu.classList.contains('hidden')){
    backupMenu.classList.add('hidden');
    if(backupBtn) backupBtn.setAttribute('aria-expanded','false');
  }
  importFile.click();
});
importFile.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!Array.isArray(data)) throw new Error('Formato inválido: se esperaba un arreglo de registros.');
      // basic validation of record shape is skipped; we replace current data
      people = data.map(p => {
        if(!p.id) p.id = uid();
        // keep activities structure if present, otherwise ensure blank
        if(!p.activities) p.activities = {};
        return p;
      });
      save();
      render(searchInput.value);
      alert('Importación completada.');
    }catch(err){
      alert('Error al importar: ' + (err && err.message ? err.message : err));
    } finally {
      importFile.value = '';
    }
  };
  reader.onerror = () => {
    alert('No se pudo leer el archivo.');
    importFile.value = '';
  };
  reader.readAsText(f, 'utf-8');
});

/* Backup menu toggle: open/close the dropdown menu */
if(backupBtn){
  backupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if(!backupMenu) return;
    const open = !backupMenu.classList.contains('hidden');
    if(open){
      backupMenu.classList.add('hidden');
      backupBtn.setAttribute('aria-expanded','false');
    } else {
      backupMenu.classList.remove('hidden');
      backupBtn.setAttribute('aria-expanded','true');
    }
  });
  // close backup menu when clicking outside
  document.addEventListener('click', (ev) => {
    if(!backupMenu) return;
    if(backupMenu.classList.contains('hidden')) return;
    const path = ev.composedPath ? ev.composedPath() : (ev.path || []);
    if(path && (path.indexOf(backupMenu) !== -1 || path.indexOf(backupBtn) !== -1)) return;
    backupMenu.classList.add('hidden');
    backupBtn.setAttribute('aria-expanded','false');
  });
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const id = personId.value;
  const record = {
    congName: $('#congName').value.trim(),
    firstName: $('#firstName').value.trim(),
    lastNameP: $('#lastNameP').value.trim(),
    lastNameM: $('#lastNameM').value.trim(),
    group: $('#group').value.trim(),
    privilege: $('#privilege').value.trim(),
    designation: $('#designation').value.trim(),
    sex: $('#sex').value,
    esp: $('#esp').value.trim(),
    birthDate: $('#birthDate').value,
    baptismDate: $('#baptismDate').value,

    address: $('#address').value.trim(),
    phone: $('#phone').value.trim(),
    emergencyContact: $('#emergencyContact').value.trim(),
    activities: {} // initialize activities container
  };
  if(!record.firstName || !record.lastNameP){
    // minimal inline validation
    alert('Nombre y Apellido Paterno son obligatorios.');
    return;
  }

  if(id){
    const i = people.findIndex(p => p.id === id);
    if(i !== -1){
      // preserve existing activities when editing
      const prev = people[i].activities || {};
      people[i] = { id, ...record, activities: prev };
    }
  } else {
    people.push({ id: uid(), ...record });
  }
  save();
  render(searchInput.value);
  close();
});

/* Delegated actions (edit/delete) and row selection */
tbody.addEventListener('click', (e) => {
  const target = e.target;

  // If a row cell/button was clicked, find the row
  const tr = target.closest('tr');

  // If the click occurred on activity controls (month picker, aux checkbox, hours/studies inputs, or comments),
  // do not treat it as a row selection — allow the control's own handlers to run.
  if (tr && tr.parentElement === tbody) {
    if (
      target.closest('.act-month') ||
      target.closest('.act-aux') ||
      target.closest('.act-hours') ||
      target.closest('.act-studies') ||
      target.closest('.act-comments')
    ) {
      // don't toggle selection when interacting with activity inputs
    } else {
      // Manage selection: clicking a row (but not header placeholder) selects it
      // clear previous selection
      const prev = tbody.querySelector('tr.selected');
      if (prev && prev !== tr) prev.classList.remove('selected');
      // toggle selection on the clicked row
      const becameSelected = !tr.classList.contains('selected');
      // ensure only one selected at a time
      tbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
      if (becameSelected) {
        tr.classList.add('selected');
        selectedId = tr.dataset.id || null;
      } else {
        selectedId = null;
      }

      // update options bar so selection-dependent controls reflect current selection state
      updateOptionsBar();

      // If in activityMode and the row was just selected, clicking it should behave like searching that person:
      // set search input to a suitable identifier (prefer Nombre (Cong.) then full name)
      if (activityMode && becameSelected) {
        const id = tr.dataset.id;
        const p = people.find(x => x.id === id);
        if (p) {
          const q = (p.congName && p.congName.trim()) ? p.congName.trim() : `${(p.firstName||'').trim()} ${(p.lastNameP||'').trim()}`.trim();
          searchInput.value = q;
          // re-render and update options bar so range controls appear/disappear as when typing
          render(searchInput.value);
          updateOptionsBar();
        }
      }
    }
  }

  // handle edit/delete buttons if present (registry view)
  if(target.matches('button.edit')){
    const id = target.dataset.id;
    const p = people.find(x => x.id === id);
    if(p) openModal('edit', p);
  } else if(target.matches('button.delete')){
    const id = target.dataset.id;
    if(confirm('¿Eliminar registro?')) {
      people = people.filter(x => x.id !== id);
      save();
      render(searchInput.value);
    }
  }
});

/* Double-click to edit: inline editing in Registro; keep modal edit in Activity mode */
tbody.addEventListener('dblclick', (e) => {
  const td = e.target.closest('td');
  if(!td) return;
  const tr = td.parentElement;
  if(!tr || tr.parentElement !== tbody) return;
  const id = tr.dataset.id;
  if(!id) return;
  const pIndex = people.findIndex(x => x.id === id);
  if(pIndex === -1) return;
  const person = people[pIndex];

  // In activity mode, keep existing behavior: double-click on cong-cell opens modal
  if(activityMode){
    if(td.classList.contains('cong-cell')){
      openModal('edit', person);
    }
    return;
  }

  // Registry mode: inline edit the whole row
  // Prevent re-initializing if already editing
  if(tr.classList.contains('inline-editing')) return;
  tr.classList.add('inline-editing');

  // Map visible cells in registry row to fields in COLUMN_KEYS (same order)
  const cells = Array.from(tr.children);
  const inputs = [];

  COLUMN_KEYS.forEach((key, idx) => {
    const cell = cells[idx];
    if(!cell) return;
    // capture current value for this field
    const current = person[key] || '';

    // create appropriate editor (text, textarea, select, date)
    let editor;
    if(key === 'address'){
      editor = document.createElement('textarea');
      editor.rows = 2;
      editor.style.width = '100%';
      editor.value = current;
    } else if(key === 'birthDate' || key === 'baptismDate'){
      editor = document.createElement('input');
      editor.type = 'date';
      editor.value = current || '';
    } else if(key === 'privilege'){
      editor = document.createElement('select');
      ['','Publicador','P. No Baut.','Anciano','Siervo Ministerial','Inactivo'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v || '-';
        if(String(v) === String(current)) o.selected = true;
        editor.appendChild(o);
      });
    } else if(key === 'designation'){
      editor = document.createElement('select');
      ['','Precursor Regular','Precursor Auxiliar','N/A'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v || '-';
        if(String(v) === String(current)) o.selected = true;
        editor.appendChild(o);
      });
    } else if(key === 'sex'){
      editor = document.createElement('select');
      ['','M','F','O'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v || '-';
        if(String(v) === String(current)) o.selected = true;
        editor.appendChild(o);
      });
    } else if(key === 'esp'){
      editor = document.createElement('select');
      ['','O.O.','UNG'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v || '-';
        if(String(v) === String(current)) o.selected = true;
        editor.appendChild(o);
      });
    } else {
      editor = document.createElement('input');
      editor.type = 'text';
      editor.value = current;
    }

    editor.style.boxSizing = 'border-box';
    editor.style.padding = '6px';
    editor.style.borderRadius = '6px';
    editor.style.border = '1px solid #e6e9ee';
    editor.style.width = '100%';
    // replace cell content with editor
    cell.innerHTML = '';
    cell.appendChild(editor);
    inputs.push({ key, editor, cell });
  });

  // Add small action cell to commit/cancel (append to end of row)
  const actionCell = document.createElement('td');
  actionCell.style.whiteSpace = 'nowrap';
  actionCell.style.padding = '8px';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary';
  saveBtn.textContent = 'Guardar';
  saveBtn.style.marginRight = '8px';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancelar';
  actionCell.appendChild(saveBtn);
  actionCell.appendChild(cancelBtn);
  tr.appendChild(actionCell);

  // Helper to commit changes
  function commit(){
    // read values and update person
    const updated = { ...person }; // shallow copy
    inputs.forEach(({ key, editor }) => {
      if(!editor) return;
      let val;
      if(editor.tagName === 'INPUT' || editor.tagName === 'TEXTAREA' || editor.tagName === 'SELECT'){
        val = editor.value;
      } else {
        val = editor.textContent;
      }
      updated[key] = val === null ? '' : String(val).trim();
    });
    // preserve activities
    updated.activities = person.activities || {};
    people[pIndex] = { id, ...updated };
    save();
    // remove inline editors and re-render to refresh table
    tr.classList.remove('inline-editing');
    render(searchInput.value);
    updateOptionsBar();
  }

  // Helper to cancel editing and restore original row (re-render)
  function cancel(){
    tr.classList.remove('inline-editing');
    render(searchInput.value);
    updateOptionsBar();
  }

  // Bind save/cancel
  saveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); commit(); });
  cancelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); cancel(); });

  // Save on Enter when inside an input (but let Enter in textarea create newline)
  inputs.forEach(({ editor }) => {
    if(!editor) return;
    editor.addEventListener('keydown', (ev) => {
      if(ev.key === 'Enter' && editor.tagName !== 'TEXTAREA'){
        ev.preventDefault();
        commit();
      } else if(ev.key === 'Escape'){
        ev.preventDefault();
        cancel();
      }
    });
    // optionally save on blur for non-textarea controls (avoid losing focus when user clicks Save)
    if(editor.tagName !== 'TEXTAREA'){
      editor.addEventListener('blur', () => {
        // tiny timeout to allow clicking Save/Cancel without immediately committing on blur
        setTimeout(() => {
          if(!tr.classList.contains('inline-editing')) return;
          // if focus moved to one of the action buttons, ignore blur commit
          const active = document.activeElement;
          if(active === saveBtn || active === cancelBtn) return;
          // commit changes
          commit();
        }, 150);
      });
    }
  });

  // focus first editor
  if(inputs[0] && inputs[0].editor) inputs[0].editor.focus();
});

/* Search */
searchInput.addEventListener('input', (e) => {
  render(e.target.value);
  // update options bar so range controls appear/disappear when searching
  updateOptionsBar();
});

// clear-search (red X) button: clears the search box and refreshes view
if(clearSearchBtn){
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';

    // If in activity mode, also deselect all persons in the visible list
    if(activityMode){
      // remove selected class from any rows and clear stored selection id
      document.querySelectorAll('#tbody tr.selected').forEach(r => r.classList.remove('selected'));
      selectedId = null;
      // also reset activity range selection so UI matches empty search
      activityRangeActive = false;
      activityRangeFrom = null;
      activityRangeTo = null;
    }

    render('');
    updateOptionsBar();
    searchInput.focus();
  });
}

/* Keyboard: Esc closes modal */
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !modal.classList.contains('hidden')) close();
});

/* Column resizing: attach resizers to headers and adjust <col> widths */
function initResizableColumns(){
  const table = document.getElementById('peopleTable');
  const cols = document.getElementById('cols');
  if(!table || !cols) return;

  const ths = table.querySelectorAll('thead th');
  // ensure number of cols matches headers
  while(cols.children.length < ths.length){
    cols.appendChild(document.createElement('col'));
  }

  // restore saved widths if any
  const saved = loadColWidths();
  if(saved && saved.length){
    for(let i=0;i<cols.children.length && i<saved.length;i++){
      if(saved[i]) cols.children[i].style.width = saved[i];
    }
  }

  ths.forEach((th, idx) => {
    th.style.position = 'relative';
    const handle = document.createElement('div');
    handle.className = 'th-resizer';
    handle.setAttribute('data-index', idx);
    th.appendChild(handle);

    let startX = 0;
    let startWidth = 0;
    let colEl = cols.children[idx];
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startWidth = colEl.getBoundingClientRect().width;
      document.documentElement.style.cursor = 'col-resize';

      function onPointerMove(ev){
        const dx = ev.clientX - startX;
        const newWidth = Math.max(40, startWidth + dx);
        colEl.style.width = newWidth + 'px';
      }
      function onPointerUp(ev){
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.documentElement.style.cursor = '';
        try{ handle.releasePointerCapture(e.pointerId); }catch(_){}
        // persist widths after finishing resize
        saveColWidths();
      }

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
  });

  // also save widths when window is resized (to capture final layout)
  window.addEventListener('resize', () => {
    // small debounce
    clearTimeout(window._saveColsTimeout);
    window._saveColsTimeout = setTimeout(saveColWidths, 200);
  });
}

/* Sort helpers for activity view */
function sortActivityByColumn(idx){
  // columns in activity view:
  // 0: congName
  // 1: month (YYYY-MM)
  // 2: group
  // 3: privilege
  // 4: designation
  // 5: aux (boolean)
  // 6: hours (integer)
  // 7: studies (integer)
  // 8: comments (string)
  if(typeof idx !== 'number') return;
  // toggle sort state; reuse same sortState structure but treat idx in activity context
  if(sortState.idx === ('a'+idx)) {
    sortState.dir = -sortState.dir;
  } else {
    sortState.idx = 'a'+idx;
    sortState.dir = 1;
  }

  const dir = sortState.dir;
  people.sort((A,B) => {
    // ensure activities initialisation
    const aKey = (A.activities && A.activities._lastMonth) ? A.activities._lastMonth : new Date().toISOString().slice(0,7);
    const bKey = (B.activities && B.activities._lastMonth) ? B.activities._lastMonth : new Date().toISOString().slice(0,7);

    const aAct = (A.activities && A.activities[aKey]) ? A.activities[aKey] : { aux:false, hours:'', studies:'', comments:'' };
    const bAct = (B.activities && B.activities[bKey]) ? B.activities[bKey] : { aux:false, hours:'', studies:'', comments:'' };

    // value extractors
    let va, vb;
    switch(idx){
      case 0: // congName only
        va = (A.congName || '').toLowerCase();
        vb = (B.congName || '').toLowerCase();
        break;
      case 1: // month: compare as YYYY-MM strings (lexicographic works) but fall back to current month
        va = (aKey || '').toLowerCase();
        vb = (bKey || '').toLowerCase();
        break;
      case 2: // group
        va = (A.group || '').toLowerCase();
        vb = (B.group || '').toLowerCase();
        break;
      case 3: // privilege
        va = (A.privilege || '').toLowerCase();
        vb = (B.privilege || '').toLowerCase();
        break;
      case 4: // designation
        va = (A.designation || '').toLowerCase();
        vb = (B.designation || '').toLowerCase();
        break;
      case 5: // aux boolean
        va = aAct.aux ? 1 : 0;
        vb = bAct.aux ? 1 : 0;
        break;
      case 6: // hours integer (empty -> -1 to push empty last)
        va = aAct.hours === '' ? -1 : parseInt(aAct.hours,10) || 0;
        vb = bAct.hours === '' ? -1 : parseInt(bAct.hours,10) || 0;
        break;
      case 7: // studies integer
        va = aAct.studies === '' ? -1 : parseInt(aAct.studies,10) || 0;
        vb = bAct.studies === '' ? -1 : parseInt(bAct.studies,10) || 0;
        break;
      case 8: // comments
        va = (aAct.comments || '').toLowerCase();
        vb = (bAct.comments || '').toLowerCase();
        break;
      default:
        va = '';
        vb = '';
    }

    // numeric compare if numbers
    if(typeof va === 'number' && typeof vb === 'number'){
      if(va < vb) return -1 * dir;
      if(va > vb) return 1 * dir;
      return 0;
    }

    // string compare
    if(va < vb) return -1 * dir;
    if(va > vb) return 1 * dir;
    return 0;
  });

  save();
  render(searchInput.value);
}

/* make headers sortable by double-click (applies in both registry and activity views) */
function initHeaderSorting(){
  const ths = document.querySelectorAll('#peopleTable thead th');
  ths.forEach((th, idx) => {
    th.addEventListener('dblclick', () => {
      // choose appropriate sort depending on mode
      if(activityMode){
        sortActivityByColumn(idx);
      } else {
        sortByColumn(idx);
      }
    });
    // indicate interactivity
    th.style.cursor = 'pointer';
  });

  // attach column filter button handlers (only present in registry headers)
  const filters = document.querySelectorAll('.col-filter');

  // helper to close any open filter panel
  function closeFilterPanel(){
    const open = document.querySelector('.filter-panel');
    if(open) open.remove();
    // remove document click listener
    document.removeEventListener('click', closeFilterPanel);
  }

  filters.forEach(btn => {
    const idx = Number(btn.getAttribute('data-idx'));
    // choose correct key set depending on current view (render calls initHeaderSorting after setting activityMode)
    const key = (activityMode ? ACT_COLUMN_KEYS[idx] : COLUMN_KEYS[idx]);
    // reflect active state from columnFilters
    if(columnFilters[key]) btn.classList.add('active'); else btn.classList.remove('active');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // toggle panel if already open for this button
      const existing = document.querySelector('.filter-panel');
      if(existing && existing.dataset.idx === String(idx)){
        closeFilterPanel();
        return;
      }
      closeFilterPanel();

      // gather unique values for this column from current people list
      const vals = Array.from(new Set(people.map(p => (p[key] || '').toString()).filter(v=>v !== ''))).sort((a,b) => a.localeCompare(b,'es'));

      // build panel
      const panel = document.createElement('div');
      panel.className = 'filter-panel';
      panel.dataset.idx = idx;

      const title = document.createElement('div');
      title.className = 'filter-panel-title';
      title.textContent = ths[idx].innerText.replace('🔍','').trim();
      panel.appendChild(title);

      const inputWrap = document.createElement('div');
      inputWrap.className = 'filter-panel-inputwrap';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Escriba para filtrar o presione uno de los valores';
      input.value = columnFilters[key] || '';
      input.className = 'filter-panel-input';
      inputWrap.appendChild(input);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'filter-panel-clear';
      clearBtn.textContent = 'Limpiar';
      clearBtn.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input'));
      });
      inputWrap.appendChild(clearBtn);

      panel.appendChild(inputWrap);

      const list = document.createElement('div');
      list.className = 'filter-panel-list';
      if(vals.length === 0){
        const empty = document.createElement('div');
        empty.className = 'filter-panel-empty';
        empty.textContent = '(sin datos)';
        list.appendChild(empty);
      } else {
        vals.forEach(v => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'filter-panel-item';
          item.textContent = v;
          item.addEventListener('click', () => {
            input.value = v;
            applyFilter();
          });
          list.appendChild(item);
        });
      }
      panel.appendChild(list);

      // actions
      const actions = document.createElement('div');
      actions.className = 'filter-panel-actions';
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'primary';
      apply.textContent = 'Aplicar';
      apply.addEventListener('click', applyFilter);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancelar';
      cancel.addEventListener('click', closeFilterPanel);
      actions.appendChild(cancel);
      actions.appendChild(apply);
      panel.appendChild(actions);

      // position panel under button
      document.body.appendChild(panel);
      const rect = btn.getBoundingClientRect();
      panel.style.position = 'absolute';
      panel.style.left = (rect.left + window.scrollX) + 'px';
      panel.style.top = (rect.bottom + window.scrollY + 8) + 'px';
      panel.style.zIndex = 9999;
      // limit width
      panel.style.minWidth = '220px';
      panel.style.maxWidth = '420px';

      // small live filter of list items
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        Array.from(list.children).forEach(ch => {
          if(ch.classList.contains('filter-panel-empty')) return;
          const matches = ch.textContent.toLowerCase().includes(q);
          ch.style.display = matches ? '' : 'none';
        });
      });

      // apply filter function
      function applyFilter(){
        const v = String(input.value || '').trim();
        if(v){
          columnFilters[key] = v;
          btn.classList.add('active');
        } else {
          delete columnFilters[key];
          btn.classList.remove('active');
        }
        closeFilterPanel();
        render(searchInput.value);
      }

      // add document click to close when clicking outside
      setTimeout(()=> document.addEventListener('click', closeFilterPanel), 0);
      // stop clicks inside panel from bubbling to document
      panel.addEventListener('click', (ev) => ev.stopPropagation());
      btn.focus();
    });
  });
}

/* Banner title: load persisted title or default */
function loadBannerTitle(){
  try{
    const v = localStorage.getItem(BANNER_TITLE_KEY);
    return v ? v : null;
  }catch(e){ return null; }
}
function saveBannerTitle(val){
  try{ localStorage.setItem(BANNER_TITLE_KEY, val); }catch(e){}
}

/* make banner title editable on double-click */
const bannerTitleEl = document.querySelector('.banner-title');
const defaultBannerText = bannerTitleEl ? bannerTitleEl.textContent : '';
const persisted = loadBannerTitle();
if(bannerTitleEl){
  bannerTitleEl.textContent = persisted || defaultBannerText;

  bannerTitleEl.addEventListener('dblclick', (e) => {
    // create input overlay
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'banner-title-input';
    input.value = bannerTitleEl.textContent;
    // replace display with input
    bannerTitleEl.replaceWith(input);
    input.focus();
    input.select();

    function commit(){
      const val = input.value.trim() || defaultBannerText;
      const newEl = document.createElement('div');
      newEl.className = 'banner-title';
      newEl.textContent = val;
      input.replaceWith(newEl);
      saveBannerTitle(val);
      // reattach handler to new element
      newEl.addEventListener('dblclick', bannerTitleDbl);
    }
    function cancel(){
      const newEl = document.createElement('div');
      newEl.className = 'banner-title';
      newEl.textContent = bannerTitleEl.textContent;
      input.replaceWith(newEl);
      newEl.addEventListener('dblclick', bannerTitleDbl);
    }
    function onKey(e){
      if(e.key === 'Enter'){
        commit();
      } else if(e.key === 'Escape'){
        cancel();
      }
    }
    // helper to reattach
    function bannerTitleDbl(ev){ /* no-op placeholder for later reattach */ }

    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', onKey);
  });
}

initResizableColumns();
initHeaderSorting();
// Ensure "Registro" is active on initial load
activityMode = false;
if (registroBtn) registroBtn.classList.add('active');
if (actividadBtn) actividadBtn.classList.remove('active');
updateOptionsBar();
render();