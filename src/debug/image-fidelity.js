// Image similarity only, never an input to disparity reconstruction. Broad-color
// error averages 25x9 native-pixel neighborhoods to discount fine dot grain.
export function imageFidelity(pixels,color,width,height,origin='bottom-left'){
  if(color===undefined||color===null)return null;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1
    ||!(pixels instanceof Uint32Array)||pixels.length!==width*height
    ||!(color instanceof Uint8Array||color instanceof Uint8ClampedArray)||color.length!==width*height*4
    ||!['top-left','bottom-left'].includes(origin))throw Error('Image fidelity requires aligned RGBA images and a valid origin');
  const stride=width+1,integral=new Float64Array(stride*(height+1));let squared=0,broadSquared=0,count=0;
  for(let c=0;c<3;c++){
    integral.fill(0);
    for(let y=0;y<height;y++){
      let row=0;const src=(origin==='bottom-left'?height-1-y:y)*width*4;
      for(let x=0;x<width;x++){
        const delta=(pixels[y*width+x]>>>(c*8)&255)-color[src+x*4+c];squared+=delta*delta;row+=delta;
        integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
      }
    }
    for(let y=4;y<height-4;y+=4)for(let x=12;x<width-12;x+=4){
      const x0=x-12,x1=x+13,y0=y-4,y1=y+5;
      const delta=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/225;
      broadSquared+=delta*delta;count++;
    }
  }
  return {sourceRMSE:Math.sqrt(squared/(width*height*3)),broadColorRMSE:count?Math.sqrt(broadSquared/count):null,broadWindow:[25,9],scope:'RGB error versus aligned original render; not a perceptual fusion score'};
}
