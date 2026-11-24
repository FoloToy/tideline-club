/* Local Mac Chrome is the BLE host. The iPad owns the simulation and screens. */
(() => {
  const role=document.documentElement.dataset.relay;
  if(role!=="host" && role!=="court")return;
  const tab=Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,"0")).join("");
  const endpoint=name=>new URL(name+"?tab="+tab,location.href);
  const source=new EventSource(endpoint("events/"+role));
  let sink=()=>{}, online=false, chain=Promise.resolve(), epoch=0;
  function reset() { online=false; epoch++; sink({type:"offline"}); }
  source.onopen=()=>{online=true;epoch++;sink({type:"open"});};
  source.onerror=reset;
  source.addEventListener("replaced",()=>{source.close();reset();});
  source.onmessage=e=>{try{sink(JSON.parse(e.data));}catch{}};
  window.TidelineRelay={
    role,
    listen(fn) {sink=fn;},
    send(event) {
      if(!online)return;
      const generation=epoch;
      chain=chain.then(async()=>{
        if(!online || generation!==epoch)return;
        const r=await fetch(endpoint("from/"+role),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(event)});
        if(!r.ok)throw Error("bridge unavailable");
      }).catch(()=>{if(generation===epoch){reset(); if(source.readyState===EventSource.OPEN){online=true;sink({type:"open"});}}});
    }
  };
})();
