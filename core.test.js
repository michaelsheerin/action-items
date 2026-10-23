import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newTask, weekBounds, sectionFor, compareTasks, normalizeTask, parseImport, categoryOptions, safeURL, csvExport, matches, upgradeTask, STATUSES, FIELDS} from './core.js';
const date = new Date(2026,9,23,12);
test('Monday-based week includes Sunday, overdue dates, and the next year boundary', () => {
  assert.deepEqual(weekBounds(date), {start:'2026-10-19',end:'2026-10-25',next:'2026-10-26'});
  assert.equal(sectionFor({due:'2026-09-08'}, date), 'week');
  assert.equal(sectionFor({due:'2026-10-25'}, date), 'week');
  assert.equal(sectionFor({due:'2026-10-26'}, date), 'remaining');
  assert.equal(sectionFor({due:''}, date), 'remaining');
  assert.deepEqual(weekBounds(new Date(2027,0,3,12)), {start:'2026-12-28',end:'2027-01-03',next:'2027-01-04'});
});
test('sort uses due date then the unified status; undated work is last', () => {
  const a = newTask('Goldman','2026-10-23','a');
  const rows = [{...a,id:'1',due:''}, {...a,id:'2',status:'Not Urgent'}, {...a,id:'3',status:'Waiting'}, {...a,id:'4',status:'Urgent'}, {...a,id:'5',due:'2026-10-22'}, {...a,id:'6',status:'Scheduled'}];
  assert.deepEqual(rows.sort(compareTasks).map(t=>t.id), ['5','4','3','6','2','1']);
});
test('import preserves explicit false, legacy unknown dates, ownership, notes, and account aliases', () => {
  const source = {...newTask('Internal'), account:'GS', done:true, completedAt:null, createdAt:null, notes:'one\ntwo', source:{row:9}};
  const t = normalizeTask(source);
  assert.equal(t.account,'Goldman'); assert.equal(t.owner,'Michael Sheerin'); assert.equal(t.completedAt,null); assert.equal(t.createdAt,null); assert.equal(t.notes,'one\ntwo'); assert.deepEqual(t.source,{row:9});
  assert.equal(normalizeTask({...source,done:false}).done,false);
});
test('invalid imports fail before persistence, including booleans, dates, accounts, and duplicate IDs', () => {
  const source = newTask('Uber');
  for (const patch of [{done:'FALSE'}, {due:'2026-02-30'}, {account:'unknown'}, {status:'unrecognized'}, {title:23}]) assert.throws(()=>parseImport(JSON.stringify([{...source,...patch}])));
  assert.throws(()=>parseImport(JSON.stringify([source, source])), /duplicate/);
  assert.throws(()=>parseImport('{}'));
});
test('autocomplete is scoped to account, deduplicated, and includes archived categories', () => {
  assert.deepEqual(categoryOptions([{account:'Goldman',category:'Capacity',done:true},{account:'Goldman',category:'Capacity'},{account:'Uber',category:'Storage'}], 'Goldman'), ['Capacity']);
});
test('ticket URLs reject script protocols and exports neutralize spreadsheet formulas', () => {
  assert.equal(safeURL('javascript:alert(1)'), ''); assert.equal(safeURL('data:text/html,<script>'), '');
  assert.equal(safeURL('https://example.com/tickets/3'), 'https://example.com/tickets/3');
  const csv = csvExport([{...newTask('Internal'),title:'=HYPERLINK("bad")',notes:'line 1\nline 2'}]);
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('line 1\nline 2'));
});
test('search covers all editable fields and combines account and status filters', () => {
  const task = {...newTask('Goldman'),ticket:'ABC-123',notes:'Waiting for engineering',status:'Urgent'};
  assert.equal(matches(task,'ABC engineering','Goldman','Urgent'),true);
  assert.equal(matches(task,'ABC engineering','Uber','Urgent'),false);
});
test('workbook migration reconciles every populated task and preserves completed history', () => {
  const path = new URL('../action-items-import.json', import.meta.url);
  if (!fs.existsSync(path)) return;
  const tasks = parseImport(fs.readFileSync(path, 'utf8'));
  assert.equal(tasks.length, 1088);
  assert.equal(tasks.filter(t=>!t.done).length,22);
  assert.equal(tasks.filter(t=>t.done).length,1066);
  assert.equal(tasks.filter(t=>sectionFor(t,date)==='week'&&!t.done).length,7);
  assert.ok(tasks.every(t=>t.owner==='Michael Sheerin' && t.source.row > 1));
  assert.ok(tasks.filter(t=>t.done).every(t=>t.completedAt===null));
  assert.ok(tasks.every(t=>STATUSES.includes(t.status) && !Object.hasOwn(t,'urgency')));
});
test('legacy status migration preserves records, explicit workflow status, and original classification', () => {
  const original={id:'existing',title:'Existing work',due:'2026-10-22',notes:'Keep these notes',status:'Waiting',urgency:'Urgent'};
  const converted=upgradeTask(original);
  assert.equal(converted.status,'Waiting');
  assert.equal(converted.due,original.due); assert.equal(converted.notes,original.notes); assert.equal(converted.id,original.id);
  assert.deepEqual(converted.legacyClassification,{status:'Waiting',urgency:'Urgent'});
  assert.deepEqual(upgradeTask(converted),converted);
  assert.equal(upgradeTask({...original,status:'Ready'}).status,'Urgent');
  assert.equal(upgradeTask({...original,status:'Scheduled'}).status,'Scheduled');
  assert.equal(upgradeTask({...original,status:'Ready',urgency:'Not urgent'}).status,'Not Urgent');
  assert.equal(upgradeTask({...converted,status:'Not Urgent',urgency:'Urgent'}).status,'Not Urgent');
});
test('new rows have no default due date and one status; export follows the requested column order', () => {
  assert.equal(newTask('Internal').due,'');
  assert.deepEqual(STATUSES,['Urgent','Waiting','Scheduled','Not Urgent']);
  assert.deepEqual(FIELDS,['account','category','title','due','status','done','notes','ticket','owner']);
  assert.equal(csvExport([]).split('\r\n')[0].replace(/^\uFEFF/,''),'"Account","Category","Action item","Due date","Status","Complete","Notes","Ticket ID / link","Owner"');
});
