import * as THREE from 'three';
import {createCity} from '../src/city.js';
import {createDepthMaterial} from '../src/adapters/three-depth.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';
import {imageFidelity} from '../src/debug/image-fidelity.js';
const width=1000,height=562,report=document.getElementById('results'),results=[];
const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(width,height);renderer.outputColorSpace=THREE.SRGBColorSpace;
const {scene}=createCity(),background=scene.background,camera=new THREE.PerspectiveCamera(62,width/height,.1,110),material=createDepthMaterial();
camera.rotation.order='YXZ';
const target=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});target.texture.colorSpace=THREE.NoColorSpace;
function show(name,pixels){const fig=document.createElement('figure'),title=document.createElement('h2'),canvas=document.createElement('canvas');title.textContent=name;canvas.width=width;canvas.height=height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),width,height),0,0);fig.append(title,canvas);document.getElementById('images').append(fig);}
try{
for(const pose of [{name:'Plaza',x:0,z:13},{name:'Near beacon',x:-2.8,z:2.5}]){
  camera.position.set(pose.x,1.8,pose.z);scene.overrideMaterial=null;scene.background=background;renderer.setRenderTarget(null);renderer.render(scene,camera);
  const color=new Uint8Array(width*height*4),gl=renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,color);
  const normal=new Uint32Array(width*height);for(let y=0;y<height;y++)normal.set(new Uint32Array(color.buffer,(height-1-y)*width*4,width),y*width);show(pose.name+' · source render',normal);
  scene.overrideMaterial=material;scene.background=new THREE.Color(0);renderer.setRenderTarget(target);renderer.render(scene,camera);
  const depth=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,depth);
  for(const [pattern,detail] of [['scene',.35],['quiet',.65],['chroma',.65],['surface',.65]]){
    const filter=new DepthWalkFilter(),start=performance.now();
    const result=filter.render({depth,color,width,height,origin:'bottom-left',format:'packed-proximity-rg16'},{pattern,surfaceDetail:detail,temporalStability:pattern==='chroma'}),renderMs=performance.now()-start;
    const decoded=reconstructStereogram({pixels:result.pixels,width,height,maxColumns:160,maxRows:100}),compared=compareReconstruction(decoded,{depth});
    results.push({pose:pose.name,pattern,detail,temporalStability:pattern==='chroma',renderMs,fidelity:imageFidelity(result.pixels,color,width,height),support:filter.surfaceStats,reconstruction:decoded.summary,comparison:compared.summary});
    show(pose.name+' · '+pattern+' · '+detail,result.pixels);report.textContent=JSON.stringify(results,null,2);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}
report.dataset.results=JSON.stringify(results);report.dataset.complete='true';
}catch(error){report.textContent=error.stack;report.dataset.error=error.message;}
