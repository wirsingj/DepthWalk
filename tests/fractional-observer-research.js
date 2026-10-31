import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {reconstructFractionalPatches,compareFractionalPatches,fractionalDefaults} from '../src/debug/fractional-reconstruct.js';
import {independentPeriodicImage,renderLayeredPair,layeredTruth} from './fractional-observer-fixtures.js';

export const observerProtocol=Object.freeze({seeds:[17,91,317],tolerance:1/16,
  periods:[35.375,43.39,47.25,47.49,47.5,47.75,51.61],
  cases:[{name:'wide-post',options:{}},
    {name:'translated-post',options:{foregroundLeft:-26,foregroundRight:38}},
    {name:'thin-post',options:{foregroundLeft:-6,foregroundRight:6}},
    {name:'off-grid-depths',options:{nearSeparation:36.2,farSeparation:51.1}}]});
function summarize(decoded,truth){
  const compared=compareFractionalPatches(decoded,truth.records.map(r=>r.separation),{tolerance:observerProtocol.tolerance});
  const strata={};
  for(let i=0;i<compared.samples.length;i++){
    const sample=compared.samples[i],label=truth.records[i].occluded?'occluded':
      truth.records[i].edgeDistance<19?truth.records[i].plane+'-boundary':truth.records[i].plane+'-interior';
    const group=strata[label]??={samples:0,accepted:0,correct:0,falseMatches:0,maxAcceptedError:null};
    group.samples++;group.accepted+=sample.accepted;group.falseMatches+=sample.falseMatch;
    group.correct+=sample.accepted&&!sample.falseMatch;
    if(sample.error!==null)group.maxAcceptedError=Math.max(group.maxAcceptedError??0,sample.error);
  }
  return {...compared.summary,strata,
    falseExamples:compared.samples.filter(s=>s.falseMatch).slice(0,5),
    reasons:Object.fromEntries([...new Set(decoded.patches.map(p=>p.reason))].map(reason=>
      [reason,decoded.patches.filter(p=>p.reason===reason).length]))};
}
export function runFractionalObserverResearch(){
  const points=[60,140,190,230].map(x=>({x,y:4})),planes=[];
  const imageArgs=pixels=>({pixels,width:320,height:9,points});
  for(const seed of observerProtocol.seeds)for(const period of observerProtocol.periods){
    const decoded=reconstructFractionalPatches(imageArgs(independentPeriodicImage({seed,period})));
    planes.push({seed,period,...compareFractionalPatches(decoded,points.map(()=>period)).summary});
  }
  let state=621;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const negatives={blank:new Float64Array(320*9).fill(128),weak:independentPeriodicImage({amplitude:.01}),
    unrelated:Float64Array.from({length:320*9},()=>32+192*random()),
    harmonic:Float64Array.from({length:320*9},(_,i)=>128+60*Math.sin(2*Math.PI*(i%320)/8))};
  const controls=Object.fromEntries(Object.entries(negatives).map(([name,pixels])=>[name,
    compareFractionalPatches(reconstructFractionalPatches(imageArgs(pixels)),points.map(()=>null)).summary]));
  const wrongDepth=reconstructFractionalPatches(imageArgs(independentPeriodicImage({period:49.375})));
  controls.wrongDepth=compareFractionalPatches(wrongDepth,points.map(()=>47.375)).summary;
  const edgePoints=[60,...Array.from({length:56},(_,i)=>80+i*2),230].map(x=>({x,y:4})),boundaries=[];
  let newlyVisible=0,newlyVisibleAccepted=0,newlyVisibleWrong=0;
  for(const seed of observerProtocol.seeds){
    let baselineTruth=null;
    for(const fixture of observerProtocol.cases){
      const options={...fixture.options,seed},pair=renderLayeredPair(options),truth=layeredTruth(edgePoints,options);
      const decoded=reconstructFractionalPatches({...pair,points:edgePoints});
      boundaries.push({seed,case:fixture.name,...summarize(decoded,truth)});
      if(fixture.name==='wide-post')baselineTruth=truth;
      if(fixture.name==='translated-post')for(let i=0;i<edgePoints.length;i++){
        if(baselineTruth.records[i].occluded&&!truth.records[i].occluded){
          newlyVisible++;newlyVisibleAccepted+=decoded.patches[i].accepted;
          newlyVisibleWrong+=decoded.patches[i].accepted&&Math.abs(decoded.patches[i].separation-truth.records[i].separation)>observerProtocol.tolerance;
        }
      }
    }
  }
  return {schema:1,scope:'Offline observer calibration, not a renderer candidate, benchmark or human-vision result.',
    settings:fractionalDefaults,protocol:observerProtocol,
    source:{url:'https://vision.middlebury.edu/stereo/taxonomy-IJCV.pdf',
      reviewed:'Scharstein and Szeliski (2002), sections 3.4, 5.1, 6.2 and 6.4: cross-checking, regional evaluation, boundary fattening and subpixel sampling. Our thresholds and implementation are engineering controls, not a reproduction.'},
    planes,controls,boundaries,disocclusion:{newlyVisible,newlyVisibleAccepted,newlyVisibleWrong},
    limitations:[
      'Layered boundary images are separately ray-rendered eye views; they do not demonstrate a valid single-image occlusion renderer.',
      'Two fixed window widths assume locally constant disparity. Rejection leaves depth unmeasured; it does not prove the image is wrong.',
      'The [32,56] pixel search is calibrated scope, not exhaustive uniqueness. Harmonics outside that range are not ruled out.',
      'Contrast and horizontal gradient are diagnostics, not proof of retained texture spectrum or human comfort.',
      'Synthetic two-plane geometry, three deterministic texture seeds, one sampled row band; no arbitrary slopes, color, physical display calibration or moving-game acceptance.'
    ]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=runFractionalObserverResearch();
  report.provenance={recordedAt:new Date().toISOString(),node:process.version,platform:process.platform,
    baseRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),uncommittedResearch:true,
    command:'node tests/fractional-observer-research.js --output evidence/fractional-observer-verification.json',
    sourceSHA256:Object.fromEntries(['src/debug/fractional-reconstruct.js','tests/fractional-observer-fixtures.js',
      'tests/fractional-observer.test.js','tests/fractional-observer-research.js'].map(path=>
      [path,createHash('sha256').update(readFileSync(path)).digest('hex')]))};
  const json=JSON.stringify(report,null,2)+'\n',flag=process.argv.indexOf('--output');
  if(flag>=0){if(!process.argv[flag+1])throw Error('Missing output path');writeFileSync(process.argv[flag+1],json);}
  else console.log(json);
}
