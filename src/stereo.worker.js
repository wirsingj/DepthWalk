import { DepthWalkFilter } from './depthwalk.js';
import {FoundationFilter} from './foundation-stereo.js';
const filter=new DepthWalkFilter();
const foundation=new FoundationFilter();
self.onmessage = ({ data }) => {
  if(data.resetHistory){filter.resetHistory();return;}
  const { width, height, fullHeight, spacing, strength, scale, buffer, version, yOffset, grain, inputHeight, topHalo, bottomHalo, edges, verticalFov } = data;
  const output = new Uint32Array(data.output || width * height);
  const start = performance.now();
  const frame={depth:new Uint8Array(buffer),color:data.color?new Uint8Array(data.color):undefined,width,height:inputHeight,fullHeight,yOffset:yOffset-topHalo,cropTop:topHalo,cropBottom:bottomHalo,
    format:'packed-proximity-rg16',origin:'bottom-left',depthRange:22,verticalFov};
  if(data.pattern.startsWith('foundation-'))foundation.render(frame,{carrier:data.pattern.slice(11),spacing:Math.max(8,Math.round(spacing*scale)),strength},output);
  else filter.render(frame,
    {spacing,depthStrength:strength,pixelRatio:scale,dotSize:grain,edges,pattern:data.pattern,surfaceDetail:data.surfaceDetail,windowPeriods:data.windowPeriods??0,temporalStability:data.temporalStability??false,invertDepth:data.invertDepth??false},output);
  const transfer=[buffer,output.buffer];if(data.color)transfer.push(data.color);
  self.postMessage({ buffer, color:data.color, output: output.buffer, width, height, version, yOffset, ms: performance.now() - start }, transfer);
};
