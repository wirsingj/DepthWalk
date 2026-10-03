import {reconstructStereogram,compareReconstruction} from './reconstruct.js';
import {imageFidelity} from './image-fidelity.js';
import {observeFrame,evaluateObserver,diagnose,OBSERVER_VERSION} from './observer.js';
import {invertDepthFrame} from '../depth-direction.js';
self.onmessage=({data})=>{
  try{
    const start=performance.now();
    const decoded=reconstructStereogram({pixels:data.pixels,width:data.width,height:data.height,spacing:data.spacing,strength:data.strength});
    const depth=data.invertDepth?invertDepthFrame({depth:data.depth,width:data.width,height:data.height,format:'packed-proximity-rg16',origin:'bottom-left'}).depth:data.depth;
    const comparison=compareReconstruction(decoded,{depth});
    const fidelity=imageFidelity(data.pixels,data.color,data.width,data.height);
    const observer=observeFrame({pixels:data.pixels,width:data.width,height:data.height,spacing:data.spacing,strength:data.strength});
    const evaluation=evaluateObserver(observer,{depth,origin:'bottom-left'});
    const findings=diagnose(observer.summary,evaluation.summary);
    self.postMessage({id:data.id,result:{decoded,comparison,fidelity,observer,evaluation,findings,observerVersion:OBSERVER_VERSION,ms:performance.now()-start}});
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
