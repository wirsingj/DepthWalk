import {DepthWalkGPU} from './depthwalk-gpu.js';
import {ThreeWebGPUDepth} from '../adapters/three-webgpu-depth.js';
import {FrameQueue} from './frame-queue.js';

export class GPUCityRenderer{
  static async create(canvas,scene,beacons,onFailure){
    if(!navigator.gpu)throw Error('WebGPU is unavailable in this browser');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw Error('No WebGPU device is available');
    const device=await adapter.requestDevice();
    const instance=new GPUCityRenderer();Object.assign(instance,{device,canvas,onFailure,frames:new FrameQueue(device),failed:false});
    const info=adapter.info;instance.adapterName=info?[info.vendor,info.architecture,info.description].filter(Boolean).join(' · '):'WebGPU adapter';
    device.lost.then(info=>{if(!instance.disposed)instance.fail('GPU device lost: '+info.message);});
    device.addEventListener('uncapturederror',event=>instance.fail(event.error.message));
    try{
      instance.format=navigator.gpu.getPreferredCanvasFormat();instance.context=canvas.getContext('webgpu');
      instance.context.configure({device,format:instance.format,alphaMode:'opaque'});
      [instance.filter,instance.depth]=await Promise.all([DepthWalkGPU.create(device,instance.format),ThreeWebGPUDepth.create(device,scene,beacons)]);
    }catch(error){instance.destroy();throw error;}
    return instance;
  }
  destroy(){
    if(this.disposed)return;this.disposed=true;
    this.frames.pending.clear();this.color?.destroy();this.depth?.destroy();this.filter?.destroy();
    this.context?.unconfigure();this.device.destroy();
  }
  fail(reason){if(this.failed||this.disposed)return;this.failed=true;this.destroy();this.onFailure(reason);}
  poll(now){if(!this.failed&&!this.disposed){try{this.frames.poll(now);}catch(error){this.fail(error.message);}}}
  resize(width,height){
    this.canvas.width=width;this.canvas.height=height;this.width=width;this.height=height;
    this.color?.destroy();this.color=this.device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
    this.depth.resize(width,height);this.filter.resize(width,height,this.depth.view,this.color.createView());
    this.preparedCarrierKey=null;
  }
  installPreparedCarrier(prepared,key){
    if(this.preparedCarrierKey===key)return;
    this.filter.installPreparedCarrier(prepared);this.preparedCarrierKey=key;
  }
  render(camera,settings,onComplete,verify=false,renderColor=null){
    if(this.failed||this.disposed)return false;
    const token=this.frames.begin(verify);if(!token)return false;
    const start=performance.now();
    let colorMs=0;
    try{
      // Evaluate moving texture state only after a real frame gets a queue slot.
      // A busy GPU must not advance the carrier for an image it never submits.
      if(typeof settings==='function')settings=settings();
      const encoder=this.device.createCommandEncoder();
      if((settings.windowPeriods>0||['scene','surface','quiet','chroma','chroma-soft'].includes(settings.pattern))&&renderColor){
        const source=renderColor();
        // Copy the actual normal-view canvas on the graphics path. No pixels
        // are read to JavaScript, and this happens only for scene-color mode.
        this.device.queue.copyExternalImageToTexture({source},{texture:this.color,colorSpace:'srgb'},[this.width,this.height]);
        colorMs=performance.now()-start;
      }
      this.depth.encode(encoder,camera);this.filter.encode(encoder,this.context.getCurrentTexture().createView(),{...settings,verticalFov:camera.fov});
      this.device.queue.submit([encoder.finish()]);
    }catch(error){this.frames.finish(token);this.fail('GPU frame: '+error.message);return false;}
    const width=this.width,height=this.height,cameraCopy=verify?camera.clone():null;
    const complete=verify?this.diagnostics((settings.windowPeriods>0||['scene','surface','quiet','chroma','chroma-soft'].includes(settings.pattern))):this.device.queue.onSubmittedWorkDone();
    complete.then(frame=>{this.frames.finish(token);if(!this.failed&&!this.disposed)onComplete({frame,ms:performance.now()-start,colorMs,width,height,camera:cameraCopy});}).catch(error=>{this.frames.finish(token);this.fail(error.message);});
    return true;
  }
  async diagnostics(withColor=false){
    const width=this.width,height=this.height,pitch=Math.ceil(width*4/256)*256;
    const read=this.device.createBuffer({size:pitch*height*(withColor?2:1),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
    const encoder=this.device.createCommandEncoder();encoder.copyTextureToBuffer({texture:this.depth.texture},{buffer:read,bytesPerRow:pitch},[width,height]);
    if(withColor)encoder.copyTextureToBuffer({texture:this.color},{buffer:read,offset:pitch*height,bytesPerRow:pitch},[width,height]);
    this.device.queue.submit([encoder.finish()]);
    const [frame]=await Promise.all([this.filter.readDiagnostics(),read.mapAsync(GPUMapMode.READ)]);
    const data=new Uint8Array(read.getMappedRange()),depth=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)depth.set(data.subarray(y*pitch,y*pitch+width*4),(height-1-y)*width*4);
    let color;
    if(withColor){color=new Uint8Array(width*height*4);for(let y=0;y<height;y++)color.set(data.subarray((height+y)*pitch,(height+y)*pitch+width*4),(height-1-y)*width*4);}
    return {...frame,depth,color};
    }finally{read.destroy();}
  }
}
