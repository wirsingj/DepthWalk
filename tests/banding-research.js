import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import crypto from 'node:crypto';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {boundedColor} from '../src/debug/bounded-color.js';
import {runBenchmark,syntheticFrames} from '../src/debug/benchmark.js';

// Fixed before running. All gates must pass against the edge-free control;
// the actual Quiet mode is also reported. No aggregate "comfort" score.
const gates={remoteColorRatio:.5,accuracyLoss:.01,supportRatio:.9,colorConflictIncrease:.02,motionRatio:1.05,stationaryChanges:0};
const profiles=[{id:'quiet',label:'Current Quiet',pattern:'quiet',surfaceDetail:.55},{id:'control',label:'Quiet without contour accents',pattern:'transport-control',surfaceDetail:.55},{id:'bounded',label:'Four-member color groups, complete carrier',pattern:'transport-bounded',surfaceDetail:.55}];
const filter=new DepthWalkFilter();
const render=(frame,settings)=>settings.pattern==='quiet'?filter.render(frame,settings).pixels.slice():boundedColor(frame,{detail:settings.surfaceDetail,bounded:settings.pattern==='transport-bounded'}).pixels;
const reports=[];
for(const dimensions of [{width:640,height:256,spacing:96},{width:1920,height:360,spacing:120}]){
  const frames=syntheticFrames(dimensions);
  const {report}=await runBenchmark(frames,profiles,{render});
  const control=report.results.find(r=>r.profile.id==='control'),candidate=report.results.find(r=>r.profile.id==='bounded');
  const pass={colorLocality:candidate.colorSpread.remoteFraction<=control.colorSpread.remoteFraction*gates.remoteColorRatio,depth:candidate.accuracy>=control.accuracy-gates.accuracyLoss,support:candidate.summary.supportedFraction>=control.summary.supportedFraction*gates.supportRatio,colorConflict:candidate.summary.colorConflictFraction<=control.summary.colorConflictFraction+gates.colorConflictIncrease,motion:candidate.motion.screenLumaRMS<=control.motion.screenLumaRMS*gates.motionRatio,stationary:candidate.motion.stationaryMaxChangedFraction===0};
  reports.push({...report,decision:{gates,pass,promote:Object.values(pass).every(Boolean)},transport:{control:boundedColor(frames[0],{bounded:false}).stats,candidate:boundedColor(frames[0]).stats}});
  // Native previews are lossless RGBA, wrapped in PPM for a small standard
  // scientific plotting/conversion utility; never browser screenshot compression.
  for(const profile of profiles){
    const pixels=render(frames[0],{pattern:profile.pattern,surfaceDetail:.55,spacing:dimensions.spacing,depthStrength:.5,edges:2}),rgb=Buffer.alloc(pixels.length*3);
    for(let i=0;i<pixels.length;i++){rgb[i*3]=pixels[i]&255;rgb[i*3+1]=pixels[i]>>>8&255;rgb[i*3+2]=pixels[i]>>>16&255;}
    fs.writeFileSync(`evidence/banding-${dimensions.width}-${profile.id}.ppm`,Buffer.concat([Buffer.from(`P6\n${dimensions.width} ${dimensions.height}\n255\n`),rgb]));
  }
  console.log(JSON.stringify({dimensions,decision:reports.at(-1).decision,results:report.results.map(r=>({id:r.profile.id,accuracy:r.accuracy,support:r.summary.supportedFraction,conflict:r.summary.colorConflictFraction,spread:r.colorSpread.remoteFraction,motion:r.motion.screenLumaRMS}))}));
}
const sources=['src/debug/bounded-color.js','src/debug/benchmark.js','src/debug/observer.js','src/debug/reconstruct.js','src/surface-stereo.js','src/stereogram.js','tests/banding-research.js'];
fs.writeFileSync('evidence/bounded-color-research.json',JSON.stringify({recordedAt:new Date().toISOString(),scope:'CPU synthetic causal experiment; full width, unchanged dense depth graph; not human fusion or GPU performance validation',sources:Object.fromEntries(sources.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')])),reports},null,2));
