import {transportRanks} from '../src/debug/rank-color.js';
import {motionTone} from '../src/foundation-motion.js';

// Offline depth-only use of the existing rank experiment's greedy one-to-one
// overlap ownership. Retain procedural seed coordinates/epochs, never old RGB.
// It is not globally optimal matching and does not establish motion comfort.
export function createSeedAssignment(){
  let history=null;
  return (globalRoots,width,height,epoch=1)=>{
    if(!(globalRoots instanceof Uint32Array)||globalRoots.length!==width*height
      ||![width,height,epoch].every(v=>Number.isSafeInteger(v)&&v>0)
      ||width>2048||height>2048||width*height>2097152||epoch>0xffffffff)throw Error('Invalid seed assignment input');
    if(history&&(history.width!==width||history.height!==height))history=null;
    const roots=new Uint32Array(globalRoots.length);
    for(let i=0;i<roots.length;i++){
      const offset=Math.floor(i/width)*width,root=globalRoots[i];
      if(root<offset||root>=offset+width||globalRoots[root]!==root)throw Error('Invalid row-local class');
      roots[i]=root-offset;
    }
    const hashes=transportRanks(roots,history,width,height),anchors=new Uint32Array(roots.length),epochs=new Uint32Array(roots.length);
    const pixels=new Uint32Array(roots.length);let retainedPixels=0;
    for(let y=0;y<height;y++){
      const offset=y*width,old=new Map();
      if(history)for(let x=0;x<width;x++)if(history.roots[offset+x]===x){
        old.set(history.hashes[offset+x],{anchor:history.anchors[offset+x],epoch:history.epochs[offset+x]});
      }
      for(let x=0;x<width;x++)if(roots[offset+x]===x){
        const i=offset+x,seed=old.get(hashes[i]);
        anchors[i]=seed?.anchor??x;epochs[i]=seed?.epoch??epoch;
        const value=motionTone(anchors[i],y,'pink',epochs[i]);
        pixels[i]=(0xff000000|value*0x010101)>>>0;
      }
      for(let x=0;x<width;x++){
        const i=offset+x;pixels[i]=pixels[offset+roots[i]];
        retainedPixels+=!!history&&hashes[i]===history.hashes[i];
      }
    }
    history={width,height,roots,hashes,anchors,epochs};
    return {pixels,retainedPixelIdentityFraction:retainedPixels/roots.length};
  };
}

export function appearanceStats(pixels,width,height){
  let sum=0,square=0,dx=0,dy=0,clipped=0;
  for(let i=0;i<pixels.length;i++){
    const v=pixels[i]&255;sum+=v;square+=v*v;clipped+=v===0||v===255;
    if(i%width)dx+=(v-(pixels[i-1]&255))**2;
    if(i>=width)dy+=(v-(pixels[i-width]&255))**2;
  }
  const mean=sum/pixels.length;
  return {mean,sd:Math.sqrt(Math.max(0,square/pixels.length-mean*mean)),
    neighborRmsX:Math.sqrt(dx/((width-1)*height)),neighborRmsY:Math.sqrt(dy/((height-1)*width)),clippedFraction:clipped/pixels.length};
}
