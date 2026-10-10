import assert from 'node:assert/strict';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {splitChange,leastChangeBound,rootsFor} from './foundation-mechanism.js';
export {changeEnergy,splitChange,leastChangeBound,rootsFor} from './foundation-mechanism.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';

export function runMechanismResearch(){
  const width=640,height=360,spacing=96,strength=.33,filter=new FoundationFilter();
  const plane=value=>new Float64Array(width*height).fill(value);
  const object=(shift,proximity=.78)=>Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);return x+shift>200&&x+shift<430&&y>50&&y<320?proximity:.15;
  });
  // Find the first exact separation transition in a fixed small approach range;
  // the criterion is topology, not a favorable image-difference result.
  let beforePlane=plane(.25),beforeRoots=rootsFor(beforePlane,width,height,spacing,strength),afterPlane,afterRoots;
  let transition;
  for(let step=1;step<=48;step++){
    afterPlane=plane(.25+step*.008);afterRoots=rootsFor(afterPlane,width,height,spacing,strength);
    if(afterRoots.some((root,i)=>root!==beforeRoots[i])){transition={from:.25+(step-1)*.008,to:.25+step*.008};break;}
    beforePlane=afterPlane;beforeRoots=afterRoots;
  }
  assert.ok(transition,'fixture failed to cross a disparity transition');
  const cases=[
    {name:'fixed-depth-brightness-peak',before:plane(.5),after:plane(.5),epochs:[51,52]},
    {name:'unchanged-graph-tiny-depth-step',before:object(0),after:object(0,.780001),epochs:[51,52]},
    {name:'flat-disparity-transition',before:beforePlane,after:afterPlane,epochs:[1,2],transition},
    {name:'occluding-edge-turn',before:object(0),after:object(2),epochs:[1,2]},
  ];
  const results=cases.map(({name,before,after,epochs,transition})=>{
    const render=(depth,noiseFrame)=>filter.render({width,height,depth,format:'proximity'},
      {carrier:'pink',spacing,strength,noiseFrame}).pixels.slice();
    const previous=render(before,epochs[0]),heldCarrier=render(after,epochs[0]),current=render(after,epochs[1]);
    const oldRoots=rootsFor(before,width,height,spacing,strength),roots=rootsFor(after,width,height,spacing,strength);
    let changedRoots=0;
    for(let i=0;i<roots.length;i++){
      changedRoots+=roots[i]!==oldRoots[i];assert.equal(current[i],current[roots[i]]);assert.equal(heldCarrier[i],heldCarrier[roots[i]]);
    }
    if(name==='unchanged-graph-tiny-depth-step')assert.equal(changedRoots,0);
    const packed=new Uint8Array(width*height*4);
    for(let i=0;i<after.length;i++){const q=Math.round(after[i]*65535);packed[i*4]=q>>8;packed[i*4+1]=q&255;packed[i*4+3]=255;}
    const decoded=reconstructStereogram({pixels:current,width,height,spacing,strength,maxColumns:64,maxRows:36});
    return {name,epochs,transition,classChangeFraction:changedRoots/roots.length,exactCurrentPairs:true,
      change:splitChange(previous,current,heldCarrier,width,height),
      exactGraphBound:leastChangeBound(previous,roots,width,height),
      reconstruction:compareReconstruction(decoded,{depth:packed,origin:'top-left'}).summary};
  });
  return {scope:'Synthetic CPU mechanism isolation, not gameplay or perceptual acceptance. No renderer candidate or changed defaults.',
    width,height,spacing,strength,seed:173,regions:[3,3],results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(runMechanismResearch(),null,2));
