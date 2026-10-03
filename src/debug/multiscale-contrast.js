// CPU research: match horizontal/vertical contrast at two scales along visible
// geometry. No optimizer access to observer scores or reconstructed disparities.
export function solveMultiscaleContrast(target,pairs,weights,width,weight,iterations,conflicts=0){
  const n=target.length/3,height=n/width,byCenter=new Int32Array(n).fill(-1);
  for(let p=0;p<pairs.length;p+=2)byCenter[pairs[p]+((pairs[p+1]-pairs[p])>>1)]=p;
  const offsets=[[1,0],[4,0],[0,1],[0,4]],terms=[],termWeights=[],degree=new Float64Array(n);
  for(let p=0;p<pairs.length;p+=2){
    const a=pairs[p],b=pairs[p+1],center=a+((b-a)>>1),x=center%width,y=Math.floor(center/width);
    for(const [dx,dy] of offsets){
      if(x+dx>=width||y+dy>=height)continue;
      const other=byCenter[center+dx+dy*width];if(other<0)continue;
      const c=pairs[other],d=pairs[other+1];if(Math.abs((b-a)-(d-c))>2)continue;
      const w=Math.min(weights[p/2],weights[other/2])/offsets.length;
      terms.push(a,c,b,d);termWeights.push(w);
      degree[a]+=w*.5;degree[c]+=w*.5;degree[b]+=w*.5;degree[d]+=w*.5;
    }
  }
  const indices=Int32Array.from(terms),coefficients=Float64Array.from(termWeights);
  let maximum=0;for(const d of degree)maximum=Math.max(maximum,d);
  const step=.8/(1+weight*2*maximum),current=Float64Array.from(target),gradient=new Float64Array(target.length);
  const measure=()=>{
    let source=0,matching=0;
    for(let i=0;i<current.length;i++)source+=(current[i]-target[i])**2;
    for(let j=0;j<indices.length;j+=4){
      const a=indices[j]*3,c=indices[j+1]*3,b=indices[j+2]*3,d=indices[j+3]*3;
      for(let ch=0;ch<3;ch++){const delta=(current[c+ch]-current[a+ch]-current[d+ch]+current[b+ch])*.5;matching+=coefficients[j/4]*delta*delta;}
    }
    return {source,matching,total:source+weight*matching};
  };
  const before=measure();
  for(let t=0;t<iterations;t++){
    for(let i=0;i<current.length;i++)gradient[i]=current[i]-target[i];
    for(let j=0;j<indices.length;j+=4){
      const a=indices[j]*3,c=indices[j+1]*3,b=indices[j+2]*3,d=indices[j+3]*3,w=weight*coefficients[j/4]*.25;
      for(let ch=0;ch<3;ch++){
        const delta=(current[c+ch]-current[a+ch]-current[d+ch]+current[b+ch])*w;
        gradient[a+ch]-=delta;gradient[c+ch]+=delta;gradient[b+ch]+=delta;gradient[d+ch]-=delta;
      }
    }
    for(let i=0;i<current.length;i++)current[i]=Math.max(0,Math.min(255,current[i]-step*gradient[i]));
  }
  const pixels=new Uint32Array(n);
  for(let i=0;i<n;i++)pixels[i]=(0xff000000|Math.round(current[i*3])|Math.round(current[i*3+1])<<8|Math.round(current[i*3+2])<<16)>>>0;
  return {pixels,before,after:measure(),constraints:pairs.length/2,contrastTerms:coefficients.length,conflicts,iterations,matchingDomain:'geometry-aware two-scale horizontal/vertical contrast'};
}
