// Signal checks complement pair equality: valid matches alone do not measure
// contrast loss or accidental matches at a second, unsupported depth.
export function luminance(color){return .2126*(color&255)+.7152*(color>>>8&255)+.0722*(color>>>16&255);}
export function contrast(pixels){
  let sum=0,squares=0;
  for(const c of pixels){const y=luminance(c);sum+=y;squares+=y*y;}
  const mean=sum/pixels.length,sd=Math.sqrt(squares/pixels.length-mean*mean);
  return {mean,sd,rms:sd/mean};
}
export function correlation(pixels,width,height,shift){
  let a=0,b=0,aa=0,bb=0,ab=0,n=0;
  for(let y=0;y<height;y++)for(let x=0;x<width-shift;x++){
    const l=luminance(pixels[y*width+x]),r=luminance(pixels[y*width+x+shift]);
    a+=l;b+=r;aa+=l*l;bb+=r*r;ab+=l*r;n++;
  }
  return (ab-a*b/n)/Math.sqrt((aa-a*a/n)*(bb-b*b/n));
}
export function ringDepth(width,height){
  const pixels=new Uint8Array(width*height*4),depth=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const radius=Math.hypot(x-width/2,y-height/2),z=radius>38&&radius<82?.95:.05;
    depth[y*width+x]=z;
    const i=((height-1-y)*width+x)*4,q=Math.round(z*65535);
    pixels[i]=q>>8;pixels[i+1]=q&255;pixels[i+2]=3;pixels[i+3]=255;
  }
  return {pixels,depth};
}
