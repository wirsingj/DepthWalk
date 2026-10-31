import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconstructFractionalPatches,compareFractionalPatches} from '../src/debug/fractional-reconstruct.js';
import {independentPeriodicImage,renderLayeredPair,layeredTruth} from './fractional-observer-fixtures.js';
import {runFractionalObserverResearch} from './fractional-observer-research.js';

const points=[60,140,190,230].map(x=>({x,y:4}));
const decode=pixels=>reconstructFractionalPatches({pixels,width:320,height:9,points});

test('local fractional observer recovers independent single-image signals across seeds and phases',()=>{
  for(const seed of [17,91,317])for(const period of [43.375,43.39,47.25,47.49,47.5,47.75,51.61,51.625]){
    const result=decode(independentPeriodicImage({period,seed}));
    for(const patch of result.patches){
      assert.equal(patch.accepted,true,JSON.stringify({seed,period,patch}));
      assert.ok(Math.abs(patch.separation-period)<=1/16);
    }
  }
});

test('blank, low-contrast, unrelated and harmonic controls do not become confident depth',()=>{
  let state=621;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const controls={blank:new Float64Array(320*9).fill(128),
    weak:independentPeriodicImage({amplitude:.01}),
    unrelated:Float64Array.from({length:320*9},()=>32+192*random()),
    harmonic:Float64Array.from({length:320*9},(_,i)=>128+60*Math.sin(2*Math.PI*(i%320)/8))};
  for(const [name,pixels] of Object.entries(controls)){
    assert.equal(decode(pixels).patches.filter(p=>p.accepted).length,0,name);
  }
  const repeated=decode(controls.harmonic);
  assert.ok(repeated.patches.every(p=>p.scales.every(s=>s.peakMargin<.03)));
});

test('wrong depth remains decodable and is rejected only by independent comparison',()=>{
  const decoded=decode(independentPeriodicImage({period:49.375}));
  const before=JSON.stringify(decoded),right=compareFractionalPatches(decoded,points.map(()=>49.375));
  const wrong=compareFractionalPatches(decoded,points.map(()=>47.375));
  assert.equal(right.summary.correct,points.length);
  assert.equal(wrong.summary.falseMatches,points.length);
  assert.ok(wrong.samples.every(s=>s.error>1.9));
  assert.equal(JSON.stringify(decoded),before,'targets must not alter reconstruction');
});

test('two-eye calibration handles interiors and abstains at occluded or mixed boundary windows',()=>{
  const samples=[60,100,110,117,122,140,158,170,190,230].map(x=>({x,y:4}));
  const truth=layeredTruth(samples);
  assert.equal(truth.records.filter(r=>r.occluded).length,2);
  for(const seed of [17,91,317]){
    const result=reconstructFractionalPatches({...renderLayeredPair({seed}),points:samples});
    const comparison=compareFractionalPatches(result,truth.records.map(r=>r.separation));
    assert.equal(comparison.summary.falseMatches,0);
    for(const x of [60,140,190,230])assert.equal(result.patches.find(p=>p.x===x).accepted,true);
    for(const x of [110,117])assert.equal(result.patches.find(p=>p.x===x).accepted,false);
    assert.ok(result.patches.some(p=>p.x===100&&!p.accepted),'boundary support must not be silently filled');
  }
});

test('declared borders and disparity search edges remain unsupported rather than clipped',()=>{
  const pixels=independentPeriodicImage();
  const result=reconstructFractionalPatches({pixels,width:320,height:9,
    points:[{x:1,y:4},{x:300,y:4},{x:80,y:0}]});
  assert.ok(result.patches.every(p=>!p.accepted&&p.scales.every(s=>s.reason==='unsupported window')));
  assert.ok(decode(independentPeriodicImage({period:56})).patches.every(p=>!p.accepted));
});

test('boundary sweep preserves coverage accounting and rejects unsupported correspondence',()=>{
  const report=runFractionalObserverResearch();
  for(const row of report.planes){assert.equal(row.accepted,row.samples);assert.equal(row.falseMatches,0);}
  for(const row of report.boundaries){
    assert.equal(row.falseMatches,0,JSON.stringify(row));
    assert.ok(row.accepted>0&&row.accepted<=row.visible);
    for(const [name,group] of Object.entries(row.strata)){
      if(name.endsWith('-interior'))assert.equal(group.correct,group.samples);
      if(name==='occluded')assert.equal(group.accepted,0);
    }
  }
  assert.ok(report.disocclusion.newlyVisible>0);
  assert.equal(report.disocclusion.newlyVisibleWrong,0);
});

test('blur can retain depth evidence; reported bandwidth and contrast remain separate',()=>{
  const source=independentPeriodicImage(),blurred=new Float64Array(source.length);
  for(let y=0;y<9;y++)for(let x=0;x<320;x++){
    let value=0;for(let dx=-4;dx<=4;dx++)value+=source[y*320+Math.max(0,Math.min(319,x+dx))]/9;
    blurred[y*320+x]=value;
  }
  const sharp=decode(source),soft=decode(blurred);
  for(let i=0;i<points.length;i++){
    assert.equal(soft.patches[i].accepted,true);
    assert.ok(Math.abs(soft.patches[i].separation-47.375)<=1/16);
    assert.ok(soft.patches[i].scales[0].gradientRms<sharp.patches[i].scales[0].gradientRms*.5);
  }
});

test('fractional observer rejects malformed domains and does not import synthesis or truth',()=>{
  const pixels=independentPeriodicImage(),args={pixels,width:320,height:9,points};
  for(const settings of [{step:0},{step:NaN},{step:1/10000},{max:Infinity},{min:'32'},
    {kernelRadius:0},{windowRadii:[11,5]},{verticalRadius:-1},{minCorrelation:NaN},{minSD:0}]){
    assert.throws(()=>reconstructFractionalPatches({...args,settings}),/Invalid/);
  }
  const invalid=pixels.slice();invalid[3]=NaN;
  assert.throws(()=>reconstructFractionalPatches({...args,pixels:invalid}),/finite scalar/);
  assert.throws(()=>reconstructFractionalPatches({...args,width:319}),/scalar/);
  assert.throws(()=>reconstructFractionalPatches({...args,points:[{x:Infinity,y:4}]}),/points/);
  assert.throws(()=>compareFractionalPatches({patches:[]},[47]),/targets/);
  assert.throws(()=>compareFractionalPatches({patches:[{accepted:true,separation:NaN}]},[47]),/targets/);
  const source=readFileSync(new URL('../src/debug/fractional-reconstruct.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bimport\s/);
});
