import {localDay,weekBounds} from './core.js?v=15';
let openPanel=null;
const shift=(iso,count)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+count);return localDay(d);};
const label=iso=>new Date(`${iso}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
export const quickDatesOpen=()=>Boolean(openPanel);
export function openQuickDates(input,onClose=()=>{}) {
  openPanel?.close();
  const panel=document.createElement('div');panel.className='quick-dates';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Choose due date');
  let start=weekBounds().start;
  function close(){if(openPanel?.panel!==panel)return;panel.remove();openPanel=null;document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);onClose();}
  function outside(event){if(!panel.contains(event.target)&&event.target!==input&&!event.target.closest('.calendar-button'))close();}
  function escape(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();input.focus({preventScroll:true});}}
  function position(){const r=input.getBoundingClientRect();panel.style.left=`${Math.max(8,Math.min(r.left,innerWidth-290))}px`;panel.style.top=`${Math.max(8,Math.min(r.bottom+4,innerHeight-panel.offsetHeight-8))}px`;}
  function choose(date){input.value=date;input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus({preventScroll:true});}
  function button(text,action,aria){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;if(aria)b.setAttribute('aria-label',aria);return b;}
  function render(){
    panel.replaceChildren();const shortcuts=document.createElement('div');shortcuts.className='date-shortcuts';const today=localDay();shortcuts.append(button('Today',()=>choose(today)),button('Tomorrow',()=>choose(shift(today,1))),button('Next week',()=>choose(shift(weekBounds().start,7))));panel.append(shortcuts);
    const heading=document.createElement('div');heading.className='date-period';const title=document.createElement('span');title.textContent=`${label(start)} – ${label(shift(start,20))}`;heading.append(button('‹',()=>{start=shift(start,-7);render();},'Previous dates'),title,button('›',()=>{start=shift(start,7);render();},'Next dates'));panel.append(heading);
    const grid=document.createElement('div');grid.className='date-choices';for(const day of ['M','T','W','T','F','S','S']){const span=document.createElement('span');span.textContent=day;grid.append(span);}
    for(let i=0;i<21;i++){const date=shift(start,i),b=button(String(new Date(`${date}T12:00:00`).getDate()),()=>choose(date),`Choose ${label(date)}`);b.title=label(date);if(date===today)b.classList.add('date-today');if(date===input.value)b.setAttribute('aria-pressed','true');grid.append(b);}panel.append(grid);
    const footer=document.createElement('div');footer.className='date-shortcuts';footer.append(button('No date',()=>choose('')),button('More dates…',()=>{close();input.focus();try{input.showPicker();}catch{}}));panel.append(footer);position();
  }
  openPanel={panel,close};document.body.append(panel);render();document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
}
