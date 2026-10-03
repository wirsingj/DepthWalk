import fs from 'node:fs';
import crypto from 'node:crypto';
import {runBenchmark,syntheticFrames} from '../src/debug/benchmark.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {createInkRenderer} from '../src/debug/ink-synthesis.js';
import {evaluateCandidate} from '../src/debug/candidate-gates.js';

// Fixed local ink: 45% final RGB at projected contour owners. No parameter sweep.
const profiles=[
  {id:'quiet',label:'Quiet baseline',pattern:'quiet',surfaceDetail:.35},
  {id:'soft',label:'Soft paired',pattern:'chroma-soft',surfaceDetail:.35,temporalStability:true},
  {id:'ink',label:'Soft paired with ink',pattern:'research-ink',surfaceDetail:.35,temporalStability:true},
  {id:'original',label:'Flat source negative control',original:true,control:'negative'},
],reports=[];
for(const sequence of [isolationFrames(),syntheticFrames({width:640,height:360,spacing:120})]){
  const frames=sequence.map(f=>({...f,invertDepth:true,name:f.name+' · reversed relief'}));
  const render=createInkRenderer();
  const {report}=await runBenchmark(frames,profiles,{render});
  report.inkRegression=evaluateCandidate(report.results[1],report.results[2],'banding');
  report.inkEffect={changedPixels:render.changedPixels,visibleChangeEveryFrame:render.changedPixels.every(n=>n>0),scope:'A zero-change ink candidate is not an edge improvement, even if regression gates pass.'};
  reports.push(report);
  console.log(JSON.stringify({scene:report.dataset,regression:report.inkRegression.pass,effect:report.inkEffect,results:report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,conflict:r.summary.colorConflictFraction,motion:r.motion.screenLumaRMS,spread:r.colorSpread.remoteFraction,source:r.broadColorRMSE}))}));
}
const paths=['src/depthwalk.js','src/chroma-stereo.js','src/contours.js','src/debug/ink-synthesis.js','src/debug/benchmark.js','src/debug/observer.js','tests/ink-research.js'];
fs.writeFileSync('evidence/ink-research.json',JSON.stringify({recordedAt:new Date().toISOString(),environment:'Windows / Node '+process.version,scope:'Fixed ink candidate on two reversed-relief synthetic fixtures; numerical comparison only',sources:Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),reports},null,2)+'\n');
