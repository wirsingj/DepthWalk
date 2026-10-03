import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {linkRow} from '../src/stereogram.js';

const width=640,height=48,settings={pattern:'quiet',temporalStability:true,surfaceDetail:.35};
function frame(t){
  const depth=Float32Array.from({length:width*height},(_,i)=>{const d=Math.abs(i%width-300-t);return d<100?.6+.24*(1-d/100):.12;});
  const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:[100,130,160][i%4]);
  return {width,height,depth,color,format:'proximity'};
}
test('Quiet seed history reduces motion change while preserving current RGB pairs and first frame',()=>{
  const plain=new DepthWalkFilter(),stable=new DepthWalkFilter();
  let previousA,previousB,aChange=0,bChange=0,last;
  for(let t=0;t<12;t++){
    const f=last=frame(t),a=plain.render(f,{...settings,temporalStability:false}).pixels.slice(),b=stable.render(f,settings).pixels.slice();
    if(!t)assert.deepEqual(b,a);
    else for(let i=0;i<a.length;i++){aChange+=((a[i]&255)-(previousA[i]&255))**2;bChange+=((b[i]&255)-(previousB[i]&255))**2;}
    for(let y=0;y<height;y++){
      const same=linkRow(f.depth.subarray(y*width,(y+1)*width),120,.5,new Int32Array(width));
      for(let x=0;x<width;x++)assert.equal(b[y*width+x],b[y*width+same[x]]);
    }
    previousA=a;previousB=b;
  }
  assert.ok(Math.sqrt(bChange/aChange)<.9);
  assert.deepEqual(stable.render(last,settings).pixels,previousB);
  // History carries seed identity only: a live source-color change is immediate.
  for(let i=0;i<last.color.length;i+=4)last.color[i]+=10;
  const recolored=stable.render(last,settings).pixels;
  for(let i=0;i<recolored.length;i++)assert.equal(recolored[i],(previousB[i]+10)>>>0);
});
test('Quiet history resets when settings or source-color availability change',()=>{
  const stable=new DepthWalkFilter(),last=frame(8);
  for(const change of [{spacing:96},{dotSize:2},{edges:0},{depthStrength:.3},{surfaceDetail:.65},{depthRange:30},{temporalStability:false}]){
    stable.render(frame(0),settings);stable.render(frame(4),settings);
    assert.deepEqual(stable.render(last,{...settings,...change}).pixels,new DepthWalkFilter().render(last,{...settings,...change}).pixels);
  }
  stable.render({...last,color:undefined},settings);
  assert.deepEqual(stable.render(last,settings).pixels,new DepthWalkFilter().render(last,settings).pixels);
  stable.render(frame(0),{...settings,windowPeriods:3});
  assert.deepEqual(stable.render(last,settings).pixels,new DepthWalkFilter().render(last,settings).pixels);
  assert.deepEqual(stable.render(last,{...settings,windowPeriods:3}).pixels,new DepthWalkFilter().render(last,{...settings,windowPeriods:3}).pixels);
});
test('Quiet temporal output stays seamless across cropped worker stripes',()=>{
  const whole=new DepthWalkFilter(),stripes=[new DepthWalkFilter(),new DepthWalkFilter()];
  for(let t=0;t<5;t++){
    const f=frame(t),before=f.color.slice(),joined=new Uint32Array(width*height);
    for(let k=0;k<2;k++){
      const start=k*height/2,end=(k+1)*height/2,halo=requiredHalo(),top=Math.max(0,start-halo),bottom=Math.min(height,end+halo);
      const part={...f,height:bottom-top,fullHeight:height,yOffset:top,cropTop:start-top,cropBottom:bottom-end,depth:f.depth.subarray(top*width,bottom*width),color:f.color.subarray(top*width*4,bottom*width*4)};
      joined.set(stripes[k].render(part,settings).pixels,start*width);
    }
    assert.deepEqual(joined,whole.render(f,settings).pixels);assert.deepEqual(f.color,before);
  }
});
