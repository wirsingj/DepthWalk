import {DepthWalkFilter} from '../depthwalk.js';
import {linkRow} from '../stereogram.js';
import {validateDepthFrame} from '../depth-frame.js';
import {validateSceneColor} from '../scene-color.js';

// Fixed CPU experiment: suppress coherent color seams before adding the existing
// unfiltered, class-matched stereo carrier. This is not a shipped filter option.
export const COLOR_BASE_PROFILES=[
  {id:'quiet',label:'Quiet · current color',pattern:'quiet',surfaceDetail:.55,temporalStability:true},
  {id:'color-base',label:'Smooth class color · rejected candidate',pattern:'research-color-base',surfaceDetail:.55,temporalStability:true,gate:'banding'},
  {id:'source-base',label:'Source color prefilter · rejected candidate',pattern:'research-source-base',surfaceDetail:.55,temporalStability:true,gate:'banding'},
  {id:'original',label:'Original render',original:true,control:'negative'},
];
export function smoothColorBase(frame,settings,classSpace=true){
  validateDepthFrame(frame);validateSceneColor(frame);
  const {width,height,color,depth,origin='top-left'}=frame;
  if(frame.format!=='packed-proximity-rg16'||!color||color.length!==width*height*4)throw Error('Color-base experiment needs aligned packed depth and color');
  // This CPU research fixture operates only at one render pixel per display pixel.
  if((settings.pixelRatio??1)!==1||!Number.isFinite(settings.spacing)||settings.spacing<8||settings.spacing>8192
    ||!Number.isFinite(settings.depthStrength)||settings.depthStrength<0||settings.depthStrength>.5
    ||typeof (settings.invertDepth??false)!=='boolean'||typeof classSpace!=='boolean')throw Error('Invalid color-base calibration');
  const radius=8,output=color.slice();
  const z=new Float32Array(width),same=new Int32Array(width),roots=new Int32Array(width),count=new Uint32Array(width);
  const sums=new Float64Array(width),values=new Float64Array(width),next=new Float64Array(width),prefix=new Float64Array(width+1);
  for(let y=0;y<height;y++){
    const src=(origin==='bottom-left'?height-1-y:y)*width*4;
    for(let x=0;x<width;x++){const p=(depth[src+x*4]*256+depth[src+x*4+1])/65535;z[x]=settings.invertDepth?1-p:p;}
    linkRow(z,settings.spacing,settings.depthStrength,same);
    count.fill(0);
    for(let x=width-1;x>=0;x--){roots[x]=same[x]===x?x:roots[same[x]];count[roots[x]]++;}
    const project=()=>{
      sums.fill(0);for(let x=0;x<width;x++)sums[roots[x]]+=values[x];
      for(let x=0;x<width;x++)values[x]=sums[roots[x]]/count[roots[x]];
    };
    for(let c=0;c<3;c++){
      for(let x=0;x<width;x++)values[x]=color[src+x*4+c];
      if(classSpace)project();
      for(let iteration=0;iteration<2;iteration++){
        prefix[0]=0;for(let x=0;x<width;x++)prefix[x+1]=prefix[x]+values[x];
        for(let x=0;x<width;x++){const lo=Math.max(0,x-radius),hi=Math.min(width,x+radius+1);next[x]=(prefix[hi]-prefix[lo])/(hi-lo);}
        values.set(next);if(classSpace)project();
      }
      for(let x=0;x<width;x++)output[src+x*4+c]=Math.round(values[x]);
    }
  }
  return output;
}
export function createColorBaseRenderer(){
  const filter=new DepthWalkFilter();
  return (frame,settings,reset)=>{
    if(reset)filter.resetHistory();
    if(!['research-color-base','research-source-base'].includes(settings.pattern))return filter.render(frame,settings).pixels.slice();
    const color=smoothColorBase(frame,settings,settings.pattern==='research-color-base');
    return filter.render({...frame,color},{...settings,pattern:'quiet'}).pixels.slice();
  };
}
