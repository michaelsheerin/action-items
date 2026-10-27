import {quarterProgress,fiscalQuarter,activityLabel,formatHours,WORK_ACCOUNTS} from './work-core.js?v=15';
import {installColumnSizing} from './columns.js?v=15';

const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const shortDate=iso=>new Date(`${iso}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'});

export function createQuarterView(section,{records,store,onError}) {
  const content=section.querySelector('.quarter-content'),period=section.querySelector('.quarter-period');
  let scheduled=false,sizing=null,widths=null,changed=false,fields=[];
  function restoreWidths(){
    if(!widths||!sizing)return;
    const headers=[...content.querySelectorAll('thead th')];
    sizing.restore(Object.fromEntries(fields.map((field,i)=>[field,Number.isFinite(widths[field])?widths[field]:headers[i].getBoundingClientRect().width])));
  }
  store.setting('columns:quarter').then(saved=>{if(!changed){widths=saved;restoreWidths();}}).catch(onError);
  function render(){
    const data=records(),report=quarterProgress(data.activities,data.entries,data.historical),hasHistory=report.historicalTotal>0;
    sizing?.destroy();content.replaceChildren();
    const caption=node('p',`${report.quarter.label} · ${shortDate(report.quarter.start)}–${shortDate(report.asOf)} · Monday–Sunday weeks`,'quarter-caption');
    const wrap=node('div',undefined,'quarter-grid-wrap');wrap.tabIndex=0;wrap.setAttribute('aria-label','Quarter hours by activity and week');
    const table=node('table',undefined,'quarter-grid');table.id='quarter-table';
    table.style.minWidth=`${Math.max(850,360+report.weeks.length*64+85+(hasHistory?75:0))}px`;
    const accessibleCaption=node('caption',`Hours recorded through ${shortDate(report.asOf)}, grouped by account. Partial weeks include only dates within this quarter through today.`,'sr-only');table.append(accessibleCaption);
    fields=['activity',...report.weeks.map((_,i)=>`week${i}`),...(hasHistory?['historical']:[]),'quarterTotal'];
    const cols=node('colgroup');fields.forEach((field,i)=>{const col=node('col');if(i)col.style.width=field==='quarterTotal'?'85px':'64px';cols.append(col);});table.append(cols);
    const head=node('thead'),header=node('tr'),activityHead=node('th','Activity');activityHead.scope='col';header.append(activityHead);
    for(const week of report.weeks){const th=node('th',undefined,'numeric');th.scope='col';th.dataset.weekStart=week.start;th.title=`Week of ${shortDate(week.start)}. Includes ${shortDate(week.from)} to ${shortDate(week.to)}.`;th.append(node('span',shortDate(week.from),'day-name'));if(week.to!==week.from)th.append(node('span',`–${shortDate(week.to)}`,'day-date'));header.append(th);}
    if(hasHistory){const th=node('th','Historical','numeric');th.scope='col';th.title='Period totals without daily dates. These hours are not assigned to individual weeks.';header.append(th);}
    const totalHead=node('th','Quarter total','numeric');totalHead.scope='col';header.append(totalHead);head.append(header);table.append(head);
    const accountNames=[...new Set([...WORK_ACCOUNTS,...report.rows.map(r=>r.activity.account)])];
    for(const account of accountNames){
      const rows=report.rows.filter(r=>r.activity.account===account);if(!rows.length)continue;
      const body=node('tbody'),band=node('tr',undefined,'work-account'),th=node('th',account);th.colSpan=fields.length;th.scope='rowgroup';band.append(th);body.append(band);
      for(const row of rows){
        const tr=node('tr',undefined,'quarter-record');tr.dataset.activity=row.activity.id;
        const td=node('td');td.dataset.field='activity';const label=node('span',activityLabel(row.activity),'quarter-activity');label.title=activityLabel(row.activity);td.append(label);tr.append(td);
        row.weeks.forEach((hours,i)=>{const cell=node('td',hours?formatHours(hours):'','numeric');cell.dataset.field=`week${i}`;cell.dataset.weekStart=report.weeks[i].start;tr.append(cell);});
        if(hasHistory){const cell=node('td',row.historical?formatHours(row.historical):'','numeric');cell.dataset.field='historical';tr.append(cell);}
        const total=node('td',formatHours(row.total),'numeric quarter-row-total');total.dataset.field='quarterTotal';tr.append(total);body.append(tr);
      }
      table.append(body);
    }
    if(!report.rows.length){const body=node('tbody'),tr=node('tr'),td=node('td','No hours recorded this quarter.','work-empty');td.colSpan=fields.length;tr.append(td);body.append(tr);table.append(body);}
    const foot=node('tfoot'),totals=node('tr',undefined,'quarter-total'),totalLabel=node('th','Total');totalLabel.scope='row';totals.append(totalLabel);
    report.weeklyTotals.forEach((hours,i)=>{const td=node('td',formatHours(hours),'numeric');td.dataset.weekStart=report.weeks[i].start;totals.append(td);});
    if(hasHistory)totals.append(node('td',formatHours(report.historicalTotal),'numeric'));
    const quarterSum=node('td',formatHours(report.total),'numeric');quarterSum.id='quarter-grid-total';totals.append(quarterSum);foot.append(totals);table.append(foot);wrap.append(table);
    const metrics=node('div',undefined,'quarter-metrics');
    for(const [label,value,id] of [['Quarter hours so far',report.total,'quarter-actual'],['Target so far',report.target,'quarter-target']]){const item=node('div',undefined,'quarter-metric');item.append(node('span',label));const number=node('span',`${formatHours(value)} h`,'quarter-metric-value');number.id=id;item.append(number);metrics.append(item);}
    const formula=node('span',`${report.workdays} workdays × 8 h · through ${shortDate(report.asOf)}`,'quarter-target-formula');formula.id='quarter-workdays';formula.title='Monday through Friday, including today when today is a weekday.';metrics.append(formula);
    content.append(caption,wrap,metrics);
    sizing=installColumnSizing(table,fields,{minimums:{activity:220,quarterTotal:80,historical:65,...Object.fromEntries(report.weeks.map((_,i)=>[`week${i}`,55]))},onChange:saved=>{changed=true;widths=saved;return store.setting('columns:quarter',saved);},onError});
    restoreWidths();
  }
  function refresh(){
    const quarter=fiscalQuarter();period.textContent=`${quarter.label} · ${shortDate(quarter.start)}–${shortDate(quarter.end)}`;
    if(!section.open||scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;if(section.open)render();});
  }
  section.addEventListener('toggle',()=>{if(section.open){refresh();requestAnimationFrame(()=>section.scrollIntoView({block:'start',behavior:'auto'}));}});
  refresh();
  return {refresh,resetWidths(){changed=true;widths=null;if(sizing)sizing.reset();else store.setting('columns:quarter',null).catch(onError);}};
}
