import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothColorBase,createColorBaseRenderer} from '../src/debug/color-base.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {linkRow} from '../src/stereogram.js';

const settings={spacing:48,depthStrength:.5,invertDepth:false,pattern:'research-color-base',surfaceDetail:.55,temporalStability:true,edges:2};
test('color smoothing preserves inputs, row origin and current matching classes in either direction',()=>{
  const f=isolationFrames({width:240,height:96,spacing:48})[0],saved=f.color.slice(),savedDepth=f.depth.slice();
  const bottom={...f,origin:'bottom-left',depth:f.depth.slice(),color:f.color.slice()};
  for(let y=0;y<f.height;y++)for(const key of ['depth','color'])bottom[key].set(f[key].subarray(y*f.width*4,(y+1)*f.width*4),(f.height-1-y)*f.width*4);
  for(const invertDepth of [false,true]){
    const s={...settings,invertDepth},a=smoothColorBase(f,s),b=smoothColorBase(bottom,s);
    const z=new Float32Array(f.width),same=new Int32Array(f.width);
    for(let y=0;y<f.height;y++){
      assert.deepEqual(a.subarray(y*f.width*4,(y+1)*f.width*4),b.subarray((f.height-1-y)*f.width*4,(f.height-y)*f.width*4));
      for(let x=0;x<f.width;x++){const i=(y*f.width+x)*4,p=(f.depth[i]*256+f.depth[i+1])/65535;z[x]=invertDepth?1-p:p;}
      linkRow(z,s.spacing,s.depthStrength,same);
      for(let x=0;x<f.width;x++)for(let c=0;c<3;c++)assert.equal(a[(y*f.width+x)*4+c],a[(y*f.width+same[x])*4+c]);
    }
  }
  assert.deepEqual(f.color,saved);assert.deepEqual(f.depth,savedDepth);
  assert.throws(()=>smoothColorBase(f,{...settings,pixelRatio:2}));
  assert.throws(()=>smoothColorBase(f,{...settings,spacing:NaN}));
});
test('research replay keeps ordinary Quiet unchanged, holds stationary pixels and resets history',()=>{
  const frames=isolationFrames({width:240,height:96,spacing:48}),render=createColorBaseRenderer(),quiet={...settings,pattern:'quiet'};
  assert.deepEqual(render(frames[0],quiet,true),new DepthWalkFilter().render(frames[0],quiet).pixels);
  const first=render(frames[0],settings,true);
  assert.deepEqual(render(frames[0],settings,false),first);
  render(frames[6],settings,false);
  assert.deepEqual(render(frames[0],settings,true),first);
});
