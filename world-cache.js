// A terrain revision occupies one slot. Private/file browsing can always regenerate it.
async function loadLakeWorld(generate,onProgress){
  const source=createLakeTerrain.toString();
  let rev=2166136261;
  for(let i=0;i<source.length;i++)rev=Math.imul(rev^source.charCodeAt(i),16777619)>>>0;
  let db;
  try{
    db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('dusk-lake-world',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('world');
      let blocked=false;
      request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>{blocked=true;resolve(null);};
    });
    if(db){
      const cached=await new Promise((resolve,reject)=>{
        const request=db.transaction('world').objectStore('world').get('lake');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      if(cached?.rev===rev && cached.height instanceof Float32Array && cached.height.length===WORLD.N**2 &&
         cached.tex instanceof Uint8Array && cached.tex.length===WORLD.N**2*4 &&
         cached.cloud instanceof Uint8Array && cached.cloud.length===WORLD.CN**2){
        db.close();onProgress(1);return cached;
      }
    }
  }catch{db?.close();db=null;}
  const world=await generate(onProgress);
  if(db){
    try{
      const tx=db.transaction('world','readwrite');
      tx.oncomplete=tx.onabort=()=>db.close();
      tx.objectStore('world').put({rev,...world},'lake');
    }catch{db.close();}
  }
  return world;
}
