import {analyzeBenchmarkFrame} from './benchmark.js';
import {DepthWalkFilter} from '../depthwalk.js';
import {renderAppearanceFrame} from './appearance-synthesis.js';
import {createColorBaseRenderer} from './color-base.js';
import {createRankRenderer} from './rank-color.js';
const filter=new DepthWalkFilter();
const colorBase=createColorBaseRenderer();
const rankColor=createRankRenderer();
self.onmessage=({data})=>{
  try{
    if(data.kind==='render'){
      if(data.reset)filter.resetHistory();
      const research=data.settings.pattern==='neutral-control'||data.settings.pattern.startsWith('solve-');
      const pixels=data.settings.pattern.startsWith('rank-')?rankColor(data.frame,data.settings,data.reset):['research-color-base','research-source-base'].includes(data.settings.pattern)?colorBase(data.frame,data.settings,data.reset):research?renderAppearanceFrame(filter,data.frame,data.settings):filter.render(data.frame,data.settings).pixels.slice();
      self.postMessage({id:data.id,result:pixels},[pixels.buffer]);
    }else self.postMessage({id:data.id,result:analyzeBenchmarkFrame(data.frame,data.pixels)});
  }
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
