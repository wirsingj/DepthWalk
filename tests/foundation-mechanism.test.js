import test from 'node:test';
import assert from 'node:assert/strict';
import {changeEnergy,splitChange,leastChangeBound} from './foundation-mechanism-research.js';
const gray=value=>(0xff000000|value*0x010101)>>>0;

test('brightness attribution distinguishes global shifts, cancelling regions and fine noise',()=>{
  const before=new Uint32Array(12*6).fill(gray(128));
  const global=changeEnergy(before,new Uint32Array(before.length).fill(gray(148)),12,6);
  assert.equal(global.globalMeanEnergyFraction,1);assert.equal(global.residualAfterGlobalMean,0);
  const regions=Uint32Array.from(before,(_,i)=>gray(128+(i%12<6?20:-20)));
  const regional=changeEnergy(before,regions,12,6,2,1);
  assert.equal(regional.globalMeanEnergyFraction,0);assert.equal(regional.regionalMeanEnergyFraction,1);
  assert.equal(regional.residualAfterRegionalMeans,0);
  const alternating=Uint32Array.from(before,(_,i)=>gray(128+(i%2?20:-20)));
  const fine=changeEnergy(before,alternating,12,6);
  assert.equal(fine.regionalMeanEnergyFraction,0);assert.equal(fine.residualAfterRegionalMeans,20);
  const held=changeEnergy(before,before,12,6);
  assert.equal(held.globalMeanEnergyFraction,null);assert.equal(held.rms,0);
});

test('exact-graph free-contrast bound agrees with exhaustive class-value search',()=>{
  const values=[0,40,160,240],previous=Uint32Array.from(values,gray),roots=Uint32Array.of(0,0,2,2);
  const bound=leastChangeBound(previous,roots,4,1);
  let best=Infinity;
  for(let a=0;a<=255;a++)for(let b=0;b<=255;b++){
    best=Math.min(best,((values[0]-a)**2+(values[1]-a)**2+(values[2]-b)**2+(values[3]-b)**2)/4);
  }
  assert.ok(Math.abs(bound.minimumRmsAnyContrast**2-best)<1e-9);
  assert.ok(bound.minimumRmsSameGlobalMeanAndSD>=bound.minimumRmsAnyContrast);
  assert.equal(bound.minimumRmsSameEachRowMeanAndSD,bound.minimumRmsSameGlobalMeanAndSD);
  const identical=leastChangeBound(previous,Uint32Array.of(0,1,2,3),4,1);
  assert.equal(identical.minimumRmsAnyContrast,0);assert.equal(identical.retainedHorizontalVariance,1);
});

test('fixed-contrast bounds retain zero-projection and infeasible-row distinctions',()=>{
  const previous=Uint32Array.from([0,255,0,255],gray),roots=Uint32Array.of(0,0,2,2);
  const bound=leastChangeBound(previous,roots,4,1);
  assert.equal(bound.projectedContrastSD,0);assert.equal(bound.retainedHorizontalVariance,0);
  const possible=Uint32Array.from([0,0,255,255],gray);
  const actual=Math.sqrt(possible.reduce((sum,v,i)=>sum+((v&255)-(previous[i]&255))**2,0)/4);
  assert.equal(bound.minimumRmsSameGlobalMeanAndSD,actual);
  const impossible=leastChangeBound(previous,new Uint32Array(4),4,1);
  assert.equal(impossible.globalContrastFeasible,false);assert.equal(impossible.rowContrastFeasible,false);
  assert.equal(impossible.minimumRmsSameEachRowMeanAndSD,null);
  const vertical=leastChangeBound(Uint32Array.from([0,255,0,255,0,255,0,255],gray),Uint32Array.of(0,0,0,0,4,4,4,4),4,2);
  assert.equal(vertical.globalContrastFeasible,true);assert.equal(vertical.rowContrastFeasible,false);
  const constant=leastChangeBound(new Uint32Array(4).fill(gray(128)),new Uint32Array(4),4,1);
  assert.equal(constant.minimumRmsSameEachRowMeanAndSD,0);assert.equal(constant.retainedHorizontalVariance,null);
  assert.throws(()=>leastChangeBound(previous,Uint32Array.of(0,1,2,8),4,1),/class labels/);
});

test('contrast bounds match analytic fractional optima and weight row energy before RMS',()=>{
  const previous=Uint32Array.from([0,0,2],gray),roots=Uint32Array.of(0,1,0);
  const bound=leastChangeBound(previous,roots,3,1);
  assert.ok(Math.abs(bound.minimumRmsAnyContrast**2-2/3)<1e-12);
  assert.ok(Math.abs(bound.minimumRmsSameGlobalMeanAndSD**2-8/9)<1e-12);
  const rows=leastChangeBound(Uint32Array.from([0,0,2,0,0,2],gray),Uint32Array.of(0,1,0,3,4,5),3,2);
  assert.ok(Math.abs(rows.minimumRmsSameEachRowMeanAndSD**2-4/9)<1e-12);
  assert.ok(Math.abs(rows.minimumRmsSameGlobalMeanAndSD**2-(16-4*Math.sqrt(10))/9)<1e-12);
  assert.ok(rows.minimumRmsSameEachRowMeanAndSD>rows.minimumRmsSameGlobalMeanAndSD);
  assert.throws(()=>leastChangeBound(Uint32Array.from([0,0,2,0,0,2],gray),Uint32Array.of(0,1,0,0,4,5),3,2),/class labels/);
});

test('depth and carrier accounting retains their signed interaction and validates frames',()=>{
  const before=new Uint32Array(12*6).fill(gray(128)),bridge=new Uint32Array(before.length).fill(gray(148));
  const after=new Uint32Array(before.length).fill(gray(138));
  const change=splitChange(before,after,bridge,12,6);
  assert.equal(change.total.meanSquare,100);assert.equal(change.depthAtHeldCarrier.meanSquare,400);
  assert.equal(change.carrierAtCurrentDepth.meanSquare,100);assert.equal(change.crossTerm,-400);
  for(const args of [[before,after,0,6],[before,after,12,5],[before,after,12,6,13,1]])assert.throws(()=>changeEnergy(...args));
  assert.throws(()=>changeEnergy(before,new Uint32Array(before.length).fill(0xff0000ff),12,6),/grayscale/);
});
