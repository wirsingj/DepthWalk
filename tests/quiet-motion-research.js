import fs from 'node:fs';
import crypto from 'node:crypto';
import {runBenchmark,syntheticFrames,QUIET_MOTION_PROFILES} from '../src/debug/benchmark.js';

// Freeze gates before execution: this targets shimmer, not removal of bands.
const gates={accuracyLoss:.01,supportRatio:.9,colorConflictIncrease:.02,motionRatio:.9,remoteColorRatio:1.05,sourceErrorIncrease:1,stationaryChanges:0};
const profiles=QUIET_MOTION_PROFILES;
const reports=[];
for(const dimensions of [{width:640,height:256,spacing:96},{width:1920,height:360,spacing:120}]){
  const {report}=await runBenchmark(syntheticFrames(dimensions),profiles);
  const [base,candidate]=report.results;
  const pass={
    depth:candidate.accuracy>=base.accuracy-gates.accuracyLoss,
    support:candidate.summary.supportedFraction>=base.summary.supportedFraction*gates.supportRatio,
    colorConflict:candidate.summary.colorConflictFraction<=base.summary.colorConflictFraction+gates.colorConflictIncrease,
    motion:candidate.motion.screenLumaRMS<=base.motion.screenLumaRMS*gates.motionRatio,
    stationary:candidate.motion.stationaryMaxChangedFraction===gates.stationaryChanges,
    colorLocality:candidate.colorSpread.remoteFraction<=base.colorSpread.remoteFraction*gates.remoteColorRatio,
    sourceColor:candidate.broadColorRMSE<=base.broadColorRMSE+gates.sourceErrorIncrease,
  };
  reports.push({...report,decision:{gates,pass,eligibleForHumanComparison:Object.values(pass).every(Boolean)}});
  console.log(JSON.stringify({dimensions,pass,results:report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,conflict:r.summary.colorConflictFraction,spread:r.colorSpread.remoteFraction,motion:r.motion.screenLumaRMS,colorError:r.broadColorRMSE,renderMs:r.renderAndReadbackMs}))}));
}
const sources=['src/depthwalk.js','src/surface-stereo.js','src/stereogram.js','src/debug/benchmark.js','src/debug/observer.js','src/debug/reconstruct.js','tests/quiet-motion-research.js'];
fs.writeFileSync('evidence/quiet-motion-research.json',JSON.stringify({recordedAt:new Date().toISOString(),scope:'CPU synthetic motion test, Windows/Node '+process.version+'; two sizes of one scene, no human fusion or GPU performance claim',sources:Object.fromEntries(sources.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')])),reports},null,2)+'\n');
