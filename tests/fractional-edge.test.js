import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFractionalEdgeField,renderFractionalEdge} from '../src/debug/fractional-synthesis.js';
import {layeredTruth} from './fractional-observer-fixtures.js';
import {edgeProtocol,evaluateEdge,edgeRoutes,edgeTransition} from './fractional-edge-research.js';
import {changeStats,imageStats} from './fractional-phase-research.js';

test('continuous edge field preserves independently projected visible fractional pairs',()=>{
  for(const fixture of edgeProtocol.cases){
    const options={...fixture.options,seed:91},field=createFractionalEdgeField(options);
    const points=Array.from({length:1200},(_,i)=>({x:20+i*.2,y:i%9}));
    const truth=layeredTruth(points,options).records;
    let visible=0,occluded=0,unequalOccluded=0;
    for(const p of truth){
      if(p.occluded){
        occluded++;
        const far=options.farSeparation??51.625;
        unequalOccluded+=Math.abs(field.sample(p.x,p.y)-field.sample(p.x+far,p.y))>1;
      }else if(p.x+p.separation<319.5){
        visible++;
        assert.ok(Math.abs(field.sample(p.x,p.y)-field.sample(p.x+p.separation,p.y))<1e-8);
      }
    }
    assert.ok(visible>900);assert.ok(occluded>0);assert.ok(unequalOccluded/occluded>.8,'hidden background must not be linked through the foreground');
  }
});

test('analytic integration agrees with independent dense quadrature across visibility cuts',()=>{
  for(const options of [{height:1},{height:1,foregroundLeft:-6,foregroundRight:6,nearSeparation:36.2,farSeparation:51.1}]){
    const field=createFractionalEdgeField(options),image=field.render();
    for(const x of [0,20,103,121,138,155,162,174,205,253,299,319]){
      let sum=0;const count=16384;
      for(let k=0;k<count;k++)sum+=field.sample(x-.5+(k+.5)/count,0)/count;
      assert.ok(Math.abs(sum-image.pixels[x])<.015,`quadrature at ${x}`);
    }
    assert.ok(image.pixels.every(v=>v>=8-1e-8&&v<=248+1e-8));
  }
});

test('image-only edge checks retain foreground/background depth and reject original-target rounding',()=>{
  const points=[{x:60,y:4},{x:110,y:4},{x:144,y:4},{x:180,y:4},{x:230,y:4}];
  const continuous=evaluateEdge(renderFractionalEdge(),{},points);
  assert.equal(continuous.falseMatches,0);assert.ok(continuous.correct>=4);
  assert.ok(continuous.strata['foreground-boundary'].correct>=1);
  assert.equal(continuous.strata.occluded.accepted,0);
  const rounded=evaluateEdge(renderFractionalEdge({},{mode:'rounded'}),{},points);
  assert.ok(rounded.falseMatches>=4,'a plausible but wrong depth must fail original-geometry scoring');
});

test('shrinking depth steps reduce continuous changes without contrast normalization or history',()=>{
  let last=Infinity;
  for(const step of [1/4,1/8,1/16,1/32]){
    const a={nearSeparation:35.5-step/2},b={nearSeparation:35.5+step/2};
    const c1=renderFractionalEdge(a,{quantize:false}),c2=renderFractionalEdge(b,{quantize:false});
    const r1=renderFractionalEdge(a,{mode:'rounded',quantize:false}),r2=renderFractionalEdge(b,{mode:'rounded',quantize:false});
    const change=changeStats(c1.pixels,c2.pixels,320).rms;
    assert.ok(change<last*.6&&change<changeStats(r1.pixels,r2.pixels,320).rms);last=change;
    for(const image of [c1,c2,r1,r2]){
      const stats=imageStats(image.pixels,320);
      assert.ok(stats.sd>24&&stats.sd<29);assert.ok(stats.horizontalDifferenceRms>13);
      assert.equal(stats.outOfGamut,0);
    }
  }
});

test('supersampled links converge to the continuous pixel integral on grid-aligned depths',()=>{
  const target=renderFractionalEdge({},{quantize:false});
  const low=renderFractionalEdge({},{mode:'supersampled-links',subpixels:8,quantize:false});
  const high=renderFractionalEdge({},{mode:'supersampled-links',subpixels:64,quantize:false});
  const lowError=changeStats(target.pixels,low.pixels,320).rms,highError=changeStats(target.pixels,high.pixels,320).rms;
  assert.ok(highError<lowError);assert.ok(highError<.1);
});

test('out-and-back geometry, repeated rest and arbitrary render ordering reproduce exact images',()=>{
  for(const route of edgeRoutes())for(const mode of edgeProtocol.modes){
    const images=route.frames.map(o=>renderFractionalEdge({...o,height:1},{mode}).pixels);
    assert.deepEqual(images[0],images[1]);assert.deepEqual(images.at(-1),images.at(-2));
    for(let i=0;i<images.length;i++)assert.deepEqual(images[i],images[images.length-1-i]);
    assert.deepEqual(images[0],renderFractionalEdge({...route.frames[0],height:1},{mode}).pixels);
  }
});

test('geometry-relative diagnostic separates stationary far field from moving silhouettes',()=>{
  const from={},to={foregroundLeft:-26,foregroundRight:38};
  const a=renderFractionalEdge(from),b=renderFractionalEdge(to);
  const held=edgeTransition(a,a,from,from),moved=edgeTransition(a,b,from,to);
  assert.equal(held.rms,0);assert.equal(held.stationaryBackground.rms,0);
  assert.ok(moved.stationaryBackground.samples>0);assert.ok(moved.stationaryBackground.rms>0);
  assert.ok(moved.topColumns.some(c=>c.silhouetteDistance>2),'propagated texture changes occur away from the physical edge');
  const changingFar=edgeTransition(a,renderFractionalEdge({farSeparation:51.5}),from,{farSeparation:51.5});
  assert.equal(changingFar.stationaryBackground.rms,null,'no stationary far reference when far depth moves');
});

test('offline synthesis validates bounds and keeps truth and image decoding outside the renderer',()=>{
  for(const options of [{width:63},{height:0},{height:NaN},{seed:-1},{seed:1.5},{nearSeparation:Infinity},
    {nearSeparation:52},{farSeparation:100},{foregroundLeft:32},{screenDistance:0}])assert.throws(()=>renderFractionalEdge(options));
  for(const settings of [{mode:'blend'},{subpixels:0},{subpixels:65},{quantize:'yes'}])assert.throws(()=>renderFractionalEdge({},settings));
  const field=createFractionalEdgeField();
  assert.throws(()=>field.sample(NaN,0));assert.throws(()=>field.sample(10,9));
  const source=readFileSync(new URL('../src/debug/fractional-synthesis.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bimport\b/);
});
