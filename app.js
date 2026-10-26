import {ACCOUNTS, OWNER, STATUSES, FIELDS, localDay, weekBounds, sectionFor, compareTasks, matches, categoryOptions, safeURL, newTask, parseImport, csvExport, cellIsBold, toggledBoldFields, ticketText, ticketInputPatch, linkPatch} from './core.js?v=10';
import {openStore} from './store.js?v=10';
import {installColumnSizing} from './columns.js?v=10';
import {inlineCompletion, reconcileChildren, installGridKeys} from './interactions.js?v=7';

const archived = document.body.dataset.view === 'archive';
const app = document.querySelector('#app');
let store;
let tasks = new Map();
let pending = 0;
let saveFailed = false;
let archiveLimit = 50;
let toastTimer;
let renderTimer;
let retryEdits = new Map();
let currentDay = localDay();
let layoutPending = false;
let syncPending = false;
let activeCell = null;
let linkTarget = null;
const drafts = new Map();
const rowViews = new Map();
const accountViews = new Map();
const categoryCache = new Map();
const expandedRemaining = new Set();
const collapsedSearch = new Set();
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('action-items-updates') : null;
const query = {text: '', account: '', status: ''};
const labels = {account: 'Account', category: 'Category', title: 'Action item', due: 'Due date', status: 'Status', done: 'Done', notes: 'Notes', ticket: 'Ticket ID / link', owner: 'Owner'};

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Action Items home"><span class="brand-mark" aria-hidden="true">✓</span><span>Action Items<small>Michael Sheerin’s workspace</small></span></a>
    <nav aria-label="Pages"><a href="./" ${!archived ? 'aria-current="page"' : ''}>Action items</a><a href="./hours.html">Hours</a><a href="./activities.html">Activities</a><a href="./archive.html" ${archived ? 'aria-current="page"' : ''}>Archive <span id="archive-count" class="nav-count">0</span></a></nav>
    <div class="topbar-right"><span id="save-state" class="save-state" role="status" aria-live="polite">Loading…</span><button id="keyboard-button" class="button quiet" aria-haspopup="dialog">Shortcuts <kbd>?</kbd></button><button id="data-button" class="button" aria-haspopup="dialog">Data & backup</button><span class="avatar" title="Michael Sheerin">MS</span></div>
  </header>
  <main>
    <div class="page-heading"><div><div class="eyebrow">YOUR WORKSPACE</div><h1>${archived ? 'Completed actions' : 'Action items'}</h1><p>${archived ? 'Completed work, ready to restore.' : 'Your next steps, organized by account. Every field saves as you type.'}</p></div><div class="heading-right"><div id="summary" class="summary"></div>${!archived ? '<button id="new-action" class="button primary">+ New action <kbd>Alt N</kbd></button>' : ''}</div></div>
    <div id="error-banner" class="error-banner" role="alert" hidden><span id="error-text"></span><button id="retry-save" class="button" hidden>Retry save</button><button id="emergency-export" class="button">Download backup</button></div>
    <section class="work-surface" aria-label="Action tracker">
      <div class="toolbar"><div class="search-box"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="search" type="search" placeholder="Search actions, categories, tickets…" aria-label="Search actions"><kbd>/</kbd></div><div class="filters"><select id="account-filter" aria-label="Filter by account"><option value="">All accounts</option></select><select id="status-filter" aria-label="Filter by status"><option value="">All statuses</option>${STATUSES.map(status => `<option>${status}</option>`).join('')}</select><button id="clear-filters" class="text-button" hidden>Clear filters</button></div><span id="visible-count" class="visible-count"></span></div>
      <div id="empty-state" class="empty-state" hidden><img src="./icon.svg" alt="" width="36" height="36"><div><strong>${archived ? 'Your completed work will appear here' : 'Start with your next action'}</strong><p>${archived ? 'Complete a task on the Action items page to move the record here.' : 'Type in a blank row below, or import your workbook records.'}</p></div>${!archived ? '<button id="empty-import" class="button">Import records</button>' : ''}</div>
      <div class="table-wrap" tabindex="0" aria-label="Editable action table"><table id="actions-table"><caption class="sr-only">${archived ? 'Completed action items, grouped by account' : 'All action items, grouped by account, then This Week and Remaining Items'}</caption><colgroup>${FIELDS.map(field => `<col class="col-${field}">`).join('')}</colgroup><thead><tr>${FIELDS.map(field => `<th scope="col" data-column="${field}" ${field === 'done' ? 'class="done-heading"' : ''}>${labels[field]}</th>`).join('')}</tr></thead></table></div>
      <div class="table-footer"><span>${archived ? 'Uncheck Done to restore.' : '<kbd>Tab</kbd> Next field <span class="footer-divider">·</span> <kbd>Ctrl Alt ↑ / ↓</kbd> Same column <span class="footer-divider">·</span> <kbd>Ctrl Enter</kbd> New action'}</span><button id="reset-widths" class="text-button">Reset column widths</button><button id="show-more" class="text-button" hidden>Show more completed actions</button><span class="local-label"><span class="local-dot"></span>Saved in this browser</span></div>
    </section>
    <div class="workspace-footer"><span>One table. All accounts.</span><span>Week starts Monday · <span id="week-label"></span></span></div>
  </main>
  <div id="completion-hint" class="sr-only" role="status" aria-live="polite"></div>
  <dialog id="keyboard-dialog"><div class="dialog-heading"><div><div class="eyebrow">WORK FASTER</div><h2>Keyboard shortcuts</h2></div><button id="close-keyboard" class="icon-button" aria-label="Close keyboard shortcuts">×</button></div><dl class="shortcut-list"><div><dt>Next / previous field</dt><dd><kbd>Tab</kbd> / <kbd>Shift Tab</kbd></dd></div><div><dt>Move up / down in a column</dt><dd><kbd>Ctrl Alt ↑</kbd> / <kbd>Ctrl Alt ↓</kbd></dd></div><div><dt>Move left / right between fields</dt><dd><kbd>Alt ←</kbd> / <kbd>Alt →</kbd></dd></div><div><dt>New action in this section</dt><dd><kbd>Ctrl Enter</kbd> or <kbd>⌘ Enter</kbd></dd></div><div><dt>New action</dt><dd><kbd>Alt N</kbd></dd></div><div><dt>Search</dt><dd><kbd>Ctrl K</kbd> or <kbd>/</kbd></dd></div><div><dt>Start editing search results</dt><dd><kbd>Enter</kbd> in search</dd></div><div><dt>Accept inline completion</dt><dd><kbd>Tab</kbd> or <kbd>→</kbd></dd></div><div><dt>Keep typed text / leave a field</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Add an Action Item line</dt><dd><kbd>Enter</kbd></dd></div><div><dt>Add a Notes line</dt><dd><kbd>Shift Enter</kbd></dd></div></dl><p class="small-print">Dropdown arrows and calendar keys keep their native browser behavior. Focus Remaining Items and press Enter or Space to expand.</p></dialog>
  <dialog id="link-dialog"><form id="link-form"><div class="dialog-heading"><h2>Edit ticket link</h2><button type="button" id="close-link" class="icon-button" aria-label="Close link editor">×</button></div><label class="dialog-field" for="link-address">Address or ticket ID<input id="link-address" type="text" autocomplete="off" spellcheck="false"></label><label class="dialog-field" for="link-label">Display text <span class="optional-label">(optional)</span><input id="link-label" type="text" autocomplete="off"></label><p class="small-print">Leave display text blank to show the address. Custom display text requires an HTTP or HTTPS link.</p><p id="link-error" class="link-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="cancel-link" class="button">Cancel</button><button type="submit" id="save-link" class="button primary">Save link</button></div></form></dialog>
  <div id="toast" class="toast" role="status" hidden><span id="toast-text"></span><button id="toast-undo" hidden>Undo</button></div>
  <dialog id="data-dialog"><div class="dialog-heading"><h2>Your records</h2><button id="close-data" class="icon-button" aria-label="Close data settings">×</button></div><p class="dialog-intro">Changes save on this device. Download a backup to move your records to another browser.</p><div class="data-action"><div><strong>Back up all action items</strong><p>Includes active actions, completed actions, and source references. Activities and Hours has a separate backup.</p></div><button id="export-json" class="button primary">Download JSON</button></div><div class="data-action"><div><strong>Export a spreadsheet</strong><p>Download ${archived ? 'completed' : 'active'} actions as CSV.</p></div><button id="export-csv" class="button">Download CSV</button></div><div class="data-action"><div><strong>Import records</strong><p>Import an Action Items JSON backup or migration file.</p></div><button id="choose-import" class="button">Choose file</button></div><label class="overwrite-option"><input id="overwrite-import" type="checkbox"> Update matching records from the file</label><p class="small-print">Existing records stay unchanged unless this option is selected. Imported rows merge by record ID.</p><input id="import-file" type="file" accept=".json,application/json" hidden><div id="import-result" class="import-result" role="status"></div></dialog>
`;

const el = id => document.getElementById(id);
const cellTools = document.createElement('div'); cellTools.className = 'cell-tools'; cellTools.setAttribute('role', 'group'); cellTools.setAttribute('aria-label', 'Cell formatting');
cellTools.innerHTML = '<button id="bold-cell" class="format-button" type="button" aria-label="Bold selected cell" aria-pressed="false" title="Bold selected cell (Ctrl+B)" disabled><span aria-hidden="true">B</span></button><button id="edit-ticket-link" class="format-button" type="button" aria-label="Edit ticket link" title="Edit ticket link and display text (Ctrl+K in the ticket cell)" disabled><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 12 4-4m-5 6-1 1a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0m2 4a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4l-1 1"/></svg></button>';
el('visible-count').before(cellTools);
const shortcut = document.createElement('div'); shortcut.innerHTML = '<dt>Bold selected cell</dt><dd><kbd>Ctrl B</kbd> or <kbd>⌘ B</kbd></dd>';
el('keyboard-dialog').querySelector('.shortcut-list').append(shortcut);
const linkShortcut = document.createElement('div'); linkShortcut.innerHTML = '<dt>Edit ticket link / display text</dt><dd><kbd>Ctrl K</kbd> in Ticket ID / link</dd>';
el('keyboard-dialog').querySelector('.shortcut-list').append(linkShortcut);
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
  } finally { pending--; setSaveState(); if (!pending && syncPending && !editingCell()) void syncFromStore(); }
}

function editingCell() { return Boolean(document.activeElement?.closest('#actions-table [data-field]') || el('link-dialog').open); }
function mergeTasks(fresh) {
  tasks = new Map(fresh.map(task => {
    const existing = tasks.get(task.id);
    return [task.id, existing ? Object.assign(existing, task) : task];
  }));
}
function refreshCategories() {
  for (const account of ACCOUNTS) {
    categoryCache.set(account, categoryOptions([...tasks.values()], account));
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
  if (control.tagName !== 'TEXTAREA' || !control.getClientRects().length) return;
  control.style.height = '0px';
  const height = Math.max(29, control.scrollHeight + 2);
  control.style.height = `${Math.min(160, height)}px`;
  control.style.overflowY = height > 160 ? 'auto' : 'hidden';
}
function updateRowAppearance(row, task) {
  row.dataset.status = task.status;
  const today = localDay();
  const due = row.querySelector('[data-field="due"]');
  const highlightDue = Boolean(task.due && task.due <= today);
  due?.classList.toggle('overdue-date', Boolean(task.due && task.due < today));
  due?.classList.toggle('due-alert', highlightDue);
  due?.closest('.cell-due')?.classList.toggle('due-alert', highlightDue);
  if (due) due.title = task.due && task.due < today ? 'Overdue' : task.due === today ? 'Today' : '';
  const hint = row.querySelector('.due-hint');
  if (hint) hint.textContent = task.due && task.due < today ? 'Overdue' : task.due === today ? 'Today' : '';
  row.querySelector('[data-field="status"]')?.setAttribute('data-value', task.status);
  for (const control of row.querySelectorAll('[data-field]')) control.classList.toggle('is-bold', cellIsBold(task, control.dataset.field));
}
function scheduleRender() {
  clearTimeout(renderTimer);
  layoutPending = true;
  renderTimer = setTimeout(() => {
    if (editingCell()) return;
    render(); if (syncPending) void syncFromStore();
  }, 0);
}

function promoteRow(row, task) {
  if (row.dataset.draft !== 'true') return;
  const group = row.closest('tbody');
  row.dataset.draft = 'false'; row.classList.remove('draft-row');
  tasks.set(task.id, task); row.querySelector('[data-field="done"]').disabled = false;
  drafts.delete(`${group.dataset.bucket}:${group.dataset.account}`);
  group.append(rowFor(draftFor(group.dataset.account, group.dataset.bucket), true, group.dataset.bucket));
  for (const control of row.querySelectorAll('[data-field]')) control.setAttribute('aria-label', `${labels[control.dataset.field]}, ${task.account}, ${task.title || 'untitled action'}`);
  row.querySelector('.field-title').placeholder = 'Action item…';
}
function inputFor(task, field, draft, bucket) {
  let control;
  if (field === 'account' || field === 'status') {
    control = document.createElement('select');
    const values = field === 'account' ? ACCOUNTS : STATUSES;
    for (const value of values) control.append(new Option(value || 'Unspecified', value));
    control.value = task[field];
  } else if (field === 'done') {
    control = document.createElement('input'); control.type = 'checkbox'; control.checked = task.done;
    control.disabled = draft;
  } else if (field === 'due') {
    control = document.createElement('input'); control.type = 'date'; control.value = task.due;
  } else if (field === 'title' || field === 'notes') {
    control = document.createElement('textarea'); control.rows = 1; control.value = task[field];
    control.placeholder = field === 'title' ? draft ? 'Add an action item…' : 'Action item…' : '';
    control.spellcheck = true;
  } else {
    control = document.createElement('input'); control.type = 'text'; control.value = field === 'ticket' ? ticketText(task) : task[field];
    control.placeholder = field === 'category' ? 'Category…' : field === 'ticket' ? '' : OWNER;
    if (field === 'category') control.autocomplete = 'off';
  }
  control.className = `cell-input field-${field}`; control.dataset.field = field;
  control.setAttribute('aria-label', `${labels[field]}, ${task.account}, ${draft ? `new ${bucket === 'week' ? 'this week' : 'remaining'} action` : task.title || 'untitled action'}`);
  function commitValue(value) {
    const row = control.closest('tr');
    const patch = field === 'ticket' ? ticketInputPatch(task, value) : {[field]: value};
    if (Object.entries(patch).every(([key, next]) => task[key] === next)) return;
    Object.assign(task, patch);
    const updatedAt = new Date().toISOString(); task.updatedAt = updatedAt;
    promoteRow(row, task);
    // Keep an edited action visible if its date or account moves it into Remaining Items.
    if (sectionFor(task) === 'remaining' && (row.closest('tbody').dataset.bucket === 'week' || field === 'account')) expandedRemaining.add(task.account);
    if (field === 'ticket') updateTicketLink(row, task);
    autoSize(control); updateRowAppearance(row, task); summary();
    void saveTask(task, {...patch, updatedAt});
    layoutPending = true;
  }
  const completion = ['category', 'owner'].includes(field) ? inlineCompletion(control,
    () => field === 'category'
      ? [...new Set([...(categoryCache.get(task.account) || []), ...categoryOptions([...tasks.values()].filter(t => t.id !== task.id), task.account)])]
      : [...new Set([OWNER, ...[...tasks.values()].filter(t => t.id !== task.id).map(t => t.owner).filter(Boolean)])],
    commitValue, message => { el('completion-hint').textContent = message; }) : null;
  control.addEventListener(field === 'done' ? 'change' : 'input', async event => {
    if (field === 'done') { await changeCompletion(task, control.checked, control); return; }
    if (field === 'due' && control.validity.badInput) return;
    commitValue(control.value); completion?.onInput(event);
  });
  if (field === 'title') control.title = 'Enter adds a new line. Tab moves to the next field.';
  return control;
}

function updateTicketLink(row, task) {
  const anchor = row.querySelector('.ticket-link'); const url = safeURL(task.ticket);
  const input = row.querySelector('.field-ticket');
  input?.classList.toggle('has-link', Boolean(url));
  if (input) input.title = url ? `Destination: ${url}` : '';
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
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ticket-edit-button'; edit.tabIndex = -1;
      edit.setAttribute('aria-label', `Edit ticket link, ${task.account}, ${draft ? 'new action' : task.title || 'untitled action'}`);
      edit.title = 'Edit link and display text'; edit.textContent = '✎'; edit.onclick = () => openLinkEditor(control);
      wrapper.append(control, anchor, edit); cell.append(wrapper);
    } else if (field === 'due') {
      const wrapper = document.createElement('div'); wrapper.className = 'date-control'; wrapper.append(control);
      if (typeof control.showPicker === 'function') {
        wrapper.classList.add('with-picker');
        const picker = document.createElement('button'); picker.type = 'button'; picker.className = 'calendar-button'; picker.tabIndex = -1;
        picker.setAttribute('aria-label', `Open calendar, ${task.account}, ${draft ? 'new action' : task.title || 'untitled action'}`);
        picker.title = 'Choose a due date. Alt+Down or F4 also opens the calendar.';
        picker.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="5" width="13" height="12" rx="2"/><path d="M6.5 3v4m7-4v4m-10 2h13"/></svg>';
        const openPicker = () => { control.focus({preventScroll: true}); try { control.showPicker(); } catch {} };
        picker.onclick = openPicker;
        control.addEventListener('keydown', event => {
          if (event.key === 'F4' || (event.altKey && !event.ctrlKey && event.key === 'ArrowDown')) {
            event.preventDefault(); event.stopPropagation(); openPicker();
          }
        });
        wrapper.append(picker);
      }
      cell.append(wrapper); const hint = document.createElement('span'); hint.className = 'due-hint'; cell.append(hint);
    } else cell.append(control);
    row.append(cell);
  }
  updateTicketLink(row, task); updateRowAppearance(row, task);
  row.addEventListener('focusout', event => {
    if (row.contains(event.relatedTarget)) return;
    if (row.dataset.draft !== 'true') scheduleRender();
  });
  return row;
}
function rowFor(task, draft = false, bucket = '') {
  let row = rowViews.get(task.id);
  if (!row) { row = makeRow(task, draft, bucket); rowViews.set(task.id, row); }
  return row;
}
function cellContext(control = activeCell) {
  if (!control?.isConnected || !control.getClientRects().length) return null;
  const row = control.closest('tr[data-id]');
  if (!row) return null;
  const task = tasks.get(row.dataset.id) || [...drafts.values()].find(draft => draft.id === row.dataset.id);
  return task ? {row, task, control, field: control.dataset.field} : null;
}
function refreshCellTools() {
  const context = cellContext();
  el('bold-cell').disabled = !context || context.field === 'done';
  el('bold-cell').setAttribute('aria-pressed', String(Boolean(context && cellIsBold(context.task, context.field))));
  el('edit-ticket-link').disabled = !context;
}
async function toggleSelectedBold(control = activeCell) {
  const context = cellContext(control);
  if (!context || context.field === 'done') return;
  activeCell = control;
  context.task.boldFields = toggledBoldFields(context.task, context.field);
  updateRowAppearance(context.row, context.task); refreshCellTools();
  autoSize(control);
  if (context.row.dataset.draft !== 'true') {
    context.task.updatedAt = new Date().toISOString();
    void saveTask(context.task, {boldFields: context.task.boldFields, updatedAt: context.task.updatedAt});
  }
  control.focus({preventScroll: true});
}
function openLinkEditor(control = activeCell) {
  const context = cellContext(control);
  if (!context || !store) return;
  linkTarget = {...context, control: context.row.querySelector('.field-ticket')};
  el('link-address').value = context.task.ticket || '';
  el('link-label').value = context.task.ticketLabel || '';
  el('link-error').hidden = true;
  el('link-dialog').showModal();
  const input = safeURL(context.task.ticket) ? el('link-label') : el('link-address');
  input.focus(); input.select();
}
el('actions-table').addEventListener('focusin', event => {
  const control = event.target.closest('[data-field]');
  if (control) { activeCell = control; refreshCellTools(); }
});
el('bold-cell').addEventListener('pointerdown', event => event.preventDefault());
el('bold-cell').onclick = () => { void toggleSelectedBold(); };
el('edit-ticket-link').onclick = () => openLinkEditor();
const closeLink = () => { if (!el('save-link').disabled) el('link-dialog').close(); };
el('close-link').onclick = closeLink; el('cancel-link').onclick = closeLink;
el('link-dialog').addEventListener('click', event => { if (event.target === el('link-dialog')) closeLink(); });
el('link-dialog').addEventListener('cancel', event => { if (el('save-link').disabled) event.preventDefault(); });
el('link-dialog').addEventListener('close', () => { linkTarget = null; scheduleRender(); });
el('link-form').addEventListener('submit', async event => {
  event.preventDefault();
  const context = linkTarget;
  if (!context || el('save-link').disabled) return;
  try {
    const patch = linkPatch(el('link-address').value, el('link-label').value);
    if (context.row.dataset.draft === 'true' && !patch.ticket) { closeLink(); return; }
    if (patch.ticket === context.task.ticket && patch.ticketLabel === (context.task.ticketLabel || '')) { closeLink(); return; }
    el('link-error').hidden = true;
    for (const id of ['save-link', 'close-link', 'cancel-link']) el(id).disabled = true;
    Object.assign(context.task, patch, {updatedAt: new Date().toISOString()});
    promoteRow(context.row, context.task);
    context.control.value = ticketText(context.task);
    updateTicketLink(context.row, context.task); updateRowAppearance(context.row, context.task); summary();
    layoutPending = true;
    if (!await saveTask(context.task, {...patch, updatedAt: context.task.updatedAt})) throw new Error('Link changes need saving. Close this editor and use Retry save.');
    el('link-dialog').close();
    context.control.focus({preventScroll: true});
  } catch (error) {
    el('link-error').textContent = error.message; el('link-error').hidden = false;
  } finally {
    for (const id of ['save-link', 'close-link', 'cancel-link']) el(id).disabled = false;
  }
});
function updateRow(row, task, draft) {
  row.dataset.account = task.account;
  row.querySelector('.calendar-button')?.setAttribute('aria-label', `Open calendar, ${task.account}, ${draft ? 'new action' : task.title || 'untitled action'}`);
  for (const control of row.querySelectorAll('[data-field]')) {
    const field = control.dataset.field;
    if (field === 'done') { control.checked = task.done; control.disabled = draft; }
    else {
      const value = field === 'ticket' ? ticketText(task) : task[field];
      if (control.value !== value) control.value = value;
    }
    if (field === 'title') control.placeholder = draft ? 'Add an action item…' : 'Action item…';
    control.setAttribute('aria-label', `${labels[field]}, ${task.account}, ${draft ? `new ${row.closest('tbody')?.dataset.bucket === 'week' ? 'this week' : 'remaining'} action` : task.title || 'untitled action'}`);
  }
  row.querySelector('.ticket-edit-button')?.setAttribute('aria-label', `Edit ticket link, ${task.account}, ${draft ? 'new action' : task.title || 'untitled action'}`);
  updateTicketLink(row, task); updateRowAppearance(row, task);
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
  if (!drafts.has(key)) drafts.set(key, newTask(account));
  return drafts.get(key);
}
function remainingOpen(account) {
  return expandedRemaining.has(account) || (Boolean(query.text.trim() || query.status) && !collapsedSearch.has(account));
}
function subsectionRow(account, section, group) {
  const row = document.createElement('tr'); row.className = 'subsection-row';
  const cell = document.createElement('th'); cell.colSpan = FIELDS.length; cell.scope = 'rowgroup';
  const remaining = section === 'remaining';
  const bar = document.createElement(remaining ? 'button' : 'div'); bar.className = 'subsection-bar';
  const icon = document.createElement('span'); icon.className = 'section-chevron'; icon.setAttribute('aria-hidden', 'true');
  icon.textContent = remaining ? '›' : '−';
  const title = document.createElement('span'); title.className = 'subsection-title'; title.textContent = remaining ? 'Remaining Items' : 'This Week';
  const badge = document.createElement('span'); badge.className = 'section-count';
  const info = document.createElement('span'); info.className = 'subsection-description';
  info.textContent = remaining ? 'Later or undated' : 'Includes overdue';
  bar.append(icon, title, badge, info);
  if (remaining) {
    bar.type = 'button'; bar.setAttribute('aria-label', `Remaining Items, ${account}`);
    bar.setAttribute('aria-controls', group.id);
    bar.setAttribute('aria-expanded', String(!group.hidden));
    bar.onclick = () => {
      if (remainingOpen(account)) { expandedRemaining.delete(account); collapsedSearch.add(account); }
      else { expandedRemaining.add(account); collapsedSearch.delete(account); }
      group.hidden = !remainingOpen(account);
      bar.setAttribute('aria-expanded', String(!group.hidden));
      if (!group.hidden) for (const textarea of group.querySelectorAll('textarea')) autoSize(textarea);
    };
  }
  cell.append(bar); row.append(cell); return row;
}
function initializeGroups() {
  const table = el('actions-table');
  for (const account of ACCOUNTS) {
    const heading = document.createElement('tbody'); heading.className = 'account-heading'; heading.dataset.account = account;
    heading.append(bandRow(account, '', 'account-row'));
    // A stable count node avoids replacing the heading or disclosure button.
    const count = document.createElement('span'); count.className = 'band-description'; heading.querySelector('th').append(count);
    table.append(heading);
    const view = {heading, count, groups: new Map()}; accountViews.set(account, view);
    for (const section of archived ? ['archive'] : ['week', 'remaining']) {
      const body = document.createElement('tbody'); body.className = 'account-records'; body.dataset.account = account; body.dataset.bucket = section;
      body.id = `records-${account.toLowerCase()}-${section}`;
      body.hidden = section === 'remaining';
      let subheading;
      if (!archived) {
        subheading = document.createElement('tbody'); subheading.className = 'subsection-heading';
        subheading.append(subsectionRow(account, section, body)); table.append(subheading);
      }
      table.append(body); view.groups.set(section, {body, subheading});
    }
  }
}
function render({force = false} = {}) {
  if (!force && editingCell()) { layoutPending = true; summary(); return; }
  layoutPending = false;
  const table = el('actions-table');
  if (!accountViews.size) initializeGroups();
  const all = [...tasks.values()];
  const filtered = all.filter(t => t.done === archived && matches(t, query.text, query.account, query.status));
  const list = archived ? filtered.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '') || compareTasks(a, b)).slice(0, archiveLimit) : filtered;
  for (const account of ACCOUNTS) {
    const accountRecords = list.filter(t => t.account === account);
    const view = accountViews.get(account);
    const hidden = Boolean(query.account && query.account !== account) || ((archived || query.text.trim() || query.status) && !accountRecords.length);
    view.heading.hidden = hidden;
    view.count.textContent = `${accountRecords.length} ${accountRecords.length === 1 ? 'action' : 'actions'}`;
    for (const [section, group] of view.groups) {
      const records = accountRecords.filter(t => archived || sectionFor(t) === section).sort(compareTasks);
      group.body.hidden = hidden || (section === 'remaining' && !remainingOpen(account));
      if (group.subheading) {
        group.subheading.hidden = hidden;
        group.subheading.querySelector('.section-count').textContent = records.length;
        group.subheading.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', String(remainingOpen(account)));
      }
      const rows = records.map(record => rowFor(record, false, section));
      if (!archived) rows.push(rowFor(draftFor(account, section), true, section));
      reconcileChildren(group.body, hidden ? [] : rows);
      for (const row of rows) {
        const record = tasks.get(row.dataset.id); updateRow(row, record || draftFor(account, section), !record);
      }
    }
  }
  refreshCategories(); summary();
  el('visible-count').textContent = `${filtered.length} ${archived ? 'completed' : 'active'} ${filtered.length === 1 ? 'action' : 'actions'}`;
  el('empty-state').hidden = archived ? filtered.length > 0 : all.some(t => !t.done);
  el('clear-filters').hidden = !query.text && !query.account && !query.status;
  el('show-more').hidden = !archived || filtered.length <= archiveLimit;
  for (const textarea of table.querySelectorAll('textarea')) autoSize(textarea);
  refreshCellTools();
}

async function changeCompletion(task, done, control) {
  control.disabled = true;
  const original = {done: task.done, completedAt: task.completedAt};
  const patch = {done, completedAt: done ? new Date().toISOString() : null, updatedAt: new Date().toISOString()};
  if (await saveTask(task, patch)) {
    Object.assign(task, patch);
    const controls = [...el('actions-table').querySelectorAll('.field-done')].filter(c => c !== control && !c.disabled && c.getClientRects().length);
    const next = controls.find(c => Boolean(control.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) || controls.at(-1);
    render({force: true}); next?.focus();
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
  download(`action-items-backup-${localDay()}.json`, JSON.stringify({format: 'action-items', version: 3, exportedAt: new Date().toISOString(), tasks: [...tasks.values()]}, null, 2), 'application/json');
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
    mergeTasks(await store.all()); render(); channel?.postMessage({imported: true});
    result.textContent = `${importedResult.count} records imported. ${imported.length - importedResult.count} matching records kept.`;
    toast(`${importedResult.count} records imported.`);
  } catch (error) { result.textContent = `Import stopped. ${error.message}`; }
  event.target.value = '';
};
el('retry-save').onclick = async () => {
  for (const [id, patch] of [...retryEdits]) await saveTask(tasks.get(id), patch);
  if (!retryEdits.size) { mergeTasks(await store.all()); render(); }
};
el('search').oninput = event => { query.text = event.target.value; collapsedSearch.clear(); render(); };
el('account-filter').onchange = event => { query.account = event.target.value; render(); };
el('status-filter').onchange = event => { query.status = event.target.value; collapsedSearch.clear(); render(); };
el('clear-filters').onclick = () => { query.text = ''; query.account = ''; query.status = ''; collapsedSearch.clear(); el('search').value = ''; el('account-filter').value = ''; el('status-filter').value = ''; render(); };
el('show-more').onclick = () => { archiveLimit += 50; render(); };
function newAction(control) {
  if (archived || !store) return;
  const row = control?.closest('tr[data-id]');
  const account = (row && tasks.get(row.dataset.id)?.account) || row?.dataset.account || query.account || ACCOUNTS[0];
  const section = row?.closest('tbody')?.dataset.bucket || 'week';
  query.text = ''; query.status = ''; collapsedSearch.clear(); el('search').value = ''; el('status-filter').value = '';
  if (query.account) { query.account = account; el('account-filter').value = account; }
  if (section === 'remaining') expandedRemaining.add(account);
  render({force: true});
  const field = rowViews.get(draftFor(account, section).id)?.querySelector('.field-title');
  field?.focus(); field?.scrollIntoView({block: 'nearest', inline: 'nearest'});
}
const gridKeys = installGridKeys(el('actions-table'), {newAction});
el('new-action')?.addEventListener('click', () => newAction());
el('keyboard-button').onclick = () => el('keyboard-dialog').showModal();
el('close-keyboard').onclick = () => el('keyboard-dialog').close();
el('keyboard-dialog').addEventListener('click', event => { if (event.target === el('keyboard-dialog')) el('keyboard-dialog').close(); });
el('search').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); gridKeys.focusFirst(); }
  if (event.key === 'Escape') { query.text = ''; collapsedSearch.clear(); el('search').value = ''; render(); }
});
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || event.target.closest('dialog')) return;
  const editing = event.target.closest('input, textarea, select');
  const control = event.target.closest('#actions-table [data-field]');
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && control) {
    event.preventDefault(); void toggleSelectedBold(control);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && control?.dataset.field === 'ticket') {
    event.preventDefault(); openLinkEditor(control);
  } else if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !editing)) {
    event.preventDefault(); el('search').focus(); el('search').select();
  } else if (event.altKey && event.key.toLowerCase() === 'n' && !archived) { event.preventDefault(); newAction(event.target.closest('[data-field]')); }
  else if (event.key === '?' && !editing) { event.preventDefault(); el('keyboard-dialog').showModal(); }
});
window.addEventListener('beforeunload', event => { if (pending || saveFailed) { event.preventDefault(); event.returnValue = ''; } });
async function syncFromStore() {
  syncPending = true;
  if (!store || pending || saveFailed || editingCell()) return;
  try {
    syncPending = false;
    const fresh = await store.all();
    // Focus or saving might have started while the IndexedDB read was pending.
    if (pending || saveFailed || editingCell()) { syncPending = true; return; }
    mergeTasks(fresh); currentDay = localDay(); render();
  } catch (error) { syncPending = true; showError(error.message); }
}
channel?.addEventListener('message', () => { void syncFromStore(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncFromStore(); });
el('actions-table').addEventListener('focusout', () => { if (layoutPending || syncPending) scheduleRender(); });
setInterval(() => { if (localDay() !== currentDay && !editingCell()) {currentDay = localDay(); render();} }, 60000);

try {
  store = await openStore();
  const sizing = installColumnSizing(el('actions-table'), FIELDS, {
    onChange: widths => store.setting('column-widths', widths),
    onError: error => toast(error.message),
    onResize: () => { for (const textarea of el('actions-table').querySelectorAll('textarea')) autoSize(textarea); }
  });
  sizing.restore(await store.setting('column-widths'));
  el('reset-widths').onclick = () => sizing.reset();
  mergeTasks(await store.all());
  render(); setSaveState();
} catch (error) {
  saveFailed = true; setSaveState();
  showError(`Browser storage is unavailable. ${error.message} Use a normal browser window with site storage enabled.`);
  for (const control of app.querySelectorAll('input, select, button')) if (!['emergency-export', 'data-button', 'close-data', 'export-json'].includes(control.id)) control.disabled = true;
}

