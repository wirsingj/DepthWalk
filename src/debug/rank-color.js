import {DepthWalkFilter,DEFAULT_SETTINGS} from '../depthwalk.js';
import {linkRow,separation} from '../stereogram.js';
import {surfaceHash} from '../surface-stereo.js';
import {srgbToLinear,linearToSrgb} from '../chroma-stereo.js';
import {validateSceneColor} from '../scene-color.js';
import {prepareGeometry} from '../depth-frame.js';
import {detectContours,expandContours,contourRadius} from '../contours.js';
const linear=Float64Array.from({length:256},(_,v)=>srgbToLinear(v/255));
function compatible(color,a,b){
  const sa=Math.max(.001,linear[color[a]]+linear[color[a+1]]+linear[color[a+2]]),sb=Math.max(.001,linear[color[b]]+linear[color[b+1]]+linear[color[b+2]]);
  for(let c=0;c<3;c++)if(Math.abs(linear[color[a+c]]/sa-linear[color[b+c]]/sb)>.1)return false;
  return true;
}

// CPU hypothesis: share stochastic thresholds, not absolute source RGB, along
// stereo classes. Local projected color controls dot occupancy. This deliberately
// relaxes RGB equality; unchanged latent ranks are NOT evidence of final fusion.
export const RANK_PROFILES=[
  {id:'quiet',label:'Quiet · source colors',pattern:'quiet',surfaceDetail:.55,temporalStability:true,edges:3},
  {id:'rank',label:'Shared rank · local color and ink',pattern:'rank-color',surfaceDetail:.55,temporalStability:true,edges:3,gate:'banding'},
  {id:'rank-levels',label:'Shared rank · four color levels',pattern:'rank-levels',surfaceDetail:.55,temporalStability:true,edges:3,gate:'banding'},
  {id:'rank-stable',label:'Local dot color · overlap history',pattern:'rank-stable',surfaceDetail:.55,temporalStability:true,edges:3,gate:'banding'},
  {id:'rank-compatible',label:'Local dot color · compatible hues',pattern:'rank-compatible',surfaceDetail:.55,temporalStability:true,edges:3,gate:'banding'},
  {id:'anchor',label:'Local color · exact matching dots',pattern:'rank-anchor',surfaceDetail:.55,temporalStability:true,edges:3,gate:'banding'},
  {id:'modulated',label:'Local color · coherent contrast',pattern:'rank-modulated',surfaceDetail:.55,temporalStability:true,edges:3,gate:'banding'},
  {id:'original',label:'Original render · negative control',original:true,control:'negative'},
];

// Match previous and current classes by descending overlap. Each historical
// seed can survive in only one current class; unlike strict-majority transport,
// useful minority overlaps can survive splits. No old color/depth is retained.
export function transportRanks(roots,previous,width,height,dotSize=1){
  const hashes=new Uint32Array(roots.length);
  for(let y=0;y<height;y++){
    const offset=y*width,votes=new Map(),assigned=new Uint8Array(width),claimed=new Uint8Array(width),used=new Set();
    if(previous)for(let x=0;x<width;x++){
      const key=roots[offset+x]*width+previous.roots[offset+x];votes.set(key,(votes.get(key)||0)+1);
    }
    const pairs=[...votes].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
    for(const [key] of pairs){
      const root=Math.floor(key/width),old=key%width;
      const hash=previous.hashes[offset+old];
      if(assigned[root]||claimed[old]||used.has(hash))continue;
      hashes[offset+root]=hash;assigned[root]=1;claimed[old]=1;used.add(hash);
    }
    for(let x=0;x<width;x++)if(roots[offset+x]===x&&!assigned[x]){
      let salt=0,hash=surfaceHash(Math.floor(x/dotSize),Math.floor(y/dotSize));
      // A split may reuse an old root coordinate after that root's seed moved
      // elsewhere. Do not create a second unrelated copy of the same texture.
      while(used.has(hash))hash=surfaceHash(Math.floor(x/dotSize),Math.floor(y/dotSize)+ ++salt*104729);
      hashes[offset+x]=hash;used.add(hash);
    }
    for(let x=0;x<width;x++)hashes[offset+x]=hashes[offset+roots[offset+x]];
  }
  return hashes;
}

export function createRankRenderer(){
  const filter=new DepthWalkFilter(),geometry={};let neutral=null,rankHistory=null,historyKey='',row=null,contourBase=null,contourExpanded=null;
  return (frame,settings={},reset=false)=>{
    settings={...DEFAULT_SETTINGS,...settings};
    if(reset||!settings.temporalStability){filter.resetHistory();rankHistory=null;}
    if(!['rank-color','rank-levels','rank-stable','rank-compatible','rank-anchor','rank-modulated'].includes(settings.pattern)){rankHistory=null;return filter.render(frame,settings).pixels.slice();}
    if(frame.format!=='packed-proximity-rg16'||!frame.color||(settings.pixelRatio??1)!==1
      ||frame.cropTop||frame.cropBottom||frame.yOffset||settings.windowPeriods)throw Error('Rank research requires a complete native packed frame with color');
    validateSceneColor(frame);
    const {width,height,color,origin='top-left'}=frame;
    const overlap=['rank-stable','rank-compatible','rank-anchor','rank-modulated'].includes(settings.pattern);
    let roots,canonical,contours,hashes;
    if(overlap){
      if(![settings.spacing,settings.dotSize,settings.depthRange].every(v=>Number.isFinite(v)&&v>0)
        ||!Number.isFinite(settings.depthStrength)||settings.depthStrength<0||settings.depthStrength>.5
        ||!Number.isFinite(settings.surfaceDetail)||settings.surfaceDetail<0||settings.surfaceDetail>1
        ||![0,1,2,3].includes(settings.edges)||typeof settings.invertDepth!=='boolean'||typeof settings.temporalStability!=='boolean')throw Error('Invalid research settings');
      canonical=prepareGeometry(frame,settings,geometry).packed;roots=new Uint32Array(width*height);
      if(settings.edges){
        if(contourBase?.length!==width*height){contourBase=new Uint8Array(width*height);contourExpanded=new Uint8Array(width*height);}
        detectContours(canonical,width,height,1,contourBase,Math.min(settings.edges,2),frame.projection);
        contours=settings.edges===3?expandContours(contourBase,width,height,contourRadius(1,2),contourExpanded):contourBase;
      }
    }else{
      // Archived occupancy references retain their original majority history.
      if(neutral?.length!==color.length){neutral=new Uint8Array(color.length).fill(128);for(let i=3;i<neutral.length;i+=4)neutral[i]=255;}
      filter.render({...frame,color:neutral},{...settings,pattern:'quiet',temporalStability:true});
      roots=filter.quietHistory.roots;hashes=filter.quietHistory.hashes;
      canonical=filter.geometry.packed;contours=filter.contours;
    }
    const key=[settings.pattern,width,height,settings.spacing,settings.depthStrength,settings.depthRange,settings.invertDepth,settings.dotSize].join('/');
    if(key!==historyKey){rankHistory=null;historyKey=key;}
    const out=new Uint32Array(width*height),owners=new Int32Array(width*height),spacing=Math.max(8,Math.round(settings.spacing));
    if(row?.z.length!==width)row={z:new Float32Array(width),physical:new Float32Array(width),same:new Int32Array(width),visible:new Uint8Array(width),quantized:new Uint16Array(width)};
    const {z,physical,same,visible,quantized}=row;owners.fill(-1);
    for(let y=0;y<height;y++){
      const depthRow=(height-1-y)*width*4,offset=y*width;
      for(let x=0;x<width;x++){physical[x]=(canonical[depthRow+x*4]*256+canonical[depthRow+x*4+1])/65535;z[x]=settings.invertDepth?1-physical[x]:physical[x];}
      linkRow(z,spacing,settings.depthStrength,same,null,visible,quantized);
      if(overlap)for(let x=width-1;x>=0;x--)roots[offset+x]=same[x]===x?x:roots[offset+same[x]];
      for(let x=0;x<width;x++)if(visible[x]){
        const s=separation(z[x],spacing,settings.depthStrength),left=x-(s>>1);
        for(const endpoint of [left,left+s])if(owners[offset+endpoint]<0||physical[x]>=physical[owners[offset+endpoint]])owners[offset+endpoint]=x;
      }
    }
    if(overlap)hashes=transportRanks(roots,rankHistory,width,height,settings.dotSize);
    rankHistory=overlap&&settings.temporalStability?{roots,hashes}:null;
    for(let y=0;y<height;y++){
      const src=(origin==='bottom-left'?height-1-y:y)*width*4;
      for(let x=0;x<width;x++){
        const i=y*width+x,owner=owners[i],at=src+(owner<0?x:owner)*4;
        const threshold=((hashes[i]&65535)+.5)/65536;
        const shade=settings.edges&&owner>=0&&contours?.[y*width+owner] ? .65 : 1;
        if(settings.pattern==='rank-modulated'){
          // Every pixel carries the same signed contrast through its stereo
          // class. Local RGB sets its mean, not whether the match disappears.
          let pixel=0xff000000;
          for(let c=0;c<3;c++){
            const mean=16+223*color[at+c]*shade/255;
            pixel|=Math.round(mean+(2*threshold-1)*.9*Math.min(mean,255-mean))<<(8*c);
          }
          out[i]=pixel>>>0;continue;
        }
        if(settings.pattern==='rank-anchor'){
          // Half the complete correspondence classes carry opaque, exact RGB
          // landmarks. The other half carries local projected source color.
          // These are final-image matches, not an additive latent carrier.
          if((hashes[i]>>>16&255)<128){
            const level=(hashes[i]>>>25&1)?232:24;
            out[i]=(0xff000000|level|level<<8|level<<16)>>>0;
          }else out[i]=(0xff000000|Math.round(color[at]*shade)|Math.round(color[at+1]*shade)<<8|Math.round(color[at+2]*shade)<<16)>>>0;
          continue;
        }
        let neutralize=false;
        if(settings.pattern==='rank-compatible'&&owner>=0){
          const d=((height-1-y)*width+owner)*4,p=(canonical[d]*256+canonical[d+1])/65535;
          const s=separation(settings.invertDepth?1-p:p,spacing,settings.depthStrength),left=owner-(s>>1),other=x===left?left+s:left,partner=owners[y*width+other];
          neutralize=partner<0||!compatible(color,at,src+partner*4);
        }
        const gray=neutralize?Math.round(255*linearToSrgb(.2126*linear[color[at]]+.7152*linear[color[at+1]]+.0722*linear[color[at+2]])):0;
        let pixel=0xff000000;
        for(let c=0;c<3;c++){
          // Fixed contrast headroom prevents black/white source patches from
          // deleting every correspondence. No time-dependent noise or blur.
          if(settings.pattern==='rank-levels'){
            const target=Math.max(32,Math.min(224,color[at+c]*shade)),level=Math.floor((target-32)/64);
            pixel|=(32+64*(level+Number(threshold<(target-32)/64-level)))<<(8*c);
          }else{
            const occupancy=.15+.7*(neutralize?gray:color[at+c])/255*shade;
            if(threshold<occupancy)pixel|=255<<(8*c);
          }
        }
        out[i]=pixel>>>0;
      }
    }
    return out;
  };
}
