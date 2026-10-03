import test from 'node:test';
import assert from 'node:assert/strict';
import {observeFrame,inspectPixel,evaluateObserver,compareSequence,diagnose,measureColorSpread} from '../src/debug/observer.js';
const width=480,height=60,spacing=96,period=72;
function stimulus(seed=0,colorConflict=false,repeat=period){
  return Uint32Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);let h=Math.imul(x%repeat+31+seed*53,374761393)^Math.imul(y+83,668265263);h=Math.imul(h^(h>>>13),1274126177);const v=50+((h^(h>>>16))>>>0)%151;
    if(!colorConflict)return (0xff000000|v|v<<8|v<<16)>>>0;
    // Opponent tints with closely matched luminance, alternating repeat cells.
    const warm=Math.floor(x/period)%2===0,r=warm?v+35:v-35,g=warm?v-10:v+10;
    return (0xff000000|r|g<<8|v<<16)>>>0;
  });
}
const image=pixels=>({pixels,width,height,spacing,strength:.5});
const observe=pixels=>observeFrame(image(pixels),{maxColumns:36,maxRows:10});
test('independent observer recovers an analytical repeat, flags harmonics separately, and aligns eye colors',()=>{
  const d=observe(stimulus());assert.ok(d.summary.supportedFraction>.9,JSON.stringify(d.summary));
  assert.ok(d.summary.harmonicAlternativeFraction>.4);assert.equal(d.summary.colorConflictFraction,0);
  assert.ok([...d.disparity].filter(Number.isFinite).every(v=>v===period));
  const p=inspectPixel(image(stimulus()),240,30);assert.equal(p.disparity,period);assert.equal(p.roundTrip,0);assert.equal(p.scaleDifference,0);assert.deepEqual(p.left,p.right);
});
test('flat images have no supported depth and cannot gain confidence from ground truth',()=>{
  const d=observe(new Uint32Array(width*height).fill(0xff808080));assert.equal(d.summary.supportedFraction,0);assert.equal(d.summary.valid,0);
  assert.ok(diagnose(d.summary).some(f=>f.code==='weak-support'));
  const depth=new Uint8Array(width*height*4);const before=d.disparity.slice();evaluateObserver(d,{depth});depth.fill(255);evaluateObserver(d,{depth});assert.deepEqual(d.disparity,before);
});
test('an apparently decodable stereo carrier still exposes eye-color disagreement',()=>{
  const good=observe(stimulus()),bad=observe(stimulus(0,true));
  assert.ok(bad.summary.colorConflictFraction>.6,JSON.stringify(bad.summary));
  assert.ok(bad.summary.supportedFraction>.6,'control should retain depth evidence');
  assert.ok(diagnose(bad.summary).some(f=>f.code==='color-conflict'));assert.equal(good.summary.colorConflictFraction,0);
});
test('wrong disparity is rejected independently of image contrast and coverage',()=>{
  const observed=observe(stimulus()),depth=new Uint8Array(width*height*4),evaluation=evaluateObserver(observed,{depth});
  assert.equal(evaluation.summary.all.within2,0);assert.equal(evaluation.summary.all.mean,24);
  assert.ok(diagnose(observed.summary,evaluation.summary).some(f=>f.code==='wrong-depth'));
});
test('freshly randomized but valid stereo detects motion static that single-frame disparity misses',()=>{
  const a=stimulus(0),b=stimulus(1),oa=observe(a),ob=observe(b);
  assert.ok(ob.summary.supportedFraction>.9);
  const still=compareSequence([{pixels:a,observed:oa,phase:'hold'},{pixels:a,observed:oa,phase:'hold'}]);
  const unstable=compareSequence([{pixels:a,observed:oa,phase:'hold'},{pixels:b,observed:ob,phase:'hold'}]);
  assert.equal(still.summary.stationaryMaxChangedFraction,0);assert.ok(unstable.summary.stationaryMaxChangedFraction>.9);assert.ok(unstable.summary.screenLumaRMS>.1);
  assert.ok(diagnose(ob.summary,null,unstable.summary).some(f=>f.code==='stationary-drift'));
});
test('region maps leave image-border exclusions unscored and thresholds do not claim comfort',()=>{
  const d=observe(stimulus());assert.ok(d.summary.eligible<d.columns*d.rows);assert.ok(d.summary.supportedFraction>.9);
  const flags=diagnose(d.summary);assert.ok(flags.some(f=>f.code==='no-flags'));assert.match(flags[0].message,/unmeasured/);
  assert.throws(()=>observeFrame(image(new Uint32Array(10))),/Invalid/);
});
test('temporal disparity evaluation removes intended motion but detects stale decoded depth',()=>{
  function frame(period){
    const pixels=stimulus(0,false,period),observed=observe(pixels),depth=new Uint8Array(width*height*4),q=Math.round(2*(spacing-period)/(.5*(2*spacing-period))*65535);
    for(let i=0;i<depth.length;i+=4){depth[i]=q>>8;depth[i+1]=q&255;}
    return {pixels,observed,evaluation:evaluateObserver(observed,{depth}),depth,phase:'move'};
  }
  const a=frame(72),b=frame(76),good=compareSequence([a,b]);assert.equal(good.summary.truthCorrectedDisparityRMS,0);assert.ok(good.summary.screenLumaRMS>0);
  const lagged={...a,evaluation:evaluateObserver(a.observed,{depth:b.depth})};assert.equal(compareSequence([a,lagged]).summary.truthCorrectedDisparityRMS,4);
});
test('counterfactual color probe distinguishes local edits from remote repeated outlines',()=>{
  const w=640,h=4,base=new Uint32Array(w*h).fill(0xff888888),mask=new Uint8Array(w*h),local=base.slice(),repeated=base.slice();
  for(let y=0;y<h;y++)for(let x=300;x<320;x++){mask[y*w+x]=1;local[y*w+x]=0xffaa33dd;repeated[y*w+x]=0xffaa33dd;repeated[y*w+x-240]=0xffaa33dd;}
  assert.equal(measureColorSpread(base,local,mask,w,h,96).summary.remoteFraction,0);
  const spill=measureColorSpread(base,repeated,mask,w,h,96);assert.equal(spill.summary.remoteFraction,.5);assert.ok(spill.summary.farthestPixels>144);
});

test('linear color distance transform handles disconnected masks, empty rows and image boundaries',()=>{
  const w=320,h=7,base=new Uint32Array(w*h).fill(0xff888888),changed=base.slice(),mask=new Uint8Array(w*h);
  const points=[[],[0],[319],[45,175,302],[9,10,11,12],[100,219],[]];
  let affected=0,remote=0,farthest=0;
  const expected=new Float32Array(base.length);
  for(let y=0;y<h;y++){
    for(const x of points[y])mask[y*w+x]=1;
    for(let x=0;x<w;x++)if((x+y)%3===0){
      changed[y*w+x]=0xffaa33dd;affected++;
      const distance=Math.min(...points[y].map(p=>Math.abs(x-p)));
      remote+=distance>48;expected[y*w+x]=distance>48?1:.35;farthest=Math.max(farthest,distance);
    }
  }
  const result=measureColorSpread(base,changed,mask,w,h,32);
  assert.deepEqual(result.map,expected);assert.equal(result.summary.affected,affected);
  assert.equal(result.summary.remote,remote);assert.equal(result.summary.farthestPixels,Number.isFinite(farthest)?farthest:null);
});

test('observer rejects malformed grids and unbounded calibration rather than silently reporting empty success',()=>{
  for(const options of [{maxColumns:0},{maxRows:-1},{maxRows:Infinity},{maxColumns:2.5}])assert.throws(()=>observeFrame(image(stimulus()),options),/grid/);
  for(const spacing of [NaN,Infinity,1e9])assert.throws(()=>inspectPixel({...image(stimulus()),spacing},20,20),/Invalid/);
  assert.throws(()=>inspectPixel(image(stimulus()),NaN,20),/probe/);
  assert.throws(()=>evaluateObserver(observe(stimulus()),{depth:new Uint8Array(width*height*4),origin:'guess'}),/origin/);
});

test('a remote color-spread warning cannot also claim that no thresholds were crossed',()=>{
  const findings=diagnose({supportedFraction:1},null,null,{remoteFraction:.2});
  assert.deepEqual(findings.map(f=>f.code),['color-spread']);
});
