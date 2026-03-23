/* app.js - Registro de personas con persistencia en localStorage
   Added an Activity view mode with editable activity fields per person.
*/
const LS_KEY = 'people_registry_v1';
const BANNER_TITLE_KEY = 'people_registry_banner_title_v1';
const GROUP_TITLE_KEY = 'people_registry_group_title_v1';

const $ = sel => document.querySelector(sel);
const tbody = $('#tbody');
const totalCountEl = $('#totalCount');
const addBtn = $('#addPersonBtn');

const exportBtn = $('#exportBtn');
const importBtn = $('#importBtn');
const importFile = $('#importFile');
const csvFile = $('#csvFile'); // CSV bulk loader input
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
const loadBtn = $('#loadBtn'); // modal "Cargar" button

let people = load();
let activityMode = false; // false = normal registry, true = activity view
// track currently selected person's id so options bar can react reliably
let selectedId = null;

/* per-mode column filters: keep Registry and Activity filters separate so they don't interfere */
let columnFiltersRegistry = {};
let columnFiltersActivity = {};
function getColumnFilters(){
  return activityMode ? columnFiltersActivity : columnFiltersRegistry;
}

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
  // (badge update moved later after filtering)
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

  // apply per-column filters: support both Registry and Activity views.
  // In Registry mode we filter directly on person properties.
  // In Activity mode we resolve values from the person's selected month (activities._lastMonth).
  const activeColFilters = getColumnFilters();
  if(Object.keys(activeColFilters).length){
    for(const [key, val] of Object.entries(activeColFilters)){
      if(!val) continue;

      // construct an array of needle values (support typed comma list or selected-array)
      let needles = [];
      if(Array.isArray(val)) {
        needles = val.map(x => String(x).trim().toLowerCase()).filter(Boolean);
      } else {
        // split typed input by commas to allow multiple typed values
        needles = String(val).split(',').map(x => x.trim()).filter(Boolean).map(x => x.toLowerCase());
      }
      // if nothing to match skip
      if(needles.length === 0) continue;

      if(!activityMode){
        // Registry: match against person property value
        list = list.filter(p => {
          const v = (p[key] || '').toString().toLowerCase();
          return needles.some(n => v.includes(n));
        });
      } else {
        // Activity: interpret ACT_COLUMN_KEYS semantics
        list = list.filter(p => {
          // only consider persons that have numeric group (activityMode already filters this but keep safe)
          const g = (p.group || '').toString().trim();
          if(!/^\d+$/.test(g)) return false;

          // determine reference month for this person
          const monthKey = (p.activities && p.activities._lastMonth) ? p.activities._lastMonth : '';
          let value = '';

          switch(key){
            case 'activityMonth':
              // consider the person's _lastMonth or any month keys if missing
              value = monthKey || '';
              break;
            case 'aux':
            case 'hours':
            case 'studies':
            case 'comments':
              if(p.activities && monthKey && p.activities[monthKey]){
                const act = p.activities[monthKey];
                value = (act[key] !== undefined && act[key] !== null) ? String(act[key]) : '';
              } else {
                value = '';
              }
              break;
            default:
              // map other activity columns back to person fields (congName, group, privilege, designation)
              value = (p[key] || '').toString();
              break;
          }
          value = value.toLowerCase();
          return needles.some(n => value.includes(n));
        });
      }
    }
  }

  // When in Activity mode, only show people who have a numeric value in the "group" field.
  // This enforces the rule: "Actividad" must only display records with a number in Grupo.
  if(activityMode){
    list = list.filter(p => {
      const g = (p.group || '').toString().trim();
      return /^\d+$/.test(g);
    });
  }

  // update total count badge:
  // - In Activity mode show the number of records currently displayed in the activity panel (after all filters).
  // - In Registry mode preserve previous behaviour: if any column filter is active show displayed count, otherwise show total records.
  if(totalCountEl){
    if(activityMode){
      totalCountEl.textContent = String(list.length);
    } else {
      const filtersActive = Object.keys(columnFiltersRegistry).length > 0;
      totalCountEl.textContent = String(filtersActive ? list.length : people.length);
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
        let act = (p.activities && p.activities[monthKey]) ? p.activities[monthKey] : { aux:false, hours:'', studies:'', comments:'' };

        // Determine if there is a "Fin Precursorado Regular" recorded for this person and its month.
        // If such a finMonth exists, months earlier than finMonth must not be auto-modified.
        // Determine earliest months marked as 'Fin Precursorado Regular' or 'Inicio Precursorado Regular'
        let finMonth = '';
        let startMonth = '';
        if (p.activities) {
          for (const k of Object.keys(p.activities)) {
            if (k === '_lastMonth') continue;
            const candidate = p.activities[k];
            const txt = String(candidate && candidate.comments || '').trim();
            if (txt === 'Fin Precursorado Regular') {
              if (!finMonth || k < finMonth) finMonth = k;
            }
            if (txt === 'Inicio Precursorado Regular') {
              if (!startMonth || k < startMonth) startMonth = k;
            }
          }
        }

        // Ensure Aux. Mes is active ONLY when hours > 1 for non-Precursor Regular;
        // if hours is 1 or empty, force aux to false and persist.
        // IMPORTANT: if this month is earlier than finMonth OR earlier than startMonth, do not auto-modify aux.
        const isBeforeFin = ((startMonth && monthKey < startMonth) || (finMonth && monthKey < finMonth));
        if (!isBeforeFin) {
          if (String(p.designation || '').trim() !== 'Precursor Regular') {
            const hnum = act.hours === '' ? NaN : Number(act.hours);
            if (!isNaN(hnum) && hnum > 1) {
              act.aux = true;
            } else {
              // hours === 1 or empty (or non-numeric) => ensure aux is not active
              act.aux = false;
            }
          } else {
            // Precursor Regular: Aux. Mes must always be false (never auto-activate or preserve a checked state)
            act.aux = false;
          }
        }
        if (!p.activities) p.activities = {};
        p.activities[monthKey] = act;
        save();

        tr.innerHTML = `
          <td class="cong-cell">${escapeHtml(p.congName || '')}</td>
          <td><input type="month" class="act-month" value="${escapeHtml(monthKey)}" style="width:100%"/></td>
          <td>${escapeHtml(p.group || '')}</td>
          <td>${escapeHtml(p.privilege || '')}</td>
          <td>${escapeHtml(p.designation || '')}</td>
          <td style="text-align:center"><input type="checkbox" class="act-aux" ${act.aux ? 'checked': ''} /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-hours num-input" value="${escapeHtml(act.hours || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-studies num-input" value="${escapeHtml(act.studies || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td>
            <div class="act-comments" data-placeholder="Comentarios">
              <div contenteditable="true" class="act-comments-input" data-placeholder="Comentarios">${escapeHtml(act.comments || '')}</div>
              <button type="button" class="comment-info" title="Información">i</button>
            </div>
          </td>
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
        let act = p.activities[monthKey] || { aux:false, hours:'', studies:'', comments:'' };

        // Ensure Aux. Mes is active ONLY when hours > 1 for non-Precursor Regular;
        // if hours is 1 or empty, force aux to false and persist.
        if (String(p.designation || '').trim() !== 'Precursor Regular') {
          const hnum = act.hours === '' ? NaN : Number(act.hours);
          if (!isNaN(hnum) && hnum > 1) {
            act.aux = true;
          } else {
            act.aux = false;
          }
          if (!p.activities) p.activities = {};
          p.activities[monthKey] = act;
          save();
        }

        tr.innerHTML = `
          <td class="cong-cell">${escapeHtml(p.congName || '')}</td>
          <td><input type="month" class="act-month" value="${escapeHtml(monthKey)}" style="width:100%"/></td>
          <td>${escapeHtml(p.group || '')}</td>
          <td>${escapeHtml(p.privilege || '')}</td>
          <td>${escapeHtml(p.designation || '')}</td>
          <td style="text-align:center"><input type="checkbox" class="act-aux" ${act.aux ? 'checked': ''} /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-hours num-input" value="${escapeHtml(act.hours || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td><input type="number" inputmode="numeric" step="1" min="0" class="act-studies num-input" value="${escapeHtml(act.studies || '')}" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #e6e9ee;text-align:right" /></td>
          <td>
            <div class="act-comments" data-placeholder="Comentarios">
              <div contenteditable="true" class="act-comments-input" data-placeholder="Comentarios">${escapeHtml(act.comments || '')}</div>
              <button type="button" class="comment-info" title="Información">i</button>
            </div>
          </td>
        `;
      } else {
        const bAge = calcAge(p.birthDate);
        const baAge = calcAge(p.baptismDate);
        const birthHtml = escapeHtml(p.birthDate || '') + (bAge !== null ? ` <strong>(${bAge} años)</strong>` : '');

        // determine if baptism age should be highlighted red:
        // show in red if months since baptism is less than 18 months (1 año 6 meses)
        let baptismAgeHtml = '';
        if(baAge !== null){
          const months = monthsSince(p.baptismDate);
          const ageSpan = `<strong${(months !== null && months < 18) ? ' class="age-recent"' : ''}>(${baAge} años)</strong>`;
          baptismAgeHtml = ` ${ageSpan}`;
        }
        const baptismHtml = escapeHtml(p.baptismDate || '') + baptismAgeHtml;

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
      const comments = tr.querySelector('.act-comments-input'); // contenteditable inner div

      // ensure activities container
      if(!p.activities) p.activities = {};
      // initialize lastMonth if absent
      if(!p.activities._lastMonth) p.activities._lastMonth = monthInput.value;

      function saveActivityFor(month){
        if(!p.activities) p.activities = {};
        p.activities._lastMonth = month;
        const cur = p.activities[month] || { aux:false, hours:'', studies:'', comments:'' };
        // read values live from DOM (inputs use .value)
        cur.hours = (hours && typeof hours.value !== 'undefined') ? String(hours.value).trim() : '';
        cur.studies = (studies && typeof studies.value !== 'undefined') ? String(studies.value).trim() : '';
        cur.comments = getCommentText(comments);

        // Determine earliest months marked as 'Fin Precursorado Regular' or 'Inicio Precursorado Regular'
        let finMonthSave = '';
        let startMonthSave = '';
        if (p.activities) {
          for (const k of Object.keys(p.activities)) {
            if (k === '_lastMonth') continue;
            const candidate = p.activities[k];
            const txt = String(candidate && candidate.comments || '').trim();
            if (txt === 'Fin Precursorado Regular') {
              if (!finMonthSave || k < finMonthSave) finMonthSave = k;
            }
            if (txt === 'Inicio Precursorado Regular') {
              if (!startMonthSave || k < startMonthSave) startMonthSave = k;
            }
          }
        }
        const isBeforeFinSave = ((startMonthSave && (month === '' ? false : (month < startMonthSave))) || (finMonthSave && (month === '' ? false : (month < finMonthSave))));

        // For non-Precursor Regular, Aux. Mes must be active ONLY when hours > 1.
        // If hours === 1 or empty, force aux false and persist; for Precursor Regular always disable Aux. Mes.
        // IMPORTANT: if saving for a month earlier than finMonth, do not auto-modify cur.aux.
        if (!isBeforeFinSave) {
          if (String(p.designation || '').trim() !== 'Precursor Regular') {
            const hnum = cur.hours === '' ? NaN : Number(cur.hours);
            if (!isNaN(hnum) && hnum > 1) {
              cur.aux = true;
            } else {
              // when hours is 1 or empty (or non-numeric), ensure aux is not active
              cur.aux = false;
            }
          } else {
            // Precursor Regular: Aux. Mes must always be false (do not allow checked)
            cur.aux = false;
            // keep the checkbox visual state in sync when possible
            if(aux) aux.checked = false;
          }
        }

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

/* extract text content from a contenteditable comment box but exclude any button labels (like the info "i") */
function getCommentText(el){
  if(!el) return '';
  try{
    // if wrapper passed, select inner editable area
    if(el.classList && el.classList.contains && el.classList.contains('act-comments')){
      el = el.querySelector('.act-comments-input') || el;
    }
    // clone to avoid modifying live DOM, remove any buttons then return plain text
    const c = el.cloneNode(true);
    c.querySelectorAll('button').forEach(b => b.remove());
    return (c.textContent || '').trim();
  }catch(e){
    return (el && el.textContent) ? String(el.textContent).trim() : '';
  }
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

/* months since a date (returns integer months, or null if invalid) */
function monthsSince(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr);
  if(isNaN(d)) return null;
  const today = new Date();
  let months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
  // adjust for day-of-month
  if(today.getDate() < d.getDate()) months--;
  return months >= 0 ? months : null;
}

/* normalize various date string formats to YYYY-MM-DD or return '' if unparseable
   Handles:
     - ISO-ish inputs (YYYY-MM-DD, YYYY/MM/DD)
     - DD/MM/YYYY or D/M/YYYY and DD-MM-YYYY
     - MM/DD/YYYY (naive; tries to detect ambiguous cases)
     - plain YYYYMMDD
*/
function normalizeDate(input){
  if(!input) return '';
  let s = String(input).trim();
  if(!s) return '';

  // already ISO-like YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if(isoMatch){
    const y = isoMatch[1], m = String(isoMatch[2]).padStart(2,'0'), d = String(isoMatch[3]).padStart(2,'0');
    const dt = new Date(`${y}-${m}-${d}`);
    if(!isNaN(dt)) return `${y}-${m}-${d}`;
  }

  // plain YYYYMMDD
  const ymdMatch = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(ymdMatch){
    const y = ymdMatch[1], m = ymdMatch[2], d = ymdMatch[3];
    const dt = new Date(`${y}-${m}-${d}`);
    if(!isNaN(dt)) return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(dmyMatch){
    const d = String(dmyMatch[1]).padStart(2,'0'), m = String(dmyMatch[2]).padStart(2,'0'), y = dmyMatch[3];
    const dt = new Date(`${y}-${m}-${d}`);
    if(!isNaN(dt)) return `${y}-${m}-${d}`;
  }

  // MM/DD/YYYY (common in some CSVs)
  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(mdyMatch){
    const m = String(mdyMatch[1]).padStart(2,'0'), d = String(mdyMatch[2]).padStart(2,'0'), y = mdyMatch[3];
    const dt1 = new Date(`${y}-${m}-${d}`);
    if(!isNaN(dt1)) return `${y}-${m}-${d}`;
  }

  // As a last resort try Date parse (will handle some textual dates)
  const parsed = new Date(s);
  if(!isNaN(parsed)){
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth()+1).padStart(2,'0');
    const d = String(parsed.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  return '';
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



    // If there is a selected row, show an "Año Servicio" control (year with arrows).
    // Otherwise show a "Seleccionar mes" button (per request).
    const anySelected = !!document.querySelector('#tbody tr.selected');

    // helper to compute service-year month range (Sept prev year -> Aug year)
    function setServiceYearRange(year) {
      if(!year || isNaN(Number(year))) return;
      const y = Number(year);
      activityRangeFrom = `${String(y-1).padStart(4,'0')}-09`;
      activityRangeTo = `${String(y).padStart(4,'0')}-08`;
      activityRangeActive = true;
      // re-render to expand rows for the selected range if search is present
      render(searchInput.value);
    }

    if(anySelected){
      // build compact year selector with left/right arrows
      const yearWrap = document.createElement('div');
      yearWrap.style.display = 'inline-flex';
      yearWrap.style.alignItems = 'center';
      yearWrap.style.gap = '6px';
      yearWrap.style.marginLeft = '8px';

      const label = document.createElement('div');
      label.textContent = 'Año Servicio';
      label.style.fontWeight = '700';
      label.style.color = 'var(--muted)';
      label.style.fontSize = '13px';
      label.style.display = 'none'; // visually hide label to keep compact, accessible via tooltip
      yearWrap.appendChild(label);

      // determine initial service year: prefer existing activityRangeTo or current defaultServiceYear
      const now = new Date();
      const defaultServiceYear = (now.getMonth() >= 8) ? (now.getFullYear() + 1) : now.getFullYear();
      let curYear = (function(){
        if(activityRangeFrom && activityRangeTo){
          // parse activityRangeTo year if it matches service-year end (YYYY-08)
          try{
            const part = (activityRangeTo || '').split('-')[0];
            if(part && /^\d{4}$/.test(part)) return Number(part);
          }catch(e){}
        }
        // fallback to previously selected month on any person, else default
        const anyp = people.find(p => p.activities && p.activities._lastMonth);
        if(anyp && anyp.activities && anyp.activities._lastMonth){
          const y = Number(anyp.activities._lastMonth.split('-')[0]);
          if(!isNaN(y)) return y + (new Date().getMonth() >= 8 ? 1 : 0);
        }
        return defaultServiceYear;
      })();

      // left arrow
      const left = document.createElement('button');
      left.className = 'secondary';
      left.title = 'Año anterior';
      left.textContent = '◀';
      left.style.padding = '6px 8px';
      left.addEventListener('click', (ev) => {
        ev.stopPropagation();
        curYear = curYear - 1;
        yearDisplay.textContent = String(curYear);
        setServiceYearRange(curYear);
      });
      yearWrap.appendChild(left);

      // year display
      const yearDisplay = document.createElement('div');
      yearDisplay.style.minWidth = '64px';
      yearDisplay.style.textAlign = 'center';
      yearDisplay.style.fontWeight = '700';
      yearDisplay.style.background = 'transparent';
      yearDisplay.style.padding = '6px 8px';
      yearDisplay.style.borderRadius = '8px';
      yearDisplay.style.border = '1px solid rgba(255,255,255,0.04)';
      yearDisplay.style.color = 'var(--text)';
      yearDisplay.textContent = String(curYear);
      yearDisplay.title = 'Año de servicio seleccionado';
      yearWrap.appendChild(yearDisplay);

      // right arrow
      const right = document.createElement('button');
      right.className = 'secondary';
      right.title = 'Año siguiente';
      right.textContent = '▶';
      right.style.padding = '6px 8px';
      right.addEventListener('click', (ev) => {
        ev.stopPropagation();
        curYear = curYear + 1;
        yearDisplay.textContent = String(curYear);
        setServiceYearRange(curYear);
      });
      yearWrap.appendChild(right);

      // clicking year display opens small chooser (month-tab style) to type/select year quickly
      yearDisplay.addEventListener('click', (ev) => {
        ev.stopPropagation();
        // prevent multiple tabs
        if(document.getElementById('serviceYearTab')) return;
        const tab = document.createElement('div');
        tab.id = 'serviceYearTab';
        tab.className = 'month-tab';
        tab.style.minWidth = '180px';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1900';
        input.max = '2099';
        input.value = String(curYear);
        input.style.width = '100%';
        input.addEventListener('keydown', (ke) => {
          if(ke.key === 'Enter'){
            ke.preventDefault();
            const v = parseInt(input.value,10) || curYear;
            curYear = v;
            yearDisplay.textContent = String(curYear);
            setServiceYearRange(curYear);
            tab.remove();
          } else if(ke.key === 'Escape'){
            ke.preventDefault();
            tab.remove();
          }
        });
        input.addEventListener('change', () => {
          const v = parseInt(input.value,10) || curYear;
          curYear = v;
          yearDisplay.textContent = String(curYear);
          setServiceYearRange(curYear);
          tab.remove();
        });
        tab.appendChild(input);
        document.body.appendChild(tab);
        const rect = yearDisplay.getBoundingClientRect();
        tab.style.position = 'absolute';
        tab.style.left = (rect.left + window.scrollX) + 'px';
        tab.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        tab.style.zIndex = 9999;
        input.focus();

        setTimeout(() => {
          const onDocClick = (ev) => {
            if(!tab) return;
            if(!tab.contains(ev.target) && ev.target !== yearDisplay){
              tab.remove();
              document.removeEventListener('click', onDocClick);
            }
          };
          document.addEventListener('click', onDocClick);
        }, 0);
      });

      wrap.appendChild(yearWrap);
    } else {
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
      // If no selection, ask whether to delete ALL records
      if(!sel){
        if(!confirm('No hay registro seleccionado. ¿Desea borrar TODO el registro de personas? Esta acción no se puede deshacer.')) {
          return;
        }
        // clear all records
        people = [];
        save();
        render('');
        updateOptionsBar();
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

    // New "Grupos" button placed to the right of "Borrar Selección"
    const groupsBtn = document.createElement('button');
    groupsBtn.id = 'groupsBtn';
    groupsBtn.className = 'secondary';
    groupsBtn.textContent = 'Grupos';
    groupsBtn.title = 'Administrar Grupos';
    groupsBtn.style.marginLeft = '8px';

    groupsBtn.addEventListener('click', () => {
      // close any existing groups popup
      const existing = document.getElementById('groupsPopup');
      if (existing) {
        existing.remove();
        return;
      }

      // compute month-year date (MM-YYYY) and build editable title span (persisted separately)
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = String(now.getFullYear());
      // load persisted group title or default
      const savedGroupTitle = (function(){
        try{ return localStorage.getItem(GROUP_TITLE_KEY) || 'GRUPOS DE SERVICIO OESTE'; }catch(e){ return 'GRUPOS DE SERVICIO OESTE'; }
      })();
      // We will render title as: [editable span with savedGroupTitle] - [non-editable date span]

      // group people by numeric group (only numeric groups shown) but keep reference to person id and role
      const groupsMap = {};
      people.forEach(p => {
        const g = (p.group || '').toString().trim();
        if (/^\d+$/.test(g)) {
          if (!groupsMap[g]) groupsMap[g] = [];
          // use congName fallback
          const displayName = (p.congName && p.congName.trim()) ? p.congName.trim() : `${(p.firstName||'').trim()} ${(p.lastNameP||'').trim()}`.trim();
          groupsMap[g].push({ id: p.id, name: displayName, role: (p.groupRole || '') });
        }
      });

      // sort group numbers ascending
      const groupNums = Object.keys(groupsMap).map(Number).sort((a,b) => a-b).map(String);

      // build popup container
      const popup = document.createElement('div');
      popup.id = 'groupsPopup';
      popup.style.position = 'fixed';
      popup.style.inset = '0';
      popup.style.display = 'flex';
      popup.style.alignItems = 'center';
      popup.style.justifyContent = 'center';
      popup.style.background = 'rgba(15,23,42,0.3)';
      popup.style.zIndex = '120';
      popup.style.padding = '18px';

      // inner card - start with auto width; we'll set an exact width later based on content
      const card = document.createElement('div');
      card.style.width = 'auto';
      card.style.maxWidth = '95vw';
      card.style.maxHeight = 'calc(100vh - 40px)';
      card.style.background = 'var(--card)';
      card.style.border = '1px solid var(--subtle)';
      card.style.borderRadius = '10px';
      card.style.boxShadow = '0 18px 48px rgba(16,24,40,0.18)';
      card.style.overflow = 'hidden';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';

      // header
      const hdr = document.createElement('div');
      hdr.style.display = 'flex';
      hdr.style.alignItems = 'center';
      hdr.style.justifyContent = 'space-between';
      hdr.style.padding = '10px 12px';
      hdr.style.borderBottom = '1px solid var(--subtle)';

      const h3 = document.createElement('h3');
      h3.style.margin = '0';
      h3.style.fontSize = '15px';
      h3.style.fontWeight = '700';
      // create editable title span and non-editable date span
      const titleSpan = document.createElement('span');
      titleSpan.id = 'groupsTitleSpan';
      titleSpan.textContent = savedGroupTitle;
      titleSpan.style.cursor = 'default';
      titleSpan.title = 'Doble click para editar el título (fecha no editable)';

      // only the date portion: non-editable
      const dateSpan = document.createElement('span');
      dateSpan.id = 'groupsDateSpan';
      dateSpan.textContent = ` - ${mm}-${yyyy}`;
      dateSpan.style.fontWeight = '600';
      dateSpan.style.marginLeft = '6px';
      // assemble into header h3
      h3.appendChild(titleSpan);
      h3.appendChild(dateSpan);

      // dblclick handler: allow editing only the titleSpan (not the date)
      titleSpan.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        // prevent creating multiple inputs
        if (titleSpan.dataset.editing === '1') return;
        titleSpan.dataset.editing = '1';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = titleSpan.textContent || '';
        input.style.fontSize = '15px';
        input.style.fontWeight = '700';
        input.style.padding = '4px 6px';
        input.style.borderRadius = '6px';
        input.style.border = '1px solid var(--subtle)';
        input.style.minWidth = '160px';
        // replace span with input in place
        h3.replaceChild(input, titleSpan);
        input.focus();
        input.select();

        function commit(){
          const val = (input.value || '').trim() || 'GRUPOS DE SERVICIO OESTE';
          // save persisted title
          try{ localStorage.setItem(GROUP_TITLE_KEY, val); }catch(e){}
          // restore titleSpan with new value
          titleSpan.textContent = val;
          titleSpan.dataset.editing = '0';
          try{ h3.replaceChild(titleSpan, input); }catch(e){}
        }
        function cancel(){
          titleSpan.dataset.editing = '0';
          try{ h3.replaceChild(titleSpan, input); }catch(e){}
        }

        input.addEventListener('blur', commit, { once: true });
        input.addEventListener('keydown', (ke) => {
          if(ke.key === 'Enter'){ ke.preventDefault(); commit(); }
          if(ke.key === 'Escape'){ ke.preventDefault(); cancel(); }
        });
      });

      // compute total number of records shown in the groups popup
      const totalCount = groupNums.reduce((sum, g) => sum + ((groupsMap[g] && groupsMap[g].length) ? groupsMap[g].length : 0), 0);

      // Total display box (placed to the left of the close button)
      const rightWrap = document.createElement('div');
      rightWrap.style.display = 'flex';
      rightWrap.style.alignItems = 'center';
      rightWrap.style.gap = '10px';

      // PDF export button (red) placed to the left of the Total box
      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'danger';
      pdfBtn.textContent = 'PDF';
      pdfBtn.title = 'Exportar grupos a PDF (horizontal, carta)';
      pdfBtn.style.padding = '8px 10px';
      pdfBtn.style.marginRight = '6px';

      const totalBox = document.createElement('div');
      totalBox.style.display = 'flex';
      totalBox.style.alignItems = 'center';
      totalBox.style.gap = '8px';
      totalBox.style.padding = '6px 10px';
      totalBox.style.borderRadius = '8px';
      totalBox.style.background = 'linear-gradient(180deg, rgba(11,102,255,0.06), rgba(11,102,255,0.03))';
      totalBox.style.border = '1px solid rgba(11,102,255,0.06)';
      totalBox.style.fontWeight = '700';
      totalBox.style.fontSize = '13px';
      totalBox.style.color = 'var(--accent-strong)';

      const lbl = document.createElement('div');
      lbl.textContent = 'Total:';
      lbl.style.color = 'var(--muted)';
      lbl.style.fontWeight = '700';
      lbl.style.fontSize = '13px';

      const val = document.createElement('div');
      val.textContent = String(totalCount);
      val.style.minWidth = '28px';
      val.style.textAlign = 'right';

      totalBox.appendChild(lbl);
      totalBox.appendChild(val);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'icon-btn';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Cerrar';
      closeBtn.addEventListener('click', () => popup.remove());

      rightWrap.appendChild(pdfBtn);
      rightWrap.appendChild(totalBox);
      rightWrap.appendChild(closeBtn);

      hdr.appendChild(h3);
      hdr.appendChild(rightWrap);

      // body: horizontal columns for each group left-to-right
      const body = document.createElement('div');
      body.style.display = 'flex';
      body.style.gap = '12px';
      body.style.padding = '12px';
      body.style.alignItems = 'flex-start';
      body.style.justifyContent = 'flex-start';
      // allow horizontal scroll internally if viewport too small, but we'll aim to size card to fit content
      body.style.overflowX = 'auto';

      // Build columns in memory first so we can measure widths
      const columns = [];

      if (groupNums.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '20px';
        empty.style.color = 'var(--muted)';
        empty.textContent = 'No hay miembros asignados a grupos numéricos.';
        body.appendChild(empty);
      } else {
        // create a column element for each group and collect name text for measurement
        groupNums.forEach(gNum => {
          const col = document.createElement('div');
          col.style.flex = '0 0 auto';
          col.style.background = '#fff';
          col.style.border = '1px solid var(--subtle)';
          col.style.borderRadius = '8px';
          col.style.padding = '6px';
          col.style.boxSizing = 'border-box';
          col.style.display = 'flex';
          col.style.flexDirection = 'column';
          col.style.gap = '4px';
          col.style.position = 'relative'; // for resizer handle positioning

          const caption = document.createElement('div');
          caption.style.fontWeight = '700';
          caption.style.fontSize = '12px';
          caption.style.textAlign = 'center';
          caption.textContent = `Grupo ${gNum}`;
          col.appendChild(caption);

          const listWrap = document.createElement('div');
          listWrap.style.display = 'flex';
          listWrap.style.flexDirection = 'column';
          listWrap.style.gap = '4px';
          listWrap.style.marginTop = '6px';

          // use objects with id/name/role and sort by role priority then name
          const persons = groupsMap[gNum] || [];
          persons.sort((a,b) => {
            const priority = role => (role === 'SUP' ? 0 : (role === 'AUX' ? 1 : 2));
            const pa = priority(a.role), pb = priority(b.role);
            if(pa !== pb) return pa - pb;
            return a.name.localeCompare(b.name,'es');
          });

          persons.forEach((personObj, personIndex) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'center';
            row.style.gap = '6px';
            row.style.padding = '4px';
            row.style.borderRadius = '6px';
            row.style.background = 'transparent';
            row.style.fontSize = '13px';
            row.dataset.personId = personObj.id;

            // badge wrapper to hold badge and a small positioned sequence number (so number doesn't affect layout)
            const badgeWrap = document.createElement('div');
            badgeWrap.style.position = 'relative';
            badgeWrap.style.flex = '0 0 auto';
            badgeWrap.style.display = 'flex';
            badgeWrap.style.alignItems = 'center';
            badgeWrap.style.justifyContent = 'center';
            badgeWrap.style.width = '30px';
            badgeWrap.style.height = '20px';

            // role badge (square) on left if set
            const badge = document.createElement('div');
            badge.style.width = '100%';
            badge.style.height = '100%';
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.borderRadius = '4px';
            badge.style.fontSize = '11px';
            badge.style.fontWeight = '700';
            badge.style.color = '#fff';
            if(personObj.role === 'SUP'){
              badge.textContent = 'SUP';
              badge.style.background = 'var(--accent-warm)';
              badge.style.visibility = 'visible';
            } else if(personObj.role === 'AUX'){
              badge.textContent = 'AUX';
              badge.style.background = 'var(--accent)';
              badge.style.visibility = 'visible';
            } else {
              badge.textContent = '';
              badge.style.background = 'transparent';
              badge.style.visibility = 'hidden';
            }

            // sequence number element positioned under the badge; show numbers starting at 3 (index 2 => number 3)
            const seq = document.createElement('div');
            seq.className = 'group-seq';
            const displayIndex = personIndex + 1; // 1-based
            // always show 1-based sequence number starting at 1
            seq.textContent = String(displayIndex);
            seq.style.visibility = 'visible';

            const nameEl = document.createElement('div');
            nameEl.style.flex = '1 1 auto';
            nameEl.style.textAlign = 'center';
            nameEl.textContent = personObj.name;
            nameEl.style.cursor = 'pointer';

            // clicking the name opens a small selector tab to pick SUP or AUX
            nameEl.addEventListener('click', (ev) => {
              ev.stopPropagation();
              // remove any other selector panels
              const openSel = document.getElementById('groupRoleSelector');
              if(openSel) openSel.remove();

              const sel = document.createElement('div');
              sel.id = 'groupRoleSelector';
              sel.style.position = 'absolute';
              sel.style.zIndex = 200;
              sel.style.display = 'flex';
              sel.style.gap = '6px';
              sel.style.padding = '6px';
              sel.style.borderRadius = '8px';
              sel.style.background = '#fff';
              sel.style.border = '1px solid var(--subtle)';
              // SUP button
              const supBtn = document.createElement('button');
              supBtn.className = 'secondary';
              supBtn.textContent = 'SUP';
              supBtn.style.padding = '6px 10px';
              supBtn.addEventListener('click', (ev2) => {
                ev2.stopPropagation();
                // persist role to person record
                const pers = people.find(pp => pp.id === personObj.id);
                if(pers) pers.groupRole = 'SUP';
                save();
                // update badge & resort column
                personObj.role = 'SUP';
                badge.textContent = 'SUP';
                badge.style.background = 'var(--accent-warm)';
                badge.style.visibility = 'visible';
                // resort current column persons and redraw the column entries
                redrawColumn(gNum, col, GROUP_COLS_KEY);
                sel.remove();
              });
              // AUX button
              const auxBtn = document.createElement('button');
              auxBtn.className = 'secondary';
              auxBtn.textContent = 'AUX';
              auxBtn.style.padding = '6px 10px';
              auxBtn.addEventListener('click', (ev2) => {
                ev2.stopPropagation();
                const pers = people.find(pp => pp.id === personObj.id);
                if(pers) pers.groupRole = 'AUX';
                save();
                personObj.role = 'AUX';
                badge.textContent = 'AUX';
                badge.style.background = 'var(--accent)';
                badge.style.visibility = 'visible';
                redrawColumn(gNum, col, GROUP_COLS_KEY);
                sel.remove();
              });

              // Clear role button
              const clearBtn = document.createElement('button');
              clearBtn.className = 'secondary';
              clearBtn.textContent = 'Limpiar';
              clearBtn.style.padding = '6px 10px';
              clearBtn.addEventListener('click', (ev2) => {
                ev2.stopPropagation();
                const pers = people.find(pp => pp.id === personObj.id);
                if(pers) delete pers.groupRole;
                save();
                personObj.role = '';
                badge.textContent = '';
                badge.style.visibility = 'hidden';
                redrawColumn(gNum, col, GROUP_COLS_KEY);
                sel.remove();
              });

              sel.appendChild(supBtn);
              sel.appendChild(auxBtn);
              sel.appendChild(clearBtn);

              document.body.appendChild(sel);
              const rect = nameEl.getBoundingClientRect();
              sel.style.left = (rect.left + window.scrollX) + 'px';
              sel.style.top = (rect.bottom + window.scrollY + 8) + 'px';

              // click outside to close
              setTimeout(() => {
                const closeOnDoc = (ev3) => {
                  if(!sel) return;
                  if(!sel.contains(ev3.target) && ev3.target !== nameEl){
                    sel.remove();
                    document.removeEventListener('click', closeOnDoc);
                  }
                };
                document.addEventListener('click', closeOnDoc);
              }, 0);

              supBtn.focus();
            });

            // assemble items: sequence number on the left, name in the middle, role badge on the right
            badgeWrap.appendChild(badge);
            row.appendChild(seq);
            row.appendChild(nameEl);
            row.appendChild(badgeWrap);
            listWrap.appendChild(row);
          });

          col.appendChild(listWrap);
          columns.push({ col, captionText: caption.textContent, persons, groupId: gNum });
        });

        // measurement and defaults
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = '13px sans-serif';
        const gap = 12; // gap between columns in px (matches body.style.gap)
        const paddingH = 6 * 2 + 4; // left/right padding inside column + reduced buffer for compact rows
        const minCol = 100;
        const maxCol = 520;

        // load saved widths if present (persist per-ordered group list)
        const GROUP_COLS_KEY = 'people_registry_groups_cols_v1';
        let savedWidths = null;
        try {
          const raw = localStorage.getItem(GROUP_COLS_KEY);
          savedWidths = raw ? JSON.parse(raw) : null;
        } catch (e) { savedWidths = null; }

        let totalWidth = 0;
        columns.forEach((cObj, index) => {
          // measure caption width and longest name width (use person names)
          const captionW = ctx.measureText(String(cObj.captionText || '')).width;
          let longest = captionW;
          cObj.persons.forEach(n => {
            const w = ctx.measureText(String(n.name || '')).width;
            if(w > longest) longest = w;
          });
          // compute column width with padding and clamp
          const measured = Math.min(maxCol, Math.max(minCol, Math.ceil(longest + paddingH)));
          // if saved width exists for this column index, prefer it
          const saved = (Array.isArray(savedWidths) && typeof savedWidths[index] !== 'undefined') ? savedWidths[index] : null;
          const colW = saved ? Math.max(60, Number(saved)) : measured;
          cObj.computedWidth = colW;
          totalWidth += colW;
        });

        // add gaps between columns and card paddings/margins
        const totalGaps = Math.max(0, columns.length - 1) * gap;
        const cardExtra = 24 + 24; // body padding left+right approx
        let desiredWidth = totalWidth + totalGaps + cardExtra;
        // Do not clamp to viewport: make the card exactly as wide as needed so all column content is visible.
        const finalWidth = desiredWidth;

        // helper to redraw a single column when roles change: resort persons and rebuild list
        function redrawColumn(groupId, colEl, groupColsKey) {
          try {
            // find column object
            const cobj = columns.find(c => c.groupId === groupId);
            if(!cobj) return;
            // refresh persons from groupsMap (reflect latest people array)
            const updatedPersons = (groupsMap[groupId] || []).map(item => {
              const pers = people.find(pp => pp.id === item.id);
              return { id: item.id, name: (pers && pers.congName) ? pers.congName : item.name, role: pers ? (pers.groupRole || '') : item.role };
            });
            // sort by role priority then name
            updatedPersons.sort((a,b) => {
              const priority = role => (role === 'SUP' ? 0 : (role === 'AUX' ? 1 : 2));
              const pa = priority(a.role), pb = priority(b.role);
              if(pa !== pb) return pa - pb;
              return a.name.localeCompare(b.name,'es');
            });
            cobj.persons = updatedPersons;

            // rebuild listWrap
            const listWrap = colEl.querySelector('div:nth-child(2)');
            if(!listWrap) return;
            listWrap.innerHTML = '';
            updatedPersons.forEach((personObj, idx) => {
              const row = document.createElement('div');
              row.style.display = 'flex';
              row.style.alignItems = 'center';
              row.style.justifyContent = 'center';
              row.style.gap = '6px';
              row.style.padding = '4px';
              row.style.borderRadius = '6px';
              row.style.background = 'transparent';
              row.style.fontSize = '13px';
              row.dataset.personId = personObj.id;

              // badge wrapper for positioning sequence number without changing layout
              const badgeWrap = document.createElement('div');
              badgeWrap.style.position = 'relative';
              badgeWrap.style.flex = '0 0 auto';
              badgeWrap.style.display = 'flex';
              badgeWrap.style.alignItems = 'center';
              badgeWrap.style.justifyContent = 'center';
              badgeWrap.style.width = '30px';
              badgeWrap.style.height = '20px';

              const badge = document.createElement('div');
              badge.style.width = '100%';
              badge.style.height = '100%';
              badge.style.display = 'flex';
              badge.style.alignItems = 'center';
              badge.style.justifyContent = 'center';
              badge.style.borderRadius = '4px';
              badge.style.fontSize = '11px';
              badge.style.fontWeight = '700';
              badge.style.color = '#fff';
              if(personObj.role === 'SUP'){
                badge.textContent = 'SUP';
                badge.style.background = 'var(--accent-warm)';
                badge.style.visibility = 'visible';
              } else if(personObj.role === 'AUX'){
                badge.textContent = 'AUX';
                badge.style.background = 'var(--accent)';
                badge.style.visibility = 'visible';
              } else {
                badge.textContent = '';
                badge.style.background = 'transparent';
                badge.style.visibility = 'hidden';
              }

              const seq = document.createElement('div');
              seq.className = 'group-seq';
              const displayIndex = idx + 1;
              // always show 1-based sequence number starting at 1
              seq.textContent = String(displayIndex);
              seq.style.visibility = 'visible';

              const nameEl = document.createElement('div');
              nameEl.style.flex = '1 1 auto';
              nameEl.style.textAlign = 'center';
              nameEl.textContent = personObj.name;
              nameEl.style.cursor = 'pointer';

              nameEl.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const openSel = document.getElementById('groupRoleSelector');
                if(openSel) openSel.remove();

                const sel = document.createElement('div');
                sel.id = 'groupRoleSelector';
                sel.style.position = 'absolute';
                sel.style.zIndex = 200;
                sel.style.display = 'flex';
                sel.style.gap = '6px';
                sel.style.padding = '6px';
                sel.style.borderRadius = '8px';
                sel.style.background = '#fff';
                sel.style.border = '1px solid var(--subtle)';

                const supBtn = document.createElement('button');
                supBtn.className = 'secondary';
                supBtn.textContent = 'SUP';
                supBtn.style.padding = '6px 10px';
                supBtn.addEventListener('click', (ev2) => {
                  ev2.stopPropagation();
                  const pers = people.find(pp => pp.id === personObj.id);
                  if(pers) pers.groupRole = 'SUP';
                  save();
                  redrawColumn(groupId, colEl, GROUP_COLS_KEY);
                  sel.remove();
                });
                const auxBtn = document.createElement('button');
                auxBtn.className = 'secondary';
                auxBtn.textContent = 'AUX';
                auxBtn.style.padding = '6px 10px';
                auxBtn.addEventListener('click', (ev2) => {
                  ev2.stopPropagation();
                  const pers = people.find(pp => pp.id === personObj.id);
                  if(pers) pers.groupRole = 'AUX';
                  save();
                  redrawColumn(groupId, colEl, GROUP_COLS_KEY);
                  sel.remove();
                });
                const clearBtn = document.createElement('button');
                clearBtn.className = 'secondary';
                clearBtn.textContent = 'Limpiar';
                clearBtn.style.padding = '6px 10px';
                clearBtn.addEventListener('click', (ev2) => {
                  ev2.stopPropagation();
                  const pers = people.find(pp => pp.id === personObj.id);
                  if(pers) delete pers.groupRole;
                  save();
                  redrawColumn(groupId, colEl, GROUP_COLS_KEY);
                  sel.remove();
                });

                sel.appendChild(supBtn);
                sel.appendChild(auxBtn);
                sel.appendChild(clearBtn);

                document.body.appendChild(sel);
                const rect = nameEl.getBoundingClientRect();
                sel.style.left = (rect.left + window.scrollX) + 'px';
                sel.style.top = (rect.bottom + window.scrollY + 8) + 'px';

                setTimeout(() => {
                  const closeOnDoc = (ev3) => {
                    if(!sel) return;
                    if(!sel.contains(ev3.target) && ev3.target !== nameEl){
                      sel.remove();
                      document.removeEventListener('click', closeOnDoc);
                    }
                  };
                  document.addEventListener('click', closeOnDoc);
                }, 0);

                supBtn.focus();
              });

              badgeWrap.appendChild(badge);
              // assemble items: sequence number left, name middle, role badge right
              row.appendChild(seq);
              row.appendChild(nameEl);
              row.appendChild(badgeWrap);
              listWrap.appendChild(row);
            });
          } catch (err) {
            console.error('redrawColumn error', err);
          }
        }

        // apply computed widths and append columns to body
        columns.forEach((cObj, idx) => {
          // use the computed width for each column exactly (no scaling to fit viewport)
          let w = cObj.computedWidth;
          cObj.col.style.width = String(w) + 'px';
          cObj.col.style.minWidth = String(w) + 'px';
          cObj.col.style.maxWidth = String(w) + 'px';
          // add a resizer handle on the right edge of each column (except last to avoid awkward overflow)
          const resizer = document.createElement('div');
          resizer.style.position = 'absolute';
          resizer.style.top = '6px';
          resizer.style.right = '-6px';
          resizer.style.width = '12px';
          resizer.style.height = 'calc(100% - 12px)';
          resizer.style.cursor = 'col-resize';
          resizer.style.zIndex = '20';
          // small visible grip
          resizer.style.display = 'flex';
          resizer.style.alignItems = 'center';
          resizer.style.justifyContent = 'center';
          resizer.innerHTML = '<div style="width:2px;height:40%;background:rgba(15,23,42,0.06);border-radius:2px"></div>';
          cObj.col.appendChild(resizer);

          // pointer handling for resizing that column and updating widths array
          let startX = 0;
          let startW = 0;
          const onPointerDown = (e) => {
            e.preventDefault();
            startX = e.clientX;
            startW = cObj.col.getBoundingClientRect().width;
            resizer.setPointerCapture && resizer.setPointerCapture(e.pointerId);
            document.documentElement.style.cursor = 'col-resize';

            function onPointerMove(ev){
              const dx = ev.clientX - startX;
              const desiredW = Math.max(60, Math.round(startW + dx));
              // Apply the same width to all columns to keep uniform widths
              columns.forEach(c => {
                c.col.style.width = desiredW + 'px';
                c.col.style.minWidth = desiredW + 'px';
                c.col.style.maxWidth = desiredW + 'px';
              });
              // recalc total and adjust card width to fit all columns (uniform)
              const currentTotal = columns.length * desiredW;
              const newDesired = currentTotal + totalGaps + cardExtra;
              const newFinal = Math.min(newDesired, Math.floor(window.innerWidth - 40));
              card.style.width = newFinal + 'px';
            }
            function onPointerUp(ev){
              document.removeEventListener('pointermove', onPointerMove);
              document.removeEventListener('pointerup', onPointerUp);
              document.documentElement.style.cursor = '';
              try{ resizer.releasePointerCapture && resizer.releasePointerCapture(e.pointerId); }catch(_){}
              // persist uniform width for all columns
              try{
                const widthVal = parseInt(cObj.col.style.width || '0',10) || 0;
                const widths = columns.map(() => widthVal);
                localStorage.setItem(GROUP_COLS_KEY, JSON.stringify(widths));
              }catch(err){}
            }
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
          };
          resizer.addEventListener('pointerdown', onPointerDown);

          body.appendChild(cObj.col);
        });

        // set card width to exactly fit content (no clamping) so columns are always fully visible
        card.style.width = finalWidth + 'px';
        card.style.maxWidth = 'none';
        card.style.overflow = 'visible';
        // ensure the body holding columns won't force an internal horizontal scrollbar;
        // allow the popup card to expand to the required width so all column content is shown.
        body.style.overflowX = 'visible';
      }

      // PDF export handler: generate landscape letter-size PDF of the groups popup
      try {
        // attach handler only if pdfBtn exists
        if (typeof pdfBtn !== 'undefined' && pdfBtn) {
          pdfBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            try{
              const jsPDFmod = await import('https://esm.sh/jspdf@2.5.1');
              const { jsPDF } = jsPDFmod;
              // use compact settings: smaller base font and tighter line spacing
              const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
              const pageW = pdf.internal.pageSize.getWidth();
              const pageH = pdf.internal.pageSize.getHeight();
              const margin = 22; // slightly smaller margins to gain space
              const usableW = pageW - margin * 2;
              let y = margin;

              // Title (smaller) - use persisted editable group title + automatic date (date not editable)
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(12);
              // compute pdf title from saved title + current date part
              const pdfSavedTitle = (function(){ try{ return localStorage.getItem(GROUP_TITLE_KEY) || 'GRUPOS DE SERVICIO OESTE'; }catch(e){ return 'GRUPOS DE SERVICIO OESTE'; } })();
              const pdfTitle = `${pdfSavedTitle} - ${mm}-${yyyy}`;
              pdf.text(pdfTitle, margin, y);
              y += 18;

              // Add Total label prominently beneath title (compact)
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(10);
              pdf.text(`Total: ${totalCount}`, margin, y);
              y += 16;

              // Determine column widths from computed DOM widths of columns
              const colWidths = columns.map(c => {
                const wpx = parseInt(String(c.col.style.width || c.computedWidth || 120).replace('px',''),10) || c.computedWidth || 120;
                return wpx;
              });

              // Normalize widths proportionally to fit usableW
              const totalPx = colWidths.reduce((s,v)=>s+v,0) || 1;
              const pdfColWidths = colWidths.map(w => Math.max(50, Math.floor((w / totalPx) * usableW)));

              // Prepare compact table-like header row: use smaller bold font
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(9);

              // column X positions
              const xPositions = [];
              let x = margin;
              pdfColWidths.forEach((w, i) => {
                xPositions.push(x);
                // Draw header centered in a compact style
                const hdr = `Grupo ${columns[i].groupId}`;
                pdf.text(hdr, x + w/2, y, { align: 'center' });
                x += w;
              });
              y += 14;

              // Switch to compact normal font for rows
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(8.5);
              const rowHeight = 13; // tighter than before

              // Compute max rows to layout as table
              const maxRows = Math.max(...columns.map(c => (c.persons && c.persons.length) ? c.persons.length : 0), 0);

              // For each row index, print name and role/badge inside each column area
              for(let rowIdx = 0; rowIdx < maxRows; rowIdx++){
                // page break if necessary
                if(y + rowHeight + margin > pageH){
                  pdf.addPage();
                  y = margin;
                }
                for(let ci = 0; ci < columns.length; ci++){
                  const c = columns[ci];
                  const w = pdfColWidths[ci];
                  const px = xPositions[ci];
                  const person = c.persons[rowIdx];
                  if(person){
                    // show compact "N. Name" with small badge for SUP/AUX if present
                    const seq = String(rowIdx + 1);
                    const name = person.name || '';
                    const role = person.role || '';
                    const text = `${seq}. ${name}`;
                    // draw name left-aligned with small padding
                    pdf.text(text, px + 4, y + 9, { maxWidth: w - 8 });

                    // draw small colored badge for SUP/AUX on the right inside the cell
                    if(role === 'SUP' || role === 'AUX'){
                      const badgeText = role;
                      const badgeFontSize = 7;
                      pdf.setFontSize(badgeFontSize);
                      const badgeW = Math.max(20, pdf.getTextWidth(badgeText) + 6);
                      const badgeH = 10;
                      const bx = px + w - badgeW - 4;
                      const by = y + 2;
                      if (role === 'SUP') {
                        pdf.setFillColor(255,122,26);
                      } else {
                        pdf.setFillColor(11,102,255);
                      }
                      pdf.roundedRect(bx, by, badgeW, badgeH, 2, 2, 'F');
                      pdf.setTextColor(255,255,255);
                      pdf.text(badgeText, bx + badgeW/2, by + badgeH - 2, { align: 'center' });
                      pdf.setTextColor(0,0,0);
                      pdf.setFontSize(8.5);
                    }
                  }
                }
                y += rowHeight;
              }

              // After table, include generation date and a compact footer line
              if(y + 30 > pageH - margin) {
                pdf.addPage();
                y = margin;
              }
              pdf.setFontSize(8);
              pdf.text(`Generado: ${new Date().toLocaleString()}`, margin, pageH - margin - 6);

              // Save PDF with compact filename in format YYYY.MM.DD-HH.MM - GRUPOS DE SERVICIO
              const _d = new Date();
              const fileName = `${_d.getFullYear()}.${String(_d.getMonth() + 1).padStart(2,'0')}.${String(_d.getDate()).padStart(2,'0')}-${String(_d.getHours()).padStart(2,'0')}.${String(_d.getMinutes()).padStart(2,'0')} - GRUPOS DE SERVICIO.pdf`;
              pdf.save(fileName);
            }catch(err){
              console.error(err);
              alert('Error al generar PDF de Grupos: ' + (err && err.message ? err.message : err));
            }
          });
        }
      } catch(e){
        console.error('PDF handler attach failed', e);
      }

      // footer: simple close action
      const footer = document.createElement('div');
      footer.style.padding = '10px 12px';
      footer.style.borderTop = '1px solid var(--subtle)';
      footer.style.display = 'flex';
      footer.style.justifyContent = 'flex-end';
      const fClose = document.createElement('button');
      fClose.className = 'secondary';
      fClose.textContent = 'Cerrar';
      fClose.addEventListener('click', () => popup.remove());
      footer.appendChild(fClose);

      card.appendChild(hdr);
      card.appendChild(body);
      card.appendChild(footer);
      popup.appendChild(card);
      document.body.appendChild(popup);

      // close when clicking outside the card
      popup.addEventListener('click', (ev) => {
        if (ev.target === popup) popup.remove();
      });

      // ensure we react to window resize to keep card within viewport and preserve column widths
      window.addEventListener('resize', () => {
        try{
          const GROUP_COLS_KEY = 'people_registry_groups_cols_v1';
          const saved = JSON.parse(localStorage.getItem(GROUP_COLS_KEY) || 'null');
          if(saved && Array.isArray(saved) && saved.length){
            // apply saved widths if card exists
            columns.forEach((cObj, idx) => {
              const w = saved[idx];
              if(typeof w !== 'undefined' && w !== null){
                const ww = Math.max(60, Number(w));
                cObj.col.style.width = ww + 'px';
                cObj.col.style.minWidth = ww + 'px';
                cObj.col.style.maxWidth = ww + 'px';
              }
            });
            // recalc total and adjust card width
            const totalCols = columns.reduce((acc, c) => acc + (parseInt(c.col.style.width || '0',10) || 0), 0);
            const totalGaps = Math.max(0, columns.length - 1) * 12;
            const cardExtra = 24 + 24;
            const desired = totalCols + totalGaps + cardExtra;
            const final = Math.min(desired, Math.floor(window.innerWidth - 40));
            card.style.width = final + 'px';
          }
        }catch(e){}
      }, { passive: true });
    });

    bar.appendChild(groupsBtn);
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
    // build filename: YYYY.MM.DD-HH.MM - RESPALDO REGISTRO.json
    const _d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fileName = `${_d.getFullYear()}.${pad(_d.getMonth() + 1)}.${pad(_d.getDate())}-${pad(_d.getHours())}.${pad(_d.getMinutes())} - RESPALDO REGISTRO.json`;
    a.download = fileName;
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

/* CSV bulk load via modal "Cargar" button */
if(loadBtn && csvFile){
  loadBtn.addEventListener('click', (ev) => {
    // open csv file picker
    csvFile.click();
  });

  csvFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const text = reader.result;
        // split lines, handle both \r\n and \n
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if(lines.length < 1) throw new Error('CSV vacío o formato inválido.');

        // parse header and map common header names to internal keys
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        // mapping common Spanish/English header names to internal keys
        const alias = {
          'nombre (cong.)':'congname','congname':'congname','nombrecong':'congname',
          'nombre':'firstname','first name':'firstname','firstName':'firstname','first_name':'firstname',
          'apellido paterno':'lastnamep','apellido_paterno':'lastnamep','last name p':'lastnamep','lastNameP':'lastnamep','last_name_p':'lastnamep',
          'apellido materno':'lastnamem','apellido_materno':'lastnamem','last name m':'lastnamem','lastNameM':'lastnamem','last_name_m':'lastnamem',
          'grupo':'group','group':'group',
          'privilegio':'privilege','privilegio ':'privilege','privilege':'privilege',
          'designación':'designation','designacion':'designation','designation':'designation',
          'sexo':'sex','sex':'sex',
          'esp':'esp',
          'fecha nacimiento':'birthdate','fecha_nacimiento':'birthdate','birthdate':'birthdate','birth date':'birthdate',
          'fecha bautismo':'baptismdate','fecha_bautismo':'baptismdate','baptismdate':'baptismdate',
          'dirección':'address','direccion':'address','address':'address',
          'teléfono':'phone','telefono':'phone','phone':'phone',
          'contacto emergencia':'emergencycontact','contacto_emergencia':'emergencycontact','emergency contact':'emergencycontact'
        };

        // create header->key map
        const headerMap = header.map(h => alias[h] || h.replace(/\s+/g,'').toLowerCase());

        // parse rows
        const newRecords = [];
        for(let i=1;i<lines.length;i++){
          const cols = lines[i].split(',').map(c => c.trim());
          if(cols.length === 0) continue;
          // build record object using headerMap
          const rec = {
            congName:'', firstName:'', lastNameP:'', lastNameM:'', group:'', privilege:'', designation:'',
            sex:'', esp:'', birthDate:'', baptismDate:'', address:'', phone:'', emergencyContact:'', activities:{}
          };
          for(let j=0;j<headerMap.length && j<cols.length;j++){
            const k = headerMap[j];
            const v = cols[j];
            if(!k) continue;
            switch(k){
              case 'congname': rec.congName = v; break;
              case 'firstname': rec.firstName = v; break;
              case 'lastnamep': rec.lastNameP = v; break;
              case 'lastnamem': rec.lastNameM = v; break;
              case 'group': rec.group = v; break;
              case 'privilege': rec.privilege = v; break;
              case 'designation': rec.designation = v; break;
              case 'sex': rec.sex = v; break;
              case 'esp': rec.esp = v; break;
              case 'birthdate': rec.birthDate = normalizeDate(v); break;
              case 'baptismdate': rec.baptismDate = normalizeDate(v); break;
              case 'address': rec.address = v; break;
              case 'phone': rec.phone = v; break;
              case 'emergencycontact': rec.emergencyContact = v; break;
              default:
                // ignore unknown columns
                break;
            }
          }
          // minimal validation: require firstName and lastNameP; if missing, skip but continue
          if(!rec.firstName && !rec.lastNameP && !rec.congName) {
            // skip empty row
            continue;
          }
          // ensure required fields: if congnName missing, synthesize from names
          if(!rec.congName){
            const combined = `${rec.firstName || ''} ${rec.lastNameP || ''}`.trim();
            rec.congName = combined;
          }
          newRecords.push({ id: uid(), ...rec });
        }

        if(newRecords.length === 0) throw new Error('No se encontraron registros válidos en el CSV.');

        // append to existing people list
        people = people.concat(newRecords);
        save();
        render(searchInput.value);
        alert(`Se agregaron ${newRecords.length} registros desde CSV.`);
      }catch(err){
        alert('Error al procesar CSV: ' + (err && err.message ? err.message : err));
      } finally {
        csvFile.value = '';
      }
    };
    reader.onerror = () => {
      alert('No se pudo leer el archivo CSV.');
      csvFile.value = '';
    };
    reader.readAsText(f, 'utf-8');
  });
}

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

  // If Privilegio is "Fuera" or "Inactivo", immediately clear the group number
  if(String(record.privilege).trim() === 'Fuera' || String(record.privilege).trim() === 'Inactivo'){
    record.group = '';
  }

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
  const tr = target.closest('tr');

  // If click on activity controls, let their handlers run.
  if (tr && tr.parentElement === tbody) {
    if (
      target.closest('.act-month') ||
      target.closest('.act-aux') ||
      target.closest('.act-hours') ||
      target.closest('.act-studies') ||
      target.closest('.act-comments')
    ) {
      // ignore for selection
    } else {
      // If not activityMode and clicked specifically on the cong-cell, show profile popup
      if (!activityMode && target.closest('.cong-cell')) {
        const id = tr.dataset.id;
        const p = people.find(x => x.id === id);
        if (p) showProfilePopup(p);
        return;
      }

      // Manage selection for rows
      const prev = tbody.querySelector('tr.selected');
      if (prev && prev !== tr) prev.classList.remove('selected');
      const becameSelected = tr && !tr.classList.contains('selected');
      tbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
      if (becameSelected && tr) {
        tr.classList.add('selected');
        selectedId = tr.dataset.id || null;
      } else {
        selectedId = null;
      }

      updateOptionsBar();

      if (activityMode && becameSelected) {
        const id = tr.dataset.id;
        const p = people.find(x => x.id === id);
        if (p) {
          const q = (p.congName && p.congName.trim()) ? p.congName.trim() : `${(p.firstName||'').trim()} ${(p.lastNameP||'').trim()}`.trim();
          searchInput.value = q;
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
      ['','Publicador','Anciano','Siervo Ministerial','Fuera','Inactivo'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v || '-';
        if(String(v) === String(current)) o.selected = true;
        editor.appendChild(o);
      });
    } else if(key === 'designation'){
      editor = document.createElement('select');
      ['','Precursor Regular','Precursor Auxiliar','No Asignar','No Bautizado','N/A'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v || '-';
        if(String(v) === String(current)) o.selected = true;
        editor.appendChild(o);
      });
    } else if(key === 'sex'){
      editor = document.createElement('select');
      ['','H','M'].forEach(v => {
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

    // If Privilegio was set to "Fuera" or "Inactivo" inline, clear the group immediately
    if(String(updated.privilege).trim() === 'Fuera' || String(updated.privilege).trim() === 'Inactivo'){
      updated.group = '';
    }

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
    // Removed automatic blur commit to avoid premature closing of the inline editor;
    // user must now explicitly click "Guardar" or press Enter to save, or "Cancelar"/Escape to cancel.
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

    // pick the correct filters object for current view
    const currentFilters = activityMode ? columnFiltersActivity : columnFiltersRegistry;

    // reflect active state from currentFilters (support array or string)
    const cf = currentFilters[key];
    if(Array.isArray(cf) ? cf.length > 0 : !!cf) btn.classList.add('active'); else btn.classList.remove('active');

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
      input.placeholder = 'Escriba para filtrar o seleccione varios valores';
      // show comma-joined preview when multiple selected
      if(Array.isArray(currentFilters[key])) input.value = currentFilters[key].join(', ');
      else input.value = currentFilters[key] || '';
      input.className = 'filter-panel-input';
      inputWrap.appendChild(input);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'filter-panel-clear';
      clearBtn.textContent = 'Limpiar';
      clearBtn.addEventListener('click', () => {
        input.value = '';
        // also clear any selection marks
        Array.from(list.querySelectorAll('.filter-panel-item.selected')).forEach(it => it.classList.remove('selected'));
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
        // allow multi-select: click toggles selection; Shift/Ctrl can be used but not required
        vals.forEach(v => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'filter-panel-item';
          item.textContent = v;
          // reflect previously selected values (if any)
          const prev = currentFilters[key];
          if(Array.isArray(prev) && prev.includes(v)) item.classList.add('selected');
          // toggle selection on click
          item.addEventListener('click', () => {
            item.classList.toggle('selected');
            // update input preview: show selected values comma separated, else the typed input
            const sel = Array.from(list.querySelectorAll('.filter-panel-item.selected')).map(s => s.textContent);
            input.value = sel.length ? sel.join(', ') : '';
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

      // apply filter function (accepts multiple selected items or typed value)
      function applyFilter(){
        // collect selected items first
        const selected = Array.from(list.querySelectorAll('.filter-panel-item.selected')).map(s => s.textContent.trim()).filter(Boolean);
        if(selected.length){
          currentFilters[key] = selected; // store as array
          btn.classList.add('active');
        } else {
          // fallback to typed input (allow comma-separated typed values)
          const typed = String(input.value || '').trim();
          if(typed){
            // split on commas and trim to allow users to type multiple values
            const parts = typed.split(',').map(p => p.trim()).filter(Boolean);
            currentFilters[key] = parts.length === 1 ? parts[0] : parts;
            btn.classList.add('active');
          } else {
            delete currentFilters[key];
            btn.classList.remove('active');
          }
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

/* Render activity rows for a single service year (September–August) into popup.
   A year label like 2026 represents Sept 2025 -> Aug 2026. */
function renderActivityRowsFor(person, serviceYear){
  const container = $('#pp_activityTable');
  container.innerHTML = '';

  // compute service year default if not provided: if current month >= September, serviceYear = thisYear+1 else thisYear
  const now = new Date();
  const defaultYear = (now.getMonth() >= 8) ? (now.getFullYear() + 1) : now.getFullYear();
  serviceYear = serviceYear || defaultYear;

  // helper: build months from (serviceYear-1)-09 to serviceYear-08 inclusive
  function monthsForServiceYear(year){
    const months = [];
    const start = new Date(year - 1, 8, 1); // Sept of previous calendar year (month 8)
    const end = new Date(year, 7, 1);       // Aug of serviceYear (month 7)
    let cur = new Date(start);
    while(cur.getFullYear() < end.getFullYear() || (cur.getFullYear() === end.getFullYear() && cur.getMonth() <= end.getMonth())){
      const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      months.push({ key, label: cur.toLocaleString('es', { month:'long', year:'numeric' }) });
      cur.setMonth(cur.getMonth() + 1);
      // safety cap
      if(months.length > 36) break;
    }
    return months;
  }

  // header
  const head = document.createElement('div');
  head.className = 'pp-head';
  head.innerHTML = `<div>Año / Mes</div><div>Participación</div><div>Cursos bíblicos</div><div>Precursor auxiliar</div><div>Horas</div><div>Notas</div>`;
  container.appendChild(head);

  const months = monthsForServiceYear(serviceYear);
  let totalHours = 0;
  let totalCourses = 0;
  let coursesCounted = 0;

  months.forEach(m => {
    const row = document.createElement('div');
    row.className = 'pp-row-act';
    const act = (person.activities && person.activities[m.key]) ? person.activities[m.key] : { aux:false, hours:'', studies:'', comments:'' };

    // Determine whether this person's hours should be displayed:
    // show hours when the person is a Precursor Regular,
    // or when the month's Aux. Mes checkbox is active for that month.
    // Additionally, if there exists a later month marked "Fin Precursorado Regular",
    // months earlier than that fin month must preserve their hours (>1) visibility even if designation changed.
    const designation = String(person.designation || '').trim();
    const isPrecursor = (designation === 'Precursor Regular');

    // find earliest fin/start month (if any)
    let finMonth = '';
    let startMonth = '';
    if (person.activities) {
      for (const k of Object.keys(person.activities)) {
        if (k === '_lastMonth') continue;
        const candidate = person.activities[k];
        const txt = String(candidate && candidate.comments || '').trim();
        if (txt === 'Fin Precursorado Regular') {
          if (!finMonth || k < finMonth) finMonth = k;
        }
        if (txt === 'Inicio Precursorado Regular') {
          if (!startMonth || k < startMonth) startMonth = k;
        }
      }
    }

    const monthKey = m.key;
    const isBeforeFin = ((startMonth && monthKey < startMonth) || (finMonth && monthKey < finMonth));

    // show hours if precursor, or aux checked, or if this month is before a "Fin Precursorado Regular" and hours > 1
    // BUT never show hours when the recorded value is exactly 1 (these must be hidden in the registro popup)
    const _hoursValStr = String(act.hours || '').trim();
    const _isExactlyOne = (_hoursValStr === '1' || Number(_hoursValStr) === 1);
    const showHoursForMonth = !_isExactlyOne && (isPrecursor || !!act.aux || (isBeforeFin && act.hours !== '' && Number(act.hours) > 1));

    // Participation should reflect whether the record indicates participation:
    // consider participation true only when numeric hours > 0 (months with no hours show no check).
    const participated = (act.hours !== '' && parseInt(act.hours, 10) > 0);
    const participation = participated ? '✔' : '';

    const courses = act.studies || '';
    const precursor = act.aux ? '✔' : '';
    const hours = showHoursForMonth ? (act.hours || '') : '';

    // accumulate totals for averages: only count numeric hours when they are shown
    const hVal = (showHoursForMonth && act.hours !== '') ? (parseInt(act.hours || 0, 10) || 0) : 0;
    totalHours += hVal;

    if(courses !== '' && !isNaN(Number(courses))){
      totalCourses += Number(courses);
      coursesCounted++;
    } else if(courses !== '' && /^\d+$/.test(String(courses).trim())){
      totalCourses += parseInt(courses,10);
      coursesCounted++;
    } else if(courses !== ''){
      // skip non-numeric courses values for totals/counting
    }

    const notes = act.comments || '';
    row.innerHTML = `<div>${m.label}</div><div style="text-align:center">${participation}</div><div style="text-align:center">${escapeHtml(courses)}</div><div style="text-align:center">${precursor}</div><div style="text-align:right">${escapeHtml(hours)}</div><div>${escapeHtml(notes)}</div>`;
    container.appendChild(row);
  });

  const total = document.createElement('div');
  total.className = 'pp-total';
  total.innerHTML = `<div style="flex:1 1 auto"></div><div>Total horas: ${totalHours}</div>`;
  container.appendChild(total);

  // compute averages:
  // - courses: total sum of numeric courses divided by 12 months (fixed request)
  // - hours: average per month across the service year (months.length, usually 12)
  const monthsCount = months.length || 12;
  const avgHours = monthsCount ? (totalHours / monthsCount) : 0;
  const avgCourses = 12 ? (totalCourses / 12) : 0;

  // update averages UI if present, format with two decimals
  const avgCoursesEl = $('#pp_avgCourses');
  const avgHoursEl = $('#pp_avgHours');
  const metaWrap = $('#pp_meta');
  const metaHoursEl = $('#pp_metaHours');
  const diffWrap = $('#pp_diffWrap');
  const diffEl = $('#pp_diff');
  if(avgCoursesEl) avgCoursesEl.textContent = (Number.isFinite(avgCourses) ? avgCourses.toFixed(2) : '0.00');
  if(avgHoursEl) avgHoursEl.textContent = (Number.isFinite(avgHours) ? avgHours.toFixed(2) : '0.00');

  // Show "Meta horas" (editable, default 600) only when the person has designation "Precursor Regular"
  const designation = String(person.designation || '').trim();
  if(designation === 'Precursor Regular'){
    // support a stored per-person metaHours value; fallback to 600
    const metaVal = (person.metaHours !== undefined && person.metaHours !== null && String(person.metaHours).trim() !== '') ? String(person.metaHours) : '600';
    if(metaHoursEl) metaHoursEl.textContent = metaVal;
    if(metaWrap) metaWrap.style.display = 'block';

    // compute and display Faltante / Sobrante = Total horas - Meta horas
    const metaNum = parseInt(metaVal, 10) || 0;
    const diff = totalHours - metaNum;
    if(diffEl) diffEl.textContent = String(diff);
    if(diffWrap) diffWrap.style.display = 'block';

    // Make meta value editable via double-click: turn into input, commit on blur/Enter, persist to person.metaHours
    if(metaHoursEl){
      // remove any previous handlers by replacing the node to avoid duplicate listeners across renders
      const newMeta = metaHoursEl.cloneNode(true);
      metaHoursEl.parentNode.replaceChild(newMeta, metaHoursEl);
      newMeta.style.cursor = 'pointer';
      newMeta.title = 'Doble click para editar Meta horas';
      newMeta.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        // create input overlay
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = '0';
        inp.value = (person.metaHours !== undefined && person.metaHours !== null && String(person.metaHours).trim() !== '') ? String(person.metaHours) : '600';
        inp.style.width = '100%';
        inp.style.boxSizing = 'border-box';
        inp.style.padding = '6px';
        inp.style.borderRadius = '6px';
        inp.style.border = '1px solid #e6e9ee';
        // replace node with input
        newMeta.replaceWith(inp);
        inp.focus();
        inp.select();

        function commitMeta(){
          try{
            const val = String(inp.value).trim();
            // save numeric string or empty
            person.metaHours = val === '' ? '' : val;
            save();
            // restore display node with new value
            const disp = document.createElement('div');
            disp.id = 'pp_metaHours';
            disp.style.fontWeight = '700';
            disp.style.fontSize = '15px';
            disp.textContent = (person.metaHours === '' ? '' : String(person.metaHours));
            disp.style.cursor = 'pointer';
            // only replace if input is still connected to DOM
            if(inp.isConnected && inp.parentNode){
              try{ inp.replaceWith(disp); }catch(e){ /* ignore if already removed */ }
            }
            // re-render this section to reattach handlers; defer to avoid interfering with current event
            setTimeout(() => {
              renderActivityRowsFor(person, Number($('#pp_yearSelect') ? $('#pp_yearSelect').value : undefined) || undefined);
            }, 10);
          }catch(err){
            // swallow unexpected errors to avoid breaking UI
            console.error('commitMeta error', err);
          }
        }

        function cancelMeta(){
          try{
            // restore display node without saving
            const disp = document.createElement('div');
            disp.id = 'pp_metaHours';
            disp.style.fontWeight = '700';
            disp.style.fontSize = '15px';
            disp.textContent = metaVal;
            // only replace if input still in DOM
            if(inp.isConnected && inp.parentNode){
              try{ inp.replaceWith(disp); }catch(e){ /* ignore if already removed */ }
            }
            setTimeout(() => {
              renderActivityRowsFor(person, Number($('#pp_yearSelect') ? $('#pp_yearSelect').value : undefined) || undefined);
            }, 10);
          }catch(err){
            console.error('cancelMeta error', err);
          }
        }

        // use guarded handlers (avoid duplicate calls if blur triggers after node removal)
        const onBlur = () => { commitMeta(); cleanupHandlers(); };
        const onKey = (kev) => {
          if(kev.key === 'Enter'){ kev.preventDefault(); commitMeta(); cleanupHandlers(); }
          if(kev.key === 'Escape'){ kev.preventDefault(); cancelMeta(); cleanupHandlers(); }
        };
        function cleanupHandlers(){
          try{
            inp.removeEventListener('blur', onBlur);
            inp.removeEventListener('keydown', onKey);
          }catch(e){}
        }
        inp.addEventListener('blur', onBlur);
        inp.addEventListener('keydown', onKey);
      });
    }
  } else {
    if(metaWrap) metaWrap.style.display = 'none';
    if(diffWrap) diffWrap.style.display = 'none';
  }

  // populate year selector if present in popup and hook change to re-render
  const sel = $('#pp_yearSelect');
  if(sel){
    // Ensure the control is a compact number input showing only up/down arrows.
    sel.type = 'number';
    sel.min = '1900';
    sel.max = String(new Date().getFullYear() + 50);
    sel.value = String(serviceYear);
    sel.style.width = '96px';

    sel.addEventListener('change', () => {
      const y = parseInt(sel.value,10) || serviceYear;
      renderActivityRowsFor(person, y);
    });
    sel.addEventListener('keydown', (ev) => {
      if(ev.key === 'Enter'){
        ev.preventDefault();
        const y = parseInt(sel.value,10) || serviceYear;
        renderActivityRowsFor(person, y);
      }
    });
  }
}

/* show popup with person data populated */
function showProfilePopup(person){
  const pop = $('#profilePopup');
  if(!pop) return;
  // populate fields
  $('#pp_congName').value = person.congName || '';
  $('#pp_firstName').value = person.firstName || '';
  $('#pp_lastNameP').value = person.lastNameP || '';
  $('#pp_lastNameM').value = person.lastNameM || '';
  $('#pp_birthDate').value = person.birthDate || '';
  $('#pp_baptismDate').value = person.baptismDate || '';
  $('#pp_sex').value = person.sex || '';
  $('#pp_privilege').value = person.privilege || '';
  $('#pp_designation').value = person.designation || '';
  $('#pp_esp').value = person.esp || '';


  renderActivityRowsFor(person);

  pop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/* close popup */
function closeProfilePopup(){
  const pop = $('#profilePopup');
  if(!pop) return;
  pop.classList.add('hidden');
  document.body.style.overflow = '';
}

/* wire popup close buttons */
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('profilePopup');
  if(!wrap || wrap.classList.contains('hidden')) return;
  if(e.target === wrap){
    closeProfilePopup();
  }
});
document.addEventListener('DOMContentLoaded', () => {
  const c = $('#closeProfilePopup');
  if(c) c.addEventListener('click', closeProfilePopup);
  const c2 = $('#pp_close');

  // generate PDF from popup content as formatted text/table using jsPDF (no image capture)
  async function generateProfilePDF(){
    try{
      const jsPDFmod = await import('https://esm.sh/jspdf@2.5.1');
      const { jsPDF } = jsPDFmod;
      const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 28; // comfortable margin in points
      const usableW = pageWidth - margin * 2;
      let y = margin;

      // Helper to draw wrapped text
      function drawWrapped(text, x, yPos, maxWidth, lineHeight){
        const lines = pdf.splitTextToSize(String(text || ''), maxWidth);
        pdf.text(lines, x, yPos);
        return lines.length * lineHeight;
      }

      // Header
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('REGISTRO DE PUBLICADOR DE LA CONGREGACION', margin, y);
      // add a slightly larger gap after the title so the title is visually separated from the following info
      y += 28;

      // (removed subtitle line per request) — preserve small vertical gap after title
      y += 18;

      // Personal info fields from popup inputs
      const fields = [
        ['Nombre (Cong.)', $('#pp_congName') ? $('#pp_congName').value : ''],
        ['Nombre', $('#pp_firstName') ? $('#pp_firstName').value : ''],
        ['Apellido Paterno', ' ' + ($('#pp_lastNameP') ? $('#pp_lastNameP').value : '')],
        ['Apellido Materno', ' ' + ($('#pp_lastNameM') ? $('#pp_lastNameM').value : '')],
        ['Fecha de nacimiento', ' ' + ($('#pp_birthDate') ? $('#pp_birthDate').value : '')],
        ['Fecha de bautismo', ' ' + ($('#pp_baptismDate') ? $('#pp_baptismDate').value : '')],
        ['Sexo', $('#pp_sex') ? $('#pp_sex').value : ''],
        ['Privilegio', $('#pp_privilege') ? $('#pp_privilege').value : ''],
        ['Designación', ' ' + ($('#pp_designation') ? $('#pp_designation').value : '')],
        ['Esp', $('#pp_esp') ? $('#pp_esp').value : '']
      ];

      // Two-column layout for personal fields
      const colGap = 12;
      const colW = (usableW - colGap) / 2;
      let xLeft = margin;
      let xRight = margin + colW + colGap;
      let maxRowH = 0;
      pdf.setFontSize(10);
      pdf.setTextColor(30);
      fields.forEach((f, i) => {
        const x = (i % 2 === 0) ? xLeft : xRight;
        const label = f[0] + ': ';
        const value = f[1] || '';
        pdf.setFont('helvetica', 'bold');
        pdf.text(label, x, y);
        pdf.setFont('helvetica', 'normal');
        const consumed = drawWrapped(value, x + pdf.getTextWidth(label) + 4, y, (i % 2 === 0 ? colW : colW) - pdf.getTextWidth(label) - 4, 12);
        const rowH = Math.max(12, consumed);
        maxRowH = Math.max(maxRowH, rowH);
        if(i % 2 === 1){
          // advance y after completing the pair
          y += maxRowH + 6;
          maxRowH = 0;
        }
      });
      if(fields.length % 2 === 1) y += maxRowH + 6;

      y += 6;

      // Activity year selector (read selected year from popup)
      const yearEl = $('#pp_yearSelect');
      const serviceYear = yearEl ? parseInt(yearEl.value,10) : (new Date().getFullYear());
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Actividad - Año de servicio: ${serviceYear} (Septiembre ${serviceYear-1} - Agosto ${serviceYear})`, margin, y);
      y += 14;

      // Build months list for that service year (Sept of previous calendar year -> Aug of serviceYear)
      function monthsForServiceYear(year){
        const months = [];
        const start = new Date(year - 1, 8, 1); // Sept previous year
        const end = new Date(year, 7, 1);       // Aug of serviceYear
        let cur = new Date(start);
        while(cur.getFullYear() < end.getFullYear() || (cur.getFullYear() === end.getFullYear() && cur.getMonth() <= end.getMonth())){
          const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
          const label = cur.toLocaleString('es', { month:'long', year:'numeric' });
          months.push({ key, label });
          cur.setMonth(cur.getMonth() + 1);
          if(months.length > 36) break;
        }
        return months;
      }

      // Acquire person activities from currently shown person inputs
      // We rely on the profile popup inputs for person identity; try to find the person in data store to get activities
      const congNameVal = $('#pp_congName') ? $('#pp_congName').value : '';
      const person = people.find(p => (p.congName || '') === congNameVal) || null;

      const months = monthsForServiceYear(serviceYear);

      // Table header
      // Compute column widths so:
      // - "Mes" is just wide enough to show its longest month label on one line
      // - Four middle columns share equal width
      // - "Notas" is wider than the others and takes the remaining space
      const monthsForPDF = months; // months array already computed above
      // estimate required width for "Mes" by measuring each label with pdf.getTextWidth
      let maxLabelW = 0;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      monthsForPDF.forEach(mo => {
        const w = pdf.getTextWidth(String(mo.label || '')) + 8; // small padding
        if (w > maxLabelW) maxLabelW = w;
      });
      // clamp mes width to reasonable bounds
      const minMesW = 70;
      const maxMesWClamp = Math.min(usableW * 0.22, 160);
      const mesW = Math.max(minMesW, Math.min(maxLabelW, maxMesWClamp));

      // remaining width to distribute
      const remaining = usableW - mesW;
      // allocate ~30% of remaining to Notes, rest divided equally among 4 middle cols
      const notesW = Math.floor(remaining * 0.30);
      const otherColsCount = 4;
      const otherW = Math.floor((remaining - notesW) / otherColsCount);

      const cols = [
        { title: 'Mes', w: mesW },
        { title: 'Participación', w: otherW },
        { title: 'Cursos bíblicos', w: otherW },
        { title: 'Precursor aux.', w: otherW },
        { title: 'Horas', w: otherW },
        { title: 'Notas', w: Math.max(remaining - otherW * otherColsCount, notesW) }
      ];
      // Ensure page has space; if not, add new page
      function ensureSpace(h){
        if(y + h > pageHeight - margin){
          pdf.addPage();
          y = margin;
        }
      }

      // Draw header labels centered in each uniform column
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      const headerH = 16;
      ensureSpace(headerH + 6);
      let tx = margin;
      cols.forEach(c => {
        // center header text inside the column
        pdf.text(String(c.title), tx + c.w / 2, y + 11, { align: 'center' });
        tx += c.w;
      });
      y += headerH + 4;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);

      // Rows
      let totalHours = 0;
      // additional accumulators for courses so we can calculate averages like the popup does
      let totalCourses = 0;
      let numericCoursesCount = 0;

      months.forEach(m => {
        ensureSpace(18);
        const act = (person && person.activities && person.activities[m.key]) ? person.activities[m.key] : { participation:false, studies:'', aux:false, hours:'', comments:'' };

        // Determine whether to display hours for this person/month:
        const designation = person ? String(person.designation || '').trim() : '';
        const isPrecursor = (designation === 'Precursor Regular');
        // Never show hours when the recorded value is exactly 1
        const _hoursValStr_pdf = String(act.hours || '').trim();
        const _isExactlyOne_pdf = (_hoursValStr_pdf === '1' || Number(_hoursValStr_pdf) === 1);
        const showHoursForMonth = !_isExactlyOne_pdf && (isPrecursor || !!act.aux);

        // Participation should reflect the stored record: only when numeric hours > 0
        const participated = (act.hours !== '' && parseInt(act.hours || 10) > 0);
        const participation = participated ? '✔' : '';

        const courses = act.studies || '';
        const precursor = act.aux ? '✔' : '';
        const hours = showHoursForMonth ? (act.hours || '') : '';

        // Only accumulate hours when they are shown (consistent with display)
        totalHours += (showHoursForMonth && act.hours !== '') ? (parseInt(act.hours || 0,10) || 0) : 0;

        // accumulate numeric courses for average calculation
        if(courses !== '' && !isNaN(Number(courses))){
          totalCourses += Number(courses);
          numericCoursesCount++;
        }

        const notes = act.comments || '';

        // draw columns with wrapping where needed
        let cx = margin;
        // Mes (wrap & center)
        const mesLines = pdf.splitTextToSize(String(m.label || ''), cols[0].w - 6);
        pdf.text(mesLines, cx + cols[0].w / 2, y + 10, { align: 'center' });
        cx += cols[0].w;

        // Participación (center) — draw only a vector checkmark (no surrounding box) when participated
        const partX = cx + cols[1].w / 2;
        const partY = y + 8;
        const checkSize = 10;
        if (participated) {
          // draw a crisp checkmark centered at partX, partY
          pdf.setDrawColor(0);
          pdf.setLineWidth(1.1);
          const cx0 = partX - checkSize / 2;
          const cy0 = partY - checkSize / 2;
          const x1 = cx0 + checkSize * 0.18, y1 = cy0 + checkSize * 0.55;
          const x2 = cx0 + checkSize * 0.45, y2 = cy0 + checkSize * 0.80;
          const x3 = cx0 + checkSize * 0.82, y3 = cy0 + checkSize * 0.26;
          pdf.line(x1, y1, x2, y2);
          pdf.line(x2, y2, x3, y3);
        }
        cx += cols[1].w;

        // Cursos bíblicos (center)
        pdf.text(String(courses || ''), cx + cols[2].w / 2, y + 10, { align: 'center' });
        cx += cols[2].w;

        // Precursor aux. (center) — draw a crisp checkmark vector when true (avoids glyph clipping)
        const precursorX = cx + cols[3].w / 2;
        const precursorY = y + 8;
        const precursorSize = 10;
        if (precursor) {
          pdf.setDrawColor(0);
          pdf.setLineWidth(1.1);
          const pCx0 = precursorX - precursorSize / 2;
          const pCy0 = precursorY - precursorSize / 2;
          const px1 = pCx0 + precursorSize * 0.18, py1 = pCy0 + precursorSize * 0.55;
          const px2 = pCx0 + precursorSize * 0.45, py2 = pCy0 + precursorSize * 0.80;
          const px3 = pCx0 + precursorSize * 0.82, py3 = pCy0 + precursorSize * 0.26;
          pdf.line(px1, py1, px2, py2);
          pdf.line(px2, py2, px3, py3);
        }
        cx += cols[3].w;

        // Horas (center) - only render numeric hours when permitted
        const hoursText = String(hours || '');
        pdf.text(hoursText, cx + cols[4].w / 2, y + 10, { align: 'center' });
        cx += cols[4].w;

        // Notas (wrap & center)
        const notesLines = pdf.splitTextToSize(String(notes || ''), cols[5].w - 6);
        // draw each notes line centered
        pdf.text(notesLines, cx + cols[5].w / 2, y + 10, { align: 'center' });

        // determine row height based on tallest wrapped column (mesLines or notesLines)
        const mesH = (pdf.splitTextToSize(String(m.label || ''), cols[0].w - 6).length || 1) * 10 + 6;
        const notesH = (notesLines.length || 1) * 10 + 6;
        const rowH = Math.max(14, mesH, notesH);

        // draw a thin gray horizontal separator under the row to visually separate months
        try {
          const lineY = y + rowH - 2; // slightly above the next row start
          pdf.setDrawColor(180); // light gray
          pdf.setLineWidth(0.5);
          pdf.line(margin, lineY, margin + usableW, lineY);
          // restore draw color and line width for subsequent content
          pdf.setDrawColor(0);
          pdf.setLineWidth(0.5);
        } catch (e) {
          // ignore drawing errors silently
        }

        y += rowH;
      });

      // compute averages consistent with popup:
      // avgCourses: sum of numeric courses divided by 12 (fixed)
      // avgHours: average per month across the service year (months.length)
      const monthsCount = months.length || 12;
      const avgCourses = 12 ? (totalCourses / 12) : 0;
      const avgHours = monthsCount ? (totalHours / monthsCount) : 0;

      // Totals and averages
      ensureSpace(36);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Total horas: ${totalHours}`, margin, y + 12);

      // place averages to the right of total
      const avgTextX = margin + 220;
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Promedio cursos: ${Number.isFinite(avgCourses) ? avgCourses.toFixed(2) : '0.00'}`, avgTextX, y + 12);
      pdf.text(`Promedio horas: ${Number.isFinite(avgHours) ? avgHours.toFixed(2) : '0.00'}`, avgTextX, y + 28);

      // If the person is a "Precursor Regular", include Meta horas and Faltante / Sobrante
      const designation = person ? String(person.designation || '').trim() : '';
      if(designation === 'Precursor Regular'){
        // determine meta value (persisted per-person or default 600)
        const metaValStr = (person && person.metaHours !== undefined && person.metaHours !== null && String(person.metaHours).trim() !== '') ? String(person.metaHours) : '600';
        const metaNum = parseInt(metaValStr, 10) || 0;
        const diff = totalHours - metaNum;

        // draw meta and diff below averages (aligned with averages area)
        // Render "Meta horas" without bold weight (use normal)
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Meta horas: ${metaNum}`, avgTextX, y + 44);
        pdf.setFont('helvetica', 'normal');
        const diffText = (diff >= 0) ? `Sobrante: ${diff}` : `Faltante: ${Math.abs(diff)}`;
        pdf.text(`Faltante / Sobrante: ${diffText}`, avgTextX, y + 60);

        y += 64;
      } else {
        y += 36;
      }

      // Footer with generation date
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const now = new Date();
      pdf.text(`Generado: ${now.toLocaleString()}`, margin, pageHeight - margin - 6);

      // filename from congName or fallback
      const nameEl = $('#pp_congName');
      // sanitize and build filename as "YYYY.MM.DD - S21 - Nombre (Cong.).pdf"
      const rawName = (nameEl && nameEl.value) ? nameEl.value.replace(/[^\w\-\s]/g,'').trim() : 'registro';
      const nowStr = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
      })();
      const fileName = `${nowStr} - S21 - ${rawName || 'registro'}.pdf`;
      pdf.save(fileName);
    }catch(err){
      console.error(err);
      alert('Error al generar PDF: ' + (err && err.message ? err.message : err));
    }
  }

  if(c2){
    c2.addEventListener('click', (ev) => {
      ev.preventDefault();
      // generate PDF; keep popup open
      generateProfilePDF();
    });
  }
});

/* Info-icon handler for activity comment boxes:
   When the info button inside .act-comments is clicked, show a small tab with two choices:
   "Inicio Precursorado Regular" and "Fin Precursorado Regular". Selecting one will set
   the content of the editable comment area (.act-comments-input) to the chosen label. */
tbody.addEventListener('click', (e) => {
  const infoBtn = e.target.closest('.comment-info');
  if (!infoBtn) return;
  e.stopPropagation();

  // find the comment container (the wrapper .act-comments) and the editable inner div
  const commentBox = infoBtn.closest('.act-comments');
  if (!commentBox) return;
  const editable = commentBox.querySelector('.act-comments-input');

  // prevent multiple tabs
  const existing = document.getElementById('commentInfoTab');
  if (existing) existing.remove();

  // build small tab
  const tab = document.createElement('div');
  tab.id = 'commentInfoTab';
  tab.className = 'month-tab';
  tab.style.minWidth = '220px';
  tab.style.padding = '8px';
  tab.style.display = 'flex';
  tab.style.flexDirection = 'column';
  tab.style.gap = '8px';

  const opt1 = document.createElement('button');
  opt1.type = 'button';
  opt1.className = 'secondary';
  opt1.textContent = 'Inicio Precursorado Regular';
  opt1.style.width = '100%';
  opt1.addEventListener('click', (ev) => {
    ev.stopPropagation();
    // set the editable area's text to this label (preserves the wrapper and info button)
    if(editable){
      editable.textContent = 'Inicio Precursorado Regular';
      // put caret at end for UX
      placeCaretAtEnd(editable);
      // notify handlers to save
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // fallback: set wrapper text but then recreate editable area to avoid losing UI
      commentBox.textContent = '';
      const newEd = document.createElement('div');
      newEd.className = 'act-comments-input';
      newEd.setAttribute('contenteditable','true');
      newEd.setAttribute('data-placeholder','Comentarios');
      newEd.textContent = 'Inicio Precursorado Regular';
      commentBox.appendChild(newEd);
      commentBox.appendChild(infoBtn);
      newEd.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // close tab
    tab.remove();
  });

  const opt2 = document.createElement('button');
  opt2.type = 'button';
  opt2.className = 'secondary';
  opt2.textContent = 'Fin Precursorado Regular';
  opt2.style.width = '100%';
  opt2.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if(editable){
      editable.textContent = 'Fin Precursorado Regular';
      placeCaretAtEnd(editable);
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      commentBox.textContent = '';
      const newEd = document.createElement('div');
      newEd.className = 'act-comments-input';
      newEd.setAttribute('contenteditable','true');
      newEd.setAttribute('data-placeholder','Comentarios');
      newEd.textContent = 'Fin Precursorado Regular';
      commentBox.appendChild(newEd);
      commentBox.appendChild(infoBtn);
      newEd.dispatchEvent(new Event('input', { bubbles: true }));
    }
    tab.remove();
  });

  // helper to place caret at end of contenteditable for better UX
  function placeCaretAtEnd(el){
    try{
      el.focus();
      if(typeof window.getSelection !== 'undefined' && typeof document.createRange !== 'undefined'){
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }catch(e){}
  }

  tab.appendChild(opt1);
  tab.appendChild(opt2);

  document.body.appendChild(tab);
  // position tab directly attached under the info icon (centered under the icon)
  const rect = infoBtn.getBoundingClientRect();
  tab.style.position = 'absolute';
  // place tab centered under the icon and snug against its bottom (small 4px gap)
  tab.style.left = (rect.left + window.scrollX + rect.width / 2) + 'px';
  tab.style.transform = 'translateX(-50%)';
  tab.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  tab.style.zIndex = 9999;

  // clicking outside closes the tab
  setTimeout(() => {
    const onDocClick = (ev) => {
      if (!tab) return;
      if (!tab.contains(ev.target) && ev.target !== infoBtn) {
        tab.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    document.addEventListener('click', onDocClick);
  }, 0);
});

initResizableColumns();
initHeaderSorting();
// Ensure "Registro" is active on initial load
activityMode = false;
if (registroBtn) registroBtn.classList.add('active');
if (actividadBtn) actividadBtn.classList.remove('active');
updateOptionsBar();
render();