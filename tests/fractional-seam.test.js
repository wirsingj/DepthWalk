import test from 'node:test';
import assert from 'node:assert/strict';
import {createFractionalEdgeField,renderFractionalEdge} from '../src/debug/fractional-synthesis.js';
import {auditSeams,sampleShiftedField,vanishingPostSweep,screening} from './fractional-seam-research.js';
import {imageStats} from './fractional-phase-research.js';
import {layeredTruth} from './fractional-observer-fixtures.js';
import {createSeamMatchedField} from '../src/debug/fractional-seam-synthesis.js';

test('seam partition covers the image and area sampling agrees with independent point quadrature',()=>{
  const field=createFractionalEdgeField({seed:317,foregroundLeft:-6,foregroundRight:6});
  const parts=field.partition();
  assert.equal(parts[0].start,-.5);assert.ok(Math.abs(parts.at(-1).end-319.5)<1e-9);
  for(let i=1;i<parts.length;i++)assert.equal(parts[i].start,parts[i-1].end);
  for(const center of [100.125,168,168+51.625,206.71]){
    let sum=0;const n=16384;
    for(let k=0;k<n;k++)sum+=field.sample(center-.5+(k+.5)/n,4)/n;
    assert.ok(Math.abs(field.area(center,4)-sum)<.02);
  }
  assert.ok(Math.abs(field.area(168,4)-field.area(219.625,4))<1e-9);
  const audit=auditSeams();assert.ok(audit.propagated>0);assert.ok(audit.maxJump>1);
  assert.throws(()=>field.area(-.1,0));assert.throws(()=>field.area(20,9));
});

test('seam diagnostics handle the declared maximum dimensions without argument-list overflow',()=>{
  const field=createSeamMatchedField({width:2048,height:512,nearSeparation:24,farSeparation:25,
    foregroundLeft:-6,foregroundRight:6},{continuity:'slope',independentSeeds:true});
  assert.equal(field.diagnostics.coefficientEnergyRetention.length,512);
  assert.ok(field.diagnostics.maxConstraintResidual<1e-8);
});

test('joint screening rejects quiet weak texture, wrong depth, missing scope and motion regressions',()=>{
  const baseline={summary:{samples:100,correct:60,falseMatches:0},
    motion:[{seed:17,name:'route',sdMin:26,gradientMin:15,peakRms:2,backgroundPeak:2}]};
  assert.equal(screening(baseline,baseline).passes,true);
  const quiet={...baseline,motion:[{...baseline.motion[0],sdMin:13,gradientMin:7.5,peakRms:1,backgroundPeak:1}]};
  assert.equal(screening(quiet,baseline).passes,false);
  assert.equal(screening({...baseline,summary:{...baseline.summary,falseMatches:1}},baseline).passes,false);
  assert.equal(screening({...baseline,motion:[]},baseline).passes,false);
  assert.equal(screening({...baseline,motion:[{...baseline.motion[0],backgroundPeak:3}]},baseline).passes,false);
  assert.equal(screening({...baseline,summary:{samples:0,correct:0,falseMatches:0}},baseline).passes,false);
});

test('objects outside both eye projections cannot recolor the unconstrained image seed',()=>{
  const absent=renderFractionalEdge({foregroundLeft:1000,foregroundRight:1001});
  for(const screenRight of [-.50001,-1,-4,-12]){
    const right=(screenRight-159.5-35.375/2)/(1-35.375/96);
    const options={foregroundLeft:right-16,foregroundRight:right};
    assert.deepEqual(renderFractionalEdge(options).pixels,absent.pixels);
    assert.deepEqual(createSeamMatchedField(options,{continuity:'slope',independentSeeds:true,fadePixels:1}).render().pixels,absent.pixels);
  }
});

test('support fade removes the global vanishing-object discontinuity without depth interpolation',()=>{
  const r=vanishingPostSweep();
  assert.ok(r.records.at(-1).hardDifference>5);
  assert.ok(r.records.at(-1).fadedDifference<.001);
  assert.ok(r.records.at(-1).faded.projectionAmount<1e-8);
  assert.equal(r.records[0].faded.projectionAmount,1);
  assert.equal(r.records[0].fadedDifference,r.records[0].hardDifference);
  const options={foregroundLeft:-.05,foregroundRight:.05};
  const field=createSeamMatchedField(options,{continuity:'slope',independentSeeds:true,fadePixels:1});
  const points=[{x:141.8125,y:4},{x:220,y:4}];
  for(const p of layeredTruth(points,options).records.filter(p=>p.separation!==null))
    assert.ok(Math.abs(field.sample(p.x,4)-field.sample(p.x+p.separation,4))<1e-8);
  assert.throws(()=>createSeamMatchedField({},{fadePixels:-1}));
});

test('independent seed fields retain two-eye correspondence and enforce seam constraints',()=>{
  const options={nearSeparation:36.2,farSeparation:51.1,seed:91};
  const field=createSeamMatchedField(options,{continuity:'slope',independentSeeds:true});
  assert.equal(field.diagnostics.dimensions,48);assert.ok(field.diagnostics.maxConstraintResidual<1e-8);
  for(const p of layeredTruth(Array.from({length:90},(_,i)=>({x:60+i*2,y:4})),options).records.filter(p=>p.separation!==null))
    assert.ok(Math.abs(field.sample(p.x,4)-field.sample(p.x+p.separation,4))<1e-8);
  assert.ok(field.render({quantize:false}).pixels.every(v=>v>=0&&v<=255));
  assert.throws(()=>createSeamMatchedField({},{independentSeeds:1}));
});

test('slope-matched seeds remove derivative jumps while preserving fractional pairs',()=>{
  const options={seed:317,foregroundLeft:-6,foregroundRight:6},field=createSeamMatchedField(options,{continuity:'slope'});
  const h=1e-5;
  for(const p of field.partition().slice(1)){
    const left=(field.sample(p.start-h,4)-field.sample(p.start-2*h,4))/h;
    const right=(field.sample(p.start+2*h,4)-field.sample(p.start+h,4))/h;
    assert.ok(Math.abs(left-right)<.005);
  }
  const points=Array.from({length:90},(_,i)=>({x:60+i*2,y:4}));
  for(const p of layeredTruth(points,options).records.filter(p=>p.separation!==null))
    assert.ok(Math.abs(field.sample(p.x,4)-field.sample(p.x+p.separation,4))<1e-8);
  assert.throws(()=>createSeamMatchedField({},{continuity:'unknown'}));
});

test('seam-value projection preserves visible geometry and removes value jumps before pixel sampling',()=>{
  const options={seed:317,foregroundLeft:-6,foregroundRight:6},field=createSeamMatchedField(options);
  const points=Array.from({length:1200},(_,i)=>({x:20+i*.2,y:i%9}));
  for(const p of layeredTruth(points,options).records.filter(p=>p.separation!==null))
    assert.ok(Math.abs(field.sample(p.x,p.y)-field.sample(p.x+p.separation,p.y))<1e-8);
  for(const p of field.partition().slice(1))assert.ok(Math.abs(field.sample(p.start-1e-7,4)-field.sample(p.start+1e-7,4))<1e-4);
  assert.ok(field.diagnostics.rank>0);assert.ok(field.diagnostics.maxConstraintResidual<1e-8);
  for(const x of [100.125,168,173.4,180.97,230.25]){
    let sum=0;for(let i=0;i<8192;i++)sum+=field.sample(x-.5+(i+.5)/8192,4)/8192;
    assert.ok(Math.abs(field.area(x,4)-sum)<1e-5);
  }
  assert.ok(field.diagnostics.coefficientEnergyRetention.every(r=>r<=1+1e-10));
});

test('birth-phase control cannot change geometry constraints or silently accept invalid phase',()=>{
  const points=Array.from({length:90},(_,i)=>({x:60+i*2,y:4}));
  for(const birthPhase of [0,2.173]){
    const field=createFractionalEdgeField({},{birthPhase});
    for(const p of layeredTruth(points).records.filter(p=>p.separation!==null))
      assert.ok(Math.abs(field.sample(p.x,4)-field.sample(p.x+p.separation,4))<1e-8);
  }
  assert.throws(()=>renderFractionalEdge({},{birthPhase:NaN}));
});

test('bandwidth control preserves carrier energy but exposes lost spatial detail',()=>{
  const options={foregroundLeft:1000,foregroundRight:1100};
  const a=renderFractionalEdge(options,{quantize:false}),b=renderFractionalEdge(options,{harmonics:6,quantize:false});
  const first=imageStats(a.pixels,320),second=imageStats(b.pixels,320);
  assert.ok(second.sd/first.sd>.95&&second.sd/first.sd<1.05);
  assert.ok(second.horizontalDifferenceRms/first.horizontalDifferenceRms<.75);
  assert.throws(()=>createFractionalEdgeField({},{harmonics:0}));
});

test('shifted sampling control preserves the zero-phase image and translates physical samples',()=>{
  const options={seed:317,foregroundLeft:-6,foregroundRight:6};
  assert.deepEqual(sampleShiftedField(options).pixels,renderFractionalEdge(options).pixels);
  const shifted=sampleShiftedField(options,.25),field=createFractionalEdgeField({...options,width:322});
  for(const x of [24,138,168,230])assert.equal(shifted.pixels[4*320+x],Math.round(field.area(x+1.25,4)));
  assert.throws(()=>sampleShiftedField({},1));
});
