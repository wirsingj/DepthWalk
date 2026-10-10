import {createPlayer,stepPlayer} from '../src/game.js';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {roots,decode,delta} from './tiny-step-check.js';
import {leastChangeBound,splitChange} from './foundation-mechanism.js';
import {temporalDiagnostics} from './foundation-motion-quality.js';
import {createSeedAssignment,appearanceStats} from './foundation-assignment.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Sequential actual-scene captures, not a real-time performance measurement.
// Prescribed simulation steps make geometry repeatable independently of QA cost.
export async function runMotionMechanismCheck({player,stop,getFrame}){
  const report=document.createElement('pre');report.id='motion-mechanism-results';
  report.style.cssText='position:fixed;inset:90px 16px 16px;z-index:30;overflow:auto;background:#10202bf5;color:#bbefc3;padding:16px;font:12px monospace';
  report.textContent='Measuring actual scene transitions…';document.body.append(report);
  const saved={...player},filter=new FoundationFilter(),routes=[],frameCount=72;
  const capture=async pose=>{
    stop();Object.assign(player,pose,{vx:0,vz:0,turn:0});
    const deadline=performance.now()+15000;let frame;
    do{
      await wait(30);frame=getFrame();
      if(performance.now()>deadline)throw Error('Timed out capturing prescribed pose');
    }while(!frame||Math.abs(frame.camera.position.x-pose.x)>1e-10
      ||Math.abs(frame.camera.position.z-pose.z)>1e-10||Math.abs(frame.camera.rotation.y-pose.yaw)>1e-10);
    if(frame.pattern!=='foundation-pink'||frame.spacing!==96||Math.abs(frame.strength-.33)>1e-6)throw Error('Unexpected study settings');
    return {...frame,pixels:frame.pixels.slice(),depth:frame.depth.slice(),roots:frame.roots?.slice()};
  };
  const render=(frame,epoch)=>filter.render({width:frame.width,height:frame.height,depth:frame.depth,
    format:'packed-proximity-rg16',origin:'bottom-left'},
  {carrier:'pink',spacing:frame.spacing,strength:frame.strength,noiseFrame:epoch}).pixels.slice();
  try{
    for(const z of [13,1])for(const action of ['turn','approach']){
      const pose={...createPlayer(),z},transitions=[],assignment=createSeedAssignment(),worst=new Map();
      await capture({...pose,z:z+.01});
      let before=await capture(pose),oldPixels=render(before,1),oldRoots=roots(before);
      let oldAssigned=assignment(oldRoots,before.width,before.height,1).pixels;
      for(let frameIndex=1;frameIndex<=frameCount;frameIndex++){
        if(action==='turn')pose.yaw+=.005;
        else stepPlayer(pose,new Set(['KeyW']),1/60);
        const after=await capture(pose),current=render(after,frameIndex+1),held=render(after,frameIndex),newRoots=roots(after);
        const assigned=assignment(newRoots,after.width,after.height,frameIndex+1);
        let changed=0;
        for(let i=0;i<newRoots.length;i++){
          changed+=newRoots[i]!==oldRoots[i];
          if(current[i]!==current[newRoots[i]]||held[i]!==held[newRoots[i]]||assigned.pixels[i]!==assigned.pixels[newRoots[i]])throw Error('Reference pair mismatch');
        }
        const settings={gridStepX:160,gridStepY:100};
        const motion=temporalDiagnostics(oldPixels,current,after.width,after.height,settings);
        const assignedMotion=temporalDiagnostics(oldAssigned,assigned.pixels,after.width,after.height,settings);
        delete motion.patches;
        delete assignedMotion.patches;
        const record={frame:frameIndex,pose:{x:pose.x,z:pose.z,yaw:pose.yaw},
          classChangeFraction:changed/newRoots.length,
          mechanism:splitChange(oldPixels,current,held,after.width,after.height),
          exactGraphBound:leastChangeBound(oldPixels,newRoots,after.width,after.height),
          independentMotion:motion,independentAppearance:appearanceStats(current,after.width,after.height),
          assignment:{motion:assignedMotion,appearance:appearanceStats(assigned.pixels,after.width,after.height),
            retainedPixelIdentityFraction:assigned.retainedPixelIdentityFraction,
            exactGraphBound:leastChangeBound(oldAssigned,newRoots,after.width,after.height)}};
        if(frameIndex===1||frameIndex===frameCount){
          record.reconstruction=decode(current,after).summary;
          record.assignment.reconstruction=decode(assigned.pixels,after).summary;
        }
        for(const [name,value] of Object.entries({independentRms:motion.frameRmsByte,
          assignmentRms:assignedMotion.frameRmsByte,assignmentConcentration:assignedMotion.columnEnergyCV,
          assignmentTravel:assignedMotion.reliableFraction,bound:record.exactGraphBound.minimumRmsSameGlobalMeanAndSD})){
          if(value!==null&&(!worst.has(name)||value>worst.get(name).value))worst.set(name,
            {value,frame:frameIndex,source:after,pixels:current,assigned:assigned.pixels,previousAssigned:oldAssigned});
        }
        transitions.push(record);
        before=after;oldPixels=current;oldRoots=newRoots;oldAssigned=assigned.pixels;
        report.textContent=`${z===13?'Spawn':'Near diamond'} · ${action}: ${frameIndex}/${frameCount}`;
      }
      const worstTransitions=[...worst].map(([reason,sample])=>({reason,frame:sample.frame,value:sample.value,
        independentReconstruction:decode(sample.pixels,sample.source).summary,
        assignmentReconstruction:decode(sample.assigned,sample.source).summary,
        patches:temporalDiagnostics(sample.previousAssigned,sample.assigned,before.width,before.height,{gridStepX:160,gridStepY:100}).patches}));
      await wait(140);
      if(delta(before.pixels,getFrame().pixels).changedPercent!==0)throw Error('Held output drifted');
      if(delta(oldAssigned,assignment(oldRoots,before.width,before.height,999).pixels).changedPercent!==0)throw Error('Assigned held output drifted');
      routes.push({pose:z===13?'spawn':'near first diamond',action,width:before.width,height:before.height,
        backend:before.backend,exactPairs:true,exactRest:true,transitions,worstTransitions});
    }
    const result={scope:'Actual scene depth captured at prescribed poses; deterministic CPU counterfactual outputs. No changed renderer or real-time/comfort claim.',
      world:document.body.dataset.demo,viewport:[innerWidth,innerHeight],devicePixelRatio,
      spacing:96,strength:.33,seed:173,framesPerRoute:frameCount+1,nominalStepHz:60,turnStepRadians:.005,
      candidate:'Offline exact-pair pink seed-coordinate transport using existing greedy rank ownership, without source colors or old RGB blending. No promotion.',routes};
    report.dataset.results=JSON.stringify(result);report.dataset.complete='true';report.textContent=JSON.stringify(result,null,2);
  }catch(error){report.dataset.error=error.message;report.textContent=error.stack;throw error;}
  finally{stop();Object.assign(player,saved);}
}
