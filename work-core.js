export const WORK_ACCOUNTS = ['Goldman', 'Uber', 'Paramount'];
export const today = () => dayString(new Date());
export function dayString(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayString(new Date(`${value}T12:00:00`)) === value; }
export function addDays(iso, count) { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+count); return dayString(d); }
export function weekDays(iso = today()) { const d = new Date(`${iso}T12:00:00`); const monday = addDays(iso, -((d.getDay()+6)%7)); return Array.from({length:7}, (_,i)=>addDays(monday,i)); }
export function fiscalQuarter(iso = today()) {
  const date = new Date(`${iso}T12:00:00`), y = date.getFullYear(), m = date.getMonth();
  const startMonth = m - ((m+7)%3), start = new Date(y,startMonth,1,12), end = new Date(y,startMonth+3,0,12);
  const fy = m >= 5 ? y+1 : y, q = Math.floor(((m+7)%12)/3)+1;
  return {start:dayString(start),end:dayString(end),label:`FY${String(fy).slice(-2)} Q${q}`};
}
export function units(hours) { return Math.round(Number(hours)*100); }
export function formatHours(value) { return (Math.round(value*100)/100).toLocaleString('en-US',{maximumFractionDigits:2}); }
export function parseHours(value) {
  if (String(value).trim()==='') return 0;
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(String(value).trim())) throw new Error('Enter hours with up to two decimal places.');
  const result = Number(value); if (result > 24) throw new Error('Enter between 0 and 24 hours.'); return result;
}
export function historyFor(historical, activityId, date) { return historical.find(h=>h.activityId===activityId && h.start<=date && h.end>=date); }
export function totalsFor(activityId, entries, historical, days, quarter = fiscalQuarter()) {
  let total=0, current=0, week=0;
  for (const e of entries) if (e.activityId===activityId) {
    const n = units(e.hours); total+=n; if(e.date>=quarter.start && e.date<=quarter.end) current+=n; if(days.includes(e.date))week+=n;
  }
  for(const h of historical) if(h.activityId===activityId) { total+=units(h.hours); if(h.start>=quarter.start && h.end<=quarter.end)current+=units(h.hours); }
  return {total:total/100,quarter:current/100,week:week/100};
}
export function rankActivities(activities, entries, historical, account) {
  return activities.filter(a=>!account || a.account===account).map(a=>({...a,hours:totalsFor(a.id,entries,historical,[]).total})).sort((a,b)=>b.hours-a.hours || a.personalName.localeCompare(b.personalName) || a.oppId.localeCompare(b.oppId));
}
export function activityLabel(a) { return [a.oppId || 'No Opp ID',a.personalName,a.stage || 'No stage',a.description.trim().replace(/\s+/g,' ')].join(' | '); }
export function quarterProgress(activities, entries, historical, asOf = today()) {
  const quarter = fiscalQuarter(asOf), weeks = [];
  for(let monday = weekDays(quarter.start)[0]; monday <= asOf; monday = addDays(monday,7)) {
    weeks.push({start:monday,from:monday<quarter.start?quarter.start:monday,to:addDays(monday,6)>asOf?asOf:addDays(monday,6)});
  }
  const weekIndex=new Map(weeks.map((w,i)=>[w.start,i])), byId=new Map(activities.map(a=>[a.id,a])), rows=new Map();
  function row(id) {
    if(!rows.has(id)) rows.set(id,{activity:byId.get(id),weeks:weeks.map(()=>0),historical:0,total:0});
    return rows.get(id);
  }
  for(const e of entries) {
    if(!byId.has(e.activityId)||e.date<quarter.start||e.date>asOf||e.hours<=0)continue;
    const value=units(e.hours),r=row(e.activityId);r.weeks[weekIndex.get(weekDays(e.date)[0])]+=value;r.total+=value;
  }
  // Period-only records stay separate. Their hours are never assigned to invented weeks.
  for(const h of historical) {
    if(!byId.has(h.activityId)||h.start<quarter.start||h.end>asOf||h.hours<=0)continue;
    const value=units(h.hours),r=row(h.activityId);r.historical+=value;r.total+=value;
  }
  const result=[...rows.values()].sort((a,b)=>a.activity.account.localeCompare(b.activity.account)||b.total-a.total||a.activity.personalName.localeCompare(b.activity.personalName));
  const weeklyTotals=weeks.map((_,i)=>result.reduce((sum,r)=>sum+r.weeks[i],0)/100),historicalTotal=result.reduce((sum,r)=>sum+r.historical,0)/100;
  let workdays=0;
  for(let date=quarter.start;date<=asOf;date=addDays(date,1)){const weekday=new Date(`${date}T12:00:00`).getDay();if(weekday!==0&&weekday!==6)workdays++;}
  return {quarter,asOf,weeks,rows:result.map(r=>({...r,weeks:r.weeks.map(n=>n/100),historical:r.historical/100,total:r.total/100})),weeklyTotals,historicalTotal,total:result.reduce((sum,r)=>sum+r.total,0)/100,workdays,target:workdays*8};
}
export function recommendations(field, activities, entries, historical, context={}) {
  const scores = new Map();
  for(const a of activities) {
    if(field!=='account' && context.account && a.account!==context.account)continue;
    if(['stage','activityName'].includes(field) && context.oppId && a.oppId!==context.oppId)continue;
    const value = a[field]; if(!value)continue; scores.set(value,(scores.get(value)||0)+units(totalsFor(a.id,entries,historical,[]).total));
  }
  if(field==='account')for(const value of WORK_ACCOUNTS)if(!scores.has(value))scores.set(value,0);
  return [...scores].map(([value,hours])=>({id:value,label:value,hours:hours/100})).sort((a,b)=>b.hours-a.hours || a.label.localeCompare(b.label));
}
function cleanText(value, max=10000) { if(typeof value!=='string' || value.length>max) throw new Error('Invalid text field in backup.'); return value.trim(); }
export function validateActivity(raw) {
  const a = {id:cleanText(raw.id,200)}; if(!a.id)throw new Error('Activity ID is missing.');
  for(const key of ['account','oppId','stage','activityName','personalName','description']) a[key]=cleanText(raw[key] ?? '',key==='description'?20000:500);
  if(!a.account || !a.personalName || !a.activityName)throw new Error('Account, Activity Name, and Personal Name are required.');
  if(a.account.toLowerCase()==='claritev')throw new Error('Claritev is excluded from Activities and Hours for now.');
  a.artifactAdded=raw.artifactAdded===true;
  if(raw.source && typeof raw.source==='object')a.source=raw.source;
  if(raw.updatedAt)a.updatedAt=cleanText(raw.updatedAt,50);
  return a;
}
export function validateImport(raw, existing={activities:[],entries:[],historical:[]}, overwrite=false) {
  if(raw?.format!=='work-log' || raw.version!==1 || !['activities','entries','historical'].every(k=>Array.isArray(raw[k])))throw new Error('Choose an Activities and Hours JSON backup.');
  const activities=raw.activities.map(validateActivity), ids=new Set([...existing.activities,...activities].map(a=>a.id));
  const seen=new Set(); for(const a of activities) {if(seen.has(a.id))throw new Error('Duplicate activity ID.');seen.add(a.id);}
  const entries=raw.entries.map(e=>{
    if(!ids.has(e.activityId) || !validDate(e.date) || e.id!==`${e.activityId}:${e.date}` || typeof e.hours!=='number')throw new Error('Invalid daily hours record.');
    parseHours(String(e.hours)); return {id:e.id,activityId:e.activityId,date:e.date,hours:e.hours,...(e.source?{source:e.source}:{})};
  });
  const historical=raw.historical.map(h=>{
    if(!ids.has(h.activityId) || !validDate(h.start)||!validDate(h.end)||h.start>h.end || typeof h.hours!=='number' || !Number.isFinite(h.hours) || h.hours<0 || Math.abs(units(h.hours)-h.hours*100)>0.000001)throw new Error('Invalid historical balance.');
    const period=cleanText(h.period,100); if(h.id!==`${h.activityId}:${period}`)throw new Error('Invalid historical ID.');
    return {id:h.id,activityId:h.activityId,period,start:h.start,end:h.end,hours:h.hours,...(h.source?{source:h.source}:{})};
  });
  for(const list of [entries,historical])if(new Set(list.map(e=>e.id)).size!==list.length)throw new Error('Duplicate hours record.');
  const merged={};
  for(const key of ['activities','entries','historical']) {
    const map=new Map(existing[key].map(e=>[e.id,e])); for(const row of ({activities,entries,historical})[key])if(overwrite||!map.has(row.id))map.set(row.id,row); merged[key]=[...map.values()];
  }
  for(const e of merged.entries)if(e.hours && historyFor(merged.historical,e.activityId,e.date))throw new Error('Daily hours overlap a historical balance. Import stopped to prevent double counting.');
  for(let i=0;i<merged.historical.length;i++)for(let j=i+1;j<merged.historical.length;j++) { const a=merged.historical[i],b=merged.historical[j]; if(a.activityId===b.activityId && a.start<=b.end && b.start<=a.end)throw new Error('Historical balances overlap.'); }
  return {activities,entries,historical};
}
