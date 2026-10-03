import * as THREE from 'three';
import { BUILDINGS, BEACONS, PLANTERS } from './game.js';
import { SURFACE as S, surfaceGLSL } from './surfaces.js';

function duskSky() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,'#142946');gradient.addColorStop(.42,'#465c85');
  gradient.addColorStop(.68,'#a992a3');gradient.addColorStop(1,'#e2bd9b');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
  for(let i=0;i<100;i++){
    const x=(i*137.507)%512,y=(i*71.93)%260;
    ctx.fillStyle=`rgba(223,237,244,${.2+(i%5)*.1})`;ctx.fillRect(x,y,i%7===0?2:1,1);
  }
  for(let i=0;i<8;i++){
    const y=180+i*22,g=ctx.createLinearGradient(0,y,512,y);
    g.addColorStop(0,'#e6c4bb00');g.addColorStop(.3,'#e6c4bb20');g.addColorStop(.8,'#e6c4bb0a');g.addColorStop(1,'#e6c4bb00');
    ctx.fillStyle=g;ctx.fillRect(0,y,512,2+i%3);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export function createCity({style='original'}={}) {
  const retro=style==='retro';
  const scene=new THREE.Scene();scene.background=retro?new THREE.Color('#516586'):duskSky();scene.fog=new THREE.Fog(retro?'#516586':'#8394aa',45,100);
  scene.add(new THREE.HemisphereLight('#d9eeef','#403d59',2.3));
  const sun=new THREE.DirectionalLight('#ffdfb6',3);sun.position.set(-15,35,15);scene.add(sun);
  const materials=new Map();
  const palette={ [S.ROAD]:'#324d58',[S.PAVING]:'#a7bba0',[S.CONCRETE]:'#78998f',[S.BRICK]:'#b77e60',[S.METAL]:'#718fa0',[S.GLASS]:'#45687b',[S.LEAVES]:'#62965d',[S.BARK]:'#79513f' };
  function material(color,kind,glow=false){
    if(retro)color=palette[kind]??color;
    const key=`${color}/${kind}/${glow}`;
    if(!materials.has(key)){
      if(retro){
        const m=new THREE.MeshLambertMaterial({color,flatShading:true,emissive:glow?color:0,emissiveIntensity:glow?.35:0});
        materials.set(key,m);return m;
      }
      const m=new THREE.MeshStandardMaterial({color,roughness:kind===S.GLASS?.35:.87,metalness:kind===S.METAL?.25:.08,emissive:glow?color:0,emissiveIntensity:glow?.35:0});
      m.onBeforeCompile=shader=>{
        shader.uniforms.surfaceKind={value:kind};
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 surfacePosition; varying vec3 surfaceNormal;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nsurfacePosition=(modelMatrix*vec4(position,1.0)).xyz; surfaceNormal=normalize((normalMatrix*normal)*mat3(viewMatrix));');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 surfacePosition; varying vec3 surfaceNormal; uniform float surfaceKind;\n${surfaceGLSL}`)
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( diffuse * surfaceDetail(surfacePosition, normalize(surfaceNormal), surfaceKind), opacity );');
      };
      m.customProgramCacheKey=()=> 'world-surface-v1';materials.set(key,m);
    }
    return materials.get(key);
  }
  function add(geometry,color,kind,x,y,z,parent=scene,glow=false){
    const mesh=new THREE.Mesh(geometry,material(color,kind,glow));mesh.position.set(x,y,z);mesh.userData.surfaceId=kind;
    parent.add(mesh);return mesh;
  }
  const box=(x,y,z,w,h,d,color,kind,parent=scene,glow=false)=>add(new THREE.BoxGeometry(w,h,d),color,kind,x,y,z,parent,glow);
  const cylinder=(x,y,z,r,h,color,kind,vertices=24,parent=scene,top=r)=>add(new THREE.CylinderGeometry(top,r,h,vertices),color,kind,x,y,z,parent);
  box(0,-.2,0,76,.4,78,'#374d63',S.ROAD);
  box(0,.008,0,12,.016,70,'#33485c',S.ROAD);box(0,.012,0,68,.024,11,'#33485c',S.ROAD);
  box(0,.025,1,14,.05,14,'#b7b39e',S.PAVING);
  for(const sx of [-1,1])for(const sz of [-1,1]){
    box(sx*19,.045,sz*19,24,.09,25,'#9fa69b',S.PAVING);
    if(!retro){box(sx*19.5,.092,sz*19,2.5,.008,25,'#3b5262',S.ROAD);box(sx*19,.092,sz*19.5,24,.008,2.8,'#3b5262',S.ROAD);}
  }
  const styles=[['#92afb4',S.CONCRETE],['#b58d7c',S.BRICK],['#8e8da8',S.METAL],['#c19481',S.BRICK],['#779f9c',S.CONCRETE],['#8897af',S.METAL]];
  BUILDINGS.forEach(([x,z,w,d,h],i)=>{
    const [color,kind]=styles[i%styles.length];box(x,h/2,z,w,h,d,color,kind);box(x,h+.28,z,w+.25,.56,d+.25,'#c5cbb5',S.CONCRETE);
    for(let y=3;!retro&&y<h-1;y+=3.3){
      box(x,y,z+d/2+.09,w*.8,.65,.2,'#529aab',S.GLASS);box(x,y,z-d/2-.09,w*.8,.65,.2,'#529aab',S.GLASS);
      box(x-w/2-.09,y,z,.2,.65,d*.8,'#529aab',S.GLASS);box(x+w/2+.09,y,z,.2,.65,d*.8,'#529aab',S.GLASS);
    }
    if(!retro&&i%3===0)box(x,h+1.35,z,w*.54,2.1,d*.56,color,kind);
    if(!retro&&i%4===1)cylinder(x,h+1.6,z,1.9,3,'#b4cdbd',S.METAL,12);
    box(x+(x<0?1:-1)*(w/2+.12),1.3,z,.22,2.6,1.6,'#315564',S.GLASS);
  });
  box(-35,1,0,.7,2,72,'#829d9f',S.CONCRETE);box(35,1,0,.7,2,72,'#829d9f',S.CONCRETE);
  box(0,1,-36,70,2,.7,'#829d9f',S.CONCRETE);box(0,1,36,70,2,.7,'#829d9f',S.CONCRETE);
  if(!retro){
    for(let z=-30;z<=30;z+=10)for(const x of [-5.9,5.9])box(x,.03,z,.16,.025,2,'#bcdfc0',S.SIGNAL,scene,true);
    for(let x=-30;x<=30;x+=10)for(const z of [-5.1,5.1])box(x,.03,z,2,.025,.16,'#bcdfc0',S.SIGNAL,scene,true);
    const ring=add(new THREE.RingGeometry(3.4,3.58,64),'#d4d9ab',S.PAVING,0,.065,-2);ring.rotation.x=-Math.PI/2;
  }
  PLANTERS.forEach(([x,z,w,d],i)=>{
    box(x,.24,z,w,.48,d,'#a49b85',S.PAVING);box(x,.485,z,w-.16,.025,d-.16,'#405442',S.LEAVES);
    if(retro){
      box(x,1.45,z,.45,2,.45,'#795b43',S.BARK);
      box(x,3.1,z,2.3,2.2,2.3,'#62965d',S.LEAVES);
      return;
    }
    cylinder(x,1.45,z,.22,2,'#795b43',S.BARK,9);
    const leaf=add(new THREE.IcosahedronGeometry(1.35,1),i%2?'#66a780':'#82af72',S.LEAVES,x,3.1+(i%3)*.2,z);leaf.scale.set(1,1.2,1);leaf.rotation.y=i*.7;
    for(const side of [-1,1]){
      const bush=add(new THREE.IcosahedronGeometry(.4,0),'#6a985b',S.LEAVES,x+side*.48,.77,z+.25);bush.scale.y=.7;
    }
  });
  const beaconMeshes=BEACONS.map((b,i)=>{
    const g=new THREE.Group();g.position.set(b.x,0,b.z);scene.add(g);
    const col=['#e9d7a1','#83d9cb','#e8b687','#b8b5ef','#e4a6be'][i];
    cylinder(0,.15,0,.85,.3,'#c2d3c0',S.PAVING,8,g);cylinder(0,.55,0,.34,.8,col,S.SIGNAL,8,g);
    if(b.shape==='prism')add(new THREE.OctahedronGeometry(.95),col,S.SIGNAL,0,1.95,0,g,true);
    else if(b.shape==='halo'){
      add(new THREE.TorusGeometry(.85,.23,retro?4:12,retro?8:32),col,S.SIGNAL,0,2,0,g,true);box(0,1,0,.22,1.4,.22,col,S.SIGNAL,g,true);
    }else if(b.shape==='spire')cylinder(0,1.9,0,.8,2.4,col,S.SIGNAL,5,g,.05);
    else if(b.shape==='portal'){
      box(-.7,1.75,0,.35,2.3,.4,col,S.SIGNAL,g,true);box(.7,1.75,0,.35,2.3,.4,col,S.SIGNAL,g,true);box(0,2.9,0,1.75,.35,.4,col,S.SIGNAL,g,true);
    }else{
      cylinder(0,1.15,0,.8,.35,col,S.SIGNAL,6,g);
      for(const x of [-.6,0,.6])cylinder(x,1.9,0,.2,x===0?1.8:1.2,col,S.SIGNAL,6,g,.08);
    }
    return g;
  });
  return {scene,beaconMeshes};
}

export function disposeCity(scene,background=scene.background){
  const materials=new Set();
  scene.traverse(object=>{object.geometry?.dispose();if(object.material)for(const m of [object.material].flat())materials.add(m);});
  for(const m of materials)m.dispose();
  background?.dispose?.();
}
