// Geometry contours are measured before stereogram encoding. They travel with
// the depth constraints, never as a screen-space overlay on the finished image.
const normalX=new Float32Array(256),normalY=new Float32Array(256),normalZ=new Float32Array(256);
for(let code=0;code<256;code++){
  let x=(code&15)/15*2-1,y=(code>>4)/15*2-1;
  const z=1-Math.abs(x)-Math.abs(y);
  if(z<0){const oldX=x;x=(1-Math.abs(y))*(x<0?-1:1);y=(1-Math.abs(oldX))*(y<0?-1:1);}
  const length=Math.hypot(x,y,z);normalX[code]=x/length;normalY[code]=y/length;normalZ[code]=z/length;
}
const crease=new Uint8Array(65536);
for(let a=0;a<256;a++)for(let b=0;b<256;b++)
  crease[a*256+b]=normalX[a]*normalX[b]+normalY[a]*normalY[b]+normalZ[a]*normalZ[b]<.57;
// Inverse view-Z is affine across a perspective plane. This distinguishes a
// genuine depth break from the large smooth depth gradient near a floor horizon.
const inverseDepth=new Float32Array(65536);
const linearDepth=new Float32Array(65536);
for(let q=1;q<65535;q++){linearDepth[q]=-Math.log(q/65535);inverseDepth[q]=1/linearDepth[q];}
inverseDepth[65535]=1e6;

export function contourRadius(scale,size=2){return Math.max(1,Math.round(size*scale));}

// Ink straddles the physical rim so recessed relief has visible border samples
// too. Expand measured contours; never recompute normals from reversed depth.
export function expandContours(source,width,height,radius,out){
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    out[i]=source[i]||(x>=radius&&source[i-radius])||(x+radius<width&&source[i+radius])||(y>=radius&&source[i-radius*width])||(y+radius<height&&source[i+radius*width])?255:0;
  }
  return out;
}

// Input rows are GPU bottom-up. Output is top-down. Worker inputs include a
// radius-sized halo above/below their stripe, so horizontal edges have no seams.
export function detectContours(pixels,width,height,scale,out=new Uint8Array(width*height),size=2,projection='perspective'){
  const radius=contourRadius(scale,size),stride=width*4;
  const planeDepth=projection==='orthographic'?linearDepth:inverseDepth;
  out.fill(0);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,z=pixels[i]*256+pixels[i+1];
    if(!z)continue; // Never paint the sky side of a silhouette.
    const normal=pixels[i+3],threshold=Math.max(100,z*.045);
    let edge=false;
    for(let side=0;side<4;side++){
      if((side===0&&x<radius)||(side===1&&x+radius>=width)||(side===2&&y<radius)||(side===3&&y+radius>=height))continue;
      const j=i+(side===0?-radius*4:side===1?radius*4:side===2?-radius*stride:radius*stride);
      const neighbor=pixels[j]*256+pixels[j+1],delta=z-neighbor;
      // Outline the foreground surface. A different normal also reveals
      // building corners where depth itself is continuous.
      let depthBreak=false;
      if(delta>threshold){
        if(!neighbor)depthBreak=true;
        else{
          const opposite=2*i-j;
          const canCompare=side<2?x>=radius&&x+radius<width:y>=radius&&y+radius<height;
          if(canCompare){
            const other=pixels[opposite]*256+pixels[opposite+1],center=planeDepth[z];
            depthBreak=Math.abs(2*center-planeDepth[neighbor]-planeDepth[other])>Math.max(1e-6,center*.015);
          }
        }
      }
      if(depthBreak||(neighbor>0&&delta>=-threshold&&crease[normal*256+pixels[j+3]])){edge=true;break;}
    }
    if(edge)out[(height-1-y)*width+x]=255;
  }
  return out;
}
