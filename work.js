import {WORK_ACCOUNTS,today,addDays,weekDays,fiscalQuarter,formatHours,parseHours,units,historyFor,totalsFor,rankActivities,activityLabel,recommendations,validateActivity,validateImport} from './work-core.js?v=10';
import {openWorkStore} from './work-store.js?v=10';
import {attachPicker} from './work-picker.js?v=10';

const isHours=document.body.dataset.view==='hours', $=id=>document.getElementById(id);
let store, data={activities:[],entries:[],historical:[]}, days=weekDays(), rowSlots={}, views=[], pickers=[], pending=0, editId=null, generation=0, syncNeeded=false;
const failed=new Map(), channel='BroadcastChannel' in window?new BroadcastChannel('sheerin-work-log-updates'):null;
const quarter=fiscalQuarter();
const app=$('app');
app.innerHTML=`
<header class="topbar"><a class="brand" href="./" aria-label="Action Items home"><span class="brand-mark" aria-hidden="true">✓</span><span>Action Items<small>Michael Sheerin’s workspace</small></span></a><nav aria-label="Pages"><a href="./">Action items</a><a href="./hours.html" ${isHours?'aria-current="page"':''}>Hours</a><a href="./activities.html" ${!isHours?'aria-current="page"':''}>Activities</a><a href="./archive.html">Archive</a></nav><div class="topbar-right"><span id="work-save" class="save-state" role="status">Loading…</span><button id="work-data" class="button">Data & backup</button><span class="avatar">MS</span></div></header>
<main class="work-main"><div class="page-heading"><div><div class="eyebrow">YOUR WORKSPACE</div><h1>${isHours?'Weekly hours':'Activities'}</h1><p>${isHours?'Choose an activity. Enter hours by day. Every entry saves as you type.':'Activities by account, with opportunity, stage, and artifact tracking.'}</p></div><div class="heading-right"><div id="work-summary" class="summary"></div><button id="new-activity" class="button primary">+ New activity <kbd>Alt N</kbd></button></div></div>
<div id="work-error" class="error-banner" role="alert" hidden><span id="work-error-text"></span><button id="work-retry" class="button">Retry save</button><button id="error-backup" class="button">Download backup</button></div>
<section class="work-surface" aria-label="${isHours?'Hours entry':'Activity directory'}">
${isHours?`<div class="toolbar week-toolbar"><div class="week-controls"><button id="previous-week" class="button" aria-label="Previous week">‹</button><label class="week-input-label">Week of <input id="week-date" type="date" aria-label="Week containing date"></label><button id="next-week" class="button" aria-label="Next week">›</button><button id="current-week" class="text-button">This week</button></div><div id="week-heading" class="week-heading"></div><span id="quarter-label" class="visible-count"></span></div>`:`<div class="toolbar"><div class="search-box"><input id="activity-search" type="search" placeholder="Search activities, opportunities, descriptions…" aria-label="Search activities"><kbd>/</kbd></div><span id="activity-count" class="visible-count"></span></div>`}
<div class="table-wrap work-grid-wrap" tabindex="0" aria-label="${isHours?'Weekly hours grid':'Activities table'}"><table id="work-table" class="${isHours?'hours-grid':'activities-grid'}"><caption class="sr-only">${isHours?'Monday through Sunday hours, grouped by account':'Activities grouped by account'}</caption></table></div>
<div class="table-footer"><span>${isHours?'<kbd>Tab</kbd> Next day · <kbd>Ctrl Alt ↑ / ↓</kbd> Same day · <kbd>Alt ← / →</kbd> Change week':'Click Edit to update an activity. Artifact checkboxes save immediately.'}</span><span class="local-label"><span class="local-dot"></span>Saved in this browser</span></div></section><div class="workspace-footer"><span id="history-summary"></span><span>${isHours?'Monday–Sunday · Oracle fiscal quarters':'Artifact presence only · No artifact links stored'}</span></div></main>
<dialog id="activity-dialog"><form id="activity-form"><div class="dialog-heading"><h2 id="activity-dialog-title">New activity</h2><button type="button" id="close-activity" class="icon-button" aria-label="Close activity form">×</button></div><div class="activity-form-grid">
<label class="dialog-field" for="activity-account">Account<input id="activity-account" name="account" required maxlength="500" type="text"></label>
<label class="dialog-field" for="activity-oppId">Opp ID<input id="activity-oppId" name="oppId" maxlength="500" type="text"></label>
<label class="dialog-field" for="activity-stage">Stage<input id="activity-stage" name="stage" maxlength="500" type="text"></label>
<label class="dialog-field" for="activity-activityName">Activity Name<input id="activity-activityName" name="activityName" required maxlength="500" type="text"></label>
<label class="dialog-field wide" for="activity-personalName">Personal Name<input id="activity-personalName" name="personalName" required maxlength="500" type="text"></label>
<label class="dialog-field wide" for="activity-description">Description<textarea id="activity-description" name="description" rows="4" maxlength="20000"></textarea></label></div>
<label class="artifact-option"><input type="checkbox" id="activity-artifactAdded"> Artifact(s) added</label><p id="activity-form-error" class="link-error" role="alert" hidden></p><div class="dialog-actions"><button id="cancel-activity" type="button" class="button">Cancel</button><button id="save-activity" type="submit" class="button primary">Save activity</button></div></form></dialog>
<dialog id="work-data-dialog"><div class="dialog-heading"><h2>Activities and hours</h2><button id="close-work-data" class="icon-button" aria-label="Close data settings">×</button></div><p class="dialog-intro">Records save on this device. JSON backups include all activities, daily entries, and historical balances. Action Items has its own backup.</p><div id="data-overview" class="data-overview"></div><div class="data-action"><div><strong>Back up activities and hours</strong><p>Download your full ledger, including historical totals.</p></div><button id="export-work" class="button primary">Download JSON</button></div><div class="data-action"><div><strong>Import activities and hours</strong><p>Import a migration file or an Activities and Hours backup.</p></div><button id="choose-work-import" class="button">Choose file</button></div><label class="overwrite-option"><input id="overwrite-work" type="checkbox"> Update matching records from the file</label><p class="small-print">Records merge by ID. Reimporting the same file does not add duplicate hours.</p><input id="work-import-file" type="file" accept=".json,application/json" hidden><div id="work-import-result" class="import-result" role="status"></div><details class="history-details"><summary>Historical balances</summary><p class="small-print">These periods contain totals only. Daily entry is locked within these periods to prevent double counting.</p><div id="history-list"></div></details></dialog>
<div id="work-toast" class="toast" role="status" hidden></div>`;

function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function shortDate(iso,year=false){return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',...(year?{year:'numeric'}:{})});}
function accounts(){return [...new Set([...WORK_ACCOUNTS,...data.activities.map(a=>a.account)])].filter(a=>a.toLowerCase()!=='claritev');}
function activity(id){return data.activities.find(a=>a.id===id);}
function replaceRecord(key,value){const i=data[key].findIndex(e=>e.id===value.id);if(i<0)data[key].push(value);else data[key][i]=value;}
function status(){const e=$('work-save'),invalid=$('work-table').querySelector('[aria-invalid="true"]');e.textContent=invalid?'Correct invalid hours':pending?'Saving…':failed.size?'Changes need saving':'Saved on this device';e.className=`save-state ${invalid?'failed':pending?'saving':failed.size?'failed':'saved'}`;}
function error(message){$('work-error-text').textContent=message;$('work-error').hidden=false;}
function toast(message){$('work-toast').textContent=message;$('work-toast').hidden=false;setTimeout(()=>{$('work-toast').hidden=true;},6000);}
async function persist(key,value){
  const token=`${key}:${value.id}`;failed.set(token,{key,value});pending++;status();
  try{await store.put(key,value);if(failed.get(token)?.value===value)failed.delete(token);if(!failed.size)$('work-error').hidden=true;channel?.postMessage({key,id:value.id});return true;}
  catch(e){error(`The edit is still on screen but has not saved. ${e.message} Retry save or download a backup.`);return false;}
  finally{pending--;status();}
}
async function saveSlots(){const id=`rows:${days[0]}`, value=Object.fromEntries(Object.entries(rowSlots).map(([a,s])=>[a,[...s]]));try{await store.setting(id,value);}catch(e){error(`Hours are saved separately. Row preferences did not save. ${e.message}`);}}
function summary(){
  const total=(data.entries.reduce((s,e)=>s+units(e.hours),0)+data.historical.reduce((s,h)=>s+units(h.hours),0))/100;
  $('work-summary').replaceChildren(node('span',`${data.activities.length} activities`),node('span',`${formatHours(total)} total hours`));
  const historical=data.historical.reduce((s,h)=>s+units(h.hours),0)/100;
  $('history-summary').textContent=`${formatHours(historical)} historical hours included in lifetime totals`;
  $('data-overview').textContent=`${data.activities.length} activities · ${data.entries.filter(e=>e.hours>0).length} daily entries · ${data.historical.length} historical balances · ${formatHours(total)} total hours`;
}
function header(labels){const head=node('thead'),tr=node('tr');for(const label of labels) {const th=node('th',label);th.scope='col';tr.append(th);}head.append(tr);return head;}
function band(account,columns){const tr=node('tr',undefined,'work-account'),th=node('th',account);th.colSpan=columns;th.scope='rowgroup';tr.append(th);return tr;}

function renderActivities(){
  const query=$('activity-search').value.toLowerCase().trim(),table=$('work-table');table.replaceChildren();
  const cols=node('colgroup');for(const c of ['opp','stage','kind','name','description','artifact','total','edit'])cols.append(node('col',undefined,`activity-col-${c}`));table.append(cols,header(['Opp ID','Stage','Activity Name','Personal Name','Description','Artifact(s)','Total hours','']));
  let count=0;
  for(const account of accounts()){
    const list=rankActivities(data.activities,data.entries,data.historical,account).filter(a=>!query||[a.account,a.oppId,a.stage,a.activityName,a.personalName,a.description].join(' ').toLowerCase().includes(query));
    if(query&&!list.length)continue;
    const body=node('tbody');body.append(band(account,8));
    for(const a of list){count++;const tr=node('tr',undefined,'activity-record');tr.dataset.activity=a.id;
      for(const key of ['oppId','stage','activityName','personalName','description'])tr.append(node('td',a[key],key==='description'?'activity-description':''));
      const artifactCell=node('td',undefined,'artifact-cell'),check=node('input');check.type='checkbox';check.checked=a.artifactAdded;check.setAttribute('aria-label',`Artifacts added, ${a.personalName}, ${account}`);check.addEventListener('change',()=>{const updated={...activity(a.id),artifactAdded:check.checked,updatedAt:new Date().toISOString()};replaceRecord('activities',updated);void persist('activities',updated);});artifactCell.append(check);tr.append(artifactCell,node('td',formatHours(a.hours),'numeric'));
      const editCell=node('td'),edit=node('button','Edit','text-button');edit.setAttribute('aria-label',`Edit ${a.personalName}, ${account}`);edit.onclick=()=>openActivity(a.id);editCell.append(edit);tr.append(editCell);body.append(tr);
    }
    if(!list.length){const tr=node('tr'),td=node('td','No activities yet. Add an activity to start tracking hours.','work-empty');td.colSpan=8;tr.append(td);body.append(tr);}
    table.append(body);
  }
  if(query&&!count){const body=node('tbody'),tr=node('tr'),td=node('td','No matching activities.','work-empty');td.colSpan=8;tr.append(td);body.append(tr);table.append(body);}
  $('activity-count').textContent=`${count} ${count===1?'activity':'activities'}`;summary();
}
function dayTotals(account){const ids=new Set(data.activities.filter(a=>!account||a.account===account).map(a=>a.id));return days.map(d=>data.entries.filter(e=>ids.has(e.activityId)&&e.date===d).reduce((sum,e)=>sum+units(e.hours),0)/100);}
function totalsRow(label,account,grand=false){const tr=node('tr',undefined,grand?'hours-grand-total':'hours-account-total');tr.dataset.totalAccount=account||'';const th=node('th',label);th.scope='row';th.colSpan=3;tr.append(th,node('td','','numeric week-sum'));for(let i=0;i<7;i++)tr.append(node('td','','numeric day-sum'));return tr;}
function updateTotals(){
  for(const v of views){const totals=v.id?totalsFor(v.id,data.entries,data.historical,days,quarter):null;['total','quarter','week'].forEach((key,i)=>{v.stats[i].textContent=totals?formatHours(totals[key]):'—';});}
  for(const row of $('work-table').querySelectorAll('[data-total-account]')){const sums=dayTotals(row.dataset.totalAccount);row.querySelector('.week-sum').textContent=formatHours(sums.reduce((s,n)=>s+units(n),0)/100);row.querySelectorAll('.day-sum').forEach((td,i)=>{td.textContent=formatHours(sums[i]);td.classList.toggle('over-day',sums[i]>24);});}
  summary();
}
function populateHours(v){
  const a=activity(v.id);v.selector.value=a?activityLabel(a):'';v.selector.title=a?`${a.activityName}\n${a.description}`:'';v.tr.classList.toggle('blank-activity-row',!a);
  v.inputs.forEach((input,i)=>{const h=a?historyFor(data.historical,a.id,days[i]):null,entry=a?data.entries.find(e=>e.activityId===a.id&&e.date===days[i]):null;
    input.value=entry?.hours?String(entry.hours):'';input.disabled=!a||Boolean(h);input.placeholder='';input.title=h?`${h.period}: ${formatHours(h.hours)} historical hours. Daily details unavailable.`:'';
    input.setAttribute('aria-label',`${a?a.personalName:'Choose activity first'}, ${v.account}, ${days[i]}`);input.setCustomValidity('');input.removeAttribute('aria-invalid');input.closest('td').classList.toggle('historical-cell',Boolean(h));
  });
  updateTotals();
}
function makeHoursRow(account,index,body){
  const tr=node('tr',undefined,'hours-record'),selectorCell=node('td',undefined,'activity-picker-cell'),selector=node('input');selector.type='text';selector.placeholder='Choose activity…';selector.className='activity-selector';selector.setAttribute('aria-label',`Activity, ${account}, row ${index+1}`);selectorCell.append(selector);tr.append(selectorCell);
  const stats=Array.from({length:3},()=>node('td','—','numeric activity-stat'));tr.append(...stats);
  const v={tr,selector,stats,inputs:[],account,index,id:rowSlots[account][index]||''};views.push(v);
  for(let i=0;i<7;i++){
    const td=node('td',undefined,'hours-entry-cell'),input=node('input');input.type='text';input.inputMode='decimal';input.autocomplete='off';input.className='hour-input';input.dataset.day=i;
    input.addEventListener('input',()=>{
      if(!v.id)return;let hours;try{hours=parseHours(input.value);input.setCustomValidity('');input.removeAttribute('aria-invalid');}catch(e){input.setCustomValidity(e.message);input.setAttribute('aria-invalid','true');$('work-save').textContent=e.message;return;}
      const entry={id:`${v.id}:${days[i]}`,activityId:v.id,date:days[i],hours,updatedAt:new Date().toISOString()};replaceRecord('entries',entry);updateTotals();void persist('entries',entry);
    });
    input.addEventListener('blur',()=>{if(!input.checkValidity()){input.reportValidity();}else status();});td.append(input);tr.append(td);v.inputs.push(input);
  }
  pickers.push(attachPicker(selector,{options:()=>rankActivities(data.activities,data.entries,data.historical,account).filter(a=>a.id===v.id||!rowSlots[account].includes(a.id)).map(a=>({id:a.id,label:activityLabel(a),search:[activityLabel(a),a.activityName,a.description].join(' '),hours:a.hours})),onSelect:item=>{
    if(!item){selector.value=v.id?activityLabel(activity(v.id)):'';return;}
    if(item.id===v.id)return;
    const old=v.id;v.id=item.id;rowSlots[account][index]=item.id;populateHours(v);
    // Switching the chooser never discards hours already entered for another activity.
    if(old&&data.entries.some(e=>e.activityId===old&&days.includes(e.date)&&e.hours>0)&&!rowSlots[account].includes(old)){const pos=rowSlots[account].length;rowSlots[account].push(old);body.insertBefore(makeHoursRow(account,pos,body),body.querySelector('.hours-add-row'));}
    void saveSlots();v.inputs.find(e=>!e.disabled)?.focus();
  }}));
  populateHours(v);return tr;
}
async function renderWeek(){
  const pass=++generation,week=[...days],saved=await store.setting(`rows:${week[0]}`);if(pass!==generation)return;
  for(const p of pickers)p.destroy();pickers=[];views=[];rowSlots={};
  $('week-date').value=days[0];$('week-heading').textContent=`${shortDate(days[0])} – ${shortDate(days[6],true)}`;$('quarter-label').textContent=`This quarter: ${quarter.label} · ${shortDate(quarter.start)} – ${shortDate(quarter.end)}`;
  const table=$('work-table');table.replaceChildren();const cols=node('colgroup');for(const c of ['chooser','stat','stat','stat',...days.map(()=> 'day')])cols.append(node('col',undefined,`hours-col-${c}`));table.append(cols);
  const head=header(['Activity','Total hours','This quarter','This week',...days.map(d=>`${new Date(`${d}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'})} ${shortDate(d)}`)]);head.querySelectorAll('th')[2].title=`${quarter.label}, ${shortDate(quarter.start,true)} to ${shortDate(quarter.end,true)}`;table.append(head);
  for(const account of accounts()){
    const accountIds=new Set(data.activities.filter(a=>a.account===account).map(a=>a.id)),used=new Set();
    rowSlots[account]=(Array.isArray(saved?.[account])?saved[account]:[]).filter(id=>{if(id==='')return true;if(!accountIds.has(id)||used.has(id))return false;used.add(id);return true;});
    const withHours=rankActivities(data.activities,data.entries,data.historical,account).filter(a=>data.entries.some(e=>e.activityId===a.id&&week.includes(e.date)&&e.hours>0));
    for(const a of withHours)if(!used.has(a.id)){rowSlots[account].unshift(a.id);used.add(a.id);}
    while(rowSlots[account].filter(id=>!id).length<3)rowSlots[account].push('');
    const body=node('tbody');body.dataset.account=account;body.append(band(account,11));table.append(body);
    rowSlots[account].forEach((_,i)=>body.append(makeHoursRow(account,i,body)));
    const addTr=node('tr',undefined,'hours-add-row'),td=node('td'),button=node('button','+ Add another activity','text-button');td.colSpan=11;button.setAttribute('aria-label',`Add another activity, ${account}`);button.onclick=()=>{const index=rowSlots[account].length;rowSlots[account].push('');const row=makeHoursRow(account,index,body);body.insertBefore(row,addTr);void saveSlots();row.querySelector('.activity-selector').focus();};td.append(button);addTr.append(td);body.append(addTr,totalsRow(`${account} total`,account));
  }
  const foot=node('tfoot');foot.append(totalsRow('All accounts','',true));table.append(foot);updateTotals();
}
function openActivity(id=null){
  editId=id;const a=activity(id)||{account:WORK_ACCOUNTS[0],oppId:'',stage:'',activityName:'',personalName:'',description:'',artifactAdded:false};
  for(const key of ['account','oppId','stage','activityName','personalName','description'])$(`activity-${key}`).value=a[key];$('activity-artifactAdded').checked=a.artifactAdded;$('activity-form-error').hidden=true;$('activity-dialog-title').textContent=id?'Edit activity':'New activity';$('activity-dialog').showModal();$('activity-account').focus();
}
function download(){const blob=new Blob([JSON.stringify({format:'work-log',version:1,exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=`activities-hours-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function historyList(){const list=$('history-list');list.replaceChildren();for(const account of accounts()){const ids=new Set(data.activities.filter(a=>a.account===account).map(a=>a.id)),balances=data.historical.filter(h=>ids.has(h.activityId));if(!balances.length)continue;list.append(node('h3',account));for(const h of balances){const row=node('div',undefined,'history-line');row.append(node('span',`${activity(h.activityId)?.personalName} · ${h.period}`),node('span',`${formatHours(h.hours)} h`));list.append(row);}}if(!data.historical.length)list.append(node('p','No historical balances.'));}

$('new-activity').onclick=()=>openActivity();
for(const id of ['close-activity','cancel-activity'])$(id).onclick=()=>$('activity-dialog').close();
$('activity-form').addEventListener('submit',async event=>{
  event.preventDefault();let a;try{const raw={id:editId||crypto.randomUUID()};for(const key of ['account','oppId','stage','activityName','personalName','description'])raw[key]=$(`activity-${key}`).value;raw.artifactAdded=$('activity-artifactAdded').checked;a=validateActivity({...activity(editId),...raw,updatedAt:new Date().toISOString()});}catch(e){$('activity-form-error').textContent=e.message;$('activity-form-error').hidden=false;return;}
  $('save-activity').disabled=true;
  replaceRecord('activities',a);const saved=await persist('activities',a);$('save-activity').disabled=false;
  if(saved){$('activity-dialog').close();if(isHours)await renderWeek();else renderActivities();toast(editId?'Activity updated.':'Activity added.');}else{$('activity-form-error').textContent='Activity has not saved. Retry with Save activity.';$('activity-form-error').hidden=false;}
});
for(const field of ['account','oppId','stage','activityName'])attachPicker($(`activity-${field}`),{freeText:true,options:()=>recommendations(field,data.activities,data.entries,data.historical,{account:$('activity-account').value,oppId:$('activity-oppId').value}),onSelect:item=>{if(item)$(`activity-${field}`).value=item.label;}});
if(isHours){
  $('previous-week').onclick=()=>changeWeek(addDays(days[0],-7));$('next-week').onclick=()=>changeWeek(addDays(days[0],7));$('current-week').onclick=()=>changeWeek(today());
  $('week-date').onchange=()=>{if($('week-date').value)changeWeek($('week-date').value);};
  $('work-table').addEventListener('keydown',event=>{if(!(event.ctrlKey&&event.altKey)||!['ArrowUp','ArrowDown'].includes(event.key))return;const input=event.target;if(!input.classList.contains('hour-input'))return;const current=views.findIndex(v=>v.inputs.includes(input));const step=event.key==='ArrowDown'?1:-1;for(let i=current+step;i>=0&&i<views.length;i+=step){const next=views[i].inputs[Number(input.dataset.day)];if(!next.disabled){event.preventDefault();next.focus();next.select();return;}}});
}else $('activity-search').addEventListener('input',renderActivities);
function changeWeek(date){const invalid=$('work-table').querySelector('[aria-invalid="true"]');if(invalid){invalid.focus();invalid.reportValidity();return;}days=weekDays(date);void renderWeek();}
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.altKey&&event.key.toLowerCase()==='n'){event.preventDefault();openActivity();}
  if(isHours&&event.altKey&&!event.ctrlKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();changeWeek(addDays(days[0],event.key==='ArrowLeft'?-7:7));}
  if(!isHours&&event.key==='/'&&!event.target.matches('input,textarea')){event.preventDefault();$('activity-search').focus();}
});
$('work-data').onclick=()=>{summary();historyList();$('work-data-dialog').showModal();};$('close-work-data').onclick=()=>$('work-data-dialog').close();
for(const id of ['export-work','error-backup'])$(id).onclick=download;
$('choose-work-import').onclick=()=>$('work-import-file').click();
$('work-import-file').onchange=async()=>{
  const file=$('work-import-file').files[0];if(!file)return;const result=$('work-import-result');$('choose-work-import').disabled=true;
  try{if(file.size>20_000_000)throw new Error('File exceeds 20 MB.');const raw=JSON.parse(await file.text()),overwrite=$('overwrite-work').checked;const parsed=validateImport(raw,data,overwrite);const counts=await store.import(parsed,overwrite);data=await store.all();summary();historyList();result.textContent=`Imported ${counts.activities} activities, ${counts.entries} daily entries, ${counts.historical} historical balances. ${counts.activities+counts.entries+counts.historical===0?'No new records.':''}`;if(isHours)await renderWeek();else renderActivities();channel?.postMessage({import:true});}
  catch(e){result.textContent=`Import stopped: ${e.message}`;}finally{$('choose-work-import').disabled=false;$('work-import-file').value='';}
};
$('work-retry').onclick=async()=>{for(const {key,value} of [...failed.values()])await persist(key,value);};
window.addEventListener('beforeunload',event=>{if(pending||failed.size||$('work-table').querySelector('[aria-invalid="true"]')){event.preventDefault();event.returnValue='';}});
async function sync(){if(pending||failed.size||document.activeElement?.matches('.hour-input,.activity-selector')||document.querySelector('dialog[open]')){syncNeeded=true;return;}data=await store.all();syncNeeded=false;if(isHours)await renderWeek();else renderActivities();}
channel?.addEventListener('message',()=>void sync());
document.addEventListener('focusout',()=>{setTimeout(()=>{if(syncNeeded)void sync();},0);});
try{store=await openWorkStore();data=await store.all();if(isHours)await renderWeek();else renderActivities();status();}catch(e){error(`Unable to open saved records. ${e.message}`);$('work-save').textContent='Storage unavailable';}
