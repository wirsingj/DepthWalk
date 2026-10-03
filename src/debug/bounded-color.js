import {validateDepthFrame} from '../depth-frame.js';
import {validateSceneColor} from '../scene-color.js';
import {linkRow,separation} from '../stereogram.js';
import {surfaceHash,surfaceTone} from '../surface-stereo.js';

/** Lab-only causal intervention: change color transport, not stereo geometry.
 * The dense scalar carrier keeps its complete equivalence classes. RGB means
 * use staggered groups of at most four members, spanning at most three periods.
 * This deliberately relaxes some color equalities. It is NOT a fusion claim.
 */
export function boundedColor(frame,{detail=.55,bounded=true}={}){
  validateDepthFrame(frame);validateSceneColor(frame);
  if(frame.format!=='packed-proximity-rg16'||!frame.color)throw Error('Bounded color needs packed depth and aligned RGB');
  if(!Number.isFinite(detail)||detail<0||detail>1||typeof bounded!=='boolean')throw Error('Invalid bounded color settings');
  const {width,height,depth,color,origin='top-left',spacing=120,strength=.5}=frame;
  if(!Number.isFinite(spacing)||spacing<8||spacing>8192||!Number.isFinite(strength)||strength<0||strength>.5)throw Error('Invalid stereo calibration');
  const pixels=new Uint32Array(width*height),z=new Float32Array(width),same=new Int32Array(width),roots=new Int32Array(width),visible=new Uint8Array(width);
  const group=new Int32Array(width),tail=new Int32Array(width),count=new Uint32Array(width),sums=new Float64Array(width*3),limits=new Uint8Array(width);
  let pairs=0,colorPairs=0,maxSpan=0,maxMembers=0;
  for(let y=0;y<height;y++){
    const src=(origin==='bottom-left'?height-1-y:y)*width*4,dst=y*width;
    for(let x=0;x<width;x++)z[x]=(depth[src+x*4]*256+depth[src+x*4+1])/65535;
    linkRow(z,spacing,strength,same,null,visible);
    tail.fill(-1);count.fill(0);sums.fill(0);
    for(let x=width-1;x>=0;x--)roots[x]=same[x]===x?x:roots[same[x]];
    // Random phase per class/row avoids placing all group breaks on a stripe.
    // Hashes are deterministic; there is no time-dependent random noise.
    for(let x=width-1;x>=0;x--){
      const root=roots[x];let g=tail[root];
      if(g<0){g=x;limits[g]=bounded?1+surfaceHash(root,y)%4:4;}
      else if(bounded&&(count[g]>=limits[g]||g-x>3*spacing)){g=x;limits[g]=4;}
      tail[root]=g;group[x]=g;count[g]++;
      for(let c=0;c<3;c++)sums[g*3+c]+=color[src+x*4+c];
      maxSpan=Math.max(maxSpan,g-x);maxMembers=Math.max(maxMembers,count[g]);
    }
    for(let x=0;x<width;x++){
      const g=group[x],h=surfaceHash(roots[x],y);
      const amplitude=(h>>>8&255)<Math.round((.06+.24*detail)*256)?50+detail*65:5;
      pixels[dst+x]=surfaceTone(sums[g*3]/count[g],sums[g*3+1]/count[g],sums[g*3+2]/count[g],h,amplitude);
      if(visible[x]){const s=separation(z[x],spacing,strength),l=x-(s>>1);pairs++;colorPairs+=group[l]===group[l+s];}
    }
  }
  return {pixels,stats:{pairs,colorPairs,colorPairFraction:pairs?colorPairs/pairs:0,maxSpan,maxMembers}};
}
