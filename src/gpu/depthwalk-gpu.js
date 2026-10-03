import {stereoWindow} from '../stereo-window.js';
import shader from './stereogram.wgsl?raw';
import {SHADED_GEOMETRY_PALETTE,SHADED_CONTOUR_PALETTE,CLASSIC_PALETTE,CONTOUR_CLASSIC_PALETTE,NEUTRAL_PALETTE,CONTOUR_NEUTRAL_PALETTE} from '../pattern.js';

const display=`
@group(0) @binding(0) var<storage,read> parents:array<u32>;
@group(0) @binding(1) var<storage,read> colors:array<u32>;
@group(0) @binding(2) var<uniform> size:vec4u;
@group(0) @binding(3) var<storage,read> local:array<u32>;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.-1.,y*2.-1.,0.,1.);
}
@fragment fn fragment(@builtin(position) at:vec4f)->@location(0) vec4f{
  let i=u32(at.y)*size.x+u32(at.x);var c=colors[parents[i]];if(size.z>=6u){c=local[i];}
  return vec4f(f32(c&255u),f32((c>>8u)&255u),f32((c>>16u)&255u),255.)/255.;
}`;

/** GPU-resident filter: consumes a top-down RG16 proximity texture on this device.
 * Optional display/sRGB scene color; no engine imports or required host normals. */
export class DepthWalkGPU{
  static async create(device,format='bgra8unorm'){
    const filter=new DepthWalkGPU();filter.device=device;filter.format=format;
    const entries=[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'unfilterable-float'}}];
    for(let binding=2;binding<=9;binding++)entries.push({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===9?'read-only-storage':'storage'}});
    entries.push({binding:10,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'unfilterable-float'}});
    filter.layout=device.createBindGroupLayout({entries});const layout=device.createPipelineLayout({bindGroupLayouts:[filter.layout]});
    const module=device.createShaderModule({code:shader});
    const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');
    if(errors.length)throw Error(errors.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
    filter.pipelines=await Promise.all(['prepare','link','gather','reuseCarrier','shade','localColor'].map(entryPoint=>device.createComputePipelineAsync({layout,compute:{module,entryPoint}})));
    const presentation=device.createShaderModule({code:display});
    filter.presentation=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:presentation,entryPoint:'vertex'},fragment:{module:presentation,entryPoint:'fragment',targets:[{format}]},primitive:{topology:'triangle-list'}});
    filter.uniform=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const palette=Uint32Array.from([...SHADED_GEOMETRY_PALETTE,...SHADED_CONTOUR_PALETTE,...CLASSIC_PALETTE,...CONTOUR_CLASSIC_PALETTE,...NEUTRAL_PALETTE,...CONTOUR_NEUTRAL_PALETTE]);
    filter.palette=device.createBuffer({size:palette.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(filter.palette,0,palette);
    filter.fallbackColor=device.createTexture({size:[1,1],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING});
    return filter;
  }
  resize(width,height,depthView,colorView=null){
    if(!Number.isInteger(width)||!Number.isInteger(height)||width>8192||height>8192||width*height>8294400||width<1||height<1)throw Error('GPU filter dimensions exceed the supported 8.3 MP / 8192-axis limit');
    this.buffers?.forEach(b=>b.destroy());this.width=width;this.height=height;
    this.hasColor=!!colorView;
    this.historyKey=null;
    this.buffers=Array.from({length:7},(_,i)=>this.device.createBuffer({size:i===6?height*3*4:width*height*4*(i===1?3:i===2||i===5?2:1),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}));
    const entries=[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:depthView},...this.buffers.map((buffer,i)=>({binding:i+2,resource:{buffer}})),{binding:9,resource:{buffer:this.palette}},{binding:10,resource:colorView||this.fallbackColor.createView()}];
    this.group=this.device.createBindGroup({layout:this.layout,entries});
    this.displayGroup=this.device.createBindGroup({layout:this.presentation.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.buffers[1]}},{binding:1,resource:{buffer:this.buffers[5]}},{binding:2,resource:{buffer:this.uniform,offset:0,size:16}},{binding:3,resource:{buffer:this.buffers[3]}}]});
  }
  // The next submission seeds fresh classes; GPU resources stay allocated.
  resetHistory(){this.historyKey=null;}
  encode(encoder,output,{pixelRatio=1,spacing=120,depthStrength=.5,dotSize=1,edges=2,pattern='geometry',verticalFov=62,depthRange=22,surfaceDetail=.35,temporalStability=false,windowPeriods=0,invertDepth=false}={}){
    if(typeof temporalStability!=='boolean')throw Error('Temporal stability must be boolean');
    if(typeof invertDepth!=='boolean')throw Error('Depth inversion must be boolean');
    if(!['chroma-soft','chroma','surface','quiet','scene','geometry','classic','mono'].includes(pattern)||![pixelRatio,spacing,dotSize,depthRange].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(depthStrength)||depthStrength<0||depthStrength>.5||![0,1,2,3].includes(edges)||!(verticalFov>0&&verticalFov<179)||spacing*pixelRatio>8192||!Number.isFinite(surfaceDetail)||surfaceDetail<0||surfaceDetail>1)throw Error('Invalid GPU filter settings');
    const region=stereoWindow(this.width,spacing,pixelRatio,windowPeriods);
    if(windowPeriods&&!this.hasColor)throw Error('A bounded stereo window requires aligned scene color');
    const data=new ArrayBuffer(64),u=new Uint32Array(data),f=new Float32Array(data);
    this.localColor=['chroma','chroma-soft'].includes(pattern)&&this.hasColor;
    const quietHistory=pattern==='quiet'&&this.hasColor&&temporalStability;
    const historyKey=(this.localColor||quietHistory)&&temporalStability?`${pattern}/${pixelRatio}/${spacing}/${depthStrength}/${dotSize}/${surfaceDetail}/${region.left}/${region.right}/${depthRange}/${edges}/${invertDepth}`:null;
    const reuse=historyKey!==null&&historyKey===this.historyKey;this.historyKey=historyKey;
    u.set([this.width,this.height,{geometry:0,classic:1,mono:2,scene:this.hasColor?3:0,surface:this.hasColor?4:0,quiet:this.hasColor?5:0,chroma:this.hasColor?6:0,'chroma-soft':this.hasColor?7:0}[pattern],edges]);
    f.set([pixelRatio,Math.max(8,Math.round(spacing*pixelRatio)),Math.round(depthStrength*1000)/1000,2*Math.tan(verticalFov*Math.PI/360)/this.height,dotSize,depthRange,surfaceDetail,historyKey===null?0:reuse?3:2],4);
    u.set([region.left,region.right,windowPeriods,Number(invertDepth)],12);
    this.device.queue.writeBuffer(this.uniform,0,data);
    const dispatches=[[Math.ceil(this.width/8),Math.ceil(this.height/8)],[Math.ceil(this.width/64),this.height],[this.height,1],[Math.ceil(this.width/64),this.height],[Math.ceil(this.width/64),this.height],[Math.ceil(this.width/64),this.height]];
    for(const i of (this.localColor||quietHistory?[0,1,2,3,4,5]:[0,1,2,4])){
      const pass=encoder.beginComputePass();pass.setPipeline(this.pipelines[i]);pass.setBindGroup(0,this.group);pass.dispatchWorkgroups(...dispatches[i]);pass.end();
    }
    const pass=encoder.beginRenderPass({colorAttachments:[{view:output,loadOp:'clear',clearValue:{r:0,g:0,b:0,a:1},storeOp:'store'}]});
    pass.setPipeline(this.presentation);pass.setBindGroup(0,this.displayGroup);pass.draw(3);pass.end();
  }
  async readDiagnostics(){
    // Explicit verification only. The interactive render path never maps buffers.
    const length=this.width*this.height*4,local=this.localColor;
    const data=await this.readBuffers([0,1,local?3:5,4]);
    const geometry=data.slice(0,length/4),roots=data.subarray(length/4,length/2),colors=data.subarray(length/2,length*3/4);
    const pixels=local?colors.slice():Uint32Array.from(roots,r=>colors[r]);return {geometry,roots:roots.slice(),pixels,pairs:data.slice(length*3/4)};
  }
  async readPixels(){
    // Observer comparisons do not need geometry, pair or root diagnostics.
    const local=this.localColor,n=this.width*this.height;
    const data=await this.readBuffers(local?[3]:[1,5]);
    return local?data:Uint32Array.from(data.subarray(0,n),root=>data[n+root]);
  }
  async readBuffers(sources){
    const length=this.width*this.height*4;
    const read=this.device.createBuffer({size:length*sources.length,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      const encoder=this.device.createCommandEncoder();
      sources.forEach((source,target)=>encoder.copyBufferToBuffer(this.buffers[source],0,read,target*length,length));
      this.device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
      return new Uint32Array(read.getMappedRange().slice(0));
    }finally{read.destroy();}
  }
  destroy(){this.buffers?.forEach(b=>b.destroy());this.uniform?.destroy();this.palette?.destroy();this.fallbackColor?.destroy();}
}
