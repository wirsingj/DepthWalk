import {decodeDepth,validateDepthFrame} from './depth-frame.js';

// Reverse the displayed relief, independently of the host's device reverse-Z.
// Keep origin, camera metadata and aligned color; never mutate host depth.
export function invertDepthFrame(frame,depthRange=22,cache={}){
  validateDepthFrame(frame);
  if(!(Number.isFinite(depthRange)&&depthRange>0))throw Error('Depth range must be positive');
  const {width,height}=frame,n=width*height;
  if(cache.packed?.length!==n*4)cache.packed=new Uint8Array(n*4);
  const packed=cache.packed;
  const direct=frame.format==='packed-proximity-rg16'&&(frame.depthRange??22)===depthRange;
  if(!direct){
    if(cache.distance?.length!==n)cache.distance=new Float32Array(n);
    decodeDepth(frame,cache.distance);
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const source=((frame.origin==='bottom-left'?height-1-y:y)*width+x)*4;
    const q=65535-(direct?frame.depth[source]*256+frame.depth[source+1]:Math.round(Math.exp(-cache.distance[y*width+x]/depthRange)*65535));
    packed[source]=q>>8;packed[source+1]=q&255;packed[source+2]=0;packed[source+3]=255;
  }
  return {...frame,depth:packed,depthRange,format:'packed-proximity-rg16'};
}
