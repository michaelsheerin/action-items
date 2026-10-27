import test from 'node:test';
import assert from 'node:assert/strict';
import {weekDays,fiscalQuarter,parseHours,totalsFor,rankActivities,recommendations,activityLabel,validateImport,validateActivity,quarterProgress} from './work-core.js';
const a={id:'a',account:'Goldman',oppId:'OPP-A',stage:'Deploy',activityName:'Launch',personalName:'Alpha',description:'One two three four five six seven',artifactAdded:true};
const b={...a,id:'b',account:'Uber',personalName:'Beta'};
const entry=(id,date,hours)=>({id:`${id}:${date}`,activityId:id,date,hours});
const history={id:'a:FY27Q1',activityId:'a',period:'FY27Q1',start:'2026-06-01',end:'2026-08-31',hours:40};
const backup=(activities=[a,b],entries=[],historical=[])=>({format:'work-log',version:1,activities,entries,historical});
test('Monday weeks span month and year boundaries',()=>{assert.deepEqual(weekDays('2027-01-03'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);});
test('Oracle fiscal quarters cover June year start and leap day',()=>{assert.deepEqual(fiscalQuarter('2026-10-26'),{start:'2026-09-01',end:'2026-11-30',label:'FY27 Q2'});assert.deepEqual(fiscalQuarter('2026-06-01'),{start:'2026-06-01',end:'2026-08-31',label:'FY27 Q1'});assert.deepEqual(fiscalQuarter('2028-02-29'),{start:'2027-12-01',end:'2028-02-29',label:'FY28 Q3'});assert.equal(fiscalQuarter('2026-05-31').label,'FY26 Q4');});
test('hours allow corrections and hundredths, reject invalid values',()=>{for(const [input,value] of [['',0],['.25',.25],['2.',2],['24',24]])assert.equal(parseHours(input),value);for(const input of ['-1','1e2','24.01','NaN','1.123'])assert.throws(()=>parseHours(input));});
test('lifetime includes history while quarter and week use the proper dates',()=>{const es=[entry('a','2026-10-26',.1),entry('a','2026-10-27',.2),entry('a','2026-09-01',4),entry('b','2026-10-26',20)];assert.deepEqual(totalsFor('a',es,[history],weekDays('2026-10-26'),fiscalQuarter('2026-10-26')),{total:44.3,quarter:4.3,week:.3});});
test('rank suggestions by hours, isolate accounts, aggregate recommendation scores',()=>{const es=[entry('b','2026-10-01',5)];assert.equal(rankActivities([a,b],es,[history])[0].id,'a');assert.equal(rankActivities([a,b],es,[history],'Uber').length,1);assert.equal(recommendations('account',[a,b],es,[history])[0].id,'Goldman');assert.deepEqual(recommendations('oppId',[a,b],es,[history],{account:'Uber'}),[{id:'OPP-A',label:'OPP-A',hours:5}]);});
test('activity display retains the full description for width-based clipping',()=>{assert.equal(activityLabel(a),'OPP-A | Alpha | Deploy -- One two three four five six seven');assert.equal(activityLabel({...a,description:'Line one\n  Line two'}),'OPP-A | Alpha | Deploy -- Line one Line two');});
test('import validates references, duplicates, dates and accepts Claritev',()=>{assert.throws(()=>validateImport(backup([a],[entry('missing','2026-10-26',2)])));assert.throws(()=>validateImport(backup([a],[entry('a','2026-02-30',2)])));assert.throws(()=>validateImport(backup([a,a])));assert.equal(validateActivity({...a,account:'Claritev',oppId:'XXXXX'}).oppId,'XXXXX');assert.throws(()=>validateImport(backup([a],[entry('a','2026-10-26',25)])));});
test('history overlap rejects double counted daily records and annual totals',()=>{assert.throws(()=>validateImport(backup([a],[entry('a','2026-07-01',2)],[history])));assert.throws(()=>validateImport(backup([a],[],[history,{...history,id:'a:FY27',period:'FY27',end:'2027-05-31'}])));assert.doesNotThrow(()=>validateImport(backup([a],[entry('a','2026-07-01',0)],[history])));});
test('repeat import preserves existing corrections unless overwrite is requested',()=>{const raw=backup([a],[entry('a','2026-10-26',2)]),existing={activities:[a],entries:[entry('a','2026-10-26',3)],historical:[]};assert.equal(validateImport(raw,existing).entries.length,1);assert.equal(existing.entries[0].hours,3);assert.doesNotThrow(()=>validateImport(raw,existing,true));const parsed=validateImport(JSON.parse(JSON.stringify(backup([a],[entry('a','2026-10-26',.25)],[history]))));assert.equal(parsed.entries[0].hours,.25);assert.equal(parsed.activities[0].artifactAdded,true);});
test('quarter progress clips partial weeks and future dates, excludes empty activities',()=>{
  const es=[entry('a','2026-08-31',9),entry('a','2026-09-01',.1),entry('a','2026-09-06',.2),entry('a','2026-09-07',2),entry('a','2026-10-26',3),entry('b','2026-10-27',5),entry('b','2026-10-26',0)];
  const report=quarterProgress([a,b],es,[history],'2026-10-26');
  assert.equal(report.rows.length,1);assert.equal(report.total,5.3);assert.equal(report.rows[0].weeks[0],.3);assert.equal(report.weeklyTotals[1],2);assert.equal(report.weeklyTotals[8],3);assert.equal(report.historicalTotal,0);
  assert.deepEqual(report.weeks[0],{start:'2026-08-31',from:'2026-09-01',to:'2026-09-06'});assert.deepEqual(report.weeks.at(-1),{start:'2026-10-26',from:'2026-10-26',to:'2026-10-26'});
  assert.equal(report.workdays,40);assert.equal(report.target,320);
});
test('quarter target counts weekdays inclusively, with no hours for weekends',()=>{
  assert.equal(quarterProgress([],[],[],'2026-09-01').target,8);
  const friday=quarterProgress([],[],[],'2026-09-04'),sunday=quarterProgress([],[],[],'2026-09-06');
  assert.equal(friday.target,32);assert.equal(sunday.target,32);assert.equal(sunday.rows.length,0);assert.equal(sunday.total,0);
  const end=quarterProgress([a],[entry('a','2026-11-30',2)],[],'2026-11-30');assert.equal(end.weeks.length,14);assert.equal(end.weeks.at(-1).from,'2026-11-30');assert.equal(end.weeks.at(-1).to,'2026-11-30');assert.equal(end.total,2);
});
test('period-only quarter history stays unallocated and is counted once',()=>{
  const report=quarterProgress([a],[],[history],'2026-08-31');assert.equal(report.total,40);assert.equal(report.historicalTotal,40);assert.ok(report.weeklyTotals.every(n=>n===0));assert.equal(report.rows[0].historical,40);
  assert.equal(quarterProgress([a],[],[history],'2026-08-30').total,0);
});
