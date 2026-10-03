import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {runBenchmark,syntheticFrames} from '../src/debug/benchmark.js';
import {isolationFrames} from '../src/debug/isolation-scene.js';
import {RANK_PROFILES,createRankRenderer} from '../src/debug/rank-color.js';

// Fixed mechanisms, no coefficient search. Keep the observer and gates unchanged.
const profiles=RANK_PROFILES.filter(p=>['quiet','anchor','modulated','original'].includes(p.id));
const sourceSHA256=Object.fromEntries(['src/debug/rank-color.js','src/debug/benchmark.js','src/debug/observer.js','src/debug/candidate-gates.js','tests/fusion-research.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
for(const [name,frames] of [
  ['isolated',isolationFrames()],
  ['ring',isolationFrames({shape:'ring'})],
  ['layered',syntheticFrames({width:640,height:360,spacing:120})],
]){
  const {report}=await runBenchmark(frames,profiles,{render:createRankRenderer()});
  report.sourceSHA256=sourceSHA256;
  fs.writeFileSync(`evidence/fusion-${name}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({scene:name,results:report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,conflict:r.summary.colorConflictFraction,spread:r.colorSpread.remoteFraction,motion:r.motion.screenLumaRMS,source:r.broadColorRMSE})),decisions:report.decisions.map(d=>({id:d.candidate,pass:d.pass}))}));
}
