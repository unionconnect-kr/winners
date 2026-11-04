// A synchronous view for the legacy UI; SDK writes must await flush().
// Persistent secrets live in the OS vault. Non-remembered secrets live only in
// native process memory, surviving WebView reloads but not process termination.
export function createSecureAuthStorage({vault,projectRef,localStorage,sessionStorage}) {
  if(!/^[a-z]{20}$/.test(projectRef))throw Error('Invalid secure storage scope');
  const roots=[`sb-${projectRef}-auth-token`,`manee-${projectRef}-auth`];
  const keys=new Set([...roots.flatMap(k=>[k,k+'-code-verifier',k+'-user']),`manee-${projectRef}-social-code-verifier`,`manee-${projectRef}-social-pending`]);
  const areas={localStorage,sessionStorage},cache={localStorage:new Map(),sessionStorage:new Map()};
  let failure=null,queue=Promise.resolve(),initialized=false;
  const unavailable=()=>Error('기기 보안 저장소를 열지 못했어요. 앱을 다시 실행해 주세요.');
  function check(){if(failure)throw unavailable();}
  const clearMarker=slot=>'manee-secure-clear:'+slot;
  function markFailure(){failure=true;cache.localStorage.clear();cache.sessionStorage.clear();return unavailable();}
  function enqueue(operation){
    queue=queue.then(()=>{check();return operation();}).catch(()=>{failure=true;cache.localStorage.clear();cache.sessionStorage.clear();throw unavailable();});
    void queue.catch(()=>{});
  }
  const ready=(async()=>{
    // Read and migrate only this backend's known auth keys; unrelated app data
    // and the other environment are never enumerated or changed.
    for(const name of Object.keys(areas))for(const key of keys){
      const slot=name+':'+key;
      // A durable, non-secret logout intent survives process death and failed
      // native deletion. Never hydrate an old token while deletion is pending.
      if(localStorage.getItem(clearMarker(slot))==='1'){
        await vault.remove({key:slot});
        areas[name].removeItem(key);
        if(areas[name].getItem(key)!==null)throw unavailable();
        localStorage.removeItem(clearMarker(slot));
      }
      const {value}=await vault.get({key:slot});
      const legacy=areas[name].getItem(key);
      if(value!==null && value!==undefined){
        cache[name].set(key,value);
      }else if(legacy!==null){
        await vault.set({key:slot,value:legacy});
        cache[name].set(key,legacy);
      }
      // Removal happens only after a successful vault read/write. Removal
      // failure blocks startup instead of leaving a plaintext fallback.
      if(legacy!==null){areas[name].removeItem(key);if(areas[name].getItem(key)!==null)throw unavailable();}
    }
    initialized=true;
  })().catch(()=>{failure=true;cache.localStorage.clear();cache.sessionStorage.clear();throw unavailable();});
  void ready.catch(()=>{});
  const view=name=>({
    getItem(key){if(!keys.has(key))return areas[name].getItem(key);check();if(!initialized)throw unavailable();return cache[name].get(key)??null;},
    setItem(key,value){
      if(!keys.has(key))return areas[name].setItem(key,value);
      check();if(!initialized)throw unavailable();value=String(value);cache[name].set(key,value);
      enqueue(()=>vault.set({key:name+':'+key,value}));
    },
    removeItem(key){
      if(!keys.has(key))return areas[name].removeItem(key);
      check();if(!initialized)throw unavailable();
      const slot=name+':'+key;
      try { localStorage.setItem(clearMarker(slot),'1');if(localStorage.getItem(clearMarker(slot))!=='1')throw unavailable(); }
      catch { throw markFailure(); }
      cache[name].delete(key);
      enqueue(async()=>{await vault.remove({key:slot});localStorage.removeItem(clearMarker(slot));});
    }
  });
  const views={localStorage:view('localStorage'),sessionStorage:view('sessionStorage')};
  return {ready,area:name=>views[name],async flush(){await ready;await queue;check();},
    wrap(adapter){return {
      async getItem(key){await ready;check();return adapter.getItem(key);},
      async setItem(key,value){await ready;check();adapter.setItem(key,value);await this.flushPending();},
      async removeItem(key){await ready;check();adapter.removeItem(key);await this.flushPending();},
      async flushPending(){await queue;check();}
    };}
  };
}
