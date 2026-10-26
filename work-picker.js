let sequence=0;
export function attachPicker(input,{options,onSelect,freeText=false}) {
  const id=`picker-${++sequence}`, popup=document.createElement('div'); popup.id=id;popup.className='work-options';popup.role='listbox';popup.hidden=true;document.body.append(popup);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',id);input.autocomplete='off';
  let items=[],active=-1,query='';
  function close(){popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function position(){if(popup.hidden)return;const r=input.getBoundingClientRect();const width=Math.min(Math.max(r.width,freeText?240:0),innerWidth-20);popup.style.width=`${width}px`;popup.style.left=`${Math.max(10,Math.min(r.left,innerWidth-width-10))}px`;const height=Math.min(290,popup.scrollHeight);popup.style.top=`${r.bottom+height>innerHeight-10?Math.max(8,r.top-height):r.bottom+3}px`;}
  function highlight(){[...popup.children].forEach((e,i)=>{e.setAttribute('aria-selected',String(i===active));});if(active>=0){input.setAttribute('aria-activedescendant',`${id}-${active}`);popup.children[active]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function select(index){const item=items[index];if(!item)return;input.value=item.label;onSelect(item);close();}
  function show(){
    const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    items=options().filter(o=>words.every(w=>(o.search||o.label).toLowerCase().includes(w)));
    popup.replaceChildren();active=-1;
    if(!items.length){const empty=document.createElement('div');empty.className='picker-empty';empty.textContent=freeText?'Type a new value or choose another suggestion.':'No matching activities. Add one from Activities.';popup.append(empty);}
    items.forEach((item,i)=>{const row=document.createElement('div');row.role='option';row.id=`${id}-${i}`;row.title=item.label;row.setAttribute('aria-selected','false');const label=document.createElement('span');label.textContent=item.label;const hours=document.createElement('small');hours.textContent=`${item.hours.toLocaleString('en-US',{maximumFractionDigits:2})} h`;row.append(label,hours);row.addEventListener('pointerdown',e=>{e.preventDefault();select(i);});popup.append(row);});
    popup.hidden=false;input.setAttribute('aria-expanded','true');position();
  }
  input.addEventListener('focus',()=>{query='';show();});
  input.addEventListener('click',()=>{if(popup.hidden){query='';show();}});
  input.addEventListener('input',()=>{query=input.value;show();});
  input.addEventListener('blur',()=>{close();if(!freeText)onSelect(null);});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(popup.hidden){query='';show();}active=Math.max(0,Math.min(items.length-1,active+(event.key==='ArrowDown'?1:-1)));highlight();}
    else if(event.key==='Enter'&&!popup.hidden&&active>=0){event.preventDefault();select(active);}
    else if(event.key==='Escape'){event.preventDefault();close();if(!freeText)onSelect(null);}
    else if(event.key==='Tab'){if(!popup.hidden&&active>=0)select(active);close();}
  });
  // A modal's top layer also contains its dropdown, preserving pointer access.
  const dialog=input.closest('dialog');if(dialog)dialog.append(popup);
  const observer=new ResizeObserver(position);observer.observe(input);
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return {close,refresh:position,destroy(){observer.disconnect();popup.remove();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);}};
}
