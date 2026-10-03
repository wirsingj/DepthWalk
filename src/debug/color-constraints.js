import {validateDepthFrame} from '../depth-frame.js';
import {validateSceneColor} from '../scene-color.js';
import {linkRow,separation} from '../stereogram.js';

// Least-squares lower bound for exact RGB classes and the supplied screen-space
// target. This is algebra, not a perceptual prediction or a new stereo decoder.
export function classColorBound(target,roots){
  const n=roots.length;
  if(target.length!==n*3)throw Error('Class target dimensions differ');
  const sums=new Float64Array(n*3),counts=new Uint32Array(n),fit=new Float64Array(n*3);
  for(let i=0;i<n;i++){
    const root=roots[i];if(!Number.isInteger(root)||root<0||root>=n)throw Error('Invalid class root');
    counts[root]++;for(let c=0;c<3;c++)sums[root*3+c]+=target[i*3+c];
  }
  let error=0;
  for(let i=0;i<n;i++)for(let c=0;c<3;c++){
    const v=sums[roots[i]*3+c]/counts[roots[i]];fit[i*3+c]=v;error+=(v-target[i*3+c])**2;
  }
  return {fit,squaredError:error,rmse:Math.sqrt(error/(n*3))};
}

export function analyzeColorConstraints(frame){
  validateDepthFrame(frame);validateSceneColor(frame);
  if(frame.format!=='packed-proximity-rg16'||!frame.color)throw Error('Constraint analysis needs packed depth and color');
  const {width,height,depth,color,origin='top-left',spacing=120,strength=.5}=frame;
  const z=new Float32Array(width),roots=new Int32Array(width),same=new Int32Array(width),visible=new Uint8Array(width);
  const target=new Float64Array(width*3),minimum=new Int32Array(width),maximum=new Int32Array(width);
  const demands=new Uint32Array(width),first=new Float64Array(width*3),conflict=new Uint8Array(width);
  let error=0,widePixels=0,conflictedPixels=0,demandedPixels=0,maxSpan=0,pairs=0;
  for(let y=0;y<height;y++){
    const row=(origin==='bottom-left'?height-1-y:y)*width*4;
    for(let x=0;x<width;x++){
      z[x]=(depth[row+x*4]*256+depth[row+x*4+1])/65535;
      for(let c=0;c<3;c++)target[x*3+c]=color[row+x*4+c];
    }
    linkRow(z,spacing,strength,same,null,visible);
    for(let x=width-1;x>=0;x--)roots[x]=same[x]===x?x:roots[same[x]];
    error+=classColorBound(target,roots).squaredError;
    minimum.fill(width);maximum.fill(-1);demands.fill(0);conflict.fill(0);
    for(let x=0;x<width;x++){minimum[roots[x]]=Math.min(minimum[roots[x]],x);maximum[roots[x]]=Math.max(maximum[roots[x]],x);}
    for(let x=0;x<width;x++){
      const span=maximum[roots[x]]-minimum[roots[x]];maxSpan=Math.max(maxSpan,span);widePixels+=span>spacing*3;
      if(!visible[x])continue;
      const s=separation(z[x],spacing,strength),left=x-(s>>1);pairs++;
      for(const at of [left,left+s]){
        if(demands[at]){
          for(let c=0;c<3;c++)if(Math.abs(first[at*3+c]-target[x*3+c])>16)conflict[at]=1;
        }else for(let c=0;c<3;c++)first[at*3+c]=target[x*3+c];
        demands[at]++;
      }
    }
    for(let x=0;x<width;x++){demandedPixels+=demands[x]>0;conflictedPixels+=conflict[x];}
  }
  return {exactRGBSourceRMSELowerBound:Math.sqrt(error/(width*height*3)),fractionPixelsInClassesWiderThanThreePeriods:widePixels/(width*height),maxClassSpanPixels:maxSpan,conflictingEndpointFraction:demandedPixels?conflictedPixels/demandedPixels:0,visiblePairs:pairs,
    scope:'Geometric feasibility, not human fusion: exact RGB graph projection versus the original screen-space image. Endpoint conflicts compare source-center RGB demands (>16 byte levels in any channel). Threshold is descriptive, not a comfort gate.'};
}
