import {stereoWindow,cropColumns} from '../stereo-window.js';
import {DiagnosticWorker} from './worker-client.js';
import {savePNG} from './save-png.js';

function paint(canvas,values,width,height,kind='depth',confidence=null){
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
  for(let i=0;i<values.length;i++){
    const v=values[i],at=i*4;let c;
    if(!Number.isFinite(v))c=[20,27,34];
    else if(kind==='heat')c=[Math.round(v*242),Math.round((1-v)*180),60];
    else if(kind==='error')c=[Math.min(255,v*55),Math.max(0,190-v*45),60];
    else if(kind==='relief'){
      const x=i%width,y=Math.floor(i/width),l=values[i-(x>0?1:0)],r=values[i+(x<width-1?1:0)],u=values[i-(y>0?width:0)],d=values[i+(y<height-1?width:0)];
      const nx=(l-r)*6,ny=(u-d)*6,light=(.8+(-nx*.45-ny*.6+.55)/Math.sqrt(nx*nx+ny*ny+1))*.65;
      c=[110*light+v*45,150*light+v*45,170*light+v*45];
    }else c=[v*255,v*255,v*255];
    if(confidence&&confidence[i]<.2)c=c.map((n,k)=>n*.35+[20,27,34][k]*.65);
    image.data.set([...c,255],at);
  }
  ctx.putImageData(image,0,0);
}
export function createStereoDebugger({capture,onOpen,onClose,getPerformance}){
  const panel=document.createElement('dialog');panel.id='stereo-debug';panel.hidden=true;panel.className='panel';panel.setAttribute('aria-label','Stereo reconstruction debugger');
  panel.innerHTML=`<div class="debug-heading"><div><span class="eyebrow">DEPTHWALK LAB · IMAGE-ONLY RECONSTRUCTION</span><h2>What depth do the finished pixels support?</h2></div><button id="debug-close">Close · F3</button></div>
  <p id="debug-status" role="status">Preparing native-resolution capture…</p>
  <p id="debug-summary"></p><p class="debug-note">Reconstruction reads only the final image and spacing/depth calibration. Ground truth is compared afterward. Alternate-layer matches include ordinary harmonic repetitions; they are candidates, not proof of perceived ghosts. The scene is paused during analysis.</p>
  <div class="debug-grid">${[['original','Original render · comparison only'],['source','Captured stereo'],['expected','Intended depth · comparison only'],['decoded','Reconstructed depth · dim = uncertain'],['relief','Recovered relief'],['ambiguity','Competing depths · red = ambiguous'],['echo','Alternate-layer candidates · red = strong'],['error','Disparity error · red = 5+ pixels']].map(([id,label])=>`<figure><figcaption>${label}</figcaption><canvas id="debug-${id}"></canvas></figure>`).join('')}</div>
  <h3>Binocular evidence</h3><p id="debug-observer"></p><p id="debug-findings" class="debug-note"></p>
  <div class="debug-grid">${[['left','Aligned left eye patches'],['right','Aligned right eye patches'],['rivalry','Color disagreement · red = higher'],['scale','Cross-scale disagreement'],['roundtrip','Left/right search inconsistency']].map(([id,label])=>`<figure><figcaption>${label}</figcaption><canvas id="debug-${id}"></canvas></figure>`).join('')}</div>
  <div class="debug-actions"><button id="debug-retry">Capture again</button><button id="debug-png" disabled>Save captured PNG</button><button id="debug-download">Save JSON report</button><a href="/tests/observer-lab.html" target="_blank" rel="noopener">Open motion &amp; observer lab ↗</a></div>`;
  document.body.append(panel);
  let worker=null,report=null,run=0,open=false,controller=null,previousFocus=null;
  const $=id=>panel.querySelector('#debug-'+id);
  const close=()=>{
    if(!open)return;
    run++;controller?.abort();worker?.destroy();worker=null;open=false;
    panel.close();panel.hidden=true;onClose();previousFocus?.focus();
  };
  panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  async function analyze(){
    const id=++run;controller?.abort();worker?.destroy();worker=null;
    controller=new AbortController();const signal=controller.signal;
    report=null;delete panel.dataset.report;delete panel.dataset.error;
    panel.dataset.complete='false';$('status').textContent='Capturing one frame; decoding native pixels in a worker…';$('summary').textContent='';$('download').disabled=true;$('png').disabled=true;
    $('observer').textContent='';$('findings').textContent='';
    panel.querySelectorAll('.debug-grid').forEach(grid=>grid.hidden=true);
    try{
      const performanceInfo=getPerformance();
      let frame=await capture(signal);if(id!==run)return;
      const region=stereoWindow(frame.width,frame.spacing,1,frame.windowPeriods??0);
      if(frame.windowPeriods){
        frame={...frame,depth:cropColumns(frame.depth,frame.width,frame.height,region.left,region.width,4),color:frame.color?cropColumns(frame.color,frame.width,frame.height,region.left,region.width,4):undefined,pixels:cropColumns(frame.pixels,frame.width,frame.height,region.left,region.width),width:region.width};
      }
      const canvas=$('source');canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.pixels.buffer),frame.width,frame.height),0,0);
      $('png').disabled=false;
      $('original').parentElement.hidden=!frame.color;
      if(frame.color){
        const original=$('original');original.width=frame.width;original.height=frame.height;
        const rgba=new Uint8ClampedArray(frame.color.length),stride=frame.width*4;
        for(let y=0;y<frame.height;y++)rgba.set(frame.color.subarray((frame.height-1-y)*stride,(frame.height-y)*stride),y*stride);
        original.getContext('2d').putImageData(new ImageData(rgba,frame.width,frame.height),0,0);
      }
      const capturePerformance=getPerformance();
      worker=new DiagnosticWorker(new Worker(new URL('./reconstruct.worker.js',import.meta.url),{type:'module'}));
      const data=await worker.request({pixels:frame.pixels,depth:frame.depth,color:frame.color,width:frame.width,height:frame.height,spacing:frame.spacing,strength:frame.strength,invertDepth:frame.invertDepth},{signal,transfer:[frame.pixels.buffer,frame.depth.buffer]});
        if(id!==run)return;
        const {decoded:d,comparison:c,fidelity,ms,observer:o,evaluation,findings,observerVersion}=data,percent=v=>v===null?'unmeasured':(100*v).toFixed(1)+'%';
        paint($('expected'),c.expected,d.columns,d.rows);paint($('decoded'),d.near,d.columns,d.rows,'depth',d.confidence);
        paint($('relief'),d.near,d.columns,d.rows,'relief',d.confidence);paint($('ambiguity'),d.ambiguity,d.columns,d.rows,'heat');paint($('echo'),d.echo,d.columns,d.rows,'heat');paint($('error'),c.error,d.columns,d.rows,'error');
        report={schema:1,recordedAt:new Date().toISOString(),pattern:frame.pattern,dimensions:[frame.width,frame.height],calibration:{spacing:frame.spacing,strength:frame.strength},search:[d.searchMin,d.searchMax],grid:[d.columns,d.rows],reconstruction:d.summary,comparison:c.summary,analysisMs:ms,performance:performanceInfo,capturePerformance:{...capturePerformance,scope:'One-frame diagnostic readback; not interactive frame timing'},limitations:['Local normalized correlation on native pixels, sampled on a grid; not a human perceptual model.','Alternate matches include inherent harmonic repetitions; they are candidates, not proof of perceived ghost layers.']};
        report.stereoRegion={...region,periods:frame.windowPeriods??0};report.surfaceDetail=frame.surfaceDetail;report.fidelity=fidelity;
        report.invertDepth=!!frame.invertDepth;
        report.renderSettings={edges:frame.edges,dotSize:frame.dotSize,pixelRatio:frame.pixelRatio,depthRange:frame.depthRange,verticalFov:frame.camera?.fov};
        report.temporalStability=['quiet','chroma','chroma-soft'].includes(frame.pattern)&&!!frame.temporalStability;
        report.signalMode=frame.pattern==='chroma-soft'?'Projected hues and 25% source lighting over a continuous carrier; luminance equality relaxed, fusion unverified.':frame.pattern==='chroma'?'Complete linear-luminance graph; hues projected to visible eye pairs with nearest-surface ownership.':frame.pattern==='surface'?'Selective exact color constraints with a faint dense carrier; quiet areas may not fuse reliably.':'Dense correspondence graph';
        report.observer={version:observerVersion,summary:o.summary,evaluation:evaluation.summary,unsupportedRegions:o.regions,findings,scope:'Image-only, linear-luminance multiscale correlation and chromaticity disagreement. Engineering thresholds are not calibrated human comfort probabilities.'};
        for(const side of ['left','right']){const canvas=$(side);canvas.width=o.columns;canvas.height=o.rows;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(o[side].buffer),o.columns,o.rows),0,0);}
        paint($('rivalry'),Float32Array.from(o.chroma,v=>Math.min(1,v*5)),o.columns,o.rows,'heat');paint($('scale'),o.scaleDisagreement,o.columns,o.rows,'heat');paint($('roundtrip'),o.rivalry,o.columns,o.rows,'heat');
        $('observer').textContent=`Consistent supported area ${percent(o.summary.supportedFraction)} · Eye-color conflict ${percent(o.summary.colorConflictFraction)} · Cross-scale disagreement ${percent(o.summary.scaleDisagreementFraction)} · Nonharmonic alternate matches ${percent(o.summary.nonharmonicAlternativeFraction)}.`;
        $('findings').textContent=findings.map(f=>f.code+': '+f.message).join(' ');
        panel.dataset.report=JSON.stringify(report);
        panel.dataset.complete='true';panel.querySelectorAll('.debug-grid').forEach(grid=>grid.hidden=false);
        $('status').textContent=`${frame.windowPeriods?'Central stereo window only. ':''}Decoded ${d.columns}×${d.rows} samples from ${frame.width}×${frame.height} native pixels in ${(ms/1000).toFixed(2)} s. ${d.summary.zeroStrength?'Zero depth strength: scene depth is not identifiable.':''}`;
        $('summary').textContent=`Reliable matches ${percent(d.summary.reliableFraction)} · Weak dot contrast ${percent(d.summary.weakContrastFraction)} · Ambiguous within range ${percent(d.summary.ambiguousFraction)} · Alternate-layer candidates ${percent(d.summary.alternateLayerFraction)} · Within 2 pixels of intended disparity ${percent(c.summary.withinTwoPixels)} (${percent(c.summary.interiorWithinTwoPixels)} in smooth interiors). Mean error ${c.summary.meanDisparityError===null?'unmeasured':c.summary.meanDisparityError.toFixed(2)+' px'}.`;
        if(fidelity)$('summary').textContent+=` Source RGB error ${fidelity.sourceRMSE.toFixed(1)}/255 · Broad-color error ${fidelity.broadColorRMSE?.toFixed(1)}/255 (lower is closer to original; not a fusion score).`;
        $('download').disabled=false;
    }catch(error){if(id===run&&!signal.aborted){$('status').textContent='Analysis failed: '+error.message;panel.dataset.error=error.message;}}
    finally{if(id===run){worker?.destroy();worker=null;}}
  }
  $('close').onclick=close;$('retry').onclick=analyze;
  $('png').onclick=async()=>{try{await savePNG($('source'),'depthwalk-stereo.png');}catch(error){$('status').textContent='Image export failed: '+error.message;}};
  $('download').onclick=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='depthwalk-reconstruction.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  window.addEventListener('pagehide',close);
  return {get isOpen(){return open;},close,toggle(){if(open)close();else{previousFocus=document.activeElement;open=true;panel.hidden=false;onOpen();panel.showModal();analyze();}}};
}
