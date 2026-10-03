import {DepthWalkFilter} from '../depthwalk.js';
import {encodeChroma} from '../chroma-stereo.js';

// CPU lab wrapper; rejected ink does not add an option to the product filter.
export function createInkRenderer(){
  const filter=new DepthWalkFilter();
  const render=(frame,settings,reset)=>{
    if(reset)filter.resetHistory();
    const ink=settings.pattern==='research-ink';
    const pixels=filter.render(frame,ink?{...settings,pattern:'chroma-soft'}:settings).pixels;
    if(!ink)return pixels.slice();
    const before=pixels.slice();
    const {width,height}=frame;
    // Same-frame second encode retains the exact current history seed. It only
    // applies the fixed local contour operation for this isolated experiment.
    encodeChroma({packed:settings.invertDepth?filter.stereoPacked:filter.geometry.packed,
      color:frame.origin==='bottom-left'?frame.color:filter.color,width,height,
      scale:settings.pixelRatio??1,yOffset:0,dotSize:settings.dotSize??1,
      spacing:settings.spacing,strength:settings.depthStrength,detail:settings.surfaceDetail,
      out:pixels,workspace:filter.workspace,history:filter.chromaHistory,lighting:.25,inkContours:filter.contours});
    render.changedPixels.push(pixels.reduce((n,v,i)=>n+Number(v!==before[i]),0));
    return pixels.slice();
  };
  render.changedPixels=[];return render;
}
