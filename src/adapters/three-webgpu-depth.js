import {Vector3} from 'three';
const shader=`
struct Camera { projection:mat4x4f, view:mat4x4f }
@group(0) @binding(0) var<uniform> camera:Camera;
struct Vertex { @builtin(position) clip:vec4f, @location(0) viewZ:f32 }
@vertex fn vertex(@location(0) position:vec3f)->Vertex{
  let view=camera.view*vec4f(position,1.);var clip=camera.projection*view;
  clip.z=(clip.z+clip.w)*.5;return Vertex(clip,-view.z);
}
@fragment fn fragment(in:Vertex)->@location(0) vec4f{
  let q=u32(floor(exp(-in.viewZ/22.)*65535.+.5));
  return vec4f(f32(q>>8u)/255.,f32(q&255u)/255.,0.,1.);
}`;
// Static city adapter. The filter receives only scalar depth; beacon visibility
// is live. General animated engines supply their own depth texture adapter.
export class ThreeWebGPUDepth{
  static async create(device,scene,beacons){
    const adapter=new ThreeWebGPUDepth();adapter.device=device;adapter.beacons=beacons;
    scene.updateMatrixWorld(true);const positions=Array.from({length:beacons.length+1},()=>[]),v=new Vector3();
    scene.traverse(object=>{
      if(!object.isMesh)return;let parent=object,batch=0;
      while(parent){const beacon=beacons.indexOf(parent);if(beacon!==-1){batch=beacon+1;break;}parent=parent.parent;}
      const geometry=object.geometry,attribute=geometry.attributes.position,index=geometry.index;
      const count=index?index.count:attribute.count;
      for(let i=0;i<count;i++){
        v.fromBufferAttribute(attribute,index?index.getX(i):i).applyMatrix4(object.matrixWorld);positions[batch].push(v.x,v.y,v.z);
      }
    });
    let first=0;adapter.ranges=positions.map(a=>{const range={first,count:a.length/3};first+=range.count;return range;});
    const vertices=Float32Array.from(positions.flat());adapter.vertices=device.createBuffer({size:vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(adapter.vertices,0,vertices);
    adapter.uniform=device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const module=device.createShaderModule({code:shader});
    adapter.pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertex',buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]}]},fragment:{module,entryPoint:'fragment',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list',cullMode:'back'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
    adapter.group=device.createBindGroup({layout:adapter.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:adapter.uniform}}]});return adapter;
  }
  resize(width,height){
    this.texture?.destroy();this.depth?.destroy();
    this.texture=this.device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
    this.depth=this.device.createTexture({size:[width,height],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});this.view=this.texture.createView();
  }
  encode(encoder,camera){
    camera.updateMatrixWorld(true);const matrix=new Float32Array(32);matrix.set(camera.projectionMatrix.elements);matrix.set(camera.matrixWorldInverse.elements,16);this.device.queue.writeBuffer(this.uniform,0,matrix);
    const pass=encoder.beginRenderPass({colorAttachments:[{view:this.view,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.setVertexBuffer(0,this.vertices);
    this.ranges.forEach((range,i)=>{if(i===0||this.beacons[i-1].visible)pass.draw(range.count,1,range.first);});pass.end();
  }
  destroy(){this.texture?.destroy();this.depth?.destroy();this.vertices?.destroy();this.uniform?.destroy();}
}
