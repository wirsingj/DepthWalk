import './style.css';
import * as THREE from 'three';
import { createCity, disposeCity } from './city.js';
import { createDepthMaterial } from './adapters/three-depth.js';
import { createPlayer, stepPlayer, collectNearby, BEACONS } from './game.js';
import { requiredHalo } from './depthwalk.js';
import {AdaptiveQuality,targetFrameRate} from './performance.js';
import {VIEWING_DEFAULTS,loadPreferences,savePreferences} from './preferences.js';
import {stereoWindow} from './stereo-window.js';
import {comparisonQuery} from './debug/comparison-settings.js';
import {FoundationMotion} from './foundation-motion.js';
import {StereoWorkerClient} from './stereo-worker-client.js';
import {FrameDemand} from './frame-demand.js';
import {FoundationPreparation} from './foundation-preparation.js';
import {foundationCarrierKey,slicePreparedCarrier} from './foundation-carrier.js';

const $=id=>document.getElementById(id);
const isFoundation=()=>$('pattern').value.startsWith('foundation-');
const usesSceneColor=()=>Number($('stereo-window').value)>0||['scene','surface','quiet','chroma','chroma-soft'].includes($('pattern').value);
const temporalStability=()=>isFoundation()?false:$('pattern').value==='quiet'?$('quiet-stability').checked:$('motion-stability').checked;
function selectFoundation(carrier){
  $('pattern').value='foundation-'+carrier;$('spacing').value=VIEWING_DEFAULTS.spacing;$('strength').value=VIEWING_DEFAULTS.strength;$('stereo-window').value='0';$('invert-depth').checked=false;
}
function surfaceControls(){
  const foundation=isFoundation();
  $('renderer-status').textContent='Stereo: '+(foundation?'':'legacy · ')+$('pattern').selectedOptions[0].textContent;
  $('texture').value=foundation?$('pattern').value:'';$('texture').disabled=mode!=='stereo';
  if(foundation){$('stereo-window').value='0';$('invert-depth').checked=false;}
  const local=['chroma','chroma-soft'].includes($('pattern').value),active=['surface','quiet','chroma','chroma-soft'].includes($('pattern').value);
  $('surface-controls').hidden=!active;$('surface-detail').disabled=mode!=='stereo';
  $('surface-hint').textContent=$('pattern').value==='chroma-soft'?'Softer texture with more scene lighting. Try Quiet if colors look doubled.':local?'Local surface hues with flatter lighting. Try Quiet for more scene shading.':'Scene colors with continuous depth. Increase support for a stronger depth lock; wider spacing gives fewer repeats.';
  $('edges').disabled=mode!=='stereo'||local||foundation;
  for(const id of ['grain','stereo-window','invert-depth'])$(id).disabled=mode!=='stereo'||foundation;
  $('backend').disabled=mode!=='stereo';
  $('foundation-hint').hidden=!foundation;
  $('foundation-motion-controls').hidden=!foundation;$('foundation-motion').disabled=mode!=='stereo';
  $('motion-compare-open').hidden=!foundation;$('motion-compare-open').disabled=mode!=='stereo';
  $('motion-comparison').hidden=!foundation||!motionComparisonOpen;
  for(const id of ['motion-baseline','motion-candidate'])$(id).disabled=mode!=='stereo'||!$('foundation-motion').checked;
  $('motion-controls').hidden=!local;$('motion-stability').disabled=mode!=='stereo';
  $('quiet-motion-controls').hidden=$('pattern').value!=='quiet';$('quiet-stability').disabled=mode!=='stereo';
}
const world=$('world'), stereo=$('stereo'), ctx=stereo.getContext('2d',{alpha:false});
const gpuCanvas=$('gpu-stereo');let gpu=null,gpuFailure='',gpuPending=true;
let gpuStart=null,gpuGeneration=0,pageClosed=false;
const startupStats={gpuStarts:0,firstPresentationMs:null,firstBackend:null};
const useGPU=()=>!!gpu&&!gpu.failed&&$('backend').value!=='cpu';
const query=new URLSearchParams(location.search);
const motionCadence='baseline';
let grainTrial=query.get('motion-compare')==='contrast'?'contrast':'baseline';
const carrierContrast=()=>isFoundation()&&grainTrial==='contrast'?.5:1;
let motionComparisonOpen=query.has('motion-compare');
$('demo').value=query.get('world')==='retro'?'retro':'original';
{
  let preferences={...VIEWING_DEFAULTS};
  if(!query.has('verify'))try{preferences=loadPreferences(localStorage);}catch{/* Storage may be blocked by browser policy. */}
  for(const [id,value] of Object.entries(preferences)){if(typeof value==='boolean')$(id).checked=value;else $(id).value=value;}
}
if(!query.has('verify')){
  const save=()=>{const values=Object.fromEntries(Object.keys(VIEWING_DEFAULTS).map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));try{savePreferences(localStorage,values);}catch{/* Viewing controls remain usable without storage. */}};
  for(const id of Object.keys(VIEWING_DEFAULTS))$(id).addEventListener('change',save);
}
if(['auto','1','0.75','0.5'].includes(query.get('quality')))$('quality').value=query.get('quality');
if(['binary','white','pink'].includes(query.get('foundation'))){
  selectFoundation(query.get('foundation'));
}
if(isFoundation()){$('stereo-window').value='0';$('invert-depth').checked=false;}
$('spacing-value').textContent=$('spacing').value+' px';$('strength-value').textContent=$('strength').value+'%';$('surface-value').textContent=$('surface-detail').value+'%';
function comparisonDirection(){
  $('quiet-comparison').href='./tests/observer-lab.html?'+comparisonQuery({invertDepth:$('invert-depth').checked,spacing:Number($('spacing').value),strength:Number($('strength').value)/100,surfaceDetail:Number($('surface-detail').value)/100,edges:Number($('edges').value),dotSize:Number($('grain').value)})+'&world='+$('demo').value;
  $('banding-comparison').href='./tests/observer-lab.html?preview=rank&world='+$('demo').value;
  document.querySelector('.edition').textContent=$('demo').value==='retro'?'BLOCK STUDY':'ORIGINAL CITY';
  document.body.dataset.demo=$('demo').value;
}
comparisonDirection();
for(const id of ['spacing','strength','surface-detail','edges','grain'])for(const event of ['input','change'])$(id).addEventListener(event,comparisonDirection);
if(query.get('renderer')==='cpu')$('backend').value='cpu';
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas:world,antialias:false,powerPreference:'high-performance'}); }
catch(e){$('fatal').hidden=false;$('fatal').textContent='Depthwalk needs WebGL. Open this page in a desktop browser with hardware acceleration enabled.';throw e;}
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
let {scene,beaconMeshes}=createCity({style:$('demo').value});
let background=scene.background;
const depthMaterial=createDepthMaterial();
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,110);
camera.rotation.order='YXZ';
const target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
target.texture.colorSpace=THREE.NoColorSpace;
// Independent scanlines can be encoded concurrently without seam artifacts.
const workers=Array.from({length:Math.max(1,Math.min(4,(navigator.hardwareConcurrency||4)-1))},()=>({worker:new StereoWorkerClient(new Worker(new URL('./stereo.worker.js',import.meta.url),{type:'module'})),depth:null,output:null}));
const player=createPlayer(), keys=new Set(), found=new Set();
let mode='stereo',started=false, paused=true, hiddenHUD=false;
let centerGuide=true;
let width=0,height=0,scale=1,version=0,busy=false,ready=false;
let depthBuffer,frameImage,pending=0,frameCount=0,lastStats=performance.now(),lastFrame=0;
let stereoMs=0, presented=0, readMs=0;
let colorMs=0,submitTime=0,workAverage=0,rafCount=0,debugCapture=null,debuggerUI=null,debuggerLoading=null,cpuFailed=false;
const adaptive=new AdaptiveQuality();
const foundationMotion=new FoundationMotion();
const frameDemand=new FrameDemand();
const foundationPreparation=new FoundationPreparation(()=>new Worker(new URL('./foundation-preparation.worker.js',import.meta.url),{type:'module'}));
let carrierRequest=null;
let holdingFrame=false,activeRenderTicks=0;
let frameNoiseFrame=0;
const motionFrame=()=>foundationMotion.update([player.x,player.z,player.yaw,player.pitch,found.size].join('/'),performance.now(),isFoundation()&&$('foundation-motion').checked,motionCadence);
let lastNoiseUpdates=0,lastMovingFrames=0;
function motionComparisonUI(){
  $('motion-compare-open').setAttribute('aria-expanded',String(motionComparisonOpen));
  $('motion-compare-open').textContent=motionComparisonOpen?'Hide movement comparison':grainTrial==='contrast'?'Movement: B · show comparison':'Compare moving grain';
  $('motion-baseline').setAttribute('aria-pressed',String(grainTrial==='baseline'));
  $('motion-candidate').setAttribute('aria-pressed',String(grainTrial==='contrast'));
  $('motion-comparison-status').textContent=(grainTrial==='contrast'?'B · Half contrast':'A · Current contrast')+'. Grain holds while stopped.';
  surfaceControls();
}
const verifying=import.meta.env.DEV&&query.has('verify');
let diagnosticCapture=verifying;
let verificationFrame=null,frameCamera=null,capturedSceneKey=null;

function resize(){
  const quality=$('quality').value==='auto'?adaptive.factor:Number($('quality').value), dpr=window.devicePixelRatio||1;
  // Native pixels up to 8.3 MP (4K). CSS spacing is independent of this cap.
  const foundation=isFoundation(),limit=foundation?2000000:8294400,axis=foundation?2048:8192;
  scale=Math.min(dpr*quality,Math.sqrt(limit/(innerWidth*innerHeight)),axis/innerWidth,axis/innerHeight);
  width=Math.max(1,Math.round(innerWidth*scale));height=Math.max(1,Math.round(innerHeight*scale));
  scale=width/innerWidth;
  renderer.setSize(width,height,false);target.setSize(width,height);
  stereo.width=width;stereo.height=height;
  if(gpu&&!gpu.failed){try{gpu.resize(width,height);}catch(error){gpu.fail(error.message);}}
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  version++;ready=false;
  depthBuffer=new Uint8Array(width*height*4);frameImage=new ImageData(width,height);capturedSceneKey=null;
  $('resolution').textContent=`${width} × ${height}`;
  updateSurround();
}
function updateSurround(){
  const periods=Number($('stereo-window').value),region=stereoWindow(width,Number($('spacing').value),scale,periods);
  const surround=$('stereo-surround');surround.hidden=mode!=='stereo'||!periods;
  surround.style.setProperty('--left-width',`${region.left/scale}px`);
  surround.style.setProperty('--right-width',`${(width-region.right)/scale}px`);
  $('stereo-window').disabled=mode!=='stereo'||isFoundation();
}
function notice(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').classList.remove('visible'),4300);}
function stop(){keys.clear();player.vx=player.vz=player.turn=0;}
function setView(next){
  mode=next;version++;ready=false;
  updateSurround();
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===mode);b.setAttribute('aria-pressed',b.dataset.view===mode);});
  updateBackend();world.hidden=mode==='stereo';
  updateAlignment();
  document.querySelectorAll('input[type=range]').forEach(el=>el.disabled=mode!=='stereo');
  $('pattern').disabled=mode!=='stereo';
  $('grain').disabled=mode!=='stereo';
  $('invert-depth').disabled=mode!=='stereo';
  $('edges').disabled=mode!=='stereo';
  surfaceControls();
}
function updateBackend(){
  const active=useGPU();stereo.hidden=mode!=='stereo'||active;gpuCanvas.hidden=mode!=='stereo'||!active;
  $('backend-status').textContent=active?`GPU · ${gpu.adapterName||'WebGPU'}`:gpuPending&&$('backend').value!=='cpu'?'Starting GPU…':gpuFailure&&$('backend').value!=='cpu'?`CPU fallback · ${gpuFailure}`:'CPU · Web Workers';
  $('live-backend').textContent=active?'WebGPU':gpuPending&&$('backend').value!=='cpu'?'Starting GPU':isFoundation()?'CPU reference':'CPU workers';
  $('performance').dataset.backend=active?'gpu':'cpu';
  $('performance').title=$('backend-status').textContent;
  if(cpuFailed&&!active&&!gpuPending&&$('fatal').dataset.reason!=='webgl'){
    $('fatal').dataset.reason='cpu';$('fatal').hidden=false;$('fatal').textContent='The CPU stereo renderer stopped. Reload the page to restart it.';
  }else if($('fatal').dataset.reason==='cpu')$('fatal').hidden=true;
}
$('backend').addEventListener('change',()=>{
  version++;ready=false;stop();
  if($('backend').value==='cpu')invalidateGPU();
  else{gpuFailure='';startGPU();}
  updateBackend();$('backend').blur();
});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view);b.blur();}));
$('spacing').addEventListener('input',()=>{
  $('spacing-value').textContent=`${$('spacing').value} px`;
  document.documentElement.style.setProperty('--spacing',`${$('spacing').value}px`);version++;ready=false;
  updateSurround();
});
$('strength').addEventListener('input',()=>{$('strength-value').textContent=`${$('strength').value}%`;version++;ready=false;});
$('quality').addEventListener('change',()=>{resize();$('quality').blur();});
$('stereo-window').addEventListener('change',()=>{version++;ready=false;updateSurround();});
$('pattern').addEventListener('change',()=>{version++;ready=false;surfaceControls();resize();updateBackend();$('pattern').blur();});
$('texture').addEventListener('change',()=>{
  stop();$('pattern').value=$('texture').value;$('pattern').dispatchEvent(new Event('change'));$('texture').blur();
});
$('surface-detail').addEventListener('input',()=>{$('surface-value').textContent=$('surface-detail').value+'%';version++;ready=false;});
$('motion-stability').addEventListener('change',()=>{version++;ready=false;});
$('quiet-stability').addEventListener('change',()=>{version++;ready=false;});
$('foundation-motion').addEventListener('change',()=>{version++;ready=false;stop();surfaceControls();});
$('motion-compare-open').addEventListener('click',()=>{stop();motionComparisonOpen=!motionComparisonOpen;motionComparisonUI();$('motion-compare-open').blur();});
for(const [id,cadence] of [['motion-baseline','baseline'],['motion-candidate','contrast']])$(id).addEventListener('click',()=>{
  stop();grainTrial=cadence;version++;ready=false;
  const url=new URL(location.href);url.searchParams.set('motion-compare',cadence);history.replaceState(null,'',url);
  motionComparisonUI();$(id).blur();
});
$('invert-depth').addEventListener('change',()=>{version++;ready=false;stop();comparisonDirection();});
$('grain').addEventListener('change',()=>{version++;ready=false;$('grain').blur();});
$('edges').addEventListener('change',()=>{version++;ready=false;$('edges').blur();});
$('reset-viewing').addEventListener('click',()=>{
  stop();
  grainTrial='baseline';const url=new URL(location.href);url.searchParams.delete('motion-compare');history.replaceState(null,'',url);
  motionComparisonUI();
  for(const [id,value] of Object.entries(VIEWING_DEFAULTS)){
    const control=$(id);if(typeof value==='boolean')control.checked=value;else control.value=value;
    if(control.type==='range')control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('change'));
  }
  notice('Latest defaults restored. Your position and signals are unchanged.');$('reset-viewing').blur();
});
$('collapse').addEventListener('click',()=>{const open=$('tuning-body').hidden;$('tuning-body').hidden=!open;$('collapse').textContent=open?'−':'+';$('collapse').setAttribute('aria-expanded',open);$('collapse').setAttribute('aria-label',open?'Collapse viewing controls':'Expand viewing controls');});
$('begin').addEventListener('click',()=>{started=true;paused=false;$('intro').hidden=true;$('mission').hidden=false;document.body.classList.add('playing');stop();$('begin').blur();});
$('help').addEventListener('click',()=>{if(document.pointerLockElement)document.exitPointerLock();const opening=$('intro').hidden;$('intro').hidden=!opening;paused=opening||!started;stop();});
function hud(){hiddenHUD=!hiddenHUD;$('interface').hidden=hiddenHUD;$('show-hud').hidden=!hiddenHUD;}
function updateAlignment(){
  $('alignment').hidden=mode!=='stereo';
  $('center-alignment').hidden=mode!=='stereo'||!centerGuide;
  $('center-guide').setAttribute('aria-pressed',String(centerGuide));
  $('center-guide').disabled=mode!=='stereo';
}
function toggleAlignment(){
  if(mode!=='stereo')return;
  centerGuide=!centerGuide;updateAlignment();
}
$('center-guide').addEventListener('click',()=>{toggleAlignment();$('center-guide').blur();});
$('hide').addEventListener('click',hud);$('show-hud').addEventListener('click',hud);
$('keep-walking').addEventListener('click',()=>{$('complete').hidden=true;paused=false;stop();});
async function capture(){
  if(!started||paused){notice('Enter the city first. Arrow keys turn without mouse capture.');return;}
  try { await document.body.requestPointerLock(); }
  catch{notice('Mouse capture is unavailable here. Use the arrow keys to turn.');}
}
$('capture').addEventListener('click',capture);
stereo.addEventListener('click',capture);world.addEventListener('click',capture);
gpuCanvas.addEventListener('click',capture);
document.addEventListener('pointerlockchange',()=>{$('capture').textContent=document.pointerLockElement?'Esc · release mouse':'Mouse look ↗';stop();});
document.addEventListener('pointerlockerror',()=>notice('Mouse capture was declined. Arrow keys still turn the view.'));
document.addEventListener('mousemove',e=>{
  if(!document.pointerLockElement||paused)return;
  player.yaw-=Math.max(-100,Math.min(100,e.movementX))*.00125;
  player.pitch=Math.max(-.45,Math.min(.45,player.pitch-e.movementY*.001));
});
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{notice('Fullscreen is unavailable in this panel. Open this address in a desktop browser.');}
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').innerHTML=document.fullscreenElement?'⛶ <span>Exit fullscreen</span>':'⛶ <span>Fullscreen</span>';resize();});
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(document.pointerLockElement)document.exitPointerLock();debuggerUI?.close();stop();return;}
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='F3'&&!e.repeat){e.preventDefault();toggleDebug();return;}
  if(e.code==='KeyT'||e.code==='KeyY'){e.preventDefault();if(!e.repeat&&!debuggerUI?.isOpen)toggleAlignment();return;}
  if(e.code==='KeyR'&&!e.repeat){e.preventDefault();if(!debuggerUI?.isOpen)setView(['stereo','normal','depth'][(['stereo','normal','depth'].indexOf(mode)+1)%3]);return;}
  if(e.code==='KeyE'&&!e.repeat){
    e.preventDefault();if(debuggerUI?.isOpen)return;
    const options=[...$('pattern').options].filter(option=>$('advanced-settings').open||option.value.startsWith('foundation-'));
    $('pattern').value=options[(options.findIndex(option=>option.value===$('pattern').value)+1)%options.length].value;
    $('pattern').dispatchEvent(new Event('change'));notice($('pattern').selectedOptions[0].textContent);return;
  }
  if(e.code==='KeyH'&&!e.repeat&&!debuggerUI?.isOpen){hud();return;}
  if(['KeyW','KeyA','KeyS','KeyD','KeyQ','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){
    e.preventDefault();if(started&&!paused)keys.add(e.code);
  }
});
window.addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('focusin',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))stop();});
window.addEventListener('blur',stop);
document.addEventListener('visibilitychange',stop);
window.addEventListener('resize',resize);
world.addEventListener('webglcontextlost',e=>{e.preventDefault();stop();$('fatal').dataset.reason='webgl';$('fatal').hidden=false;$('fatal').textContent='The graphics context was interrupted. Reload this page to return to the plaza.';});
function failCPU(error){
  if(cpuFailed)return;
  cpuFailed=true;busy=false;pending=0;workers.forEach(slot=>slot.worker.destroy(error));
  updateBackend();
  debugCapture?.reject(Error('CPU stereo renderer failed'));console.error(error);
}
function acceptWorkerFrame(slot,data){
    if(cpuFailed)return;
    slot.depth=new Uint8Array(data.buffer);slot.output=data.output;
    slot.color=data.color?new Uint8Array(data.color):null;
    pending--;if(pending===0)busy=false;
    // Never mix scanlines from different resolutions or settings.
    if(data.version!==version||data.width!==width||useGPU())return;
    stereoMs=Math.max(stereoMs,data.ms);
    frameImage.data.set(new Uint8ClampedArray(data.output),data.yOffset*width*4);
    if(pending!==0)return;
    ctx.putImageData(frameImage,0,0);
    if(diagnosticCapture||debugCapture){
      const frame={depth:depthBuffer.slice(),color:usesSceneColor()?sceneBuffer.slice():undefined,pixels:new Uint32Array(frameImage.data.buffer.slice(0)),width,height,camera:frameCamera,spacing:Math.round(Number($('spacing').value)*scale),strength:Number($('strength').value)/100,pattern:$('pattern').value,surfaceDetail:Number($('surface-detail').value)/100,windowPeriods:Number($('stereo-window').value),temporalStability:temporalStability()};
      frame.invertDepth=$('invert-depth').checked;frame.edges=isFoundation()?0:Number($('edges').value);
      frame.dotSize=isFoundation()?1/scale:Number($('grain').value);frame.pixelRatio=scale;frame.depthRange=22;frame.noiseFrame=frameNoiseFrame;frame.motionCadence=motionCadence;frame.carrierContrast=carrierContrast();frame.grainTrial=grainTrial;acceptCapture(frame);
    }
    workAverage=performance.now()-submitTime;
    ready=true;frameCount++;presented++;
    if(startupStats.firstPresentationMs===null){startupStats.firstPresentationMs=performance.now();startupStats.firstBackend='cpu';}
}
function updateScene(dt){
  if(started&&!paused&&!document.hidden)stepPlayer(player,keys,dt);
  camera.position.set(player.x,1.8,player.z);camera.rotation.set(player.pitch,player.yaw,0);
  const newly=started&&!paused?collectNearby(player,found):[];
  newly.forEach(i=>{
    beaconMeshes[i].visible=false;$('count').textContent=found.size;
    $('signals').children[i].classList.add('found');notice(`Signal ${found.size} / 5 — ${BEACONS[i].name}`);
  });
  if(newly.length&&found.size===5){$('complete').hidden=false;paused=true;stop();if(document.pointerLockElement)document.exitPointerLock();}
  $('location').textContent=Math.abs(player.x)<8&&Math.abs(player.z)<8?'CENTRAL PLAZA':player.z<-18?'NORTH PASSAGES':player.z>18?'SOUTH GARDENS':player.x>8?'EAST PROMENADE':player.x<-8?'WEST ARCADES':'PLAZA APPROACH';
}
let sceneBuffer;
function acceptCapture(frame){
  if(diagnosticCapture)verificationFrame=frame;
  debugCapture?.resolve({...frame,pixels:frame.pixels.slice(),depth:frame.depth.slice()});
}
function renderSceneColor(){
  scene.overrideMaterial=null;scene.background=background;renderer.setRenderTarget(null);renderer.render(scene,camera);return world;
}
let debugWasPaused=false,debugWasView='stereo';
function captureForDebugger(signal){
  debugCapture?.reject(Error('Capture superseded'));
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
    const finish=(complete,value)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(debugCapture===request)debugCapture=null;complete(value);};
    const request={resolve:frame=>finish(resolve,frame),reject:error=>finish(reject,error)};
    const abort=()=>request.reject(signal.reason||Error('Capture cancelled'));
    const timer=setTimeout(()=>request.reject(Error('Capture timed out. Check the renderer status and retry.')),15000);
    signal.addEventListener('abort',abort,{once:true});debugCapture=request;setView('stereo');ready=false;
  });
}
async function toggleDebug(){
  if(!debuggerUI){
    if(debuggerLoading)return;
    debuggerLoading=import('./debug/panel.js');
    let createStereoDebugger;
    try{({createStereoDebugger}=await debuggerLoading);}catch(error){notice('Debugger could not load: '+error.message);return;}finally{debuggerLoading=null;}
    debuggerUI=createStereoDebugger({
      capture:captureForDebugger,
      onOpen:()=>{if(document.pointerLockElement)document.exitPointerLock();debugWasPaused=paused;debugWasView=mode;paused=true;stop();},
      onClose:()=>{paused=debugWasPaused;stop();setView(debugWasView);},
      getPerformance:()=>({backend:useGPU()?'WebGPU':'CPU workers',adapter:gpu?.adapterName||null,fallback:gpuFailure||null,completionMs:workAverage,colorMs,readbackMs:readMs,width,height,quality:$('quality').value}),
    });
  }
  debuggerUI.toggle();
}
$('debug-open').addEventListener('click',toggleDebug);
function preparedFoundationCarrier(){
  const specification={width,height,carrier:$('pattern').value.slice(11),seed:173};
  const key=foundationCarrierKey(specification);
  if(carrierRequest?.key!==key){
    const request={key,data:null,error:null};carrierRequest=request;
    if($('fatal').dataset.reason==='texture'){$('fatal').hidden=true;delete $('fatal').dataset.reason;}
    $('renderer-status').textContent='Preparing depth texture…';
    foundationPreparation.prepare(specification).then(data=>{
      if(carrierRequest!==request||pageClosed)return;
      request.data=data;surfaceControls();
    }).catch(error=>{
      if(carrierRequest!==request||pageClosed)return;
      request.error=error;
      debugCapture?.reject(error);console.error(error);
    });
  }
  if(carrierRequest.error&&!['webgl','cpu'].includes($('fatal').dataset.reason)){
    $('fatal').dataset.reason='texture';$('fatal').hidden=false;
    $('fatal').textContent='The depth texture could not be prepared. Reload the page to retry.';
  }
  return carrierRequest.data;
}
function render(){
  if(mode==='stereo'&&isFoundation()&&Math.max(8,Math.round(Number($('spacing').value)*scale))>=width){
    stop();
    if(!cpuFailed&&$('fatal').dataset.reason!=='webgl'){
      $('fatal').dataset.reason='size';$('fatal').hidden=false;$('fatal').textContent='Widen this window to show the depth pattern.';
    }
    return false;
  }
  if($('fatal').dataset.reason==='size'){$('fatal').hidden=true;delete $('fatal').dataset.reason;}
  if((mode!=='stereo'||!isFoundation())&&$('fatal').dataset.reason==='texture')$('fatal').hidden=true;
  const needsCarrier=mode==='stereo'&&isFoundation()&&(!foundationMotion.frame||!$('foundation-motion').checked);
  const preparedCarrier=needsCarrier?preparedFoundationCarrier():null;
  if(needsCarrier&&!preparedCarrier)return false;
  scene.overrideMaterial=mode==='normal'?null:depthMaterial;
  scene.background=mode==='normal'?background:new THREE.Color(0);
  depthMaterial.uniforms.preview.value=mode==='depth';
  if(mode==='stereo'){
    if(useGPU()){
      if(preparedCarrier)gpu.installPreparedCarrier(preparedCarrier,carrierRequest.key);
      const frameVersion=version;
      const settings={pixelRatio:scale,spacing:Number($('spacing').value),depthStrength:Number($('strength').value)/100,dotSize:Number($('grain').value),edges:Number($('edges').value),pattern:$('pattern').value,surfaceDetail:Number($('surface-detail').value)/100,windowPeriods:Number($('stereo-window').value),temporalStability:temporalStability()};
      settings.motionCadence=motionCadence;settings.carrierContrast=carrierContrast();settings.grainTrial=grainTrial;
      if(isFoundation()){settings.edges=0;settings.dotSize=1/scale;settings.windowPeriods=0;}
      settings.invertDepth=$('invert-depth').checked;
      return gpu.render(camera,()=>{settings.noiseFrame=motionFrame();return settings;},result=>{
        if(frameVersion!==version||mode!=='stereo'||!useGPU())return;
        stereoMs=result.ms;workAverage=stereoMs;colorMs=result.colorMs;readMs=0;ready=true;frameCount++;presented++;
        if(startupStats.firstPresentationMs===null){startupStats.firstPresentationMs=performance.now();startupStats.firstBackend='gpu';}
        if(result.frame)acceptCapture({...result.frame,width:result.width,height:result.height,camera:result.camera,spacing:Math.round(settings.spacing*settings.pixelRatio),strength:settings.depthStrength,pattern:settings.pattern,surfaceDetail:settings.surfaceDetail,windowPeriods:settings.windowPeriods,temporalStability:settings.temporalStability,invertDepth:settings.invertDepth,edges:settings.edges,dotSize:settings.dotSize,pixelRatio:settings.pixelRatio,noiseFrame:settings.noiseFrame,motionCadence:settings.motionCadence,carrierContrast:settings.carrierContrast,grainTrial:settings.grainTrial,depthRange:22,backend:'gpu'});
      },diagnosticCapture||!!debugCapture,renderSceneColor);
    }
    if(busy||cpuFailed)return false;
    frameNoiseFrame=motionFrame();
    submitTime=performance.now();colorMs=0;
    // This demo is static apart from its camera and collected beacon visibility.
    // Reuse identical inputs at rest: repeated WebGL draws can vary by one RG16
    // depth unit at rounding boundaries and unnecessarily reshuffle stereo seeds.
    const captureKey=[width,height,camera.aspect,camera.fov,usesSceneColor(),player.x,player.z,player.yaw,player.pitch,found.size].join('/');
    readMs=0;
    if(captureKey!==capturedSceneKey){
      if(usesSceneColor()){
        renderSceneColor();
        if(sceneBuffer?.length!==width*height*4)sceneBuffer=new Uint8Array(width*height*4);
        const gl=renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,sceneBuffer);
        colorMs=performance.now()-submitTime;
        scene.overrideMaterial=depthMaterial;scene.background=new THREE.Color(0);
      }
      renderer.setRenderTarget(target);renderer.render(scene,camera);
      frameCamera=camera.clone();
      if(!depthBuffer||depthBuffer.byteLength!==width*height*4)depthBuffer=new Uint8Array(width*height*4);
      const t=performance.now();renderer.readRenderTargetPixels(target,0,0,width,height,depthBuffer);readMs=performance.now()-t;
      capturedSceneKey=captureKey;
    }
    const activeWorkers=workers.slice(0,Math.min(workers.length,height));
    busy=true;pending=activeWorkers.length;stereoMs=0;
    activeWorkers.forEach((slot,i)=>{
      const yOffset=Math.floor(i*height/activeWorkers.length),stripeHeight=Math.floor((i+1)*height/activeWorkers.length)-yOffset;
      const edges=isFoundation()?0:Number($('edges').value),halo=isFoundation()?0:requiredHalo(scale,edges);
      const topHalo=Math.min(halo,yOffset),bottomHalo=Math.min(halo,height-yOffset-stripeHeight);
      const inputHeight=stripeHeight+topHalo+bottomHalo,length=width*inputHeight*4;
      if(!slot.depth||slot.depth.byteLength!==length)slot.depth=new Uint8Array(length);
      if(slot.output?.byteLength!==width*stripeHeight*4)slot.output=null;
      const src=(height-yOffset-stripeHeight-bottomHalo)*width*4;
      slot.depth.set(depthBuffer.subarray(src,src+length));
      if(usesSceneColor()){
        if(slot.color?.byteLength!==length)slot.color=new Uint8Array(length);
        slot.color.set(sceneBuffer.subarray(src,src+length));
      }
      const message={width,height:stripeHeight,fullHeight:height,inputHeight,topHalo,bottomHalo,edges,yOffset,spacing:Number($('spacing').value),strength:Number($('strength').value)/100,pattern:$('pattern').value,surfaceDetail:Number($('surface-detail').value)/100,windowPeriods:Number($('stereo-window').value),temporalStability:temporalStability(),grain:Number($('grain').value),verticalFov:camera.fov,scale,version,buffer:slot.depth.buffer,output:slot.output};
      message.invertDepth=$('invert-depth').checked;
      message.noiseFrame=frameNoiseFrame;message.carrierContrast=carrierContrast();
      const transfers=[slot.depth.buffer];if(slot.output)transfers.push(slot.output);
      if(preparedCarrier){
        const carrierKey=`${carrierRequest.key}/${yOffset}/${stripeHeight}`;
        if(slot.carrierKey!==carrierKey){
          message.preparedCarrier=slicePreparedCarrier(preparedCarrier,yOffset,stripeHeight);
          transfers.push(message.preparedCarrier.tones.buffer);slot.carrierKey=carrierKey;
        }
      }
      if(usesSceneColor()){message.color=slot.color.buffer;transfers.push(message.color);slot.color=null;}
      slot.worker.render(message,transfers).then(data=>acceptWorkerFrame(slot,data)).catch(failCPU);slot.depth=null;slot.output=null;
    });
  }else{
    renderer.setRenderTarget(null);renderer.render(scene,camera);frameCount++;
  }
  return true;
}
let previous=performance.now(), lastDpr=devicePixelRatio;
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(lastDpr!==devicePixelRatio){lastDpr=devicePixelRatio;resize();}
  if(document.hidden)return;
  // Also service outstanding captures while the reconstruction panel is paused.
  gpu?.poll(now);
  rafCount++;
  updateScene(dt);
  // Only this static demo's foundation output can be held without convergence.
  // Version includes controls/resize/world/backend changes. Captures always run.
  const frameKey=[version,mode,useGPU(),player.x,player.z,player.yaw,player.pitch,found.size].join('/');
  const canHold=mode==='stereo'&&isFoundation()&&!diagnosticCapture&&!debugCapture;
  holdingFrame=canHold&&!frameDemand.shouldRender(frameKey);
  if(!holdingFrame)activeRenderTicks++;
  // Stereo at up to 40 fps leaves time for input and compositor on desktop CPUs.
  if(!holdingFrame&&(!debuggerUI?.isOpen||debugCapture)&&(mode!=='stereo'||useGPU()||(!busy&&now-lastFrame>=25))){
    if(render())frameDemand.accepted(frameKey);
    lastFrame=now;
  }
  if(now-lastStats>1000){
    const fps=Math.round(frameCount*1000/(now-lastStats)),refresh=Math.round(rafCount*1000/(now-lastStats));
    const grainHz=Math.round((foundationMotion.refreshes-lastNoiseUpdates)*1000/(now-lastStats)),movingStereoHz=Math.round((foundationMotion.movingFrames-lastMovingFrames)*1000/(now-lastStats));
    lastNoiseUpdates=foundationMotion.refreshes;lastMovingFrames=foundationMotion.movingFrames;
    $('motion-comparison-status').textContent=(grainTrial==='contrast'?'B · Half contrast':'A · Current contrast')+(!isFoundation()||!$('foundation-motion').checked?' · grain refresh off':movingStereoHz?` · ${grainHz} grain updates / ${movingStereoHz} moving frames per second`:' · standing still; grain held');
    const idle=holdingFrame&&ready;
    $('fps').textContent=$('live-fps').textContent=debuggerUI?.isOpen?'Analysis paused':idle?'Still · grain held':`${fps} fps`;
    $('perf-detail').textContent=debuggerUI?.isOpen?'One-frame inspection · F3 resumes play':idle?'Scene unchanged · updates on movement':mode==='stereo'?`${width}×${height} · ${workAverage.toFixed(1)} ms ${useGPU()?'completion':'frame'}${diagnosticCapture?' · QA readback':!useGPU()?` · read ${readMs.toFixed(1)} ms`:''}`:`Colored/depth view · ${refresh} Hz callbacks`;
    $('performance').dataset.details=JSON.stringify({fps,idle,refresh,grainHz,movingStereoHz,motionCadence,grainTrial,carrierContrast:carrierContrast(),completionMs:workAverage,colorMs,readMs,diagnosticCapture,autoScale:adaptive.factor,fallback:gpuFailure,adapter:gpu?.adapterName});
    if(activeRenderTicks<rafCount*.9)adaptive.slow=adaptive.fast=0;
    else if(mode==='stereo'&&!diagnosticCapture&&!debuggerUI?.isOpen&&$('quality').value==='auto'&&adaptive.update(fps,workAverage,now,targetFrameRate(refresh,!useGPU())))resize();
    frameCount=0;rafCount=0;activeRenderTicks=0;lastStats=now;
    world.dataset.state=JSON.stringify({x:+player.x.toFixed(3),z:+player.z.toFixed(3),yaw:+player.yaw.toFixed(4),pitch:+player.pitch.toFixed(4),mode,pattern:$('pattern').value,noiseFrame:isFoundation()&&$('foundation-motion').checked?foundationMotion.frame:0,backend:useGPU()?'gpu':'cpu',found:found.size,width,height,scale,stereoMs:+stereoMs.toFixed(1),readMs:+readMs.toFixed(1),presented,pointerLocked:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement});
  }
}
document.documentElement.style.setProperty('--spacing',`${$('spacing').value}px`);
resize();setView('stereo');requestAnimationFrame(loop);
motionComparisonUI();
function invalidateGPU(){
  gpuGeneration++;gpu?.destroy();gpu=null;gpuFailure='';gpuPending=false;
}
async function startGPU(){
  if(pageClosed||$('backend').value==='cpu'){
    gpuPending=false;updateBackend();return;
  }
  if(useGPU()||gpuFailure)return;
  if(gpuStart){await gpuStart;return startGPU();}
  const generation=++gpuGeneration,sourceScene=scene,sourceBeacons=beaconMeshes;
  const current=()=>!pageClosed&&generation===gpuGeneration&&sourceScene===scene&&$('backend').value!=='cpu';
  gpuPending=true;updateBackend();
  gpuStart=(async()=>{
    let candidate=null;
    try{
      const {GPUCityRenderer}=await import('./gpu/city-renderer.js');
      if(!current())return;
      startupStats.gpuStarts++;
      candidate=await GPUCityRenderer.create(gpuCanvas,sourceScene,sourceBeacons,reason=>{
        if(!current())return;
        gpuFailure=reason;version++;ready=false;updateBackend();
      });
      if(!current()){candidate.destroy();return;}
      candidate.resize(width,height);gpu=candidate;
    }catch(error){
      candidate?.destroy();
      if(current())gpuFailure=error.message;
    }finally{
      gpuStart=null;
      if(current()){gpuPending=false;version++;ready=false;verificationFrame=null;updateBackend();}
    }
  })();
  return gpuStart;
}
const backendReady=startGPU();
backendReady.then(()=>{$('demo').disabled=false;});
$('demo').addEventListener('change',async()=>{
  stop();$('demo').disabled=true;
  if(debuggerUI?.isOpen)await toggleDebug();
  const previous=scene,previousBackground=background;
  ({scene,beaconMeshes}=createCity({style:$('demo').value}));background=scene.background;
  for(const i of found)beaconMeshes[i].visible=false;
  invalidateGPU();
  if(!cpuFailed)for(const slot of workers)slot.worker.resetHistory().catch(failCPU);
  version++;ready=false;verificationFrame=null;capturedSceneKey=null;
  disposeCity(previous,previousBackground);comparisonDirection();updateBackend();
  const url=new URL(location.href);url.searchParams.set('world',$('demo').value);history.replaceState(null,'',url);
  await startGPU();$('demo').disabled=false;$('demo').blur();
  notice('World changed. Position, signals and viewing settings kept.');
});
window.addEventListener('pagehide',event=>{
  stop();debugCapture?.reject(Error('Page closed'));
  if(!event.persisted){pageClosed=true;workers.forEach(slot=>slot.worker.destroy());foundationPreparation.destroy();invalidateGPU();}
});

// Read-only diagnostics for QA: never changes gameplay or bypasses input.
Object.defineProperty(window,'depthwalk',{value:{get state(){return {player:{...player},found:[...found],mode,started,paused,width,height,scale,cssSpacing:Number($('spacing').value),pixelSpacing:Math.round(Number($('spacing').value)*scale),ready,busy,stereoMs,readMs,presented,pointerLocked:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement};}}});
if(verifying)backendReady.then(()=>import('../tests/browser-checks.js')).then(({runChecks})=>runChecks({player,scene,found,stop,getWorld:()=>({scene,beaconMeshes}),getFrame:()=>verificationFrame,getMotionStats:()=>({movingFrames:foundationMotion.movingFrames,refreshes:foundationMotion.refreshes}),runtime:{
  getRuntime:()=>({backend:useGPU()?'gpu':'cpu',presented,ready,busy,holdingFrame,pending:gpu?.frames.pending.size||0,autoScale:adaptive.factor,cpuFailed,noiseFrame:foundationMotion.frame}),
  getStartupStats:()=>({...startupStats,gpuReady:!!gpu&&!gpu.failed,gpuPending,preparation:{...foundationPreparation.stats},cpuCarrierKeys:workers.map(slot=>slot.carrierKey||null),gpuCarrierKey:gpu?.preparedCarrierKey||null}),
  terminatePreparation:()=>foundationPreparation.destroy(),
  setDiagnosticCapture:value=>{diagnosticCapture=value;verificationFrame=null;},
  loseGPU:()=>gpu.device.destroy(),
  terminateCPUWorker:()=>workers[0].worker.client.worker.terminate(),
},captureNormalColor:()=>{
  renderSceneColor();const bytes=new Uint8Array(width*height*4),gl=renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
}})).finally(()=>{diagnosticCapture=false;});
