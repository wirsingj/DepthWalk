import {linkRow,separation} from '../stereogram.js';
import {validateDepthFrame} from '../depth-frame.js';

// Correlation is invariant to positive affine brightness changes. Unlike RGB
// equality, it does not require distant surface means to become identical.
// Derivatives are analytic; the observer is not used by this optimizer.
export function correlationGradient(a,b){
  const n=a.length;
  if(n!==b.length||n<2)throw Error('Matching patches required');
  let ma=0,mb=0;for(let i=0;i<n;i++){ma+=a[i];mb+=b[i];}ma/=n;mb/=n;
  let aa=0,bb=0,ab=0;
  for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;aa+=x*x;bb+=y*y;ab+=x*y;}
  const da=new Float64Array(n),db=new Float64Array(n);
  if(aa<1||bb<1)return {correlation:0,da,db,valid:false};
  const denominator=Math.sqrt(aa*bb),correlation=ab/denominator;
  for(let i=0;i<n;i++){
    da[i]=(b[i]-mb)/denominator-correlation*(a[i]-ma)/aa;
    db[i]=(a[i]-ma)/denominator-correlation*(b[i]-mb)/bb;
  }
  return {correlation,da,db,valid:true};
}

export function synthesizeFeatures(frame,initial,{iterations=16,learningRate=20}={}){
  validateDepthFrame(frame);
  const {width,height,depth,origin='top-left',spacing=120,strength=.5}=frame,n=width*height;
  if(frame.format!=='packed-proximity-rg16'||!(initial instanceof Uint32Array)||initial.length!==n
    ||!Number.isInteger(iterations)||iterations<0||iterations>64||!Number.isFinite(learningRate)||learningRate<=0||learningRate>100)throw Error('Invalid feature synthesis inputs');
  const left=new Int32Array(n).fill(-1),right=new Int32Array(n),disparity=new Uint16Array(n);
  const z=new Float32Array(width),same=new Int32Array(width),visible=new Uint8Array(width);
  for(let y=0;y<height;y++){
    const row=(origin==='bottom-left'?height-1-y:y)*width*4;
    for(let x=0;x<width;x++)z[x]=(depth[row+x*4]*256+depth[row+x*4+1])/65535;
    linkRow(z,spacing,strength,same,null,visible);
    for(let x=0;x<width;x++)if(visible[x]){
      const i=y*width+x,s=separation(z[x],spacing,strength);
      disparity[i]=s;left[i]=y*width+x-(s>>1);right[i]=left[i]+s;
    }
  }
  const patches=[];
  // Follow each sample's geometry instead of treating a depth boundary as one
  // translated rectangular patch. No RGB equivalence classes are solved here.
  for(let y=1;y<height-1;y+=4)for(let x=2;x<width-2;x+=4){
    const center=y*width+x;if(left[center]<0)continue;
    const a=[],b=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-2;dx<=2;dx++){
      const i=(y+dy)*width+x+dx;
      if(left[i]>=0&&Math.abs(disparity[i]-disparity[center])<=2){a.push(left[i]);b.push(right[i]);}
    }
    if(a.length>=6)patches.push([a,b]);
  }
  const target=Float64Array.from(initial,c=>(c&255)*.2126+(c>>>8&255)*.7152+(c>>>16&255)*.0722);
  const current=target.slice(),gradient=new Float64Array(n),count=new Uint16Array(n);
  for(let step=0;step<iterations;step++){
    gradient.fill(0);count.fill(0);
    for(const [a,b] of patches){
      const result=correlationGradient(a.map(i=>current[i]),b.map(i=>current[i]));
      if(!result.valid)continue;
      for(let j=0;j<a.length;j++){
        gradient[a[j]]-=result.da[j];gradient[b[j]]-=result.db[j];count[a[j]]++;count[b[j]]++;
      }
    }
    for(let i=0;i<n;i++)if(count[i]){
      // Soft source anchor and a fixed correction bound prevent contrast-only
      // optimization from inventing an unrelated picture or erasing texture.
      const delta=-learningRate*(gradient[i]/count[i]*256+(current[i]-target[i])*.01);
      current[i]=Math.max(target[i]-24,Math.min(target[i]+24,current[i]+delta));
    }
  }
  const pixels=new Uint32Array(n);
  for(let i=0;i<n;i++){
    const delta=current[i]-target[i];let p=0xff000000;
    for(let c=0;c<3;c++)p|=Math.round(Math.max(0,Math.min(255,(initial[i]>>>(8*c)&255)+delta)))<<(8*c);
    pixels[i]=p>>>0;
  }
  return {pixels,patches:patches.length};
}
