import test from 'node:test';
import assert from 'node:assert/strict';
import {createCarrier,renderPlane,decodeDisparity,changeStats,fixture,runFractionalPhaseResearch} from './fractional-phase-research.js';

test('analytic pixel integral agrees with independent spatial quadrature',()=>{
  const carrier=createCarrier({height:1,harmonics:5}),separation=47.375,anchor=10.3,width=32;
  const image=renderPlane(carrier,separation,{width,anchor});
  for(const x of [0,7,15,31]){
    let integrated=0;const samples=4096;
    for(let j=0;j<samples;j++){
      const u=x-.5+(j+.5)/samples;
      let value=128;
      for(let k=0;k<carrier.harmonics;k++)value+=carrier.amplitude*carrier.weights[k]*
        Math.cos(2*Math.PI*(k+1)*(u-anchor)/separation+carrier.phases[0][k]);
      integrated+=value/samples;
    }
    assert.ok(Math.abs(image[x]-integrated)<1e-6);
  }
  assert.throws(()=>renderPlane(carrier,10),/Nyquist/);
  assert.throws(()=>renderPlane(carrier,NaN),/Nyquist/);
});

test('image-only decoder handles an independently specified fractional periodic control',()=>{
  const {width,height}=fixture,period=49.375;
  // Independently constructed mixture, without the renderer or its random field.
  const pixels=Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width),angle=2*Math.PI*x/period;
    return Math.round(128+35*Math.sin(angle+.17*y)+28*Math.cos(3*angle+.61*y)+23*Math.sin(7*angle+.37*y));
  });
  const decoded=decodeDisparity(pixels,width,height);
  assert.equal(decoded.accepted,true);assert.ok(Math.abs(decoded.separation-period)<=1/32);
  assert.throws(()=>decodeDisparity(pixels,width-1,height),/domain/);
});

test('matched fractional experiment retains depth and contrast while exposing coherent motion',()=>{
  const report=runFractionalPhaseResearch();
  for(const sequence of Object.values(report.sequences)){
    assert.equal(sequence.heldExact,true);
    for(const precision of ['float','byte']){
      assert.equal(sequence[precision].exactReturn,true);assert.equal(sequence[precision].outOfGamut,0);
      assert.ok(sequence[precision].contrastSD.min>20);
      assert.ok(sequence[precision].contrastSD.max/sequence[precision].contrastSD.min<1.04);
    }
  }
  const continuous=report.sequences.continuous.float,rounded=report.sequences.rounded.float;
  assert.ok(Math.abs(continuous.contrastSD.min/rounded.contrastSD.min-1)<.02);
  assert.ok(Math.abs(continuous.horizontalDifferenceRms.min/rounded.horizontalDifferenceRms.min-1)<.03);
  for(let i=0;i<report.crossings.length;i++){
    const row=report.crossings[i];
    assert.equal(row.continuous.reverseRms,row.continuous.float.rms);
    assert.equal(row.rounded.reverseRms,row.rounded.float.rms);
    assert.ok(row.continuous.float.rms<row.rounded.float.rms);
    assert.equal(row.rounded.float.rms,report.crossings[0].rounded.float.rms);
    if(i){
      const ratio=row.continuous.float.rms/report.crossings[i-1].continuous.float.rms;
      assert.ok(ratio>.45&&ratio<.55,'halved separation steps should approximately halve float RMS');
      assert.ok(row.continuous.byte.rms<report.crossings[i-1].continuous.byte.rms);
    }
  }
  for(const row of report.decoded)for(const precision of ['float','byte']){
    assert.equal(row[precision].accepted,true);assert.ok(Math.abs(row[precision].separation-row.separation)<=1/32);
  }
  for(const row of [...report.roundedDecoded,...report.controls.knownDifferentCarrier]){
    assert.equal(row.result.accepted,true);assert.ok(Math.abs(row.result.separation-row.separation)<=1/32);
  }
  for(const name of ['flat','unrelatedNoise','ambiguousPeriodic'])assert.equal(report.controls[name].accepted,false,name);
  assert.ok(report.spectrum.maxCyclesPerPixel<report.spectrum.nyquist);
  assert.ok(report.spectrum.pixelAreaPowerRetention.min>.9);
  for(const direction of ['expansion','contraction'])for(const patch of report.motion[direction]){
    assert.ok(Math.abs(patch.shift-patch.predictedShift)<.15,'image evidence should retain predicted coherent movement');
    assert.ok(patch.correlation>.97);
  }
  for(const patch of report.motion.stationary){assert.equal(patch.shift,0);assert.ok(Math.abs(patch.improvement)<1e-10);}
});

test('research frames are history-free and rounded separation provides an actual discontinuous control',()=>{
  const carrier=createCarrier(),initial=renderPlane(carrier,47.25);
  renderPlane(carrier,47.75);assert.deepEqual(renderPlane(carrier,47.25),initial);
  const a=renderPlane(carrier,47.49,{rounded:true}),b=renderPlane(carrier,47.499,{rounded:true});
  assert.equal(changeStats(a,b,fixture.width).rms,0);
  assert.ok(changeStats(a,renderPlane(carrier,47.501,{rounded:true}),fixture.width).rms>5);
  assert.throws(()=>changeStats(a,b.subarray(1),fixture.width),/frames/);
});
