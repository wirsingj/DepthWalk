import { DepthWalkFilter } from './depthwalk.js';
const filter=new DepthWalkFilter();
self.onmessage = ({ data }) => {
  if(data.resetHistory){filter.resetHistory();return;}
  const { width, height, fullHeight, spacing, strength, scale, buffer, version, yOffset, grain, inputHeight, topHalo, bottomHalo, edges, verticalFov } = data;
  const output = new Uint32Array(data.output || width * height);
  const start = performance.now();
  filter.render({depth:new Uint8Array(buffer),color:data.color?new Uint8Array(data.color):undefined,width,height:inputHeight,fullHeight,yOffset:yOffset-topHalo,cropTop:topHalo,cropBottom:bottomHalo,
    format:'packed-proximity-rg16',origin:'bottom-left',depthRange:22,verticalFov},
    {spacing,depthStrength:strength,pixelRatio:scale,dotSize:grain,edges,pattern:data.pattern,surfaceDetail:data.surfaceDetail,windowPeriods:data.windowPeriods??0,temporalStability:data.temporalStability??false,invertDepth:data.invertDepth??false},output);
  const transfer=[buffer,output.buffer];if(data.color)transfer.push(data.color);
  self.postMessage({ buffer, color:data.color, output: output.buffer, width, height, version, yOffset, ms: performance.now() - start }, transfer);
};
