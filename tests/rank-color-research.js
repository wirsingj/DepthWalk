import fs from 'node:fs';
import {runBenchmark,syntheticFrames} from '../src/debug/benchmark.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {RANK_PROFILES,createRankRenderer} from '../src/debug/rank-color.js';

// Fixed mechanisms, calibration and gates. No parameter search or observer tuning.
// City captures remain in the browser lab: preview=rank.
const anchorProfiles=RANK_PROFILES.filter(p=>['quiet','rank-stable','anchor','original'].includes(p.id));
for(const [name,frames,profiles] of [
  ['rank-color-isolated',isolationFrames(),RANK_PROFILES.filter(p=>!['anchor','modulated'].includes(p.id))],
  ['rank-color-layered',syntheticFrames({width:640,height:360,spacing:120}),RANK_PROFILES.filter(p=>['quiet','rank','rank-stable','original'].includes(p.id))],
  ['anchor-color-isolated',isolationFrames(),anchorProfiles],
  ['anchor-color-layered',syntheticFrames({width:640,height:360,spacing:120}),anchorProfiles],
]){
  const {report}=await runBenchmark(frames,profiles,{render:createRankRenderer()});
  fs.writeFileSync(`evidence/${name}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({scene:name,results:report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,conflict:r.summary.colorConflictFraction,spread:r.colorSpread.remoteFraction,motion:r.motion.screenLumaRMS,source:r.broadColorRMSE})),decisions:report.decisions.map(d=>({id:d.candidate,pass:d.pass}))}));
}
