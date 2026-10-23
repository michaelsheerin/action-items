export const ACCOUNTS = ['Internal', 'Goldman', 'Uber', 'Claritev', 'Paramount'];
export const OWNER = 'Michael Sheerin';
export const URGENCIES = ['', 'Urgent', 'Not urgent'];
export const STATUSES = ['Ready', 'In progress', 'Waiting', 'Scheduled'];
export const FIELDS = ['account', 'category', 'title', 'due', 'urgency', 'status', 'ticket', 'owner', 'done', 'notes'];

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(year, month - 1, day, 12);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function weekBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const next = new Date(end); next.setDate(next.getDate() + 1);
  return {start: localDay(start), end: localDay(end), next: localDay(next)};
}

export function sectionFor(task, date = new Date()) {
  return task.due && task.due <= weekBounds(date).end ? 'week' : 'remaining';
}

const urgencyRank = {'Urgent': 0, 'Not urgent': 1, '': 2};
const statusRank = {'In progress': 0, 'Ready': 1, 'Waiting': 2, 'Scheduled': 3};
export function compareTasks(a, b) {
  return (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31')
    || (urgencyRank[a.urgency] ?? 2) - (urgencyRank[b.urgency] ?? 2)
    || (statusRank[a.status] ?? 4) - (statusRank[b.status] ?? 4)
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

export function matches(task, query = '', account = '', urgency = '') {
  const text = FIELDS.filter(k => k !== 'done').map(k => task[k] || '').join(' ').toLocaleLowerCase();
  return (!account || task.account === account) && (!urgency || task.urgency === urgency)
    && query.toLocaleLowerCase().trim().split(/\s+/).every(word => text.includes(word));
}

export function categoryOptions(tasks, account) {
  const names = tasks.filter(t => t.account === account).map(t => t.category.trim()).filter(Boolean);
  return [...new Map(names.map(name => [name.toLocaleLowerCase(), name])).values()].sort((a, b) => a.localeCompare(b));
}

export function safeURL(value) {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function newTask(account, due = '', id = crypto.randomUUID()) {
  const now = new Date().toISOString();
  return {id, account, category: '', title: '', due, urgency: 'Not urgent', status: 'Ready', ticket: '', owner: OWNER,
    done: false, notes: '', createdAt: now, updatedAt: now, completedAt: null};
}

export function normalizeTask(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Record ${index + 1} has an invalid format.`);
  const aliases = {'GS': 'Goldman', 'GS Action Items': 'Goldman', 'Parmount': 'Paramount'};
  const sourceAccount = String(raw.account || 'Internal').replace(/ Action Items$/, '');
  const account = aliases[sourceAccount] || sourceAccount;
  if (!ACCOUNTS.includes(account)) throw new Error(`Record ${index + 1}: unknown account "${account}".`);
  const base = newTask(account, '', String(raw.id || crypto.randomUUID()));
  for (const key of FIELDS.filter(k => k !== 'done')) {
    if (raw[key] != null) {
      if (typeof raw[key] !== 'string') throw new Error(`Record ${index + 1}: ${key} must contain text.`);
      if (raw[key].length > 100000) throw new Error(`Record ${index + 1}: ${key} is too long.`);
      base[key] = raw[key];
    }
  }
  base.account = account;
  if (base.due && !validDay(base.due)) throw new Error(`Record ${index + 1}: invalid due date.`);
  base.urgency = base.urgency === 'Not Urgent' ? 'Not urgent' : base.urgency;
  if (!URGENCIES.includes(base.urgency)) throw new Error(`Record ${index + 1}: invalid urgency.`);
  if (!STATUSES.includes(base.status)) throw new Error(`Record ${index + 1}: invalid status.`);
  if (raw.done != null && typeof raw.done !== 'boolean') throw new Error(`Record ${index + 1}: done must be true or false.`);
  base.done = raw.done === true;
  for (const key of ['createdAt', 'updatedAt', 'completedAt']) {
    if (typeof raw[key] === 'string' && !Number.isNaN(Date.parse(raw[key]))) base[key] = raw[key];
  }
  if (raw.createdAt === null) base.createdAt = null;
  // Imported historical completions have no known completion date.
  if (base.done && !raw.completedAt) base.completedAt = null;
  if (!base.done) base.completedAt = null;
  if (raw.source && typeof raw.source === 'object') base.source = raw.source;
  return base;
}

export function parseImport(text) {
  const parsed = JSON.parse(text);
  const input = Array.isArray(parsed) ? parsed : parsed.tasks;
  if (!Array.isArray(input)) throw new Error('Choose an Action Items JSON backup.');
  if (input.length > 50000) throw new Error('Import fewer than 50,000 records at once.');
  const tasks = input.map(normalizeTask);
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('The import contains duplicate record IDs.');
  return tasks;
}

export function csvExport(tasks) {
  const header = ['Account', 'Category', 'Action item', 'Due date', 'Urgency', 'Status', 'Ticket ID / link', 'Owner', 'Complete', 'Notes'];
  const quote = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [header, ...tasks.map(t => FIELDS.map(k => t[k]))].map(row => row.map(quote).join(',')).join('\r\n');
}
