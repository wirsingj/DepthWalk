import test from 'node:test';
import assert from 'node:assert/strict';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {createFoundationTexture} from '../src/foundation-texture.js';
import {linkRow} from '../src/stereogram.js';

const fixture=(width=384,height=48,fn=(x,y)=>x>130&&x<250&&y>12?.8:.1)=>({width,height,format:'proximity',depth:Float64Array.from({length:width*height},(_,i)=>fn(i%width,Math.floor(i/width)))});
// Independent floating-point ray check + disjoint sets, not the encoder's
// rightward insertion algorithm. Quantization is part of the input contract.
function oracle(row,spacing,strength,y){
  const z=Array.from(row,v=>Math.round(v*65535)/65535),mu=Math.round(strength*1000)/1000,n=z.length,parent=Array.from({length:n},(_,i)=>i),pairs=[];
  const root=x=>{while(parent[x]!==x)x=parent[x];return x;};
  for(let x=0;x<n;x++){
    const s=Math.floor(2*spacing*(1-mu*z[x])/(2-mu*z[x])+.5),l=x-Math.floor((s+(s%2)*(y%2))/2),r=l+s;
    if(l<0||r>=n)continue;
    let visible=true;
    if(mu)for(let t=1;;t++){
      const ray=z[x]+(2-mu*z[x])*t/(mu*spacing);if(ray>=1)break;
      if((x>=t&&z[x-t]>=ray)||(x+t<n&&z[x+t]>=ray)){visible=false;break;}
    }
    if(visible){const a=root(l),b=root(r);parent[Math.min(a,b)]=Math.max(a,b);pairs.push([l,r]);}
  }
  return {roots:parent.map((_,i)=>root(i)),pairs};
}
test('foundation links agree with independent ray/union oracle on layered, sloped and reversed depth',()=>{
  for(const parity of [0,1])for(const mu of [0,.27,.333,.5])for(const kind of [0,1,2]){
    const z=Float64Array.from({length:257},(_,x)=>kind===0?(x>70&&x<150?.91:.11):kind===1?.07+.86*x/257:.95-.85*x/257);
    const same=linkRow(z,53,mu,new Int32Array(z.length),null,null,undefined,null,parity);
    const roots=Array.from(same);for(let x=z.length-1;x>=0;x--)roots[x]=roots[same[x]];
    assert.deepEqual(roots,oracle(z,53,mu,parity).roots);
  }
});
test('all foundation carriers preserve visible correspondences without source-color influence',()=>{
  const frame=fixture(),filter=new FoundationFilter(),copy=frame.depth.slice();
  for(const carrier of ['binary','white','pink']){
    const settings={carrier,spacing:53,strength:.333},pixels=filter.render(frame,settings).pixels.slice();
    for(let y=0;y<frame.height;y++)for(const [l,r] of oracle(frame.depth.subarray(y*frame.width,(y+1)*frame.width),53,.333,y).pairs)assert.equal(pixels[y*frame.width+l],pixels[y*frame.width+r]);
    assert.deepEqual(filter.render({...frame,color:new Uint8Array(frame.width*frame.height*4).fill(255)},settings).pixels,pixels);
    assert.deepEqual(frame.depth,copy);
  }
});
test('binary reference has full contrast; near and far surfaces have different matching distances',()=>{
  const frame=fixture(640,12,x=>x>230&&x<440?.85:.1),pixels=new FoundationFilter().render(frame,{spacing:80,strength:.333}).pixels;
  assert.deepEqual(new Set(pixels),new Set([0xff000000,0xffffffff]));
  const rate=(start,end,s)=>{let hit=0,n=0;for(let y=0;y<12;y++)for(let x=start;x<end;x++){hit+=pixels[y*640+x]===pixels[y*640+x+s];n++;}return hit/n;};
  const near=Math.round(160*(1-.333*.85)/(2-.333*.85)),far=Math.round(160*(1-.333*.1)/(2-.333*.1));
  assert.ok(near<far);assert.equal(rate(270,330,near),1);assert.equal(rate(20,100,far),1);assert.ok(rate(270,330,far)<.65);
});
test('held frames are history independent, including carrier changes and return after motion',()=>{
  const filter=new FoundationFilter(),a=fixture(),b=fixture(384,48,x=>x>180?.75:.1);
  for(const carrier of ['binary','white','pink']){
    const settings={carrier,spacing:53},first=filter.render(a,settings).pixels.slice();
    filter.render(b,settings);filter.render(a,{carrier:carrier==='pink'?'white':'pink',spacing:53});
    assert.deepEqual(filter.render(a,settings).pixels,first);
  }
});
test('origin, packed depth and odd-offset stripes preserve the same reference image',()=>{
  const frame=fixture(192,33,(x,y)=>(Math.round((.1+.7*((x+y)%31)/31)*65535))/65535),filter=new FoundationFilter();
  for(const carrier of ['binary','pink']){
    const settings={carrier,spacing:43},expected=filter.render(frame,settings).pixels.slice(),packed=new Uint8Array(192*33*4);
    for(let y=0;y<33;y++)for(let x=0;x<192;x++){const q=Math.round(frame.depth[y*192+x]*65535),i=((32-y)*192+x)*4;packed[i]=q>>8;packed[i+1]=q&255;}
    assert.deepEqual(filter.render({...frame,depth:packed,format:'packed-proximity-rg16',origin:'bottom-left'},settings).pixels,expected);
    const combined=new Uint32Array(expected.length);
    for(const [offset,rows] of [[0,11],[11,22]]){
      const result=new FoundationFilter().render({...frame,height:rows,fullHeight:33,yOffset:offset,depth:frame.depth.slice(offset*192,(offset+rows)*192)},settings);
      combined.set(result.pixels,offset*192);
    }
    assert.deepEqual(combined,expected);
  }
});
function stats(a){const mean=a.reduce((s,v)=>s+v,0)/a.length;return {mean,rms:Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length)};}
function power(a,w,kx,ky){let r=0,im=0;for(let y=0;y<w;y++)for(let x=0;x<w;x++){const angle=2*Math.PI*(x*kx+y*ky)/w,v=a[y*w+x]-128;r+=v*Math.cos(angle);im+=v*Math.sin(angle);}return r*r+im*im;}
test('pink texture follows 1/f power against an independent DFT and matches white contrast',()=>{
  const w=128,white=createFoundationTexture(w,w,'white'),pink=createFoundationTexture(w,w,'pink');
  for(const a of [white,pink]){const s=stats(a);assert.ok(Math.abs(s.mean-128)<.15);assert.ok(s.rms>47&&s.rms<49);}
  // Fit the exponent rather than demanding exact bins after 8-bit clipping.
  const samples=[[2,1],[4,3],[7,6],[12,9],[20,15]].map(([x,y])=>[Math.log(Math.hypot(x,y)),Math.log(power(pink,w,x,y)/power(white,w,x,y))]);
  const mx=samples.reduce((s,p)=>s+p[0],0)/samples.length,my=samples.reduce((s,p)=>s+p[1],0)/samples.length;
  const slope=samples.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/samples.reduce((s,p)=>s+(p[0]-mx)**2,0);
  assert.ok(Math.abs(slope+1)<.1,`power exponent ${slope}: expected -1, not -2`);
  assert.deepEqual(createFoundationTexture(w,w,'pink'),pink);
  assert.notDeepEqual(createFoundationTexture(w,w,'pink',174),pink);
});
test('pink broad structure survives flat correspondence assignment without contrast collapse',()=>{
  const frame=fixture(384,128,()=>0),filter=new FoundationFilter();
  function neighbor(pixels){let energy=0,gradient=0;for(let y=0;y<128;y++)for(let x=1;x<384;x++){const i=y*384+x,v=pixels[i]&255;energy+=(v-128)**2;gradient+=(v-(pixels[i-1]&255))**2;}return gradient/energy;}
  const white=filter.render(frame,{carrier:'white',spacing:96}).pixels.slice(),pink=filter.render(frame,{carrier:'pink',spacing:96}).pixels.slice();
  assert.ok(neighbor(pink)<neighbor(white)*.85);
  const s=stats(Uint8Array.from(pink,v=>v&255));assert.ok(s.rms>40&&s.rms<55);
});
test('foundation validates bounded memory and settings, and maps invalid proximity to background',()=>{
  const filter=new FoundationFilter(),frame=fixture();
  for(const settings of [{carrier:'quiet'},{spacing:0},{spacing:384},{strength:.6},{seed:-1}])assert.throws(()=>filter.render(frame,settings));
  assert.throws(()=>createFoundationTexture(2048,2048,'pink'));assert.throws(()=>createFoundationTexture(1.5,20));
  assert.throws(()=>filter.render({...frame,format:'view-z'}));
  assert.throws(()=>filter.render(frame,{},new Uint32Array(1)));
  const output=new Uint32Array(frame.width*frame.height);assert.equal(filter.render(frame,{},output).pixels,output);
  assert.deepEqual(filter.render({...frame,depth:new Float64Array(frame.depth.length).fill(NaN)}).pixels,new FoundationFilter().render({...frame,depth:new Float64Array(frame.depth.length)}).pixels);
});
