import {FoundationFilter} from '../src/foundation-stereo.js';

// Dev-only integration checks of the real host/worker/device boundaries.
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const $=id=>document.getElementById(id);
function assert(value,message){if(!value)throw Error(message);}
async function until(predicate,message,timeout=25000){
  const deadline=performance.now()+timeout;
  while(!predicate()){assert(performance.now()<deadline,message);await wait(10);}
}
function select(id,value){$(id).value=value;$(id).dispatchEvent(new Event('change'));}

export async function runStartupChecks({stop,getFrame,getRuntime,getStartupStats,setDiagnosticCapture,loseGPU,terminatePreparation}){
  const report=document.createElement('pre');report.id='verification';
  report.style.cssText='position:fixed;top:90px;left:16px;z-index:50;background:#10202b;color:#bbefc3;padding:16px;max-width:750px;max-height:75vh;overflow:auto';
  report.textContent='STARTUP AND PREPARATION CHECKS\n';document.body.append(report);
  const results=[],initialCPU=new URLSearchParams(location.search).get('renderer')==='cpu';
  const idle=()=>{const state=getRuntime();return state.ready&&state.holdingFrame&&!state.busy&&state.pending===0&&!getStartupStats().preparation.pending;};
  const current=async()=>{setDiagnosticCapture(true);await until(()=>getFrame(),'current capture missing');return getFrame();};
  const hold=async()=>{setDiagnosticCapture(false);await until(idle,'host did not settle');};
  const exact=frame=>{
    const expected=new FoundationFilter().render({depth:frame.depth,width:frame.width,height:frame.height,
      format:'packed-proximity-rg16',origin:'bottom-left'},
    {carrier:frame.pattern.slice(11),spacing:frame.spacing,strength:frame.strength,noiseFrame:frame.noiseFrame,carrierContrast:frame.carrierContrast});
    for(let i=0;i<frame.pixels.length;i++)assert(frame.pixels[i]===expected.pixels[i],`prepared/reference mismatch at ${i}`);
    return frame.pixels.length;
  };
  async function check(name,fn){
    try{results.push({name,pass:true,detail:await fn()});}
    catch(error){results.push({name,pass:false,error:error.message});}
    const last=results.at(-1);report.textContent+=`${last.pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(last.detail||last.error)}\n`;
  }
  try{
    stop();
    await check('initial static texture is prepared once and presents identical pixels',async()=>{
      const frame=await current();await hold();const stats=getStartupStats();
      assert(stats.preparation.requests===1&&stats.preparation.completed===1,'duplicate initial preparation');
      assert(stats.firstPresentationMs>0,'first presentation timing absent');
      if(initialCPU){
        assert(stats.gpuStarts===0&&!stats.gpuReady&&!stats.gpuPending,'explicit CPU initialized GPU');
        assert(stats.cpuCarrierKeys.every(key=>key?.startsWith(stats.preparation.preparedKey+'/')),'CPU stripes do not share preparation identity');
      }
      return {backend:getRuntime().backend,firstBackend:stats.firstBackend,firstCompletionMs:stats.firstPresentationMs,
        timingScope:'Navigation-relative first accepted stereo completion in dev verification with QA readback; not display scanout or production startup.',
        preparation:stats.preparation,exactPixels:exact(frame)};
    });
    await check('new pink preparation leaves UI callbacks and guide input responsive',async()=>{
      const before=getStartupStats(),priorGuide=$('center-alignment').hidden;
      let rafCount=0,maxGap=0,last=performance.now(),watching=true;
      // RAF's supplied timestamp may precede this check's synchronous reference
      // work in the same display frame. Measure actual callback execution time.
      const tick=()=>{if(!watching)return;const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;rafCount++;requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
      try{
        select('quality','0.75');
        await until(()=>getStartupStats().preparation.requests>before.preparation.requests,'new preparation never began');
        assert(getStartupStats().preparation.pending,'preparation finished before responsiveness could be sampled');
        const atStart=rafCount;
        window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',bubbles:true}));
        assert($('center-alignment').hidden!==priorGuide&&!$('alignment').hidden,'guide input did not respond during preparation');
        window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',bubbles:true}));
        await until(()=>!getStartupStats().preparation.pending,'preparation stalled');
        const pendingCallbacks=rafCount-atStart,stats=getStartupStats();watching=false;
        assert(pendingCallbacks>0,'no UI frame while texture was prepared');
        await hold();
        return {pendingCallbacks,maxCallbackGapMs:maxGap,preparationMs:stats.preparation.finishedAt-stats.preparation.startedAt,
          sharedBytes:stats.preparation.bytes};
      }finally{watching=false;}
    });
    await check('rapid size and texture changes reject obsolete preparation',async()=>{
      select('quality','1');
      await until(()=>getStartupStats().preparation.pending,'preparation never became pending');
      const obsolete=getStartupStats().preparation.requestedKey;
      select('texture','foundation-white');select('quality','0.5');
      await hold();
      const frame=await current(),stats=getStartupStats();
      assert(frame.pattern==='foundation-white'&&$('quality').value==='0.5','obsolete settings presented');
      assert(stats.preparation.preparedKey!==obsolete&&stats.preparation.preparedKey===stats.preparation.requestedKey,'obsolete carrier adopted');
      const pixels=exact(frame);await hold();
      return {discardedKey:obsolete,currentKey:stats.preparation.preparedKey,width:frame.width,height:frame.height,exactPixels:pixels};
    });
    await check('CPU to Auto starts GPU once and reuses the prepared texture',async()=>{
      select('backend','cpu');await hold();
      const before=getStartupStats();select('backend','auto');select('backend','gpu');select('backend','auto');
      await until(()=>getRuntime().backend==='gpu'&&getRuntime().ready,'selected GPU did not become usable');
      await hold();
      const after=getStartupStats();
      assert(after.gpuStarts===before.gpuStarts+(before.gpuReady?0:1),'GPU startup was duplicated');
      assert(after.preparation.requests===before.preparation.requests,'backend switch regenerated texture');
      assert(after.gpuCarrierKey===after.preparation.preparedKey,'GPU lacks current preparation');
      const frame=await current(),pixels=exact(frame);await hold();
      return {gpuStarts:after.gpuStarts,exactPixels:pixels};
    });
    await check('CPU world switch avoids GPU recreation and retains preparation',async()=>{
      select('backend','cpu');await hold();
      const before=getStartupStats(),oldWorld=$('demo').value;
      select('demo',oldWorld==='retro'?'original':'retro');
      await until(()=>!$('demo').disabled&&getRuntime().ready,'world replacement did not complete');await hold();
      const after=getStartupStats();
      assert(after.gpuStarts===before.gpuStarts&&!after.gpuReady&&!after.gpuPending,'CPU world replacement initialized GPU');
      assert(after.preparation.requests===before.preparation.requests,'world replacement regenerated identical texture');
      const frame=await current(),pixels=exact(frame);await hold();
      return {world:$('demo').value,exactPixels:pixels,gpuStarts:after.gpuStarts};
    });
    await check('new world GPU startup and actual device loss retain usable CPU output',async()=>{
      select('backend','auto');await until(()=>getRuntime().backend==='gpu'&&getRuntime().ready,'new world GPU unavailable');await hold();
      const before=getStartupStats();loseGPU();
      await until(()=>getRuntime().backend==='cpu'&&getRuntime().ready,'device loss did not fall back');await hold();
      const after=getStartupStats();assert(after.preparation.requests===before.preparation.requests,'fallback regenerated prepared carrier');
      assert($('fatal').hidden,'fallback displays fatal error');
      const frame=await current(),pixels=exact(frame);await hold();
      return {backend:getRuntime().backend,exactPixels:pixels,preparedKey:after.preparation.preparedKey};
    });
    await check('preparation failure restores recovery guidance after changing views',async()=>{
      select('texture','foundation-pink');
      await until(()=>getStartupStats().preparation.pending,'uncached preparation did not begin');
      terminatePreparation();
      await until(()=>!$('fatal').hidden&&$('fatal').textContent.includes('Reload'),'preparation failure was not visible');
      document.querySelector('[data-view="normal"]').click();
      await until(()=>$('fatal').hidden,'source view retained preparation error overlay');
      document.querySelector('[data-view="stereo"]').click();
      await until(()=>!$('fatal').hidden&&$('fatal').textContent.includes('Reload'),'returning to failed texture lost recovery guidance');
      assert(!getRuntime().busy&&!getStartupStats().preparation.pending,'failed preparation left work pending');
      return 'closed this test page’s preparation worker; alternate view remains available; re-entry restores reload guidance';
    });
  }finally{
    stop();setDiagnosticCapture(false);report.dataset.results=JSON.stringify(results);report.dataset.complete='true';
    report.textContent+=`\n${results.filter(result=>result.pass).length}/${results.length} passed.\n`;
  }
}
