import {createPlayer,stepPlayer} from '../src/game.js';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {linkRow} from '../src/stereogram.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';
import {leastChangeBound,splitChange} from './foundation-mechanism.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const round=value=>Number(value.toFixed(6));
export function delta(a,b){
  let changed=0,large=0,sum=0,square=0,sa=0,sb=0,aa=0,bb=0,ab=0;
  for(let i=0;i<a.length;i++){
    const x=a[i]&255,y=b[i]&255,d=Math.abs(x-y);
    changed+=d>0;large+=d>=16;sum+=d;square+=d*d;
    sa+=x;sb+=y;aa+=x*x;bb+=y*y;ab+=x*y;
  }
  const n=a.length,den=Math.sqrt((aa-sa*sa/n)*(bb-sb*sb/n));
  return {changedPercent:round(100*changed/n),changedAtLeast16Percent:round(100*large/n),meanAbsByte:round(sum/n),rmsByte:round(Math.sqrt(square/n)),correlation:round(den?(ab-sa*sb/n)/den:1)};
}
function sourceDelta(a,b){
  let changed=0,sum=0;
  for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a[i+c]-b[i+c]);changed+=d>0;sum+=d;}
  return {changedPercent:round(400*changed/a.length),meanAbsChannelByte:round(sum/(a.length/4*3))};
}
export function roots(frame){
  if(frame.roots)return frame.roots;
  const {width,height,depth}=frame,out=new Uint32Array(width*height),z=new Float64Array(width),same=new Int32Array(width);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){const i=((height-1-y)*width+x)*4;z[x]=(depth[i]*256+depth[i+1])/65535;}
    linkRow(z,frame.spacing,frame.strength,same,null,null,undefined,null,y);
    for(let x=width-1;x>=0;x--)out[y*width+x]=same[x]===x?y*width+x:out[y*width+same[x]];
  }
  return out;
}
export function decode(pixels,frame){
  // The decoder sees output pixels only. Source depth enters the comparison afterward.
  const decoded=reconstructStereogram({pixels,width:frame.width,height:frame.height,spacing:frame.spacing,strength:frame.strength,maxColumns:64,maxRows:36});
  const comparison=compareReconstruction(decoded,{depth:frame.depth,origin:'bottom-left'});
  return {decoded,comparison,summary:{sampled:decoded.summary.sampled,valid:decoded.summary.valid,
    withinTwoPixelsPercent:round(comparison.summary.withinTwoPixels*100),
    meanDisparityError:round(comparison.summary.meanDisparityError),
    reliablePercent:round(decoded.summary.reliableFraction*100)}};
}
function decodedChange(before,after,strength,spacing){
  const changes=[];let expectedSum=0,unexplained=0,large=0;
  for(let i=0;i<before.decoded.disparity.length;i++){
    const a=before.decoded.disparity[i],b=after.decoded.disparity[i];
    if(!Number.isFinite(a)||!Number.isFinite(b))continue;
    const shift=z=>Math.round(2*spacing*(1-strength*z)/(2-strength*z));
    const expected=shift(after.comparison.expected[i])-shift(before.comparison.expected[i]);
    const d=Math.abs(b-a);changes.push(d);expectedSum+=Math.abs(expected);unexplained+=Math.abs(b-a-expected);large+=d>2;
  }
  changes.sort((a,b)=>a-b);
  return {compared:changes.length,meanDisparityChangePixels:round(changes.reduce((s,v)=>s+v,0)/changes.length),
    p95DisparityChangePixels:changes[Math.floor((changes.length-1)*.95)],changedOverTwoPixelsPercent:round(100*large/changes.length),
    meanExpectedChangePixels:round(expectedSum/changes.length),meanChangeErrorPixels:round(unexplained/changes.length)};
}

// Targeted game diagnostic, not another rendering mode. No control defaults change.
// A one-tick input is rate-dependent, not an absolute human minimum. Capture its
// first pose before release/coasting, using the actual stepPlayer implementation.
export async function runTinyStepCheck({player,stop,getFrame,captureNormalColor}){
  const report=document.createElement('pre');report.id='tiny-step-results';
  report.style.cssText='position:fixed;inset:90px 16px 16px;z-index:30;overflow:auto;background:#10202bf5;color:#bbefc3;padding:16px;font:12px monospace';
  report.textContent='Measuring tiny forward steps…';document.body.append(report);
  const saved={...player},reference=new FoundationFilter(),cases=[];
  const capture=async pose=>{
    stop();Object.assign(player,pose,{vx:0,vz:0,turn:0});
    const deadline=performance.now()+15000;let f;
    do{
      await wait(30);f=getFrame();
      if(performance.now()>deadline)throw Error('Timed out capturing exact pose');
    }while(!f||Math.abs(f.camera.position.z-player.z)>1e-10||Math.abs(f.camera.rotation.y-player.yaw)>1e-10);
    return {...f,pixels:f.pixels.slice(),depth:f.depth.slice(),roots:f.roots?.slice()};
  };
  const synth=(frame,noiseFrame,carrierContrast=1)=>reference.render({width:frame.width,height:frame.height,depth:frame.depth,format:'packed-proximity-rg16',origin:'bottom-left'},
    {carrier:'pink',spacing:frame.spacing,strength:frame.strength,noiseFrame,carrierContrast}).pixels.slice();
  try{
    // Warm up the dynamic carrier so FFT-to-procedural startup cannot explain it.
    await capture({...createPlayer(),z:13.01});
    for(const z of [13,1])for(const hz of [240,60]){
      await capture({...createPlayer(),z:z+.01});
      const basePose={...createPlayer(),z},before=await capture(basePose),sourceBefore=captureNormalColor();
      if(!before.noiseFrame)throw Error('Expected an already-moving carrier');
      await wait(140);const held=getFrame();
      const idle=delta(before.pixels,held.pixels);
      if(idle.changedPercent!==0||held.noiseFrame!==before.noiseFrame)throw Error('Standing-still control changed');
      const moved={...basePose};stepPlayer(moved,new Set(['KeyW']),1/hz);
      const distance=basePose.z-moved.z,after=await capture(moved),sourceAfter=captureNormalColor();
      if(after.noiseFrame===before.noiseFrame)throw Error('Movement did not refresh grain');
      const beforeRoots=roots(before),afterRoots=roots(after);
      let rootsChanged=0,depthSum=0;
      for(let i=0;i<beforeRoots.length;i++){
        rootsChanged+=beforeRoots[i]!==afterRoots[i];
        depthSum+=Math.abs((before.depth[i*4]*256+before.depth[i*4+1])-(after.depth[i*4]*256+after.depth[i*4+1]));
      }
      const fullBefore=synth(before,before.noiseFrame),fullAfter=synth(after,after.noiseFrame);
      const halfBefore=synth(before,before.noiseFrame,.5),halfAfter=synth(after,after.noiseFrame,.5);
      const depthOnly=synth(after,before.noiseFrame),grainOnly=synth(before,after.noiseFrame);
      const actualExpected=synth(after,after.noiseFrame,after.carrierContrast);
      const parity=delta(after.pixels,actualExpected);
      if(parity.meanAbsByte>.01)throw Error('Captured output differs from current CPU reference');
      const decodedBefore=decode(fullBefore,before),decodedHalfBefore=decode(halfBefore,before);
      const reconstruction={};
      for(const [name,a,b,frame] of [['fullContrast',decodedBefore,fullAfter,after],['halfContrast',decodedHalfBefore,halfAfter,after],
        ['depthOnlyHeldGrain',decodedBefore,depthOnly,after],['grainOnlyHeldDepth',decodedBefore,grainOnly,before]]){
        const decoded=decode(b,frame);
        reconstruction[name]={before:a.summary,after:decoded.summary,change:decodedChange(a,decoded,frame.strength,frame.spacing)};
      }
      cases.push({pose:z===13?'spawn':'near first diamond',hz,forwardDistance:round(distance),
        image:{width:after.width,height:after.height,backend:after.backend,noiseFrames:[before.noiseFrame,after.noiseFrame],contrast:after.carrierContrast},
        standingStill:idle,sourceRender:sourceDelta(sourceBefore,sourceAfter),
        changedStereoClassPercent:round(100*rootsChanged/beforeRoots.length),meanDepthChangeRG16:round(depthSum/beforeRoots.length),
        actualMovement:delta(before.pixels,after.pixels),
        controlled:{fullContrast:delta(fullBefore,fullAfter),halfContrast:delta(halfBefore,halfAfter),
          depthOnlyHeldGrain:delta(fullBefore,depthOnly),grainOnlyHeldDepth:delta(fullBefore,grainOnly)},
        mechanism:splitChange(fullBefore,fullAfter,depthOnly,after.width,after.height),
        exactGraphBound:leastChangeBound(fullBefore,afterRoots,after.width,after.height),
        reconstruction,cpuReferenceError:parity.meanAbsByte});
      report.textContent=JSON.stringify(cases,null,2);
    }
    const result={scope:'Actual game depth/output; one simulated input tick before release, not an absolute minimum tap. Controlled images vary depth or carrier independently. No renderer change.',
      world:document.body.dataset.demo,viewport:[innerWidth,innerHeight],devicePixelRatio,spacing:96,strength:.33,seed:173,
      reconstructionScope:'Independent image-only decoder; source comparison follows decoding. Confidence is contrast-sensitive; reconstruction is not human comfort.',cases};
    report.dataset.results=JSON.stringify(result);report.dataset.complete='true';report.textContent=JSON.stringify(result,null,2);
  }catch(error){report.dataset.error=error.message;report.textContent=error.stack;throw error;}
  finally{stop();Object.assign(player,saved);}
}
