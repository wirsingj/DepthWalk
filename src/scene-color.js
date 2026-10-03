import {CONTRAST_LEVELS,CONTOUR_LEVELS} from './pattern.js';

// Work in display/sRGB bytes. The texture's chroma is retained while a shared
// high-contrast luminance signal supplies the stereo correspondence.
export function sceneLuma(r,g,b){return (54*r+183*g+19*b)/256;}
export function shadeSceneColor(r,g,b,rowLuma,tone,edge=false){
  const l=sceneLuma(r,g,b),mean=48+.38*(.25*l+.75*rowLuma);
  const value=Math.min(250,mean*(edge?CONTOUR_LEVELS:CONTRAST_LEVELS)[tone]/138);
  const dr=r-l,dg=g-l,db=b-l;
  let chroma=1;
  for(const d of [dr,dg,db])if(d)chroma=Math.min(chroma,d>0?(255-value)/d:value/-d);
  return (0xff000000|Math.round(value+dr*chroma)|(Math.round(value+dg*chroma)<<8)|(Math.round(value+db*chroma)<<16))>>>0;
}

export function validateSceneColor(frame){
  if(frame.color===undefined)return;
  if(!(frame.color instanceof Uint8Array||frame.color instanceof Uint8ClampedArray)||frame.color.length!==frame.width*frame.height*4)
    throw Error('Scene color must be RGBA8 matching depth dimensions and row origin');
}
