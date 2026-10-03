import test from 'node:test';
import assert from 'node:assert/strict';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {motionTone,FoundationMotion} from '../src/foundation-motion.js';
import {motionCoherence} from './foundation-motion-quality.js';
import {contrast} from './stereo-quality.js';
import {linkRow} from '../src/stereogram.js';
import {reconstructStereogram} from '../src/debug/reconstruct.js';
import {grayscaleRegions,regionChange} from './foundation-luminance-research.js';

test('motion texture freezes immediately at rest and refreshes no faster than 60 Hz',()=>{
  const motion=new FoundationMotion();
  assert.equal(motion.update('start',0,true),0);
  assert.equal(motion.update('walk1',1,true),1);
  assert.equal(motion.update('walk2',5,true),1);
  assert.equal(motion.update('walk3',18,true),2);
  assert.equal(motion.update('walk3',9999,true),2);
  assert.equal(motion.update('look',10000,true),3);
  assert.equal(motion.update('look',10001,false),0);
  assert.equal(motion.update('look',10002,true),3);
});

test('frame-sync grain follows accepted moving frames through jitter, stalls and cadence switches',()=>{
  for(const hz of [30,50,59.94,60,120,144,240]){
    const motion=new FoundationMotion();motion.update('start',0,true,'frame');
    let accepted=0;
    for(let i=1;i<=120;i++){
      // Missed submissions never call update; a later frame uses current pose.
      if(i%11===0)continue;
      assert.equal(motion.update(String(i),i*1000/hz+(i%2?.12:-.12),true,'frame'),++accepted);
    }
    assert.equal(motion.movingFrames,accepted);assert.equal(motion.refreshes,accepted);
    assert.equal(motion.update('120',10000,true,'baseline'),accepted,'switching while stopped changed the image');
    assert.equal(motion.update('120',20000,true,'frame'),accepted,'idle frame changed');
    assert.equal(motion.update('disabled',21000,false,'frame'),0);
    assert.equal(motion.update('disabled',22000,true,'frame'),accepted);
    assert.equal(motion.update('new pose',22001,true,'frame'),accepted+1);
  }
  const motion=new FoundationMotion();motion.update('start',0,true);motion.frame=0xffffffff;
  assert.equal(motion.update('move',1,true,'frame'),1,'frame identifier wrapped to static mode');
  assert.throws(()=>motion.update('move',2,true,'guess'),/Invalid grain cadence/);
});

test('timer baseline exposes half-rate jitter while frame sync refreshes each frame',()=>{
  const baseline=new FoundationMotion(),candidate=new FoundationMotion();
  baseline.update('0',0,true);candidate.update('0',0,true,'frame');
  for(let i=1;i<=600;i++){
    const now=i*1000/60+(i%2?.12:-.12);
    baseline.update(String(i),now,true);candidate.update(String(i),now,true,'frame');
  }
  assert.equal(baseline.refreshes,300);assert.equal(candidate.refreshes,600);
  assert.equal(baseline.movingFrames,600);assert.equal(candidate.movingFrames,600);
});

test('independent moving carriers suppress directional texture motion while retaining exact depth pairs',()=>{
  const width=640,height=160,filter=new FoundationFilter();
  for(const carrier of ['binary','white','pink'])for(const movement of ['turn','approach']){
    let basePrevious,dynamicPrevious,baseMotion=0,dynamicMotion=0;
    for(let frame=0;frame<5;frame++){
      const depth=Float64Array.from({length:width*height},(_,i)=>{
        const x=i%width,y=Math.floor(i/width),sx=movement==='turn'?x+frame*3:(x-width/2)/(1+frame*.012)+width/2;
        return sx>190&&sx<450&&y>24&&y<136?.78:.1+.2*sx/width;
      });
      const input={width,height,depth,format:'proximity'},settings={spacing:96,strength:.33,carrier};
      const base=filter.render(input,settings).pixels.slice(),dynamic=filter.render(input,{...settings,noiseFrame:frame+1}).pixels.slice();
      for(let y=0;y<height;y++){
        const row=depth.subarray(y*width,(y+1)*width),same=linkRow(row,96,.33,new Int32Array(width),null,null,undefined,null,y);
        for(let x=0;x<width;x++)assert.equal(dynamic[y*width+x],dynamic[y*width+same[x]]);
      }
      assert.ok(contrast(dynamic).rms>=contrast(base).rms*.85,'texture contrast weakened');
      assert.deepEqual(filter.render(input,{...settings,noiseFrame:frame+1}).pixels,dynamic,'held frame drifted');
      if(frame){baseMotion+=motionCoherence(basePrevious,base,width,height);dynamicMotion+=motionCoherence(dynamicPrevious,dynamic,width,height);}
      basePrevious=base;dynamicPrevious=dynamic;
    }
    assert.ok(dynamicMotion<baseMotion*.3,`${carrier}/${movement}: coherence ratio ${dynamicMotion/baseMotion}`);
    assert.ok(dynamicMotion/4<.25,`${carrier}/${movement}: directional peak ${dynamicMotion/4}`);
  }
});

test('sampled raw dynamic carriers keep RMS contrast and broad pink structure',()=>{
  // Raw fields do not establish stable mean brightness after stereo classes
  // replicate a subset of their pixels. See foundation-luminance-research.js.
  const width=128,height=128;
  for(const frame of [1,2,3,127,65537]){
    const fields=['white','pink'].map(carrier=>Float64Array.from({length:width*height},(_,i)=>motionTone(i%width,Math.floor(i/width),carrier,frame)));
    const gradient=fields.map(a=>{let sum=0,energy=0,difference=0;for(let i=0;i<a.length;i++){sum+=a[i];energy+=(a[i]-128)**2;if(i%width)difference+=(a[i]-a[i-1])**2;}assert.ok(Math.abs(sum/a.length-128)<5);assert.ok(Math.sqrt(energy/a.length)>43&&Math.sqrt(energy/a.length)<53);return difference/energy;});
    assert.ok(gradient[1]<gradient[0]*.8,'pink lost broad texture');
  }
});

test('encoded grayscale diagnostics expose regional flashes hidden by a stable whole-image mean',()=>{
  const gray=value=>(0xff000000|value|value<<8|value<<16)>>>0;
  const width=6,height=3,a=new Uint32Array(width*height).fill(gray(128));
  const b=Uint32Array.from(a,(_,i)=>gray(i%width<2?168:i%width>=4?88:128));
  const first=grayscaleRegions(a,width,height),second=grayscaleRegions(b,width,height);
  const delta=regionChange(first,second);
  assert.equal(delta.absoluteMeanDelta,0,'regional brightening and darkening should cancel globally');
  assert.equal(delta.peakRegionDelta,40,'local luminance changes must remain visible to the diagnostic');
  assert.deepEqual(delta.signedRegionDeltas,[40,0,-40,40,0,-40,40,0,-40]);
  assert.equal(regionChange(second,second).peakRegionDelta,0,'a held image must have no reported flicker');
  assert.throws(()=>grayscaleRegions(Uint32Array.of(0xff0000ff),1,1,1,1),/grayscale/);
  assert.throws(()=>grayscaleRegions(a,width,height,7,3),/dimensions/);
});

test('moving carrier keeps origin/worker seams deterministic and validates frame identifiers',()=>{
  const width=192,height=33,depth=Float64Array.from({length:width*height},(_,i)=>.1+.7*(i%width)/width),settings={carrier:'pink',spacing:43,noiseFrame:0xffffffff};
  const full=new FoundationFilter().render({width,height,depth,format:'proximity'},settings).pixels.slice(),striped=new Uint32Array(full.length);
  for(const [start,end] of [[0,11],[11,33]])striped.set(new FoundationFilter().render({width,height:end-start,fullHeight:height,yOffset:start,depth:depth.slice(start*width,end*width),format:'proximity'},settings).pixels,start*width);
  assert.deepEqual(striped,full);
  for(const noiseFrame of [-1,.5,NaN,0x100000000])assert.throws(()=>new FoundationFilter().render({width,height,depth,format:'proximity'},{...settings,noiseFrame}));
});

test('procedural pink power follows an approximate 1/f slope across independent frames',()=>{
  const width=128,bins=[2,4,8,16,32],sums=bins.map(()=>[0,0]);
  for(const frame of [1,2,3,4])for(const [kind,carrier] of ['white','pink'].entries()){
    const field=Float64Array.from({length:width*width},(_,i)=>motionTone(i%width,Math.floor(i/width),carrier,frame)-128);
    for(const [bin,kx] of bins.entries())for(let ky=-4;ky<4;ky++){
      let real=0,imag=0;
      for(let y=0;y<width;y++)for(let x=0;x<width;x++){const angle=2*Math.PI*(x*kx+y*ky)/width,v=field[y*width+x];real+=v*Math.cos(angle);imag+=v*Math.sin(angle);}
      sums[bin][kind]+=real*real+imag*imag;
    }
  }
  const x=bins.map(Math.log),y=sums.map(([white,pink])=>Math.log(pink/white)),mx=x.reduce((s,v)=>s+v)/x.length,my=y.reduce((s,v)=>s+v)/y.length;
  const slope=x.reduce((sum,v,i)=>sum+(v-mx)*(y[i]-my),0)/x.reduce((sum,v)=>sum+(v-mx)**2,0);
  assert.ok(slope> -1.3&&slope< -.7,`pink/white power exponent ${slope}`);
});

test('accepted moving pink baseline retains decoded support, not just valid correspondence',()=>{
  const width=640,height=360;
  const depth=Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);return x>200&&x<430&&y>50&&y<320?.8:.15;
  });
  const {pixels}=new FoundationFilter().render({width,height,depth,format:'proximity'},
    {carrier:'pink',spacing:96,strength:.33,noiseFrame:2});
  const decoded=reconstructStereogram({pixels,width,height,spacing:96,strength:.33,maxColumns:64,maxRows:36});
  // Fixed decoder thresholds include local contrast. Correct disparities alone
  // missed the support loss caused by a 25% contrast-reduction trial. These are
  // reference-regression bounds, not validated human perception thresholds.
  assert.ok(decoded.summary.valid>1900,'insufficient decoded area');
  assert.ok(decoded.summary.reliableFraction>.85,'moving texture lost strong depth support');
  assert.ok(decoded.summary.weakContrastFraction<.2,'too much weak matching texture');
});

test('contrast comparison scales current tones without changing matching or refreshing held grain',()=>{
  const width=192,height=33,filter=new FoundationFilter();
  const input={width,height,format:'proximity',depth:Float64Array.from({length:width*height},(_,i)=>i%width>70&&i%width<135?.85:.1)};
  for(const noiseFrame of [0,1,2])for(const carrierContrast of [.75,.5]){
    const settings={carrier:'pink',spacing:43,noiseFrame};
    const a=filter.render(input,settings).pixels.slice(),b=filter.render(input,{...settings,carrierContrast}).pixels.slice();
    const ratio=contrast(b).sd/contrast(a).sd;assert.ok(Math.abs(ratio-carrierContrast)<.01);
    for(let y=0;y<height;y++){
      const same=linkRow(input.depth.subarray(y*width,(y+1)*width),43,.333,new Int32Array(width),null,null,undefined,null,y);
      for(let x=0;x<width;x++)assert.equal(b[y*width+x],b[y*width+same[x]]);
    }
    assert.ok(b.every((v,i)=>(v&255)===Math.round(128+((a[i]&255)-128)*carrierContrast)));
    assert.deepEqual(filter.render(input,{...settings,carrierContrast}).pixels,b);
    assert.deepEqual(filter.render(input,settings).pixels,a);
  }
  for(const carrierContrast of [NaN,.49,1.01,'0.75'])assert.throws(()=>filter.render(input,{spacing:43,carrierContrast}));
});
