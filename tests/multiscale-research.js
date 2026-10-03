import fs from 'node:fs';
import crypto from 'node:crypto';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {runBenchmark,syntheticFrames} from '../src/debug/benchmark.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {MULTISCALE_PROFILES,renderAppearanceFrame} from '../src/debug/appearance-synthesis.js';
// One fixed candidate, specified before measurement. No observer tuning/sweep.
const reports=[],filter=new DepthWalkFilter();
for(const frames of [isolationFrames(),syntheticFrames({width:640,height:360,spacing:120})]){
  const {report}=await runBenchmark(frames,MULTISCALE_PROFILES,{render:(frame,settings)=>renderAppearanceFrame(filter,frame,settings)});
  reports.push(report);
  console.log(JSON.stringify({scene:report.dataset,decision:report.decisions[0],results:report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,colorConflict:r.summary.colorConflictFraction,motion:r.motion.screenLumaRMS,spread:r.colorSpread.remoteFraction,sourceError:r.broadColorRMSE,renderMs:r.renderAndReadbackMs}))}));
}
const sources=['src/debug/appearance-synthesis.js','src/debug/multiscale-contrast.js','src/debug/isolation-scene.js','src/debug/candidate-gates.js','src/debug/benchmark.js','src/debug/observer.js','src/debug/reconstruct.js','tests/multiscale-research.js'];
fs.writeFileSync('evidence/multiscale-research.json',JSON.stringify({recordedAt:new Date().toISOString(),environment:{os:'Windows',node:process.version},scope:'CPU fixed-parameter experiment on isolated and layered shapes; no human fusion or interactive FPS claim',sources:Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),reports},null,2)+'\n');
