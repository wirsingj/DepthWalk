import fs from 'node:fs';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {runBenchmark,syntheticFrames} from '../src/debug/benchmark.js';
import {APPEARANCE_PROFILES,renderAppearanceFrame} from '../src/debug/appearance-synthesis.js';

const frames=syntheticFrames(),filter=new DepthWalkFilter();
const {report}=await runBenchmark(frames,APPEARANCE_PROFILES,{render:(frame,settings)=>renderAppearanceFrame(filter,frame,settings)});
report.scope='Static appearance optimization replayed per frame; CPU research only. Matching loss is separate from the frozen observer. Neutral control records human rejection despite decoder recovery.';
fs.writeFileSync('evidence/appearance-research.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,conflict:r.summary.colorConflictFraction,spread:r.colorSpread.remoteFraction,colorError:r.broadColorRMSE,motion:r.motion.screenLumaRMS})),null,2));
