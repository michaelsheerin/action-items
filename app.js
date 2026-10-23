import {ACCOUNTS, OWNER, URGENCIES, STATUSES, FIELDS, localDay, weekBounds, sectionFor, compareTasks, matches, categoryOptions, safeURL, newTask, parseImport, csvExport} from './core.js';
import {openStore} from './store.js';

const archived = document.body.dataset.view === 'archive';
const app = document.querySelector('#app');
let store;
let tasks = new Map();
let pending = 0;
let saveFailed = false;
let archiveLimit = 150;
let toastTimer;
let renderTimer;
let retryEdits = new Map();
let currentDay = localDay();
const drafts = new Map();
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('action-items-updates') : null;
const query = {text: '', account: '', urgency: ''};
const labels = {account: 'Account', category: 'Category', title: 'Action item', due: 'Due date', urgency: 'Urgency', status: 'Status', ticket: 'Ticket ID / link', owner: 'Owner', done: 'Done', notes: 'Notes'};

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Action Items home"><img src="./icon.svg" alt="" width="30" height="30"><span>Action Items</span></a>
    <nav aria-label="Pages"><a href="./" ${!archived ? 'aria-current="page"' : ''}>Action items</a><a href="./archive.html" ${archived ? 'aria-current="page"' : ''}>Archive <span id="archive-count" class="nav-count">0</span></a></nav>
    <div class="topbar-right"><span id="save-state" class="save-state" role="status" aria-live="polite">Loading…</span><button id="data-button" class="button" aria-haspopup="dialog">Data <span aria-hidden="true">⌄</span></button><span class="avatar" title="Michael Sheerin">MS</span></div>
  </header>
  <main>
    <div class="page-heading"><div><div class="eyebrow">WORKSPACE</div><h1>${archived ? 'Completed actions' : 'Action items'}</h1><p>${archived ? 'Your completed work. Uncheck any row to restore.' : 'Edit any field. Changes save as you type.'}</p></div><div id="summary" class="summary"></div></div>
    <div id="error-banner" class="error-banner" role="alert" hidden><span id="error-text"></span><button id="retry-save" class="button" hidden>Retry save</button><button id="emergency-export" class="button">Download backup</button></div>
    <section class="work-surface" aria-label="Action tracker">
      <div class="toolbar"><div class="search-box"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="search" type="search" placeholder="Search actions, categories, tickets…" aria-label="Search actions"><kbd>/</kbd></div><div class="filters"><select id="account-filter" aria-label="Filter by account"><option value="">All accounts</option></select><select id="urgency-filter" aria-label="Filter by urgency"><option value="">All urgency</option><option>Urgent</option><option>Not urgent</option></select><button id="clear-filters" class="text-button" hidden>Clear filters</button></div><span id="visible-count" class="visible-count"></span></div>
      <div id="empty-state" class="empty-state" hidden><img src="./icon.svg" alt="" width="36" height="36"><div><strong>${archived ? 'Your completed work will appear here' : 'Start with your next action'}</strong><p>${archived ? 'Complete a task on the Action items page to move the record here.' : 'Type in a blank row below, or import your workbook records.'}</p></div>${!archived ? '<button id="empty-import" class="button">Import records</button>' : ''}</div>
      <div class="table-wrap" tabindex="0" aria-label="Editable action table"><table id="actions-table"><caption class="sr-only">${archived ? 'Completed action items' : 'All account action items, grouped by week and account'}</caption><colgroup><col class="col-account"><col class="col-category"><col class="col-title"><col class="col-due"><col class="col-urgency"><col class="col-status"><col class="col-ticket"><col class="col-owner"><col class="col-done"><col class="col-notes"></colgroup><thead><tr>${FIELDS.map(field => `<th scope="col" ${field === 'done' ? 'class="done-heading"' : ''}>${labels[field]}</th>`).join('')}</tr></thead></table></div>
      <div class="table-footer"><span>${archived ? 'Uncheck Done to return an action to your list.' : 'Blank rows are ready for typing. Tab moves between fields.'}</span><button id="show-more" class="text-button" hidden>Show more completed actions</button><span class="local-label"><span class="local-dot"></span>Stored in this browser</span></div>
    </section>
    <div class="workspace-footer"><span>One table. All accounts.</span><span>Week starts Monday · <span id="week-label"></span></span></div>
  </main>
  <div id="category-lists"></div>
  <div id="toast" class="toast" role="status" hidden><span id="toast-text"></span><button id="toast-undo" hidden>Undo</button></div>
  <dialog id="data-dialog"><div class="dialog-heading"><h2>Your records</h2><button id="close-data" class="icon-button" aria-label="Close data settings">×</button></div><p class="dialog-intro">Changes save on this device. Download a backup to move your records to another browser.</p><div class="data-action"><div><strong>Back up all records</strong><p>Includes active actions, completed actions, and source references.</p></div><button id="export-json" class="button primary">Download JSON</button></div><div class="data-action"><div><strong>Export a spreadsheet</strong><p>Download ${archived ? 'completed' : 'active'} actions as CSV.</p></div><button id="export-csv" class="button">Download CSV</button></div><div class="data-action"><div><strong>Import records</strong><p>Import an Action Items JSON backup or migration file.</p></div><button id="choose-import" class="button">Choose file</button></div><label class="overwrite-option"><input id="overwrite-import" type="checkbox"> Update matching records from the file</label><p class="small-print">Existing records stay unchanged unless this option is selected. Imported rows merge by record ID.</p><input id="import-file" type="file" accept=".json,application/json" hidden><div id="import-result" class="import-result" role="status"></div></dialog>
`;

const el = id => document.getElementById(id);
for (const account of ACCOUNTS) el('account-filter').append(new Option(account, account));
function shortDate(iso, options = {}) { return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric', ...options}); }
function setSaveState() {
  const node = el('save-state');
  node.textContent = saveFailed ? 'Changes need saving' : pending ? 'Saving…' : 'Saved on this device';
  node.className = `save-state ${saveFailed ? 'failed' : pending ? 'saving' : 'saved'}`;
}
function showError(message) {
  el('error-text').textContent = message;
  el('error-banner').hidden = false;
  el('retry-save').hidden = retryEdits.size === 0;
}
function toast(message, undo) {
  clearTimeout(toastTimer); el('toast-text').textContent = message; el('toast').hidden = false;
  const button = el('toast-undo'); button.hidden = !undo; button.onclick = undo || null;
  toastTimer = setTimeout(() => { el('toast').hidden = true; }, 9000);
}

async function saveTask(task, patch) {
  pending++; setSaveState();
  try {
    await store.patch(task.id, patch, task);
    const failed = retryEdits.get(task.id);
    if (failed) {
      for (const [key, value] of Object.entries(patch)) if (failed[key] === value) delete failed[key];
      if (Object.keys(failed).every(key => key === 'updatedAt')) retryEdits.delete(task.id);
    }
    if (!retryEdits.size) { saveFailed = false; el('error-banner').hidden = true; }
    channel?.postMessage({id: task.id});
    return true;
  } catch (error) {
    retryEdits.set(task.id, {...retryEdits.get(task.id), ...patch});
    saveFailed = true;
    showError(`Your latest edit is still on screen but has not saved. ${error.message || 'Browser storage is unavailable.'} Retry or download a backup.`);
    return false;
  } finally { pending--; setSaveState(); }
}

function currentFocus() {
  const focused = document.activeElement;
  const row = focused?.closest('tr[data-id]');
  return row && focused.dataset.field ? {id: row.dataset.id, field: focused.dataset.field, start: focused.selectionStart, end: focused.selectionEnd} : null;
}
function restoreFocus(focus) {
  if (!focus) return;
  const control = [...el('actions-table').querySelectorAll('[data-field]')].find(c => c.dataset.field === focus.field && c.closest('tr').dataset.id === focus.id);
  if (control) {
    control.focus({preventScroll: true});
    if (['TEXTAREA', 'INPUT'].includes(control.tagName) && ['text', 'search', 'textarea'].includes(control.type)) {
      try { control.setSelectionRange(focus.start, focus.end); } catch {}
    }
  }
}
function refreshCategories() {
  const host = el('category-lists'); host.replaceChildren();
  for (const account of ACCOUNTS) {
    const list = document.createElement('datalist'); list.id = `categories-${account}`;
    for (const name of categoryOptions([...tasks.values()], account)) list.append(new Option(name, name));
    host.append(list);
  }
}
function summary() {
  const all = [...tasks.values()]; const active = all.filter(t => !t.done); const today = localDay();
  el('archive-count').textContent = all.length - active.length;
  const summary = el('summary'); summary.replaceChildren();
  const counts = archived ? [[all.length - active.length, 'completed']] : [[active.length, 'open'], [active.filter(t => t.due && t.due < today).length, 'overdue'], [active.filter(t => t.status === 'Waiting').length, 'waiting']];
  for (const [count, label] of counts) {
    const item = document.createElement('span'); const value = document.createElement('strong'); value.textContent = count;
    item.append(value, ` ${label}`); if (label === 'overdue' && count) item.className = 'overdue-count'; summary.append(item);
  }
  el('week-label').textContent = `${shortDate(weekBounds().start)}–${shortDate(weekBounds().end)}`;
}
function autoSize(control) {
  if (control.tagName !== 'TEXTAREA') return;
  control.style.height = '0px';
  const height = Math.max(24, control.scrollHeight + 2);
  control.style.height = `${Math.min(160, height)}px`;
  control.style.overflowY = height > 160 ? 'auto' : 'hidden';
}
function updateRowAppearance(row, task) {
  row.dataset.urgency = task.urgency; row.dataset.status = task.status;
  const due = row.querySelector('[data-field="due"]');
  due?.classList.toggle('overdue-date', Boolean(task.due && task.due < localDay()));
  if (due) due.title = task.due && task.due < localDay() ? 'Overdue' : task.due === localDay() ? 'Today' : '';
  const hint = row.querySelector('.due-hint');
  if (hint) hint.textContent = task.due && task.due < localDay() ? 'Overdue' : task.due === localDay() ? 'Today' : '';
  row.querySelector('[data-field="urgency"]')?.setAttribute('data-value', task.urgency);
  row.querySelector('[data-field="status"]')?.setAttribute('data-value', task.status);
}
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    if (!pending && !saveFailed) {
      try {
        const fresh = await store.all();
        // Do not replace a row during an in-progress edit.
        if (!document.activeElement?.closest('tr[data-id]')) { tasks = new Map(fresh.map(t => [t.id, t])); render(); }
        else render();
      } catch (error) { showError(error.message); }
    } else render();
  }, 80);
}

function inputFor(task, field, draft, bucket) {
  let control;
  if (field === 'account' || field === 'urgency' || field === 'status') {
    control = document.createElement('select');
    const values = field === 'account' ? ACCOUNTS : field === 'urgency' ? URGENCIES : STATUSES;
    for (const value of values) control.append(new Option(value || 'Unspecified', value));
    control.value = task[field];
  } else if (field === 'done') {
    control = document.createElement('input'); control.type = 'checkbox'; control.checked = task.done;
    control.disabled = draft;
  } else if (field === 'due') {
    control = document.createElement('input'); control.type = 'date'; control.value = task.due;
  } else if (field === 'title' || field === 'notes') {
    control = document.createElement('textarea'); control.rows = 1; control.value = task[field];
    control.placeholder = field === 'title' ? draft ? 'Add an action item…' : 'Action item…' : 'Add notes…';
    control.spellcheck = true;
  } else {
    control = document.createElement('input'); control.type = 'text'; control.value = task[field];
    control.placeholder = field === 'category' ? 'Category…' : field === 'ticket' ? 'ID or https://…' : OWNER;
    if (field === 'category') { control.setAttribute('list', `categories-${task.account}`); control.autocomplete = 'off'; }
  }
  control.className = `cell-input field-${field}`; control.dataset.field = field;
  control.setAttribute('aria-label', `${labels[field]}, ${task.account}, ${draft ? `new ${bucket === 'week' ? 'this week' : 'remaining'} action` : task.title || 'untitled action'}`);
  control.addEventListener(field === 'done' ? 'change' : 'input', async () => {
    const row = control.closest('tr');
    if (field === 'done') { await changeCompletion(task, control.checked, control); return; }
    const value = control.value;
    if (field === 'due' && control.validity.badInput) return;
    if (task[field] === value) return;
    task[field] = value;
    const updatedAt = new Date().toISOString(); task.updatedAt = updatedAt;
    if (row.dataset.draft === 'true') {
      row.dataset.draft = 'false'; row.classList.remove('draft-row');
      tasks.set(task.id, task); row.querySelector('[data-field="done"]').disabled = false;
      drafts.delete(`${bucket}:${row.dataset.account}`);
      row.closest('tbody').append(makeRow(draftFor(row.dataset.account, bucket), true, bucket));
      for (const cell of row.querySelectorAll('[data-field]')) cell.setAttribute('aria-label', `${labels[cell.dataset.field]}, ${task.account}, ${task.title || 'untitled action'}`);
      control.placeholder = field === 'title' ? 'Action item…' : control.placeholder;
    }
    if (field === 'account') row.querySelector('[data-field="category"]').setAttribute('list', `categories-${value}`);
    if (field === 'ticket') updateTicketLink(row, value);
    if (field === 'category') refreshCategories();
    autoSize(control); updateRowAppearance(row, task); summary();
    void saveTask(task, {[field]: value, updatedAt});
  });
  if (control.tagName === 'TEXTAREA') control.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); const inputs = [...control.closest('tr').querySelectorAll('[data-field]')];
      inputs[inputs.indexOf(control) + 1]?.focus();
    }
  });
  return control;
}

function updateTicketLink(row, value) {
  const anchor = row.querySelector('.ticket-link'); const url = safeURL(value);
  if (!anchor) return;
  anchor.hidden = !url;
  if (url) { anchor.href = url; anchor.title = `Open ${url}`; } else anchor.removeAttribute('href');
}
function makeRow(task, draft = false, bucket = '') {
  const row = document.createElement('tr'); row.className = `task-row ${draft ? 'draft-row' : ''}`;
  row.dataset.id = task.id; row.dataset.draft = String(draft); row.dataset.account = task.account;
  for (const field of FIELDS) {
    const cell = document.createElement('td'); cell.className = `cell-${field}`;
    const control = inputFor(task, field, draft, bucket);
    if (field === 'ticket') {
      const wrapper = document.createElement('div'); wrapper.className = 'ticket-control';
      const anchor = document.createElement('a'); anchor.className = 'ticket-link'; anchor.textContent = '↗'; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.setAttribute('aria-label', 'Open ticket link');
      wrapper.append(control, anchor); cell.append(wrapper);
    } else if (field === 'due') {
      cell.append(control); const hint = document.createElement('span'); hint.className = 'due-hint'; cell.append(hint);
    } else cell.append(control);
    row.append(cell);
  }
  updateTicketLink(row, task.ticket); updateRowAppearance(row, task);
  row.addEventListener('focusout', event => {
    if (row.contains(event.relatedTarget)) return;
    if (row.dataset.draft !== 'true') scheduleRender();
  });
  return row;
}
function bandRow(title, description, className) {
  const row = document.createElement('tr'); row.className = className;
  const cell = document.createElement('th'); cell.colSpan = FIELDS.length; cell.scope = 'rowgroup';
  const text = document.createElement('span'); text.textContent = title; cell.append(text);
  if (description) { const info = document.createElement('span'); info.className = 'band-description'; info.textContent = description; cell.append(info); }
  row.append(cell); return row;
}
function draftFor(account, section) {
  const key = `${section}:${account}`;
  if (!drafts.has(key)) drafts.set(key, newTask(account, section === 'week' ? localDay() : weekBounds().next));
  return drafts.get(key);
}
function render() {
  const focus = currentFocus();
  const table = el('actions-table'); for (const body of [...table.tBodies]) body.remove();
  const all = [...tasks.values()];
  const filtered = all.filter(t => t.done === archived && matches(t, query.text, query.account, query.urgency));
  const list = archived ? filtered.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '') || compareTasks(a, b)).slice(0, archiveLimit) : filtered;
  const accounts = query.account ? [query.account] : ACCOUNTS;
  const sections = archived ? ['archive'] : ['week', 'remaining'];
  const week = weekBounds();
  for (const section of sections) {
    const body = document.createElement('tbody'); body.className = `section-${section}`;
    body.append(bandRow(section === 'week' ? 'This week' : section === 'remaining' ? 'Remaining actions' : 'Completed actions', section === 'week' ? `${shortDate(week.start)}–${shortDate(week.end)} · Includes overdue` : section === 'remaining' ? 'Later dates and actions without a due date' : 'Uncheck Done to restore', 'section-row'));
    table.append(body);
    for (const account of accounts) {
      const records = list.filter(t => t.account === account && (archived || sectionFor(t) === section)).sort(compareTasks);
      if (archived && !records.length) continue;
      const group = document.createElement('tbody'); group.dataset.account = account; group.dataset.bucket = section;
      group.append(bandRow(account, `${records.length} ${records.length === 1 ? 'action' : 'actions'}`, `group-row account-${account.toLowerCase()}`));
      for (const record of records) group.append(makeRow(record, false, section));
      if (!archived) group.append(makeRow(draftFor(account, section), true, section));
      table.append(group);
    }
    if (!body.isConnected) table.append(body);
  }
  refreshCategories(); summary();
  el('visible-count').textContent = `${filtered.length} ${archived ? 'completed' : 'active'} ${filtered.length === 1 ? 'action' : 'actions'}`;
  el('empty-state').hidden = archived ? filtered.length > 0 : all.some(t => !t.done);
  el('clear-filters').hidden = !query.text && !query.account && !query.urgency;
  el('show-more').hidden = !archived || filtered.length <= archiveLimit;
  for (const textarea of table.querySelectorAll('textarea')) autoSize(textarea);
  restoreFocus(focus);
}

async function changeCompletion(task, done, control) {
  control.disabled = true;
  const original = {done: task.done, completedAt: task.completedAt};
  const patch = {done, completedAt: done ? new Date().toISOString() : null, updatedAt: new Date().toISOString()};
  if (await saveTask(task, patch)) {
    Object.assign(task, patch); render();
    toast(done ? 'Action moved to Archive.' : 'Action restored to your list.', async () => {
      const undoPatch = {...original, updatedAt: new Date().toISOString()};
      if (await saveTask(task, undoPatch)) { Object.assign(task, undoPatch); render(); el('toast').hidden = true; }
    });
  } else {
    // Keep the failed intended state in the backup and retry queue.
    Object.assign(task, patch); control.checked = done; control.disabled = false;
  }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type})); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportJSON() {
  download(`action-items-backup-${localDay()}.json`, JSON.stringify({format: 'action-items', version: 1, exportedAt: new Date().toISOString(), tasks: [...tasks.values()]}, null, 2), 'application/json');
}
function openData() { el('data-dialog').showModal(); }
el('data-button').onclick = openData; el('empty-import')?.addEventListener('click', openData);
el('close-data').onclick = () => el('data-dialog').close();
el('data-dialog').addEventListener('click', event => { if (event.target === el('data-dialog')) el('data-dialog').close(); });
el('export-json').onclick = exportJSON; el('emergency-export').onclick = exportJSON;
el('export-csv').onclick = () => download(`action-items-${archived ? 'archive' : 'active'}-${localDay()}.csv`, csvExport([...tasks.values()].filter(t => t.done === archived).sort((a, b) => a.account.localeCompare(b.account) || compareTasks(a, b))), 'text/csv;charset=utf-8');
el('choose-import').onclick = () => el('import-file').click();
el('import-file').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  const result = el('import-result'); result.textContent = 'Importing…';
  try {
    if (pending || saveFailed) throw new Error('Finish saving your current edits before importing.');
    if (file.size > 30 * 1024 * 1024) throw new Error('Choose a file smaller than 30 MB.');
    const imported = parseImport(await file.text());
    const importedResult = await store.import(imported, el('overwrite-import').checked);
    tasks = new Map((await store.all()).map(t => [t.id, t])); render(); channel?.postMessage({imported: true});
    result.textContent = `${importedResult.count} records imported. ${imported.length - importedResult.count} matching records kept.`;
    toast(`${importedResult.count} records imported.`);
  } catch (error) { result.textContent = `Import stopped. ${error.message}`; }
  event.target.value = '';
};
el('retry-save').onclick = async () => {
  for (const [id, patch] of [...retryEdits]) await saveTask(tasks.get(id), patch);
  if (!retryEdits.size) { tasks = new Map((await store.all()).map(t => [t.id, t])); render(); }
};
el('search').oninput = event => { query.text = event.target.value; render(); };
el('account-filter').onchange = event => { query.account = event.target.value; render(); };
el('urgency-filter').onchange = event => { query.urgency = event.target.value; render(); };
el('clear-filters').onclick = () => { query.text = ''; query.account = ''; query.urgency = ''; el('search').value = ''; el('account-filter').value = ''; el('urgency-filter').value = ''; render(); };
el('show-more').onclick = () => { archiveLimit += 150; render(); };
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.target.closest('input, textarea, select, dialog')) { event.preventDefault(); el('search').focus(); }
});
window.addEventListener('beforeunload', event => { if (pending || saveFailed) { event.preventDefault(); event.returnValue = ''; } });
channel?.addEventListener('message', async () => {
  if (!store || pending || saveFailed) return;
  if (document.activeElement?.closest('tr[data-id]')) return;
  tasks = new Map((await store.all()).map(t => [t.id, t])); render();
});
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !store || pending || saveFailed) return;
  currentDay = localDay(); tasks = new Map((await store.all()).map(t => [t.id, t])); render();
});
setInterval(() => { if (localDay() !== currentDay && !document.activeElement?.closest('tr[data-id]')) {currentDay = localDay(); render();} }, 60000);

try {
  store = await openStore();
  tasks = new Map((await store.all()).map(task => [task.id, task]));
  render(); setSaveState();
} catch (error) {
  saveFailed = true; setSaveState();
  showError(`Browser storage is unavailable. ${error.message} Use a normal browser window with site storage enabled.`);
  for (const control of app.querySelectorAll('input, select, button')) if (!['emergency-export', 'data-button', 'close-data', 'export-json'].includes(control.id)) control.disabled = true;
}
