import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
const width=600,height=45;
function repeated(period){
  return Uint32Array.from({length:width*height},(_,i)=>{let h=Math.imul((i%width)%period+31,374761393)^Math.imul(Math.floor(i/width)+83,668265263);h=Math.imul(h^(h>>>13),1274126177);const t=40+((h^(h>>>16))>>>0)%193;return(0xff000000|t|t<<8|t<<16)>>>0;});
}
const decode=pixels=>reconstructStereogram({pixels,width,height,spacing:120,strength:.5,maxColumns:100,maxRows:15});
test('independent decoder recovers a hand-constructed repeat period without source depth',()=>{
  for(const period of [80,96,113,120]){
    const d=decode(repeated(period)),values=[...d.disparity].filter(Number.isFinite);
    assert.ok(values.filter(v=>v===period).length/values.length>.995);
    assert.ok(d.summary.reliableFraction>.95);
    assert.ok(d.summary.alternateLayerFraction>.3,'harmonic repeats should be reported, not hidden');
  }
});
test('changing comparison ground truth never changes the recovered image',()=>{
  const decoded=decode(repeated(96)),before=decoded.disparity.slice(),depth=new Uint8Array(width*height*4);
  const far=compareReconstruction(decoded,{depth});
  for(let i=0;i<depth.length;i+=4){depth[i]=255;depth[i+1]=255;}
  const near=compareReconstruction(decoded,{depth});
  assert.deepEqual(decoded.disparity,before);assert.equal(far.summary.meanDisparityError,24);assert.equal(near.summary.meanDisparityError,16);
});
test('blank and blurred signals do not receive the confidence of sharp dots',()=>{
  const flat=decode(new Uint32Array(width*height).fill(0xff888888));assert.equal(flat.summary.valid,0);
  const sharp=repeated(96),blurred=new Uint32Array(sharp.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sum=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy));sum+=sharp[yy*width+xx]&255;n++;}
    const t=Math.round(sum/n);blurred[y*width+x]=(0xff000000|t|t<<8|t<<16)>>>0;
  }
  const a=decode(sharp),b=decode(blurred);assert.ok(b.summary.meanDotContrast<a.summary.meanDotContrast*.5);assert.ok(b.summary.reliableFraction<a.summary.reliableFraction*.5);
});
test('absent reconstruction evidence is unmeasured rather than zero error',()=>{
  const decoded=decode(new Uint32Array(width*height).fill(0xff888888));
  for(const key of ['reliableFraction','ambiguousFraction','alternateLayerFraction','meanDotContrast','weakContrastFraction'])assert.equal(decoded.summary[key],null,key);
  const {summary}=compareReconstruction(decoded,{depth:new Uint8Array(width*height*4)});
  assert.equal(summary.compared,0);
  for(const key of ['meanDisparityError','withinTwoPixels','confidentWrongFraction','interiorWithinTwoPixels'])assert.equal(summary[key],null,key);
});

test('overlapping geometry can be decoded independently with error and ambiguity exposed',()=>{
  const w=600,h=90,depth=Float32Array.from({length:w*h},(_,i)=>i%w>210&&i%w<390&&Math.floor(i/w)>15&&Math.floor(i/w)<75?5:45);
  const pixels=new DepthWalkFilter().render({width:w,height:h,depth},{pattern:'mono',edges:0}).pixels.slice();
  const d=reconstructStereogram({pixels,width:w,height:h,maxColumns:100,maxRows:30});
  const packed=new Uint8Array(w*h*4);for(let i=0;i<depth.length;i++){const q=Math.round(Math.exp(-depth[i]/22)*65535);packed[i*4]=q>>8;packed[i*4+1]=q&255;}
  const c=compareReconstruction(d,{depth:packed,origin:'top-left'});
  assert.ok(c.summary.interiorWithinTwoPixels>.92,JSON.stringify(c.summary));
  assert.ok(d.summary.reliableFraction>.65);
});
