import {linkRow,separation} from './stereogram.js';
import {surfaceHash} from './surface-stereo.js';

// Research mode: disparity is carried by linear-light luminance, not RGB equality.
// Source chromaticity is splatted to both visible eye endpoints, with nearest
// surface ownership. It never traverses transitive chains across the scanline.
// sRGB transfer is essential: matching gamma-encoded gray does not match light.
export const srgbToLinear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
export const linearToSrgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const linear=Float64Array.from({length:256},(_,v)=>srgbToLinear(v/255));
export function linearLuminance(pixel){return linear[pixel&255]*.2126+linear[pixel>>>8&255]*.7152+linear[pixel>>>16&255]*.0722;}
export function carrierLevel(hash,detail){
  const strong=(hash>>>8&255)<Math.round((.22+.3*detail)*256);
  const amplitude=strong?65+detail*30:8+detail*8;
  return Math.round(128+((hash&255)/255*2-1)*amplitude);
}
function seedLevel(x,y,cell,detail){return carrierLevel(surfaceHash(Math.floor(Math.max(0,x)/cell),Math.floor(y/cell)),detail);}
function smoothCarrier(x,y,cell,scale,detail){
  const r=Math.max(1,Math.round(scale)),a=seedLevel(x-r,y,cell,detail),b=seedLevel(x,y,cell,detail),c=seedLevel(x+r,y,cell,detail);
  // Filter in the seed domain, then copy through exact current correspondences.
  // Variance normalization avoids washing out the binocular matching signal.
  return Math.round(Math.max(24,Math.min(232,128+(a+2*b+c-512)/Math.sqrt(6))));
}
export function localChroma(r,g,b,level){
  const y=linear[level],rgb=[linear[r],linear[g],linear[b]],sourceY=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  const delta=rgb.map(c=>(c-sourceY)/Math.max(sourceY,.025)*y*.8);
  let gamut=1;
  for(const d of delta){if(d>0)gamut=Math.min(gamut,(1-y)/d);else if(d<0)gamut=Math.min(gamut,-y/d);}
  const c=delta.map(d=>Math.round(linearToSrgb(Math.max(0,Math.min(1,y+d*gamut)))*255));
  return (0xff000000|c[0]|c[1]<<8|c[2]<<16)>>>0;
}
function compatible(color,a,b){
  const ar=linear[color[a]],ag=linear[color[a+1]],ab=linear[color[a+2]],br=linear[color[b]],bg=linear[color[b+1]],bb=linear[color[b+2]],as=Math.max(.001,ar+ag+ab),bs=Math.max(.001,br+bg+bb);
  return Math.max(Math.abs(ar/as-br/bs),Math.abs(ag/as-bg/bs),Math.abs(ab/as-bb/bs))<=.1;
}
export function encodeChroma({packed,color,width,height,scale,yOffset,dotSize,spacing,strength,detail,out,workspace:w,history=null,lighting=0,inkContours=null}){
  const cell=Math.max(1,dotSize*scale);
  if(w.chromaOwners?.length!==width)Object.assign(w,{chromaOwners:new Uint32Array(width),chromaHeads:new Int32Array(width),chromaNext:new Int32Array(width),chromaCandidate:new Int32Array(width),chromaClaims:new Uint32Array(width),chromaLevels:new Uint8Array(width)});
  let reused=0,classes=0;
  for(let y=0;y<height;y++){
    const src=(height-1-y)*width*4,dst=y*width;
    for(let x=0;x<width;x++)w.z[x]=(packed[src+x*4]*256+packed[src+x*4+1])/65535;
    linkRow(w.z,spacing,strength,w.same,null,w.visible,w.quantized);
    w.chromaOwners.fill(0);
    for(let x=0;x<width;x++)if(w.visible[x]){
      const s=separation(w.z[x],spacing,strength),left=x-(s>>1),right=left+s,q=packed[src+x*4]*256+packed[src+x*4+1],owner=((q<<16)|(x+1))>>>0;
      w.chromaOwners[left]=Math.max(w.chromaOwners[left],owner);w.chromaOwners[right]=Math.max(w.chromaOwners[right],owner);
    }
    w.chromaHeads.fill(-1);w.chromaClaims.fill(0);w.chromaCandidate.fill(-1);
    for(let x=width-1;x>=0;x--){const root=w.roots[x]=w.same[x]===x?x:w.roots[w.same[x]];w.chromaNext[x]=w.chromaHeads[root];w.chromaHeads[root]=x;}
    if(history?.valid)for(let root=0;root<width;root++)if(w.roots[root]===root){
      let candidate=-1,votes=0,n=0;
      for(let m=w.chromaHeads[root];m!==-1;m=w.chromaNext[m]){const previous=history.roots[dst+m];if(!votes){candidate=previous;votes=1;}else votes+=candidate===previous?1:-1;n++;}
      let count=0;for(let m=w.chromaHeads[root];m!==-1;m=w.chromaNext[m])count+=history.roots[dst+m]===candidate;
      if(count*2>n){w.chromaCandidate[root]=candidate;w.chromaClaims[candidate]=Math.max(w.chromaClaims[candidate],((count<<16)|(root+1))>>>0);}
    }
    // A previous class may survive in only one new class. Splits get fresh seeds,
    // avoiding duplicate historical IDs that would add false depth matches.
    for(let root=0;root<width;root++)if(w.roots[root]===root){
      const candidate=w.chromaCandidate[root],retained=candidate>=0&&(w.chromaClaims[candidate]&65535)===root+1;
      const h=surfaceHash(Math.floor(root/cell),Math.floor((y+yOffset)/cell));
      w.chromaLevels[root]=retained?history.levels[dst+candidate]:history?smoothCarrier(root,y+yOffset,cell,scale,detail):carrierLevel(h,detail);reused+=retained;classes++;
    }
    for(let x=0;x<width;x++){
      let owner=w.chromaOwners[x]&65535;const level=w.chromaLevels[w.roots[x]];
      if(owner){
        const center=owner-1,s=separation(w.z[center],spacing,strength),left=center-(s>>1),other=x===left?left+s:left,partner=w.chromaOwners[other]&65535;
        if(!partner||!compatible(color,src+center*4,src+(partner-1)*4))owner=0;
      }
      const at=src+(owner-1)*4;
      // A disoccluded/unconstrained pixel has no eye-space color owner. A neutral
      // seed avoids reintroducing the original zero-disparity silhouette there.
      out[dst+x]=owner?localChroma(color[at],color[at+1],color[at+2],level):(0xff000000|level|level<<8|level<<16)>>>0;
      if(lighting){
        const pixel=out[dst+x];let result=0xff000000;
        for(let c=0;c<3;c++)result|=Math.round((pixel>>>(8*c)&255)*(1-lighting)+(owner?color[at+c]:128)*lighting)<<(8*c);
        out[dst+x]=result>>>0;
      }
      // Ink follows the visible source owner into both eyes, never a flat-screen
      // overlay or a transitive color chain. Only Soft paired opts into this.
      if(owner&&inkContours?.[dst+owner-1]){
        const pixel=out[dst+x];let result=0xff000000;
        for(let c=0;c<3;c++)result|=Math.round((pixel>>>(8*c)&255)*.45)<<(8*c);
        out[dst+x]=result>>>0;
      }
      if(history){history.roots[dst+x]=w.roots[x];history.levels[dst+x]=level;}
    }
  }
  if(history)history.valid=true;return {reused,classes};
}
