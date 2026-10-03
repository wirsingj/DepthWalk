import * as THREE from 'three';
import {createCity,disposeCity} from '../src/city.js';
import {createDepthMaterial} from '../src/adapters/three-depth.js';
import {savePNG} from '../src/debug/save-png.js';

const $=id=>document.getElementById(id),canvas=$('image'),ctx=canvas.getContext('2d',{alpha:false});
const worker=new Worker(new URL('./foundation.worker.js',import.meta.url),{type:'module'});
let view='binary',width=960,height=540,revision=0,busy=false,dirty=true,playing=false,phase=0,lastTime=0,frame=null,workerFrame=null,city=null;
const descriptions={binary:'A clean black-and-white reference. No scene color, added outlines or frame blending.',white:'Grayscale white noise: fine texture throughout. This is the contrast-matched control for pink texture.',pink:'Candidate: pink noise adds broader matching features while retaining fine texture. Source colors and extra outlines are excluded.',source:'Source appearance only. This view is not a stereogram.',depth:'Depth input only: brighter means nearer. This view is not a stereogram.'};
function pause(){if(playing)dirty=true;playing=false;$('motion').textContent='Play motion';$('motion').setAttribute('aria-pressed','false');}
function invalidate(capture=false){revision++;dirty=true;if(capture)frame=null;}
function dispose(){if(city){city.target.dispose();city.material.dispose();disposeCity(city.scene,city.background);city.renderer.dispose();city.renderer.forceContextLoss();city=null;}}
function captureShapes(){
  const depth=new Uint8Array(width*height*4),color=new Uint8Array(depth.length),shift=Math.sin(phase)*width*.035;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=x-shift,dx=(sx-width*.5)/(height*.29),dy=(y-height*.48)/(height*.29),r2=dx*dx+dy*dy;
    let z=.1,rgb=[76,97,109];
    if(r2<1){z=.25+.55*Math.sqrt(1-r2);rgb=[105+Math.round(z*85),145+Math.round(z*50),121];}
    if(sx>width*.16&&sx<width*.3&&y>height*.35&&y<height*.73){z=.65;rgb=[194,144,88];}
    const ring=Math.hypot((sx-width*.79)/(height*.18),(y-height*.5)/(height*.18));
    if(ring>.52&&ring<1){z=.75;rgb=[145,163,201];}
    const i=(y*width+x)*4,q=Math.round(z*65535);depth[i]=q>>8;depth[i+1]=q&255;depth[i+3]=255;color.set([...rgb,255],i);
  }
  return {width,height,depth,color,format:'packed-proximity-rg16',origin:'top-left'};
}
function captureCity(){
  if(!city){
    const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(width,height);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const {scene}=createCity({style:$('scene').value});
    city={renderer,scene,background:scene.background,camera:new THREE.PerspectiveCamera(62,width/height,.1,110),material:createDepthMaterial(),target:new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter})};
    city.target.texture.colorSpace=THREE.NoColorSpace;city.camera.rotation.order='YXZ';
  }
  const {renderer,scene,background,camera,target,material}=city;
  camera.position.set(Math.sin(phase)*.5,1.8,-Math.sin(phase)*.45);camera.rotation.set(0,Math.sin(phase)*.05,0);
  scene.overrideMaterial=null;scene.background=background;renderer.setRenderTarget(null);renderer.render(scene,camera);
  const color=new Uint8Array(width*height*4),depth=new Uint8Array(color.length),gl=renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,color);
  scene.overrideMaterial=material;scene.background=new THREE.Color(0);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,width,height,depth);
  return {width,height,depth,color,format:'packed-proximity-rg16',origin:'bottom-left'};
}
function paint(pixels){ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer,pixels.byteOffset,pixels.byteLength),width,height),0,0);}
function paintSource(){
  const pixels=new Uint32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=((frame.origin==='bottom-left'?height-1-y:y)*width+x)*4;
    const r=view==='depth'?Math.round((frame.depth[i]*256+frame.depth[i+1])/257):frame.color[i],g=view==='depth'?r:frame.color[i+1],b=view==='depth'?r:frame.color[i+2];
    pixels[y*width+x]=(0xff000000|r|g<<8|b<<16)>>>0;
  }
  paint(pixels);$('status').textContent='Source frame · motion paused';
}
function fail(message){pause();dirty=false;document.body.classList.add('failed');$('status').textContent=message;}
worker.onerror=event=>{busy=false;fail(event.message||'Renderer worker failed. Reload to retry.');};
worker.onmessage=({data})=>{
  busy=false;if(data.id!==revision)return;
  if(data.error){fail(data.error);return;}
  paint(data.pixels);$('status').textContent=`${width} × ${height} · ${data.ms.toFixed(1)} ms CPU synthesis${playing?' · moving':' · still'}`;
};
function choose(next){pause();view=next;invalidate();$('description').textContent=descriptions[view];$('guides').hidden=['source','depth'].includes(view);$('play-city').href='../index.html?foundation='+(['source','depth'].includes(view)?'binary':view)+'&world='+($('scene').value==='retro'?'retro':'original');for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));}
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>choose(b.dataset.view);
for(const id of ['spacing','strength'])$(id).oninput=()=>{pause();$('spacing-value').textContent=$('spacing').value+' px';$('strength-value').textContent=Math.round(Number($('strength').value))+'%';$('guides').style.gap=(Number($('spacing').value)-8)+'px';invalidate();};
function resize(){width=Number($('size').value);height=Math.round(width*9/16);canvas.width=width;canvas.height=height;$('native').style.width=width+'px';dispose();invalidate(true);}
$('size').onchange=()=>{pause();resize();};
$('scene').onchange=()=>{choose(view);phase=0;dispose();invalidate(true);};
$('motion').onclick=()=>{if(['source','depth'].includes(view))choose('binary');playing=!playing;$('motion').textContent=playing?'Pause motion':'Play motion';$('motion').setAttribute('aria-pressed',String(playing));};
$('reset').onclick=()=>{pause();phase=0;invalidate(true);};
$('save').onclick=()=>savePNG(canvas,`depthwalk-foundation-${$('scene').value}-${view}.png`).catch(e=>fail(e.message));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
addEventListener('pagehide',()=>{worker.terminate();dispose();});
function tick(time){
  requestAnimationFrame(tick);
  if(document.hidden||busy||(!dirty&&!playing))return;
  const dt=Math.min(.1,(time-lastTime)/1000);lastTime=time;
  try{
    let fresh=!frame;
    if(playing){phase+=dt*.65;fresh=true;}
    if(fresh)frame=$('scene').value==='shapes'?captureShapes():captureCity();
    dirty=false;
    if(['source','depth'].includes(view)){paintSource();return;}
    busy=true;document.body.classList.remove('failed');$('status').textContent='Rendering…';
    // One job in flight. Views use the held frame; stale jobs never paint.
    worker.postMessage({id:revision,frame:frame!==workerFrame?{...frame,color:undefined}:undefined,settings:{carrier:view,spacing:Number($('spacing').value),strength:Number($('strength').value)/100}});
    workerFrame=frame;
  }catch(error){busy=false;fail(error.message);}
}
resize();requestAnimationFrame(tick);
