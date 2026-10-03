import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {invertDepthFrame} from '../src/depth-direction.js';
import {separation} from '../src/stereogram.js';
import {correlation} from './stereo-quality.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {VIEWING_DEFAULTS,loadPreferences,savePreferences,sanitizePreferences} from '../src/preferences.js';
import {reconstructStereogram} from '../src/debug/reconstruct.js';

test('fresh and migrated viewing defaults give foreground a smaller recovered separation than background',()=>{
  const old=loadPreferences({getItem:()=>JSON.stringify({layoutRevision:2,'invert-depth':true})});
  for(const preferences of [VIEWING_DEFAULTS,old])for(const pattern of ['classic','mono','quiet']){
    const width=480,height=24,spacing=Number(preferences.spacing),strength=Number(preferences.strength)/100;
    const recovered=[4,40].map(distance=>{
      const frame={width,height,depth:new Float32Array(width*height).fill(distance),color:new Uint8Array(width*height*4).fill(128)};
      const pixels=new DepthWalkFilter().render(frame,{pattern,spacing,depthStrength:strength,invertDepth:preferences['invert-depth'],edges:0}).pixels;
      const decoded=reconstructStereogram({pixels,width,height,spacing,strength,maxColumns:120,maxRows:12});
      const values=[...decoded.disparity].filter(Number.isFinite).sort((a,b)=>a-b);
      assert.ok(values.length>100,'insufficient recovered image evidence');
      return values[Math.floor(values.length/2)];
    });
    assert.ok(recovered[0]<recovered[1],`${pattern}: foreground ${recovered[0]}px, background ${recovered[1]}px`);
  }
});

test('old reversed tuning migrates to the latest preset; subsequent diagnostic choices persist',()=>{
  let saved=JSON.stringify({layoutRevision:2,'invert-depth':true,pattern:'classic',spacing:'150',grain:'2','stereo-window':'3'});
  const storage={getItem:()=>saved,setItem:(_,value)=>saved=value};
  const migrated=loadPreferences(storage);
  assert.equal(migrated['invert-depth'],false);
  assert.deepEqual(migrated,VIEWING_DEFAULTS);
  savePreferences(storage,{...migrated,'invert-depth':true});
  assert.equal(loadPreferences(storage)['invert-depth'],true,'new explicit diagnostic choice should persist');
});

test('depth reversal changes near/far disparity ordering across source formats without mutating input',()=>{
  const width=400,height=16,filter=new DepthWalkFilter(),depths=[4,40],measured=[];
  for(const distance of depths){
    const depth=new Float32Array(width*height).fill(distance),frame={width,height,depth};
    const q=Math.round(Math.exp(-distance/22)*65535),original=separation(q/65535,96,.5),reversed=separation((65535-q)/65535,96,.5);
    for(const invertDepth of [false,true]){
      const pixels=filter.render(frame,{pattern:'mono',spacing:96,invertDepth}).pixels;
      assert.ok(correlation(pixels,width,height,invertDepth?reversed:original)>.999);
    }
    measured.push([original,reversed]);assert.ok(depth.every(v=>v===distance));
    const near=.1,far=100,raw=far/(far-near)-far*near/((far-near)*distance);
    const device={...frame,format:'device-depth',near,far,reverseZ:true,depth:new Float64Array(width*height).fill(1-raw)};
    assert.deepEqual(invertDepthFrame(device).depth,invertDepthFrame(frame).depth);
  }
  assert.ok(measured[0][0]<measured[1][0]);assert.ok(measured[0][1]>measured[1][1]);
  assert.throws(()=>filter.render({width:1,height:1,depth:Float32Array.of(4)},{invertDepth:'yes'}));
});

test('depth reversal preserves row origin, windows, history resets and worker stripe seams',()=>{
  const frame=isolationFrames({width:320,height:64,spacing:48})[0],snapshot=frame.depth.slice();
  const inverted=invertDepthFrame(frame),back=invertDepthFrame(inverted);
  assert.deepEqual(back.depth,snapshot);
  for(const pattern of ['quiet','chroma','chroma-soft','geometry'])for(const windowPeriods of [0,3]){
    const settings={pattern,spacing:48,invertDepth:true,temporalStability:true,windowPeriods},filter=new DepthWalkFilter();
    filter.render(frame,{...settings,invertDepth:false});
    const actual=filter.render(frame,settings).pixels.slice();
    assert.deepEqual(actual,new DepthWalkFilter().render(frame,settings).pixels,'direction change must discard old history');
    assert.deepEqual(actual,filter.render(frame,settings).pixels);
    const bottom={...frame,origin:'bottom-left',depth:frame.depth.slice(),color:frame.color.slice()};
    for(let y=0;y<frame.height;y++)for(const key of ['depth','color'])bottom[key].set(frame[key].subarray(y*frame.width*4,(y+1)*frame.width*4),(frame.height-1-y)*frame.width*4);
    assert.deepEqual(actual,new DepthWalkFilter().render(bottom,settings).pixels);
    const combined=new Uint32Array(actual.length),halo=requiredHalo();
    for(let i=0;i<4;i++){
      const start=i*16,end=start+16,top=Math.max(0,start-halo),stop=Math.min(64,end+halo);
      combined.set(new DepthWalkFilter().render({...frame,height:stop-top,fullHeight:64,yOffset:top,cropTop:start-top,cropBottom:stop-end,depth:frame.depth.subarray(top*320*4,stop*320*4),color:frame.color.subarray(top*320*4,stop*320*4)},settings).pixels,start*320);
    }
    assert.deepEqual(actual,combined);
  }
  assert.deepEqual(frame.depth,snapshot);
});

test('depth direction preference is saved and validates booleans',()=>{
  let saved;const storage={getItem:()=>saved,setItem:(_,value)=>saved=value};
  savePreferences(storage,{'invert-depth':true});assert.equal(loadPreferences(storage)['invert-depth'],true);
  savePreferences(storage,{'invert-depth':false});assert.equal(loadPreferences(storage)['invert-depth'],false);
  assert.equal(sanitizePreferences({'invert-depth':'false'})['invert-depth'],false);
});

test('reversing stereo depth preserves physical floor contours and geometry colors',()=>{
  const width=320,height=180,focal=height/(2*Math.tan(62*Math.PI/360));
  const frame={width,height,depth:Float32Array.from({length:width*height},(_,i)=>{
    const y=Math.floor(i/width);return y>height*.54?1.8*focal/(y+.5-height/2):Infinity;
  })};
  const original=new DepthWalkFilter(),reversed=new DepthWalkFilter();
  original.render(frame);reversed.render(frame,{invertDepth:true});
  assert.deepEqual(reversed.contours,original.contours,'depth reversal invented floor bands');
  assert.deepEqual(reversed.geometry.packed,original.geometry.packed,'physical colors/normals changed');
  assert.equal(reversed.contours.reduce((n,v)=>n+Number(v>0),0),640);
  for(let i=0;i<frame.depth.length;i++){
    const at=i*4;
    assert.equal(reversed.stereoPacked[at]*256+reversed.stereoPacked[at+1],65535-(original.geometry.packed[at]*256+original.geometry.packed[at+1]));
  }
});
