import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {decodeDepth,validateDepthFrame} from '../src/depth-frame.js';

const frame={width:2,height:1,depth:Float32Array.of(.25,.75),format:'device-depth',near:.1,far:100};
const invalidFov=[true,false,'62',new Number(62),[62],{valueOf:()=>62},null,NaN,Infinity,-Infinity,0,179,-1];

test('CPU projection rejects coercible FOV metadata before changing output',()=>{
  const output=new Float32Array([11,12]);
  for(const verticalFov of invalidFov){
    assert.throws(()=>decodeDepth({...frame,verticalFov},output),/verticalFov must be a finite number/);
    assert.deepEqual([...output],[11,12]);
  }
  for(const verticalFov of [undefined,.01,62,178.99])assert.doesNotThrow(()=>validateDepthFrame({...frame,verticalFov}));
});

test('other projection quantities retain numeric validation and the perspective infinite-far exception',()=>{
  for(const key of ['near','far','orthographicHeight','depthRange']){
    for(const value of [true,'100',new Number(100),[100],{valueOf:()=>100},null,NaN,-Infinity,0,-1]){
      assert.throws(()=>validateDepthFrame({...frame,[key]:value}),`${key} accepted nonnumeric or nonpositive input`);
    }
  }
  for(const key of ['near','orthographicHeight','depthRange'])assert.throws(()=>validateDepthFrame({...frame,[key]:Infinity}));
  assert.doesNotThrow(()=>validateDepthFrame({...frame,projection:'perspective',far:Infinity}));
  assert.throws(()=>validateDepthFrame({...frame,projection:'orthographic',far:Infinity}),/finite far plane/);
  assert.doesNotThrow(()=>validateDepthFrame({...frame,projection:'orthographic',orthographicHeight:20}));
});

test('GPU encode rejects coercible FOV values before writes and preserves numeric projection encoding',async()=>{
  // Use the project's normal module loader for the WGSL ?raw import. The
  // command-recording stub checks the JavaScript API without requiring a GPU.
  const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,
    server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
  try{
    const {DepthWalkGPU}=await server.ssrLoadModule('/src/gpu/depthwalk-gpu.js');
    const filter=new DepthWalkGPU(),writes=[];
    Object.assign(filter,{width:192,height:10,hasColor:false,pipelines:[],historyKey:'unchanged',
      device:{queue:{writeBuffer:(_buffer,_offset,data)=>writes.push(new Float32Array(data.slice(0)))}}});
    for(const verticalFov of invalidFov){
      assert.throws(()=>filter.encode(null,null,{verticalFov}),/Invalid GPU filter settings/);
      assert.equal(writes.length,0);
      assert.equal(filter.historyKey,'unchanged');
    }
    const pass={setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},draw(){},end(){}};
    const encoder={beginComputePass:()=>pass,beginRenderPass:()=>pass};
    for(const verticalFov of [undefined,.01,62,178.99]){
      filter.encode(encoder,{},verticalFov===undefined?{}:{verticalFov});
      assert.equal(writes.at(-1)[7],Math.fround(2*Math.tan((verticalFov??62)*Math.PI/360)/filter.height));
    }
  }finally{await server.close();}
});
