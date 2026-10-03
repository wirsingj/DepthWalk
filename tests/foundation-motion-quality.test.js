import test from 'node:test';
import assert from 'node:assert/strict';
import {motionCoherence,temporalDiagnostics} from './foundation-motion-quality.js';

const width=384,height=128;
const pixel=v=>(0xff000000|v|v<<8|v<<16)>>>0;
function noise(seed=173){
  return Uint32Array.from({length:width*height},(_,i)=>{
    let value=Math.imul(i^seed,0x45d9f3b);
    value=Math.imul(value^(value>>>16),0x45d9f3b);
    return pixel((value^(value>>>16))&255);
  });
}
function warp(source,position){
  return Uint32Array.from(source,(_,i)=>{
    const [x,y]=position(i%width,Math.floor(i/width));
    return source[Math.max(0,Math.min(height-1,Math.round(y)))*width+Math.max(0,Math.min(width-1,Math.round(x)))];
  });
}

test('stationary texture has zero-shift evidence, not reliable translated motion',()=>{
  const a=noise(),snapshot=a.slice(),result=temporalDiagnostics(a,a,width,height);
  assert.equal(motionCoherence(a,a,width,height),1,'legacy stationary result must remain intact');
  assert.equal(result.zeroCorrelation,1);
  assert.ok(result.translatedCorrelation<.5);
  assert.ok(result.translatedImprovement<0);
  assert.equal(result.reliableFraction,0);
  assert.equal(result.meanDx,null);
  assert.equal(result.meanDy,null);
  assert.equal(result.frameRmsByte,0);
  assert.equal(result.changedFraction,0);
  assert.equal(result.columnEnergyCV,null,'no changed energy has no concentration statistic');
  assert.deepEqual(a,snapshot);
});

test('independent frames expose flicker without inventing coherent displacement',()=>{
  const result=temporalDiagnostics(noise(173),noise(9827),width,height);
  assert.ok(Math.abs(result.zeroCorrelation)<.1);
  assert.ok(result.translatedCorrelation<.5);
  assert.equal(result.reliableFraction,0);
  assert.equal(result.radialDisplacement,null);
  assert.ok(result.frameRmsByte>90);
  assert.ok(result.frameMeanAbsByte>70);
  assert.ok(result.changedFraction>.99);
  assert.ok(result.columnEnergyCV<.2);
});

test('translated controls recover right/down and left/up independently of zero shift',()=>{
  const a=noise();
  for(const [dx,dy] of [[4,2],[-6,-2],[1,0],[0,3]]){
    const b=warp(a,(x,y)=>[x-dx,y-dy]),result=temporalDiagnostics(a,b,width,height);
    assert.equal(result.translatedCorrelation,1);
    assert.equal(result.reliableFraction,1);
    assert.equal(result.meanDx,dx);
    assert.equal(result.meanDy,dy);
    assert.ok(result.translatedImprovement>.9);
    assert.ok(result.frameRmsByte>90);
    for(const patch of result.patches){assert.equal(patch.dx,dx);assert.equal(patch.dy,dy);}
  }
});

test('expanding and contracting controls preserve opposing local displacement',()=>{
  const a=noise(),cx=(width-1)/2,cy=(height-1)/2;
  for(const expansion of [1.04,.96]){
    const b=warp(a,(x,y)=>[cx+(x-cx)/expansion,cy+(y-cy)/expansion]);
    const result=temporalDiagnostics(a,b,width,height,{patchRadiusX:8,patchRadiusY:6});
    const reliable=result.patches.filter(p=>p.reliable);
    assert.ok(result.reliableFraction>.4,'insufficient local displacement evidence');
    assert.ok(reliable.some(p=>p.dx<0)&&reliable.some(p=>p.dx>0),'opposing horizontal motion was lost');
    if(expansion>1){
      assert.ok(result.radialDisplacement>2);
      assert.ok(result.outwardFraction>.9);
      assert.equal(result.inwardFraction,0);
    }else{
      assert.ok(result.radialDisplacement<-2);
      assert.ok(result.inwardFraction>.9);
      assert.equal(result.outwardFraction,0);
    }
  }
});

test('flat, low-contrast and undersized inputs report absent correlation evidence',()=>{
  const flat=new Uint32Array(width*height).fill(pixel(128)),brighter=new Uint32Array(flat.length).fill(pixel(148));
  const result=temporalDiagnostics(flat,brighter,width,height);
  assert.ok(result.samples>0);
  assert.equal(result.validSamples,0);
  for(const key of ['zeroCorrelation','translatedCorrelation','translatedImprovement','reliableFraction','meanDx','meanDy','radialDisplacement','outwardFraction','inwardFraction'])assert.equal(result[key],null,key);
  assert.equal(result.frameRmsByte,20);
  assert.equal(result.frameMeanAbsByte,20);
  assert.equal(result.frameMeanSignedByte,20);
  assert.equal(result.columnEnergyCV,0);
  const weak=Uint32Array.from(noise(),v=>pixel(128+(v&1)));
  assert.equal(temporalDiagnostics(weak,weak,width,height).validSamples,0);
  const small=new Uint32Array(12*8).fill(pixel(128)),tiny=temporalDiagnostics(small,small,12,8);
  assert.equal(tiny.samples,0);
  assert.equal(tiny.zeroCorrelation,null);
  assert.equal(tiny.reliableFraction,null);
});

test('repetitive texture does not turn tied translated matches into reliable flow',()=>{
  const a=Uint32Array.from({length:width*height},(_,i)=>pixel([30,90,160,220][i%4]));
  const b=warp(a,(x,y)=>[x-1,y]),result=temporalDiagnostics(a,b,width,height,{sampleStep:1});
  assert.equal(result.translatedCorrelation,1);
  assert.ok(result.translatedImprovement>.5);
  assert.equal(result.reliableFraction,0,'equally good periodic matches are ambiguous');
  assert.ok(result.patches.every(p=>p.peakMargin===0));
});

test('column energy concentration distinguishes narrow refresh stripes from full-frame change',()=>{
  const a=new Uint32Array(width*height).fill(pixel(128));
  const uniform=new Uint32Array(a.length).fill(pixel(129));
  const striped=Uint32Array.from(a,(v,i)=>i%width>=190&&i%width<194?pixel(224):v);
  const full=temporalDiagnostics(a,uniform,width,height),stripe=temporalDiagnostics(a,striped,width,height);
  assert.equal(full.columnEnergyCV,0);
  assert.ok(stripe.columnEnergyCV>9);
  assert.equal(stripe.changedFraction,4/width);
  assert.equal(stripe.reliableFraction,null,'difference bands alone do not prove texture travel');
});

test('temporal diagnostics reject malformed frames and unbounded settings',()=>{
  const a=noise();
  for(const args of [[a,a,0,height],[a,a,width+.5,height],[a,a.subarray(1),width,height],[new Uint8Array(a.buffer),a,width,height]]){
    assert.throws(()=>temporalDiagnostics(...args),/Invalid temporal/);
  }
  for(const options of [{gridStepX:0},{sampleStep:Infinity},{patchRadiusX:-1},{maxShiftX:-1},{maxShiftX:0,maxShiftY:0},{minTextureRms:0},{minCorrelation:NaN},{minImprovement:Infinity},{minPeakMargin:-1}]){
    assert.throws(()=>temporalDiagnostics(a,a,width,height,options),/Invalid temporal/);
  }
});
