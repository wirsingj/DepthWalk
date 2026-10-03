import {prepareGeometry,normalRadius,validateDepthFrame} from './depth-frame.js';
import {stereoWindow,cropColumns} from './stereo-window.js';
import {detectContours,contourRadius,expandContours} from './contours.js';
import {createSeedField,GEOMETRY_PALETTE} from './pattern.js';
import {createWorkspace,encodeFrame} from './stereogram.js';
import {validateSceneColor} from './scene-color.js';
import {encodeSurface} from './surface-stereo.js';
import {encodeChroma} from './chroma-stereo.js';

export const DEFAULT_SETTINGS=Object.freeze({pattern:'geometry',pixelRatio:1,spacing:120,depthStrength:.5,dotSize:1,edges:2,depthRange:22,surfaceDetail:.35,temporalStability:false,invertDepth:false});

// Number of neighboring input rows needed for a seam-free worker stripe.
export function requiredHalo(pixelRatio=1,edges=2){return normalRadius(pixelRatio)+(edges?contourRadius(pixelRatio,Math.min(edges,2))*(edges===3?2:1):0);}

/** A synchronous, reusable depth-to-stereogram filter. No engine, DOM or GPU dependency. */
export class DepthWalkFilter{
  constructor(){this.geometry={};this.key='';}
  // Call after a camera cut, teleport or unrelated input stream; keep allocations.
  resetHistory(){this.quietHistory=null;this.chromaHistory=null;this.windowFilter?.resetHistory();}
  render(frame,settings={},output=null){
    const options={...DEFAULT_SETTINGS,...settings};
    const {pattern,pixelRatio,spacing,depthStrength,dotSize,edges,depthRange,surfaceDetail}=options;
    if(!['chroma-soft','chroma','surface','quiet','scene','geometry','classic','mono'].includes(pattern))throw Error('Unsupported DepthWalk pattern');
    if(!Number.isFinite(surfaceDetail)||surfaceDetail<0||surfaceDetail>1)throw Error('Surface detail must be between zero and one');
    if(typeof options.temporalStability!=='boolean')throw Error('Temporal stability must be boolean');
    if(typeof options.invertDepth!=='boolean')throw Error('Depth inversion must be boolean');
    if(!['chroma','chroma-soft'].includes(pattern)||!options.temporalStability)this.chromaHistory=null;
    if(pattern!=='quiet'||!options.temporalStability||!frame.color)this.quietHistory=null;
    validateSceneColor(frame);
    if(![pixelRatio,spacing,dotSize,depthRange].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(depthStrength)||depthStrength<0||depthStrength>.5||![0,1,2,3].includes(edges))throw Error('Invalid DepthWalk settings');
    const {width,height,cropTop=0,cropBottom=0,yOffset=0}=frame,outputHeight=height-cropTop-cropBottom;
    const region=stereoWindow(width,spacing,pixelRatio,options.windowPeriods??0);
    if(options.windowPeriods){
      this.quietHistory=null;this.chromaHistory=null;
      validateDepthFrame(frame);
      if(!frame.color)throw Error('A bounded stereo window requires aligned scene color');
      const channels=frame.format==='packed-proximity-rg16'?4:1;
      const size=region.width*height;
      if(this.windowDepth?.length!==size*channels||this.windowDepth.constructor!==frame.depth.constructor)this.windowDepth=new frame.depth.constructor(size*channels);
      if(this.windowColor?.length!==size*4)this.windowColor=new Uint8Array(size*4);
      cropColumns(frame.depth,width,height,region.left,region.width,channels,this.windowDepth);
      cropColumns(frame.color,width,height,region.left,region.width,4,this.windowColor);
      this.windowFilter??=new DepthWalkFilter();
      const inner=this.windowFilter.render({...frame,width:region.width,depth:this.windowDepth,color:this.windowColor},{...options,windowPeriods:0});
      if(this.windowOutput?.length!==width*outputHeight)this.windowOutput=new Uint32Array(width*outputHeight);
      const target=output||this.windowOutput;
      if(!(target instanceof Uint32Array)||target.length!==width*outputHeight)throw Error('Output must match the rendered dimensions');
      for(let y=0;y<outputHeight;y++){
        const sourceY=frame.origin==='bottom-left'?height-1-y-cropTop:y+cropTop;
        for(let x=0;x<width;x++){
          const i=(sourceY*width+x)*4;
          target[y*width+x]=(0xff000000|frame.color[i]|frame.color[i+1]<<8|frame.color[i+2]<<16)>>>0;
        }
        target.set(inner.pixels.subarray(y*region.width,(y+1)*region.width),y*width+region.left);
      }
      return {width,height:outputHeight,pixels:target,rgba:new Uint8ClampedArray(target.buffer,target.byteOffset,target.byteLength),stereoRegion:region};
    }
    this.windowFilter?.resetHistory();
    const {packed}=prepareGeometry(frame,options,this.geometry);
    const key=`${width}/${outputHeight}/${pixelRatio}/${yOffset+cropTop}/${dotSize}`;
    if(key!==this.key){
      this.key=key;this.workspace=createWorkspace(width);
      this.seeds=createSeedField(width,outputHeight,pixelRatio,yOffset+cropTop,dotSize);
      this.output=new Uint32Array(width*outputHeight);
    }
    let contours=null;
    if(edges){
      if(this.contours?.length!==width*height)this.contours=new Uint8Array(width*height);
      if(edges===3){
        if(this.contourBase?.length!==width*height)this.contourBase=new Uint8Array(width*height);
        detectContours(packed,width,height,pixelRatio,this.contourBase,2,frame.projection);
        expandContours(this.contourBase,width,height,contourRadius(pixelRatio,2),this.contours);
      }else detectContours(packed,width,height,pixelRatio,this.contours,edges,frame.projection);
      contours=this.contours.subarray(cropTop*width,(height-cropBottom)*width);
    }
    // Direction changes binocular relief, not the physical normals/silhouettes.
    let stereoPacked=packed;
    if(options.invertDepth){
      if(this.stereoPacked?.length!==packed.length)this.stereoPacked=new Uint8Array(packed.length);
      stereoPacked=this.stereoPacked;stereoPacked.set(packed);
      for(let i=0;i<packed.length;i+=4){stereoPacked[i]=255-packed[i];stereoPacked[i+1]=255-packed[i+1];}
    }
    const target=output||this.output;
    if(!(target instanceof Uint32Array)||target.length!==width*outputHeight)throw Error('Output must be a Uint32Array matching the rendered dimensions');
    const source=stereoPacked.subarray(cropBottom*width*4,(height-cropTop)*width*4);
    let color=null;
    if(['chroma-soft','chroma','surface','quiet','scene'].includes(pattern)&&frame.color){
      // Encoders read bottom-up color synchronously and never retain or mutate it.
      if(frame.origin==='bottom-left'){
        color=frame.color.subarray(cropBottom*width*4,(height-cropTop)*width*4);
      }else{
        if(this.color?.length!==width*outputHeight*4)this.color=new Uint8Array(width*outputHeight*4);
        color=this.color;
        for(let y=0;y<outputHeight;y++){
          const row=y+cropTop;
          color.set(frame.color.subarray(row*width*4,(row+1)*width*4),(outputHeight-1-y)*width*4);
        }
      }
    }
    if(['chroma','chroma-soft'].includes(pattern)&&color){
      const historyKey=`${pattern}/${key}/${spacing}/${depthStrength}/${surfaceDetail}/${options.invertDepth}`;
      if(options.temporalStability&&this.chromaHistory?.key!==historyKey)this.chromaHistory={key:historyKey,valid:false,roots:new Uint32Array(width*outputHeight),levels:new Uint8Array(width*outputHeight)};
      this.temporalStats=encodeChroma({packed:source,color,width,height:outputHeight,scale:pixelRatio,yOffset:yOffset+cropTop,dotSize,spacing:Math.max(8,Math.round(spacing*pixelRatio)),strength:depthStrength,detail:surfaceDetail,out:target,workspace:this.workspace,history:this.chromaHistory,lighting:pattern==='chroma-soft'?.25:0});
      return {width,height:outputHeight,pixels:target,rgba:new Uint8ClampedArray(target.buffer,target.byteOffset,target.byteLength)};
    }
    if(['surface','quiet'].includes(pattern)&&color){
      const historyKey=`${key}/${spacing}/${depthStrength}/${surfaceDetail}/${depthRange}/${edges}/${options.invertDepth}`;
      if(pattern==='quiet'&&options.temporalStability&&this.quietHistory?.key!==historyKey)this.quietHistory={key:historyKey,valid:false,roots:new Uint32Array(width*outputHeight),hashes:new Uint32Array(width*outputHeight)};
      this.surfaceStats=encodeSurface({packed:source,color,width,height:outputHeight,scale:pixelRatio,yOffset:yOffset+cropTop,dotSize,contours,spacing:Math.max(8,Math.round(spacing*pixelRatio)),strength:depthStrength,detail:surfaceDetail,quiet:pattern==='quiet',out:target,workspace:this.workspace,history:this.quietHistory,ink:edges===3});
      return {width,height:outputHeight,pixels:target,rgba:new Uint8ClampedArray(target.buffer,target.byteOffset,target.byteLength)};
    }
    const styled=['geometry','scene','surface','quiet','chroma','chroma-soft'].includes(pattern);
    this.chromaHistory=null;
    encodeFrame(source,width,outputHeight,Math.max(8,Math.round(spacing*pixelRatio)),depthStrength,this.workspace,this.seeds,target,styled?GEOMETRY_PALETTE:null,pattern==='mono',contours,styled,color,edges===3);
    return {width,height:outputHeight,pixels:target,rgba:new Uint8ClampedArray(target.buffer,target.byteOffset,target.byteLength)};
  }
}
