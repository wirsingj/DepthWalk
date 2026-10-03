// Cached spectral carrier: radial 2D pink power ~1/f, amplitude ~1/sqrt(f).
// Yankelevsky et al., https://arxiv.org/abs/1506.05036.
function randomAt(i,seed){
  let h=Math.imul(i^seed,0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);
  return ((h^(h>>>16))>>>0)+.5;
}
function fft(real,imag,inverse){
  const n=real.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
    if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
  }
  for(let size=2;size<=n;size*=2){
    const angle=(inverse?2:-2)*Math.PI/size,cr=Math.cos(angle),ci=Math.sin(angle);
    for(let start=0;start<n;start+=size){
      let wr=1,wi=0;
      for(let j=0;j<size/2;j++){
        const a=start+j,b=a+size/2,tr=wr*real[b]-wi*imag[b],ti=wr*imag[b]+wi*real[b];
        real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
        const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;
      }
    }
  }
  if(inverse)for(let i=0;i<n;i++){real[i]/=n;imag[i]/=n;}
}
function fft2(real,imag,w,h,inverse){
  for(let y=0;y<h;y++)fft(real.subarray(y*w,(y+1)*w),imag.subarray(y*w,(y+1)*w),inverse);
  const r=new Float64Array(h),im=new Float64Array(h);
  for(let x=0;x<w;x++){
    for(let y=0;y<h;y++){r[y]=real[y*w+x];im[y]=imag[y*w+x];}
    fft(r,im,inverse);
    for(let y=0;y<h;y++){real[y*w+x]=r[y];imag[y*w+x]=im[y];}
  }
}
export function createFoundationTexture(width,height,kind='binary',seed=173){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||width*height>2097152
    ||!['binary','white','pink'].includes(kind)||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid foundation texture');
  const w=2**Math.ceil(Math.log2(width)),h=2**Math.ceil(Math.log2(height)),out=new Uint8Array(width*height);
  if(kind==='binary'){
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)out[y*width+x]=randomAt(y*w+x,seed)>2147483648?255:0;
    return out;
  }
  const real=new Float64Array(w*h),imag=new Float64Array(real.length);
  for(let i=0;i<real.length;i+=2){
    const radius=Math.sqrt(-2*Math.log(randomAt(i,seed)/4294967296)),angle=2*Math.PI*randomAt(i+1,seed)/4294967296;
    real[i]=radius*Math.cos(angle);if(i+1<real.length)real[i+1]=radius*Math.sin(angle);
  }
  if(kind==='pink'){
    fft2(real,imag,w,h,false);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const f=Math.hypot(Math.min(x,w-x)/w,Math.min(y,h-y)/h),weight=f?1/Math.sqrt(f):0,i=y*w+x;
      real[i]*=weight;imag[i]*=weight;
    }
    fft2(real,imag,w,h,true);
  }
  // White/pink share mean and RMS contrast before byte quantization.
  let sum=0,squares=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=real[y*w+x];sum+=v;squares+=v*v;}
  const mean=sum/out.length,scale=48/Math.sqrt(Math.max(1e-20,squares/out.length-mean*mean));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)out[y*width+x]=Math.round(Math.max(0,Math.min(255,128+(real[y*w+x]-mean)*scale)));
  return out;
}
