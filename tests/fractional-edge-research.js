import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {renderFractionalEdge,createFractionalEdgeField,edgeDefaults} from '../src/debug/fractional-synthesis.js';
import {reconstructFractionalPatches,compareFractionalPatches,fractionalDefaults} from '../src/debug/fractional-reconstruct.js';
import {layeredTruth} from './fractional-observer-fixtures.js';
import {imageStats,changeStats} from './fractional-phase-research.js';

export const edgeProtocol=Object.freeze({seeds:[17,91,317],tolerance:1/16,
  modes:['continuous','rounded','supersampled-links'],subpixels:8,
  cases:[{name:'wide-post',options:{}},{name:'translated-post',options:{foregroundLeft:-26,foregroundRight:38}},
    {name:'thin-post',options:{foregroundLeft:-6,foregroundRight:6}},
    {name:'off-grid-depths',options:{nearSeparation:36.2,farSeparation:51.1}}]});
export const edgePoints=[60,...Array.from({length:56},(_,i)=>80+i*2),230].map(x=>({x,y:4}));
const range=values=>({min:Math.min(...values),max:Math.max(...values)});
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

export function evaluateEdge(image,options={},points=edgePoints){
  const decoded=reconstructFractionalPatches({...image,points});
  // Geometry is introduced after the image-only search, including for controls
  // whose generating depth was rounded. Never score against a modified target.
  const truth=layeredTruth(points,options);
  const compared=compareFractionalPatches(decoded,truth.records.map(p=>p.separation),{tolerance:edgeProtocol.tolerance});
  const strata={};
  for(let i=0;i<points.length;i++){
    const t=truth.records[i],s=compared.samples[i];
    const label=t.occluded?'occluded':t.plane+(t.edgeDistance<19?'-boundary':'-interior');
    const group=strata[label]??={samples:0,accepted:0,correct:0,falseMatches:0};
    group.samples++;group.accepted+=s.accepted;group.correct+=s.accepted&&!s.falseMatch;group.falseMatches+=s.falseMatch;
  }
  return {...compared.summary,strata,falseExamples:compared.samples.filter(p=>p.falseMatch).slice(0,5),
    reasons:Object.fromEntries([...new Set(decoded.patches.map(p=>p.reason))].map(reason=>
      [reason,decoded.patches.filter(p=>p.reason===reason).length])),
    image:imageStats(image.pixels,image.width)};
}

export function edgeRoutes(){
  const outBack=out=>[out[0],...out,...out.slice(0,-1).reverse(),out[0]];
  return [
    {name:'translate-wide',frames:outBack(Array.from({length:17},(_,i)=>({foregroundLeft:-32+i/2,foregroundRight:32+i/2})))},
    {name:'translate-thin',frames:outBack(Array.from({length:17},(_,i)=>({foregroundLeft:-6+i/2,foregroundRight:6+i/2})))},
    {name:'near-rounding-crossing',frames:outBack(Array.from({length:9},(_,i)=>({nearSeparation:35.25+i/16})))},
    {name:'far-rounding-crossing',frames:outBack(Array.from({length:9},(_,i)=>({farSeparation:51.25+i/16})))},
  ];
}

export function edgeTransition(before,after,from={},to={}){
  const {width,height}=before;
  const points=Array.from({length:width},(_,x)=>({x,y:0}));
  const first=layeredTruth(points,from),second=layeredTruth(points,to);
  const boundDistance=(x,t)=>Math.min(...[...t.leftBounds,...t.rightBounds].map(v=>Math.abs(x-v)));
  const outside=(x,b)=>x<b[0]||x>=b[1];
  let squares=0,count=0,maxAbs=0,allSquares=0;
  const columns=new Float64Array(width);
  const sameFar=(from.farSeparation??edgeDefaults.farSeparation)===(to.farSeparation??edgeDefaults.farSeparation);
  for(let x=0;x<width;x++){
    const stationaryBackground=sameFar&&[first,second].every(t=>t.records[x].plane==='background'&&
      !t.records[x].occluded&&outside(x,t.rightBounds)&&boundDistance(x,t)>2);
    for(let y=0;y<height;y++){
      const delta=after.pixels[y*width+x]-before.pixels[y*width+x];
      allSquares+=delta*delta;columns[x]+=delta*delta;
      if(stationaryBackground){squares+=delta*delta;count++;maxAbs=Math.max(maxAbs,Math.abs(delta));}
    }
  }
  const topColumns=Array.from(columns,(v,x)=>({x,rms:Math.sqrt(v/height),
    silhouetteDistance:Math.min(boundDistance(x,first),boundDistance(x,second))})).sort((a,b)=>b.rms-a.rms).slice(0,5);
  return {...changeStats(before.pixels,after.pixels,width),stationaryBackground:{samples:count,
    rms:count?Math.sqrt(squares/count):null,maxAbs:count?maxAbs:null,energyFraction:allSquares?squares/allSquares:null},topColumns};
}

function summarizeRoute(route,seed,mode){
  const options=route.frames.map(frame=>({...frame,seed}));
  const images=options.map(o=>renderFractionalEdge(o,{mode,subpixels:edgeProtocol.subpixels}));
  const stats=images.map(i=>imageStats(i.pixels,i.width));
  const changes=images.slice(1).map((image,i)=>({from:i,to:i+1,...edgeTransition(images[i],image,options[i],options[i+1])}));
  const worst=changes.reduce((a,b)=>a.rms>=b.rms?a:b);
  const stationary=changes.filter(c=>c.stationaryBackground.rms!==null&&
    ['nearSeparation','farSeparation','foregroundLeft','foregroundRight'].some(key=>
      (options[c.from][key]??edgeDefaults[key])!==(options[c.to][key]??edgeDefaults[key])));
  const result={name:route.name,seed,mode,transitionCount:changes.length,rmsTrace:changes.map(c=>c.rms),
    contrastSD:range(stats.map(s=>s.sd)),gradientRms:range(stats.map(s=>s.horizontalDifferenceRms)),
    meanChangeRms:changes.reduce((sum,c)=>sum+c.rms,0)/changes.length,peakChangeRms:worst.rms,
    peakStationaryBackgroundRms:stationary.length?Math.max(...stationary.map(c=>c.stationaryBackground.rms)):null,
    exactRest:equal(images[0].pixels,images[1].pixels)&&equal(images.at(-1).pixels,images.at(-2).pixels),
    exactReturn:equal(images[0].pixels,images.at(-1).pixels),
    reversalSymmetry:images.every((im,i)=>equal(im.pixels,images[images.length-1-i].pixels)),
    worstTransition:{...worst,fromGeometry:options[worst.from],toGeometry:options[worst.to]}};
  if(mode==='continuous')result.worstTransition.reconstruction=[worst.from,worst.to].map(index=>({index,...evaluateEdge(images[index],options[index])}));
  return result;
}

export function runFractionalEdgeResearch(){
  const staticCases=[];
  for(const seed of edgeProtocol.seeds)for(const fixture of edgeProtocol.cases)for(const mode of edgeProtocol.modes){
    const options={...fixture.options,seed};
    staticCases.push({seed,case:fixture.name,mode,...evaluateEdge(renderFractionalEdge(options,{mode}),options)});
  }
  const pairs=[];
  for(const fixture of edgeProtocol.cases){
    const field=createFractionalEdgeField(fixture.options);
    const points=Array.from({length:1200},(_,i)=>({x:20+i*.2,y:i%9}));
    const truth=layeredTruth(points,fixture.options).records;
    const errors=truth.filter(t=>t.separation!==null&&t.x+t.separation<319.5).map(t=>Math.abs(field.sample(t.x,t.y)-field.sample(t.x+t.separation,t.y)));
    pairs.push({case:fixture.name,samples:errors.length,maxCodeError:Math.max(...errors)});
  }
  const routes=[];
  for(const seed of edgeProtocol.seeds)for(const route of edgeRoutes())for(const mode of edgeProtocol.modes)routes.push(summarizeRoute(route,seed,mode));
  const crossings=[];
  for(const seed of edgeProtocol.seeds)for(const step of [1/4,1/8,1/16,1/32]){
    const from={seed,nearSeparation:35.5-step/2},to={seed,nearSeparation:35.5+step/2};
    crossings.push({seed,step,methods:Object.fromEntries(edgeProtocol.modes.map(mode=>[mode,
      edgeTransition(renderFractionalEdge(from,{mode}),renderFractionalEdge(to,{mode}),from,to)]))});
  }
  const disocclusion=[];
  for(const seed of edgeProtocol.seeds){
    const from={seed},to={seed,foregroundLeft:-26,foregroundRight:38};
    const a=layeredTruth(edgePoints,from),b=layeredTruth(edgePoints,to);
    const points=edgePoints.filter((_p,i)=>a.records[i].occluded&&!b.records[i].occluded);
    disocclusion.push({seed,...evaluateEdge(renderFractionalEdge(to),to,points)});
  }
  // Post-sweep diagnosis of an out-of-tolerance accepted estimate. These extra
  // kernel sizes do NOT replace the frozen primary observer or rescore its data.
  const probeOptions={seed:317,foregroundLeft:-6,foregroundRight:6},probePoint={x:168,y:4};
  const field=createFractionalEdgeField(probeOptions);
  const probeTruth=layeredTruth([probePoint],probeOptions).records[0].separation;
  let areaLeft=0,areaRight=0;
  for(let i=0;i<16384;i++){
    const x=probePoint.x-.5+(i+.5)/16384;
    areaLeft+=field.sample(x,4)/16384;areaRight+=field.sample(x+probeTruth,4)/16384;
  }
  const samplingProbe={scope:'Post-sweep diagnostic; not a retuned acceptance rule.',options:probeOptions,point:probePoint,
    expected:probeTruth,pixelAreaPairDifference:Math.abs(areaRight-areaLeft),decodes:[]};
  for(const quantize of [false,true])for(const kernelRadius of [8,16,32]){
    const decoded=reconstructFractionalPatches({...renderFractionalEdge(probeOptions,{quantize}),
      points:[probePoint],settings:{kernelRadius}}).patches[0];
    samplingProbe.decodes.push({quantize,kernelRadius,...decoded});
  }
  return {schema:1,scope:'Offline single-image two-plane synthesis. No gameplay replacement, timed display, calibrated viewing or human comfort result.',
    protocol:edgeProtocol,observer:fractionalDefaults,geometry:edgeDefaults,
    method:'Continuous right-to-left visible-pair traversal; analytic integration of a fixed 12-harmonic seed field once per pixel. Separate seed phase for left-occluded background. Byte quantization last.',
    controls:'Rounded control changes both plane geometry and separation; scored against ORIGINAL geometry. 8x links use nearest subpixel partner and one final box integration. Same fixed field, amplitude, resolution and seed; no contrast normalization.',
    sources:[{url:'https://cvai.cit.tum.de/_media/spezial/bib/pgm03_has.pdf',scope:'Petz et al. 2003 sections 2-5, visible correspondence propagation, fractional sampling and repeated-filter blur. Our interval integrator is not their implementation.'},
      {url:'http://www.techmind.org/stereo/stech.html',scope:'Supersampled-link and final pixel-integration comparator; our two-eye visibility test replaces the endpoint shortcut. Not a reproduction.'}],
    pairs,staticCases,routeDefinitions:edgeRoutes(),routes,crossings,disocclusion,samplingProbe,
    limitations:['Two frontoparallel planes and one vertical post only; no slopes, city geometry, source colors or performance guarantee.',
      'An exact continuous field is not an exact band-limited displayed image: seed-domain seams and visibility cuts introduce high frequencies, attenuated only by single pixel-area integration.',
      'Local observer thresholds and original geometry remain fixed. Missing estimates stay null; accepted wrong estimates and their locations are retained.',
      'Stationary-background change excludes projected silhouettes by two pixels and compares fixed far geometry; it exposes propagation away from moving edges, not a human banding verdict.',
      'Same carrier parameters do not guarantee matching output spectra. Report SD and gradient with motion; neither proves full spectral preservation.',
      'Default seed fields are fixed in screen coordinates, not material-attached textures. Near-depth motion and translating boundaries can conflict with monocular motion cues.',
      'Rounded and supersampled comparators are research controls, not the current gameplay renderer. No claimed improvement over gameplay or increase in perceived pop.']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=runFractionalEdgeResearch();
  const files=['src/debug/fractional-synthesis.js','src/debug/fractional-reconstruct.js','tests/fractional-edge-research.js',
    'tests/fractional-edge.test.js','tests/fractional-observer-fixtures.js','tests/fractional-phase-research.js'];
  report.provenance={recordedAt:new Date().toISOString(),node:process.version,platform:process.platform,
    baseRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),uncommittedResearch:true,
    command:'node tests/fractional-edge-research.js --output evidence/fractional-edge-verification.json',
    sourceSHA256:Object.fromEntries(files.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]))};
  const json=JSON.stringify(report,null,2)+'\n',flag=process.argv.indexOf('--output');
  if(flag>=0){if(!process.argv[flag+1])throw Error('Missing output path');writeFileSync(process.argv[flag+1],json);}
  else console.log(json);
}
