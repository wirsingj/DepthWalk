import {FoundationFilter} from '../src/foundation-stereo.js';
const filter=new FoundationFilter();
let frame;
self.onmessage=({data})=>{
  try{
    if(data.frame)frame=data.frame;
    if(!frame)throw Error('No depth frame supplied');
    const start=performance.now(),result=filter.render(frame,data.settings),pixels=result.pixels.slice();
    self.postMessage({id:data.id,result:{width:result.width,height:result.height,pixels,ms:performance.now()-start}},[pixels.buffer]);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
