// Fixed engineering gates. Passing them is permission to compare, not human approval.
export const CANDIDATE_GATES=Object.freeze({
  'quiet-motion':Object.freeze({accuracyLoss:.01,supportRatio:.9,colorConflictIncrease:.02,motionRatio:.9,remoteColorRatio:1.05,sourceErrorIncrease:1,stationaryChanges:0}),
  banding:Object.freeze({accuracyLoss:.01,supportRatio:.9,colorConflictIncrease:.02,motionRatio:1.05,remoteColorRatio:.5,sourceErrorIncrease:1,stationaryChanges:0}),
});
export function evaluateCandidate(base,candidate,kind){
  const gates=CANDIDATE_GATES[kind];if(!gates)throw Error('Unknown candidate gates');
  const rows=[
    ['depth','Depth accuracy',candidate.accuracy,base.accuracy-gates.accuracyLoss,'min',base.accuracy],
    ['support','Supported area',candidate.summary.supportedFraction,base.summary.supportedFraction*gates.supportRatio,'min',base.summary.supportedFraction],
    ['colorConflict','Eye-color conflict',candidate.summary.colorConflictFraction,base.summary.colorConflictFraction+gates.colorConflictIncrease,'max',base.summary.colorConflictFraction],
    ['motion','Motion change',candidate.motion.screenLumaRMS,base.motion.screenLumaRMS*gates.motionRatio,'max',base.motion.screenLumaRMS],
    ['stationary','Stationary drift',candidate.motion.stationaryMaxChangedFraction,gates.stationaryChanges,'max',0],
    ['colorLocality','Remote color spread',candidate.colorSpread.remoteFraction,base.colorSpread.remoteFraction*gates.remoteColorRatio,'max',base.colorSpread.remoteFraction],
    ['sourceColor','Source-color error',candidate.broadColorRMSE,base.broadColorRMSE+gates.sourceErrorIncrease,'max',base.broadColorRMSE],
  ];
  const checks=rows.map(([key,label,actual,limit,direction,baseline])=>({key,label,actual,limit,direction,pass:Number.isFinite(actual)&&Number.isFinite(baseline)&&Number.isFinite(limit)&&(direction==='min'?actual>=limit:actual<=limit)}));
  const pass=Object.fromEntries(checks.map(c=>[c.key,c.pass]));
  return {candidate:candidate.profile.id,baseline:base.profile.id,kind,gates,checks,pass,allGatesPassed:checks.every(c=>c.pass),scope:'Relative engineering gates; absolute observer floors and human fusion remain separate.'};
}
