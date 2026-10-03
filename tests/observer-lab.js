import {APPEARANCE_PROFILES,MULTISCALE_PROFILES} from '../src/debug/appearance-synthesis.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCity,disposeCity} from '../src/city.js';
import {createDepthMaterial} from '../src/adapters/three-depth.js';
import {DepthWalkGPU} from '../src/gpu/depthwalk-gpu.js';
import {runBenchmark,syntheticFrames,PROFILES,QUIET_MOTION_PROFILES,INK_PROFILES} from '../src/debug/benchmark.js';
import {inspectPixel,diagnose} from '../src/debug/observer.js';
import {DiagnosticWorker} from '../src/debug/worker-client.js';
import {readComparisonSettings} from '../src/debug/comparison-settings.js';
import {savePNG} from '../src/debug/save-png.js';
import {COLOR_BASE_PROFILES} from '../src/debug/color-base.js';
import {RANK_PROFILES} from '../src/debug/rank-color.js';
const $=id=>document.getElementById(id);
$('demo').value=new URLSearchParams(location.search).get('world')==='retro'?'retro':'original';
const requestedScene=new URLSearchParams(location.search).get('scene');
if([...$('dataset').options].some(option=>option.value===requestedScene))$('dataset').value=requestedScene;
const requestedSweep=new URLSearchParams(location.search).get('sweep');
if([...$('sweep').options].some(option=>option.value===requestedSweep))$('sweep').value=requestedSweep;
const imported=new URLSearchParams(location.search).get('compare')==='quiet'?readComparisonSettings(new URLSearchParams(location.search)):null;
if(new URLSearchParams(location.search).get('compare')==='quiet'){
  if(![...$('spacing').options].some(o=>Number(o.value)===imported.spacing))$('spacing').add(new Option(imported.spacing+' pixels · from city',String(imported.spacing)));
  $('sweep').value='quiet-motion';$('spacing').value=String(imported.spacing);$('strength').value=String(imported.strength*100);$('resolution').value=innerWidth>=1280?'1280':'640';
  $('direction').value=imported.invertDepth?'reversed':'original';
  $('imported-settings').textContent=`Quiet motion replay uses city support ${Math.round(imported.surfaceDetail*100)}%, edges ${['off','light','strong','dark ink'][imported.edges]}, dots ${imported.dotSize}px. Spacing and strength can be adjusted below. Other sweeps use their labeled profiles. The replay has its own camera and native-pixel resolution.`;
}
let rankPreview=new URLSearchParams(location.search).get('preview')==='rank';
if(rankPreview){
  if(![...$('dataset').options].some(option=>option.value===requestedScene))$('dataset').value='close';
  $('sweep').value='rank';$('backend').value='cpu';
  $('resolution').value=innerWidth>=1320&&innerHeight>=960?'1280':'640';$('spacing').value='120';$('strength').value='50';$('direction').value='original';
  $('imported-settings').textContent='Preparing the anti-banding prototype. The recorded comparison opens on B when ready; A shows Quiet and C the original render. This prototype still fails depth and motion checks.';
}
let width=640,height=360,spacing=96;
let cancelled=false,worker=null,runId=0,bundle=null,selected=0,frameIndex=0,playing=false,lastPlayback=0,gpu=null;
let playbackRAF=0,reliefRAF=0,probeX=.5,probeY=.45;
let compareChoice='quiet',compareCandidate='quiet-stable';
const percent=v=>v===null?'n/a':(v*100).toFixed(1)+'%',num=v=>v===null?'n/a':v.toFixed(2);
function paint(id,pixels,w,h){const c=$(id);c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer,pixels.byteOffset,pixels.byteLength),w,h),0,0);}
function heat(id,values,o,depth=false){
  const pixels=Uint32Array.from(values,(v,i)=>{
    if(!Number.isFinite(v))return 0xff201710;
    if(depth){v=2*(o.spacing-v)/(o.strength*(2*o.spacing-v));const level=Math.round(Math.max(0,Math.min(1,v))*(o.confidence[i]>.35?255:75));return(0xff000000|level|level<<8|level<<16)>>>0;}
    v=Math.max(0,Math.min(1,v));return(0xff000000|Math.round(240*v)|Math.round(170*(1-v))<<8|65<<16)>>>0;
  });paint(id,pixels,o.columns,o.rows);
}
// Explicit relative-depth relief, reconstructed from pixels only. No scene mesh.
const reliefScene=new THREE.Scene(),reliefCamera=new THREE.PerspectiveCamera(43,2,.01,20);
reliefScene.background=new THREE.Color('#0c151e');reliefCamera.position.set(.8,.35,3.1);
let relief=null,reliefRenderer=null,orbit=null,reliefUnavailable=false;
function ensureRelief(){
  if(reliefRenderer)return true;if(reliefUnavailable)return false;
  try{
    reliefRenderer=new THREE.WebGLRenderer({canvas:$('relief'),antialias:true});
    orbit=new OrbitControls(reliefCamera,$('relief'));orbit.enableDamping=false;orbit.target.set(0,0,.4);orbit.update();
    orbit.addEventListener('change',requestRelief);
    return true;
  }catch{reliefUnavailable=true;$('relief-status').textContent='3D relief requires WebGL. The image analysis and maps remain available.';return false;}
}
function requestRelief(){
  if(reliefRAF||!reliefRenderer||document.hidden||$('inspection').hidden)return;
  reliefRAF=requestAnimationFrame(()=>{
    reliefRAF=0;const w=Math.max(1,$('relief').clientWidth),h=Math.max(1,$('relief').clientHeight);
    reliefRenderer.setPixelRatio(Math.min(devicePixelRatio||1,2));reliefRenderer.setSize(w,h,false);
    reliefCamera.aspect=w/h;reliefCamera.updateProjectionMatrix();reliefRenderer.render(reliefScene,reliefCamera);
    $('relief').dataset.draws=String(Number($('relief').dataset.draws||0)+1);
  });
}
const reliefResize=new ResizeObserver(requestRelief);reliefResize.observe($('relief'));
function updateRelief(o){
  if(!ensureRelief())return;
  if(relief){reliefScene.remove(relief);relief.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});}
  const p=[],c=[],lookup=new Int32Array(o.disparity.length).fill(-1),indices=[];
  for(let i=0;i<o.disparity.length;i++)if(o.confidence[i]>.35&&Number.isFinite(o.disparity[i])){
    const s=o.disparity[i],z=Math.max(0,Math.min(1,2*(o.spacing-s)/(o.strength*(2*o.spacing-s))));
    lookup[i]=p.length/3;p.push((i%o.columns/o.columns-.5)*2.5,(.5-Math.floor(i/o.columns)/o.rows)*1.4,z*.85);
    const v=o.fused[i],color=new THREE.Color().setRGB((v&255)/255,(v>>>8&255)/255,(v>>>16&255)/255,THREE.SRGBColorSpace);c.push(color.r,color.g,color.b);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  for(let y=0;y<o.rows-1;y++)for(let x=0;x<o.columns-1;x++){
    const at=y*o.columns+x;for(const tri of [[at,at+1,at+o.columns],[at+1,at+o.columns+1,at+o.columns]]){
      const ids=tri.map(i=>lookup[i]);if(ids.some(i=>i<0))continue;const z=ids.map(i=>p[i*3+2]);if(Math.max(...z)-Math.min(...z)<.14)indices.push(...ids);
    }
  }
  const dots=g.clone();g.setIndex(indices);relief=new THREE.Group();relief.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})),new THREE.Points(dots,new THREE.PointsMaterial({size:.025,vertexColors:true})));reliefScene.add(relief);
  requestRelief();
}
function curve(frame,pixels,x,y){
  const p=inspectPixel({pixels,width:frame.width,height:frame.height,spacing:frame.spacing,strength:frame.strength},x,y),c=$('curve'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  const px=s=>35+(s-p.lo)/(p.hi-p.lo)*(c.width-50),py=v=>c.height-30-v*(c.height-50);
  ctx.fillStyle='#254d43';ctx.fillRect(px(p.min),10,px(p.max)-px(p.min),c.height-40);ctx.font='12px monospace';ctx.fillStyle='#aec2c6';ctx.fillText('calibrated range',px(p.min)+4,25);
  for(const [values,color] of [[p.fine,'#b8efcd'],[p.broad,'#efcf83']]){ctx.strokeStyle=color;ctx.beginPath();let begun=false;for(let s=p.lo;s<=p.hi;s++){if(!Number.isFinite(values[s])){begun=false;continue;}if(begun)ctx.lineTo(px(s),py(values[s]));else ctx.moveTo(px(s),py(values[s]));begun=true;}ctx.stroke();}
  for(const a of p.all.slice(0,5)){ctx.fillStyle='#d4e6e1';ctx.fillText(String(a.disparity),px(a.disparity)-6,c.height-10);}
  $('probe').textContent=p.valid?`(${p.x}, ${p.y}) · best ${p.disparity}px · evidence ${percent(p.confidence)} · color difference ${num(p.chromaDifference)} · round-trip ${num(p.roundTrip)}px · cross-scale ${num(p.scaleDifference)}px. Other peaks: ${p.alternatives.slice(0,4).map(a=>a.disparity+'px'+(a.harmonic?' harmonic':'')).join(', ')}.`:'No measurable matching contrast at this point.';
}
function timeline(result){
  const c=$('timeline'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.font='12px monospace';
  for(const [field,mult,color] of [['screenLumaRMS',100,'#b8efcd'],['truthCorrectedDisparityRMS',1,'#efcf83']]){
    const max=Math.max(1,...result.timeline.map(p=>(p[field]??0)*mult));ctx.strokeStyle=color;ctx.beginPath();result.timeline.forEach((p,i)=>{const x=20+i/Math.max(1,result.timeline.length-1)*(c.width-40),y=c.height-25-(p[field]??0)*mult/max*(c.height-55);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.fillStyle=color;ctx.fillText(field+' · peak '+max.toFixed(2),20,field==='screenLumaRMS'?15:30);
  }
}
function showFrame(){
  if($('compare-view').open){showComparison();return;}
  if(!bundle)return;const series=bundle.previews[selected],sample=series.frames[frameIndex],sourceIndex=series.frameIndices[frameIndex],frame=bundle.inputs[sourceIndex],o=sample.observed;
  $('selected').textContent=series.profile.label;$('frame-label').textContent=`Source frame ${sourceIndex+1} / ${bundle.inputs.length} · ${sample.phase}`;
  paint('stereo',sample.pixels,frame.width,frame.height);paint('left',o.left,o.columns,o.rows);paint('right',o.right,o.columns,o.rows);
  // This intervention is per profile, not per recorded frame.
  if($('spread').dataset.profile!==series.profile.id){heat('spread',series.colorSpread.map,{columns:frame.width,rows:frame.height});$('spread').dataset.profile=series.profile.id;}
  heat('depth',o.disparity,o,true);heat('chroma',Float32Array.from(o.chroma,v=>v*5),o);heat('scale',o.scaleDisagreement,o);updateRelief(o);
  $('findings').textContent=diagnose(o.summary,sample.evaluation.summary).map(f=>f.code+': '+f.message).join(' ');
  updateProbe();
}
function updateProbe(){if(!bundle)return;const s=bundle.previews[selected],f=bundle.inputs[s.frameIndices[frameIndex]];curve(f,s.frames[frameIndex].pixels,Math.round(probeX*(f.width-1)),Math.round(probeY*(f.height-1)));}
$('stereo').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();probeX=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));probeY=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));updateProbe();};
$('stereo').onkeydown=e=>{
  if(!bundle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.code))return;
  e.preventDefault();const f=bundle.inputs[0],step=e.shiftKey?10:1;
  if(e.code==='Home'){probeX=.5;probeY=.45;}else{probeX=Math.max(0,Math.min(1,probeX+({'ArrowLeft':-step,'ArrowRight':step}[e.code]||0)/(f.width-1)));probeY=Math.max(0,Math.min(1,probeY+({'ArrowUp':-step,'ArrowDown':step}[e.code]||0)/(f.height-1)));}updateProbe();
};
function setPlaying(value){
  if(value&&bundle&&$('compare-view').open&&frameIndex===bundle.previews[0].frames.length-1){frameIndex=0;$('frame').value=0;showComparison();}
  playing=value;cancelAnimationFrame(playbackRAF);playbackRAF=0;
  $('play').textContent=playing?'Pause sequence':'Play sequence';
  $('play').setAttribute('aria-pressed',String(playing));
  $('compare-play').textContent=playing?'Pause replay':'Play slow replay';
  $('compare-play').setAttribute('aria-pressed',String(playing));
  if(playing){lastPlayback=performance.now();playbackRAF=requestAnimationFrame(animate);}
}
$('frame').oninput=()=>{setPlaying(false);frameIndex=Number($('frame').value);showFrame();};
$('play').onclick=()=>setPlaying(!playing);
function showComparison(){
  if(!bundle)return;
  const series=bundle.previews.find(s=>s.profile.id===compareChoice);
  if(!series)return;
  const candidate=bundle.previews.find(s=>s.profile.id===compareCandidate);
  $('compare-history').textContent=candidate.profile.label+' · B';
  const decision=bundle.report.decisions.find(d=>d.candidate===compareCandidate);
  $('compare-verdict').textContent=decision?decisionText(decision):'Research comparison; no acceptance claim.';
  const sourceIndex=series.frameIndices[frameIndex],frame=bundle.inputs[sourceIndex],sample=series.frames[frameIndex];
  paint('compare-canvas',sample.pixels,frame.width,frame.height);
  $('compare-canvas').dataset.profile=series.profile.id;
  $('compare-canvas').dataset.sourceFrame=String(sourceIndex);
  $('compare-position').textContent=`${sourceIndex+1} / ${bundle.inputs.length} · ${sample.phase}`;
  $('compare-frame').max=series.frames.length-1;$('compare-frame').value=frameIndex;
  $('compare-previous').disabled=frameIndex===0;$('compare-next').disabled=frameIndex===series.frames.length-1;
  $('compare-guides').style.setProperty('--spacing',frame.spacing+'px');
  $('compare-baseline').setAttribute('aria-pressed',String(compareChoice==='quiet'));
  $('compare-history').setAttribute('aria-pressed',String(compareChoice===compareCandidate));
  $('compare-original').setAttribute('aria-pressed',String(compareChoice==='original'));
  $('compare-guides').hidden=compareChoice==='original'||!$('compare-guides-toggle').checked;
  $('compare-guides-toggle').disabled=compareChoice==='original';
}
function chooseComparison(choice){compareChoice=choice;showComparison();}
$('compare').onclick=()=>{
  setPlaying(false);compareChoice='quiet';
  $('compare-original').hidden=!bundle.previews.some(s=>s.profile.id==='original');
  $('compare-view').showModal();showComparison();
};
$('compare-baseline').onclick=()=>chooseComparison('quiet');
$('compare-history').onclick=()=>chooseComparison(compareCandidate);
$('compare-original').onclick=()=>chooseComparison('original');
$('compare-png').onclick=async()=>{
  const canvas=$('compare-canvas'),filename=`depthwalk-${canvas.dataset.profile}-frame-${Number(canvas.dataset.sourceFrame)+1}.png`;
  try{await savePNG(canvas,filename);}catch(error){$('compare-verdict').textContent='Image export failed: '+error.message;}
};
$('compare-play').onclick=()=>setPlaying(!playing);
function stepComparison(delta){setPlaying(false);frameIndex=Math.max(0,Math.min(bundle.previews[0].frames.length-1,frameIndex+delta));$('frame').value=frameIndex;showComparison();}
$('compare-previous').onclick=()=>stepComparison(-1);
$('compare-next').onclick=()=>stepComparison(1);
$('compare-guides-toggle').onchange=()=>{$('compare-guides').hidden=!$('compare-guides-toggle').checked;};
$('compare-frame').oninput=()=>{setPlaying(false);frameIndex=Number($('compare-frame').value);$('frame').value=frameIndex;showComparison();};
$('compare-close').onclick=()=>$('compare-view').close();
$('compare-view').addEventListener('close',()=>{setPlaying(false);showFrame();$('compare').focus();});
$('compare-view').addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement)return;
  if(['KeyA','KeyB','KeyC'].includes(e.code)){e.preventDefault();if(e.code!=='KeyC'||!$('compare-original').hidden)chooseComparison(e.code==='KeyC'?'original':e.code==='KeyB'?compareCandidate:'quiet');}
  if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}
  if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();stepComparison(e.code==='ArrowLeft'?-1:1);}
});
function animate(now){
  if(!playing||!bundle||document.hidden){setPlaying(false);return;}
  if(now-lastPlayback>140){
    lastPlayback=now;
    if($('compare-view').open&&frameIndex===bundle.previews[selected].frames.length-1){setPlaying(false);return;}
    frameIndex=(frameIndex+1)%bundle.previews[selected].frames.length;$('frame').value=frameIndex;showFrame();
  }
  playbackRAF=requestAnimationFrame(animate);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);else requestRelief();});

async function cityFrames(view){
  const near=view==='near',close=view==='close';
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(width,height);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const {scene}=createCity({style:$('demo').value}),background=scene.background,camera=new THREE.PerspectiveCamera(62,width/height,.1,110),material=createDepthMaterial(),target=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});target.texture.colorSpace=THREE.NoColorSpace;camera.rotation.order='YXZ';
  const frames=[];
  const sceneGeometry={meshes:0,triangles:0};
  scene.traverse(object=>{if(object.isMesh){sceneGeometry.meshes++;sceneGeometry.triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
  try{for(let t=0;t<10;t++){
    if(cancelled)throw Error('Benchmark cancelled');const motion=t<2?0:Math.min(t-1,5);
    if(t===1||t>6){frames.push({...frames.at(-1),phase:'hold',frameIndex:t,nominalTimeMs:t*1000/15});continue;}
    camera.position.set(near?-2.8:0,1.8,(close?0:near?4:13)-motion*(close?.08:.22));camera.rotation.set(0,Math.max(0,motion-2)*.024,0);
    scene.overrideMaterial=null;scene.background=background;renderer.setRenderTarget(null);renderer.render(scene,camera);
    const rawColor=new Uint8Array(width*height*4),gl=renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rawColor);
    scene.overrideMaterial=material;scene.background=new THREE.Color(0);renderer.setRenderTarget(target);renderer.render(scene,camera);
    const rawDepth=new Uint8Array(rawColor.length);renderer.readRenderTargetPixels(target,0,0,width,height,rawDepth);
    const color=new Uint8Array(rawColor.length),depth=new Uint8Array(rawDepth.length);
    for(let y=0;y<height;y++){color.set(rawColor.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);depth.set(rawDepth.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);}
    // Holds reuse identical scene captures, avoiding render quantization jitter.
    frames.push({width,height,color,depth,sceneGeometry,format:'packed-proximity-rg16',origin:'top-left',spacing,strength:.5,phase:t<2?'hold':'move',frameIndex:t,name:close?'First collectible close-up':near?'City near beacon':'City plaza walk and turn',nominalTimeMs:t*1000/15});await new Promise(r=>setTimeout(r,0));
  }}finally{target.dispose();material.dispose();disposeCity(scene,background);renderer.dispose();renderer.forceContextLoss();}
  return frames;
}
async function gpuRenderer(frames){
  if(!navigator.gpu)throw Error('WebGPU is unavailable. Select CPU reference.');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No GPU adapter. Select CPU reference.');
  const device=await adapter.requestDevice(),w=frames[0].width,h=frames[0].height,format='rgba8unorm';
  if(cancelled){device.destroy();throw Error('Benchmark cancelled');}
  // Own the device before any async pipeline creation can fail or be cancelled.
  const errors=[];gpu={destroy:()=>device.destroy(),adapter:[adapter.info?.vendor,adapter.info?.architecture].filter(Boolean).join(' '),errors};
  device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const input=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),color=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),output=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const filter=await DepthWalkGPU.create(device,format);filter.resize(w,h,input.createView(),color.createView());
  return async(frame,settings,reset)=>{if(reset)filter.resetHistory();device.queue.writeTexture({texture:input},frame.depth,{bytesPerRow:w*4},[w,h]);device.queue.writeTexture({texture:color},frame.color,{bytesPerRow:w*4},[w,h]);const encoder=device.createCommandEncoder();filter.encode(encoder,output.createView(),settings);device.queue.submit([encoder.finish()]);return filter.readPixels();};
}
function decisionText(decision){return decision.allGatesPassed?'Engineering gates passed; human comparison pending.':'Not promoted — failed: '+decision.checks.filter(c=>!c.pass).map(c=>c.label.toLowerCase()).join(', ')+'.';}
function showGates(report){
  $('gate-rows').replaceChildren();$('gates').hidden=!report.decisions.length;
  for(const decision of report.decisions){
    const label=report.results.find(r=>r.profile.id===decision.candidate).profile.label;
    for(const check of decision.checks){
      const format=value=>!Number.isFinite(value)?'unmeasured':['depth','support','colorConflict','stationary','colorLocality'].includes(check.key)?percent(value):value.toFixed(check.key==='motion'?4:2);
      const row=document.createElement('tr');row.className=check.pass?'':'fail';
      for(const value of [label,check.label,format(check.actual),(check.direction==='min'?'≥ ':'≤ ')+format(check.limit),check.pass?'PASS':'FAIL']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      $('gate-rows').append(row);
    }
  }
}
function analyze(frame,pixels){return worker.request({frame,pixels});}
function stop(){cancelled=true;setPlaying(false);worker?.destroy(Error('Benchmark cancelled'));gpu?.destroy();}
$('cancel').onclick=stop;
$('run').onclick=async()=>{
  $('compare').disabled=true;
  $('gates').hidden=true;$('gate-rows').replaceChildren();
  const id=++runId;cancelled=false;setPlaying(false);bundle=null;width=Number($('resolution').value);height=Math.round(width*9/16);spacing=Number($('spacing').value);$('run').disabled=true;$('cancel').disabled=false;$('download').disabled=true;$('rows').replaceChildren();$('inspection').hidden=true;$('live-preview').hidden=false;$('results').dataset.complete='false';delete $('results').dataset.error;delete $('results').dataset.report;delete $('spread').dataset.profile;
  $('decision').textContent='';$('report').textContent='Run in progress.';$('progress').value=0;$('preview-note').textContent='';
  for(const control of ['demo','dataset','backend','sweep','resolution','spacing','strength','direction'])$(control).disabled=true;
  try{
    if(!$('strength').value||!$('strength').checkValidity())throw Error('Depth strength must be between 0 and 50 percent.');
    $('status').textContent='Capturing repeatable scene inputs…';
    const dataset=$('dataset').value,captures=dataset.startsWith('isolated-')?isolationFrames({width,height,spacing,shape:dataset.slice(9)}):dataset==='synthetic'?syntheticFrames({width,height,spacing}):await cityFrames(dataset);
    const inverted=$('direction').value==='reversed';
    const inputs=captures.map(frame=>({...frame,strength:Number($('strength').value)/100,invertDepth:inverted,name:frame.name+(inverted?' · reversed relief':'')}));
    if(cancelled)throw Error('Benchmark cancelled');
    worker=new DiagnosticWorker(new Worker(new URL('../src/debug/observer.worker.js',import.meta.url),{type:'module'}));
    const rank=$('sweep').value==='rank',colorBase=$('sweep').value==='color-base',multiscale=$('sweep').value==='multiscale',appearance=$('sweep').value==='appearance'||multiscale;
    const backend=appearance||colorBase||rank?'cpu':$('backend').value,render=backend==='gpu'?await gpuRenderer(inputs):(frame,settings,reset)=>worker.request({kind:'render',frame,settings,reset});
    const ink=$('sweep').value==='ink';
    let profiles=rank?RANK_PROFILES.filter(p=>['quiet','anchor','original'].includes(p.id)):colorBase?COLOR_BASE_PROFILES:ink?INK_PROFILES:multiscale?MULTISCALE_PROFILES:appearance?APPEARANCE_PROFILES:$('sweep').value==='quiet-motion'?QUIET_MOTION_PROFILES:$('sweep').value==='full'?PROFILES:PROFILES.slice(0,4);
    if(imported&&$('sweep').value==='quiet-motion')profiles=profiles.map(p=>p.pattern==='quiet'?{...p,surfaceDetail:imported.surfaceDetail,edges:imported.edges,dotSize:imported.dotSize,label:`Quiet ${Math.round(imported.surfaceDetail*100)}${p.temporalStability?' + seed history':''} · city settings`}:p);
    const outcome=await runBenchmark(inputs,profiles,{render,analyze,retainFrames:true,cancelled:()=>cancelled||id!==runId,onProgress:p=>{$('status').textContent=`${p.profile} · frame ${p.frame}/${p.frames} · profile ${p.completed+1}/${p.total}`;$('progress').value=(p.completed+p.frame/p.frames)/p.total;paint('live',p.preview.pixels,p.preview.frame.width,p.preview.frame.height);}});
    if(cancelled)return;bundle={...outcome,inputs};const feasibility=outcome.report.constraintAnalysis;$('constraint-summary').textContent=`Exact RGB model: ${percent(feasibility.fractionPixelsInClassesWiderThanThreePeriods)} of pixels belong to chains wider than three periods; ${percent(feasibility.conflictingEndpointFraction)} of color-demanded endpoints conflict. Raw RGB error floor: ${num(feasibility.exactRGBSourceRMSELowerBound)} (not broad-color error or a fusion score).`;bundle.report.backend=backend;bundle.report.adapter=gpu?.adapter??null;bundle.report.gpuErrors=gpu?.errors??[];
    if(bundle.report.gpuErrors.length)throw Error(bundle.report.gpuErrors.join('; '));
    bundle.report.results.forEach((r,i)=>{
      const row=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');button.textContent=r.profile.label;button.setAttribute('aria-pressed',String(i===0));row.classList.toggle('chosen',i===0);button.onclick=()=>{setPlaying(false);selected=i;frameIndex=0;$('frame').value=0;showFrame();timeline(r);document.querySelectorAll('#rows tr').forEach((tr,j)=>{tr.classList.toggle('chosen',i===j);tr.querySelector('button').setAttribute('aria-pressed',String(i===j));});};cell.append(button);row.append(cell);
      for(const value of [percent(r.accuracy),percent(r.summary.supportedFraction),percent(r.summary.colorConflictFraction),percent(r.colorSpread.remoteFraction),num(r.motion.truthCorrectedDisparityRMS)+' px',num(r.motion.screenLumaRMS),num(r.broadColorRMSE),r.findings.map(f=>f.code).join(', ')]){const td=document.createElement('td');td.textContent=value;row.append(td);}$('rows').append(row);
    });
    $('inspection').hidden=false;$('live-preview').hidden=true;$('frame').max=bundle.previews[0].frames.length-1;$('frame').value=0;selected=0;frameIndex=0;showFrame();timeline(bundle.report.results[0]);
    const retained=bundle.report.preview.frameIndices.length;
    bundle.report.invertDepth=inverted;
    bundle.report.world=['city','near','close'].includes(dataset)?$('demo').value:null;
    bundle.report.sceneGeometry=inputs[0].sceneGeometry??null;
    $('preview-note').textContent=`All ${inputs.length} frames per profile were analyzed. ${retained} native frames per profile retained for inspection within a 128 MiB stereo-preview budget.${retained<inputs.length?' Playback is sampled; source frame numbers show the gaps.':''}`;
    $('play').disabled=retained<2;
    compareCandidate=rank?'anchor':colorBase?'color-base':ink?'ink':multiscale?'multiscale':'quiet-stable';$('compare').disabled=!bundle.previews.some(s=>s.profile.id===compareCandidate);
    showGates(bundle.report);
    $('decision').textContent=bundle.report.decisions.length?bundle.report.decisions.map(decisionText).join(' '):`Exploratory frontier: ${bundle.report.frontier.join(', ')||'none'}. This does not establish candidate acceptance or human comfort.`;
    $('status').textContent=`Complete · ${bundle.report.world?$('demo').selectedOptions[0].textContent+' · ':''}${inputs.length*profiles.length} analyzed frames · ${backend} · select a profile to inspect it.`;$('report').textContent=JSON.stringify(bundle.report,null,2);$('results').dataset.report=JSON.stringify(bundle.report);$('results').dataset.complete='true';$('download').disabled=false;
    if(rankPreview&&rank){
      rankPreview=false;$('compare').click();chooseComparison(compareCandidate);
      $('imported-settings').textContent='Prototype ready. B shows matching dots; A shows Quiet and C the original render. This is still an unaccepted prototype. Review the failed checks before judging motion or fusion.';
    }
  }catch(error){bundle=null;const message=cancelled?'Benchmark cancelled':error.message;$('status').textContent=message;$('report').textContent=message;$('results').dataset.error=message;$('live-preview').hidden=true;}
  finally{worker?.destroy();worker=null;gpu?.destroy();gpu=null;$('run').disabled=false;$('cancel').disabled=true;for(const control of ['demo','dataset','backend','sweep','resolution','spacing','strength','direction'])$(control).disabled=false;}
};
$('download').onclick=()=>{if(!bundle)return;const url=URL.createObjectURL(new Blob([JSON.stringify(bundle.report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='depthwalk-observer.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('pagehide',event=>{stop();cancelAnimationFrame(reliefRAF);reliefRAF=0;if(!event.persisted){reliefResize.disconnect();orbit?.dispose();relief?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});reliefRenderer?.dispose();}});
if(rankPreview)$('run').click();
