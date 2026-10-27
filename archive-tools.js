export function archiveMatches(task, filters={}) {
  return Object.entries(filters).every(([field,value])=>{
    let text=String(task[field]||'');
    if(field==='completedAt'&&text){const d=new Date(text);text=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
    return !value||text.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase());
  });
}
export function compareArchived(a,b,{field='completedAt',direction='desc'}={}) {
  const left=String(a[field]||''),right=String(b[field]||'');
  // Unknown dates stay last in either direction.
  if(!left!==!right)return left?-1:1;
  const result=left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'});
  return result*(direction==='desc'?-1:1) || String(a.id).localeCompare(String(b.id));
}
