import test from 'node:test';
import assert from 'node:assert/strict';
import {createRankRenderer,transportRanks} from '../src/debug/rank-color.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {DepthWalkFilter,DEFAULT_SETTINGS} from '../src/depthwalk.js';
import {reconstructStereogram} from '../src/debug/reconstruct.js';
import {linkRow,separation} from '../src/stereogram.js';
import {surfaceHash} from '../src/surface-stereo.js';
import {prepareGeometry} from '../src/depth-frame.js';
import {inspectPixel} from '../src/debug/observer.js';

const settings={pattern:'rank-color',spacing:48,depthStrength:.5,invertDepth:false,dotSize:1,edges:3,surfaceDetail:.55,temporalStability:true};
const fixture=()=>isolationFrames({width:240,height:96,spacing:48});

test('anchor ring preserves its background hole and keeps ink local without erasing matching dots',()=>{
  const f=isolationFrames({shape:'ring'})[0],render=createRankRenderer(),s={...settings,spacing:120,pattern:'rank-anchor'};
  const plain=render(f,{...s,edges:0},true),ink=render(f,s,true),image={pixels:ink,width:f.width,height:f.height,spacing:120,strength:.5};
  const hole=inspectPixel(image,320,166),rim=inspectPixel(image,395,166);
  assert.ok(hole.valid&&rim.valid);assert.ok(Math.abs(hole.disparity-116)<=2);assert.ok(Math.abs(rim.disparity-89)<=2);
  let darkened=0;
  for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
    const i=y*f.width+x;
    if(plain[i]===0xff181818||plain[i]===0xffe8e8e8)assert.equal(ink[i],plain[i]);
    if(plain[i]!==ink[i]){
      darkened++;assert.ok(x>158&&x<482&&y>60&&y<272);
      for(let c=0;c<3;c++)assert.ok((ink[i]>>>(8*c)&255)<=(plain[i]>>>(8*c)&255));
    }
  }
  assert.ok(darkened>100);assert.deepEqual(render(f,s),ink);
});

test('history-off and calibration changes cannot reuse another sequence state',()=>{
  const frames=fixture(),render=createRankRenderer(),s={...settings,pattern:'rank-anchor'};
  render(frames[0],s,true);render(frames[4],s);
  const off={...s,temporalStability:false};
  assert.deepEqual(render(frames[6],off),createRankRenderer()(frames[6],off));
  render(frames[0],s,true);render(frames[4],s);
  const changed={...s,depthRange:35};
  assert.deepEqual(render(frames[6],changed),createRankRenderer()(frames[6],changed));
  assert.deepEqual(render(frames[6],changed),render(frames[6],changed));
});

test('research rejects unsupported color and cropped-window contracts before synthesis',()=>{
  const f=fixture()[0],render=createRankRenderer(),s={...settings,pattern:'rank-anchor'};
  assert.throws(()=>render({...f,color:new Float32Array(f.color)},s),/RGBA8/);
  assert.throws(()=>render({...f,color:f.color.subarray(4)},s),/RGBA8/);
  assert.throws(()=>render(f,{...s,windowPeriods:3}),/complete native/);
  assert.throws(()=>render({...f,origin:'sideways'},s),/origin/);
  assert.deepEqual(render({...f,color:new Uint8ClampedArray(f.color)},s,true),render(f,s,true));
});

test('research uses one canonical depth for color owners, edges and correspondences',()=>{
  const input={...fixture()[0],depthRange:44},converted=prepareGeometry(input,{depthRange:22}).packed;
  const canonical={...input,depth:converted,depthRange:22,origin:'bottom-left',color:input.color.slice()};
  for(let y=0;y<input.height;y++)canonical.color.set(input.color.subarray(y*input.width*4,(y+1)*input.width*4),(input.height-1-y)*input.width*4);
  const render=createRankRenderer();
  for(const pattern of ['rank-anchor','rank-modulated'])for(const invertDepth of [false,true])
    assert.deepEqual(render(input,{...settings,pattern,invertDepth},true),render(canonical,{...settings,pattern,invertDepth},true));
  assert.deepEqual(render(input,{pattern:'rank-anchor'},true),render(input,{...DEFAULT_SETTINGS,pattern:'rank-anchor'},true));
});

test('new classes cannot duplicate a seed retained by another class',()=>{
  const h=surfaceHash(3,0),roots=Uint32Array.from([1,1,3,3]);
  const previous={roots:Uint32Array.from([3,3,3,3]),hashes:Uint32Array.from([h,h,h,h])};
  const hashes=transportRanks(roots,previous,4,1);
  assert.equal(hashes[0],hashes[1]);assert.equal(hashes[2],hashes[3]);
  assert.notEqual(hashes[1],hashes[3]);
  assert.deepEqual(transportRanks(roots,{roots,hashes},4,1),hashes);
});
test('rank research retains source-color locality without changing depth or inputs',()=>{
  const f=fixture()[0],savedDepth=f.depth.slice(),savedColor=f.color.slice(),edit={...f,color:f.color.slice()},render=createRankRenderer();
  const cx=120,cy=44;for(let y=cy-3;y<=cy+3;y++)for(let x=cx-3;x<=cx+3;x++)edit.color.set([239,48,173,255],(y*f.width+x)*4);
  for(const pattern of ['rank-color','rank-stable','rank-anchor','rank-modulated']){
    const a=render(f,{...settings,pattern},true),b=render(edit,{...settings,pattern},true);let changes=0;
    for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(a[y*f.width+x]!==b[y*f.width+x]){
      changes++;assert.ok(Math.abs(y-cy)<=3);assert.ok(Math.abs(x-cx)<=3+settings.spacing/2);
    }
    assert.ok(changes>0);
  }
  assert.deepEqual(f.depth,savedDepth);assert.deepEqual(f.color,savedColor);
});
test('rank edges darken local eye samples, preserve holds and reset history',()=>{
  const frames=fixture(),render=createRankRenderer(),a=render(frames[0],settings,true),plain=render(frames[0],{...settings,edges:0},true);
  let changed=0;for(let i=0;i<a.length;i++)if(a[i]!==plain[i]){changed++;for(let c=0;c<3;c++)assert.ok((a[i]>>>(8*c)&255)<=(plain[i]>>>(8*c)&255));}
  assert.ok(changed>0);
  assert.deepEqual(render(frames[0],settings,true),a);assert.deepEqual(render(frames[1],settings,false),a);
  render(frames[6],settings,false);assert.deepEqual(render(frames[0],settings,true),a);
});
test('rank rendering respects row origin in both directions and leaves Quiet unchanged',()=>{
  const f=fixture()[0],b={...f,origin:'bottom-left',color:f.color.slice(),depth:f.depth.slice()},render=createRankRenderer();
  for(let y=0;y<f.height;y++)for(const key of ['color','depth'])b[key].set(f[key].subarray(y*f.width*4,(y+1)*f.width*4),(f.height-1-y)*f.width*4);
  for(const pattern of ['rank-color','rank-anchor','rank-modulated'])for(const invertDepth of [false,true])assert.deepEqual(render(f,{...settings,pattern,invertDepth},true),render(b,{...settings,pattern,invertDepth},true));
  const quiet={...settings,pattern:'quiet'};assert.deepEqual(render(f,quiet,true),new DepthWalkFilter().render(f,quiet).pixels);
  assert.throws(()=>render(f,{...settings,pixelRatio:2},true));
});

test('overlap transport retains minority matches without duplicating a historical class seed',()=>{
  const roots=Uint32Array.from([3,2,2,3]),previous={roots:Uint32Array.from([1,1,3,3]),hashes:Uint32Array.from([17,17,29,29])};
  const hashes=transportRanks(roots,previous,4,1);
  assert.equal(hashes[0],hashes[3]);assert.equal(hashes[1],hashes[2]);assert.notEqual(hashes[0],hashes[1]);
  assert.deepEqual(new Set(hashes),new Set([17,29]));
  assert.deepEqual(transportRanks(roots,{roots,hashes},4,1),hashes);
  const frames=fixture(),render=createRankRenderer(),s={...settings,pattern:'rank-stable'},first=render(frames[0],s,true);
  assert.deepEqual(render(frames[1],s,false),first);render(frames[6],s,false);assert.deepEqual(render(frames[0],s,true),first);
});

test('independent pixel reconstruction places rank foreground in front of background',()=>{
  const width=480,height=24,render=createRankRenderer();
  for(const pattern of ['rank-color','rank-stable','rank-anchor','rank-modulated'])for(const invertDepth of [false,true]){
    const recovered=[4,40].map(distance=>{
      const depth=new Uint8Array(width*height*4),color=new Uint8Array(depth.length),q=Math.round(Math.exp(-distance/22)*65535);
      for(let i=0;i<depth.length;i+=4){depth.set([q>>8,q&255,0,255],i);color.set([168,156,96,255],i);}
      const pixels=render({width,height,depth,color,format:'packed-proximity-rg16'},{...settings,spacing:120,pattern,invertDepth,edges:0},true);
      const image=reconstructStereogram({pixels,width,height,spacing:120,strength:.5,maxColumns:120,maxRows:12});
      const values=[...image.disparity].filter(Number.isFinite).sort((a,b)=>a-b);
      assert.ok(values.length>100);return values[Math.floor(values.length/2)];
    });
    assert.ok(invertDepth?recovered[0]>recovered[1]:recovered[0]<recovered[1],`${pattern}: ${recovered}`);
  }
});

test('opaque matching dots survive conflicting source colors as exact final-image pairs',()=>{
  const f=fixture()[0],edit={...f,color:f.color.slice()},render=createRankRenderer(),s={...settings,pattern:'rank-anchor',edges:0};
  for(let i=0;i<f.color.length;i+=4){f.color.set([17,110,193,255],i);edit.color.set([240,35,70,255],i);}
  const a=render(f,s,true),b=render(edit,s,true),z=new Float32Array(f.width),same=new Int32Array(f.width),visible=new Uint8Array(f.width);
  const anchor=p=>p===0xff181818||p===0xffe8e8e8;let pairs=0,anchors=0;
  for(let y=0;y<f.height;y++){
    for(let x=0;x<f.width;x++){const at=(y*f.width+x)*4;z[x]=(f.depth[at]*256+f.depth[at+1])/65535;}
    linkRow(z,s.spacing,s.depthStrength,same,null,visible);
    for(let x=0;x<f.width;x++)if(visible[x]){
      const disparity=separation(z[x],s.spacing,s.depthStrength),left=y*f.width+x-(disparity>>1),right=left+disparity;pairs++;
      if(anchor(a[left])){anchors++;assert.equal(a[left],a[right]);assert.equal(b[left],a[left]);assert.equal(b[right],a[left]);}
    }
  }
  assert.ok(anchors/pairs>.4&&anchors/pairs<.6,`Anchor coverage ${anchors/pairs}`);
  assert.ok(a.some((p,i)=>p!==b[i]),'local scene color must remain visible');
});
