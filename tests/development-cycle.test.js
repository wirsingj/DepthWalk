import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {evaluateCandidate} from '../src/debug/candidate-gates.js';
import {synthesizeAppearance} from '../src/debug/appearance-synthesis.js';
import {solveMultiscaleContrast} from '../src/debug/multiscale-contrast.js';

test('isolation scene supplies repeatable holds, translated objects and visible ring holes',()=>{
  const options={width:240,height:96,spacing:48},frames=isolationFrames(options),ring=isolationFrames({...options,shape:'ring'});
  assert.equal(frames.length,10);assert.equal(frames[0].depth,frames[1].depth);assert.equal(frames[6].depth,frames[9].depth);
  assert.notDeepEqual(frames[0].depth,frames[6].depth);
  const at=(Math.floor(96*.46)*240+120)*4;
  assert.ok(frames[0].depth[at]>frames[0].depth[0]);assert.equal(ring[0].depth[at],ring[0].depth[0]);
  assert.deepEqual(isolationFrames(options),frames);
  assert.throws(()=>isolationFrames({...options,width:NaN}));
});
test('explicit history reset matches a fresh filter after a camera cut, including windows',()=>{
  const frames=isolationFrames({width:320,height:48,spacing:48});
  for(const pattern of ['quiet','chroma','chroma-soft'])for(const windowPeriods of [0,3]){
    const settings={pattern,windowPeriods,spacing:48,temporalStability:true},filter=new DepthWalkFilter();
    filter.render(frames[0],settings);filter.render(frames[6],settings);
    const output=filter.render(frames[6],settings).pixels;
    filter.resetHistory();filter.resetHistory();
    const actual=filter.render(frames[0],settings).pixels;
    assert.equal(actual,output,'reset should retain output allocation');
    assert.deepEqual(actual,new DepthWalkFilter().render(frames[0],settings).pixels,`${pattern}/${windowPeriods}`);
  }
});
test('fixed gates expose the recorded city motion miss and fail missing measurements',()=>{
  const [base,candidate]=JSON.parse(fs.readFileSync(new URL('../evidence/quiet-motion-city-gpu.json',import.meta.url))).results;
  const d=evaluateCandidate(base,candidate,'quiet-motion');
  assert.equal(d.pass.motion,false);assert.equal(d.pass.depth,true);assert.equal(d.allGatesPassed,false);
  assert.equal(evaluateCandidate(base,{...candidate,accuracy:null},'quiet-motion').pass.depth,false);
  assert.equal(evaluateCandidate({...base,accuracy:null},candidate,'quiet-motion').pass.depth,false);
  assert.throws(()=>evaluateCandidate(base,candidate,'unknown'));
});
test('multiscale contrast preserves free patch means and reduces its own objective',()=>{
  const width=24,height=8,pairs=[],weights=[];
  for(let y=0;y<height;y++)for(let x=0;x<8;x++){pairs.push(y*width+x,y*width+x+12);weights.push(1);}
  const target=Float32Array.from({length:width*height*3},(_,i)=>(Math.floor(i/3)%width)<12?40:180);
  const flat=solveMultiscaleContrast(target,pairs,weights,width,8,48);
  assert.ok(flat.contrastTerms>pairs.length);assert.equal(flat.before.matching,0);assert.equal(flat.after.total,0);
  target[(3*width+4)*3]=100;
  const textured=solveMultiscaleContrast(target,pairs,weights,width,8,48);
  assert.ok(textured.after.total<textured.before.total);assert.ok(textured.after.matching<textured.before.matching);
});
test('multiscale synthesis respects row origin, stationary output and immutable inputs',()=>{
  const f=isolationFrames({width:96,height:32,spacing:24})[0],copy=f.color.slice(),carrier=new Uint32Array(96*32).fill(0xff808080),settings={multiscale:true,projected:true,iterations:8};
  const a=synthesizeAppearance(f,carrier,settings),bottom={...f,origin:'bottom-left',depth:f.depth.slice(),color:f.color.slice()};
  for(let y=0;y<32;y++)for(const key of ['depth','color'])bottom[key].set(f[key].subarray(y*96*4,(y+1)*96*4),(31-y)*96*4);
  assert.deepEqual(synthesizeAppearance(bottom,carrier,settings).pixels,a.pixels);
  assert.deepEqual(synthesizeAppearance(f,carrier,settings).pixels,a.pixels);assert.deepEqual(f.color,copy);
  assert.throws(()=>synthesizeAppearance(f,carrier,{contrast:true,multiscale:true}));
});
