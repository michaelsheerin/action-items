export async function openWorkStore() {
  const db=await new Promise((resolve,reject)=>{
    const r=indexedDB.open('sheerin-work-log',1);
    r.onupgradeneeded=()=>{for(const key of ['activities','entries','historical','settings'])r.result.createObjectStore(key,{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.onblocked=()=>reject(new Error('Close older Hours tabs and reload.'));
  });
  db.onversionchange=()=>db.close();
  function run(keys,mode,action) { return new Promise((resolve,reject)=>{const tx=db.transaction(keys,mode);let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('Browser storage failed.'));tx.onabort=()=>reject(tx.error||new Error('Save interrupted.'));try{action(tx,value=>{result=value;});}catch(error){tx.abort();reject(error);}}); }
  return {
    all:()=>run(['activities','entries','historical'],'readonly',(tx,result)=>{const data={};result(data);for(const key of ['activities','entries','historical']){const r=tx.objectStore(key).getAll();r.onsuccess=()=>{data[key]=r.result;};}}),
    put:(key,value)=>run([key],'readwrite',tx=>tx.objectStore(key).put(value)),
    setting:(id,value)=>run(['settings'],value===undefined?'readonly':'readwrite',(tx,result)=>{const s=tx.objectStore('settings');const r=value===undefined?s.get(id):s.put({id,value});r.onsuccess=()=>result(value===undefined?r.result?.value:value);}),
    import:(data,overwrite=false)=>run(['activities','entries','historical'],'readwrite',(tx,result)=>{const counts={activities:0,entries:0,historical:0};result(counts);for(const key of Object.keys(counts))for(const row of data[key]){const s=tx.objectStore(key),r=s.get(row.id);r.onsuccess=()=>{if(!r.result||overwrite){s.put(row);counts[key]++;}};}})
  };
}
