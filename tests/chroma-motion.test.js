import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {linkRow} from '../src/stereogram.js';

const width=960,height=64;
export function motionFrame(t){
  const depth=new Float32Array(width*height),color=new Uint8Array(width*height*4).fill(128);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=x-(430+t),radius=110+Math.abs(y-height/2)*.4;
    depth[y*width+x]=Math.abs(dx)<radius?.6+.24*(1-Math.abs(dx)/radius):.12;
    color[(y*width+x)*4+3]=255;
  }
  return {width,height,depth,color,format:'proximity'};
}
const difference=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=((a[i]&255)-(b[i]&255))**2;return sum/a.length;};
test('carrier transport reduces motion flicker without blur, stale disparity or stationary drift',()=>{
  const plain=new DepthWalkFilter(),stable=new DepthWalkFilter(),settings={pattern:'chroma',surfaceDetail:.65};
  let oldPlain,oldStable,plainError=0,stableError=0,reused=0,classes=0,lastFrame;
  for(let t=0;t<24;t++){
    const frame=lastFrame=motionFrame(t),a=plain.render(frame,settings).pixels.slice(),b=stable.render(frame,{...settings,temporalStability:true}).pixels.slice();
    if(t){plainError+=difference(a,oldPlain);stableError+=difference(b,oldStable);reused+=stable.temporalStats.reused;classes+=stable.temporalStats.classes;}
    for(let y=0;y<height;y++){
      const same=linkRow(frame.depth.subarray(y*width,(y+1)*width),120,.5,new Int32Array(width));
      for(let x=0;x<width;x++)assert.equal(b[y*width+x],b[y*width+same[x]],'history violated CURRENT depth constraints');
    }
    oldPlain=a;oldStable=b;
  }
  const deviation=a=>{let sum=0,sq=0;for(const p of a){const v=p&255;sum+=v;sq+=v*v;}return Math.sqrt(sq/a.length-(sum/a.length)**2);};
  const contrastRatio=deviation(oldStable)/deviation(oldPlain),ratio=Math.sqrt(stableError/plainError);console.log(JSON.stringify({motionRMSRatio:ratio,reusedFraction:reused/classes,contrastRatio}));
  assert.ok(ratio<.8,`motion RMS ratio ${ratio}`);
  assert.ok(contrastRatio>.85,`motion smoothing washed out contrast: ${contrastRatio}`);
  assert.ok(stable.render(lastFrame,{...settings,temporalStability:true}).pixels.every((v,i)=>v===oldStable[i]),'stationary carrier drift');
  const reset=stable.render(lastFrame,{...settings,surfaceDetail:.5,temporalStability:true}).pixels.slice();
  assert.ok(new DepthWalkFilter().render(lastFrame,{...settings,surfaceDetail:.5,temporalStability:true}).pixels.every((v,i)=>v===reset[i]),'setting change must reset history');
});
