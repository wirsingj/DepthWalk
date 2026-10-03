import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {linkRow,separation} from '../src/stereogram.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {sanitizePreferences} from '../src/preferences.js';

test('dark ink remains visible for protruding and recessed objects without breaking RGB pairs',()=>{
  const frame=isolationFrames({width:400,height:128,spacing:96})[0],depth=frame.depth.slice();
  for(const invertDepth of [false,true])for(const pattern of ['quiet','scene','geometry','classic','mono']){
    const filter=new DepthWalkFilter(),settings={pattern,spacing:96,invertDepth,temporalStability:true};
    const before=filter.render(frame,settings).pixels.slice(),ink=filter.render(frame,{...settings,edges:3}).pixels.slice();
    let darker=0,change=0;
    for(let i=0;i<ink.length;i++){change+=ink[i]!==before[i];for(const s of [0,8,16])darker+=(before[i]>>>s&255)-(ink[i]>>>s&255);}
    assert.ok(change>300&&darker>1000,`${pattern}/${invertDepth}: ink is not visible`);
    assert.deepEqual(ink,filter.render(frame,{...settings,edges:3}).pixels,'stationary ink drifts');
    for(let y=0;y<frame.height;y++){
      const z=Float32Array.from({length:frame.width},(_,x)=>{const i=(y*frame.width+x)*4,q=depth[i]*256+depth[i+1];return (invertDepth?65535-q:q)/65535;}),visible=new Uint8Array(frame.width);
      linkRow(z,96,.5,new Int32Array(frame.width),null,visible);
      for(let x=0;x<frame.width;x++)if(visible[x]){const s=separation(z[x],96,.5),l=x-(s>>1);assert.equal(ink[y*frame.width+l],ink[y*frame.width+l+s]);}
    }
  }
  assert.deepEqual(frame.depth,depth);
});

test('ink halos preserve worker seams and source origin across resolution and window changes',()=>{
  const frame=isolationFrames({width:320,height:64,spacing:48})[0];
  for(const pixelRatio of [.5,1,1.5,2])for(const windowPeriods of [0,3]){
    const settings={pattern:'quiet',spacing:48,invertDepth:true,edges:3,pixelRatio,windowPeriods},expected=new DepthWalkFilter().render(frame,settings).pixels.slice();
    const combined=new Uint32Array(expected.length),halo=requiredHalo(pixelRatio,3);
    for(let start=0;start<64;start+=16){
      const end=start+16,top=Math.max(0,start-halo),stop=Math.min(64,end+halo);
      combined.set(new DepthWalkFilter().render({...frame,height:stop-top,fullHeight:64,yOffset:top,cropTop:start-top,cropBottom:stop-end,depth:frame.depth.subarray(top*320*4,stop*320*4),color:frame.color.subarray(top*320*4,stop*320*4)},settings).pixels,start*320);
    }
    assert.deepEqual(combined,expected);
    const flipped={...frame,origin:'bottom-left',depth:frame.depth.slice(),color:frame.color.slice()};
    for(let y=0;y<64;y++)for(const key of ['depth','color'])flipped[key].set(frame[key].subarray(y*320*4,(y+1)*320*4),(63-y)*320*4);
    assert.deepEqual(new DepthWalkFilter().render(flipped,settings).pixels,expected);
  }
});

test('legacy ink and wider spacing remain selectable alongside the depth-first defaults',()=>{
  const saved=sanitizePreferences({edges:'3',spacing:'180'});
  assert.equal(saved.edges,'3');assert.equal(saved.spacing,'180');
  assert.equal(sanitizePreferences({spacing:'181'}).spacing,'96');
  assert.equal(sanitizePreferences({}).edges,'0');
});
