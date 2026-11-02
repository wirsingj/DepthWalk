import {createFractionalEdgeField,renderFractionalEdge} from '../src/debug/fractional-synthesis.js';
import {layeredTruth} from './fractional-observer-fixtures.js';
import {reconstructFractionalPatches,compareFractionalPatches} from '../src/debug/fractional-reconstruct.js';
import {edgeProtocol,evaluateEdge,edgeRoutes,edgeTransition} from './fractional-edge-research.js';
import {imageStats,changeStats} from './fractional-phase-research.js';
import {createSeamMatchedField} from '../src/debug/fractional-seam-synthesis.js';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

const render=(options,settings)=>settings.continuity?createSeamMatchedField(options,settings).render():renderFractionalEdge(options,settings);
export const treatments=Object.freeze([
  {name:'baseline',settings:{}},{name:'six-harmonics',settings:{harmonics:6}},
  {name:'shared-birth-phase',settings:{birthPhase:0}},{name:'matched-value',settings:{continuity:'value'}},
  {name:'matched-slope',settings:{continuity:'slope'}},
  {name:'independent-slope',settings:{continuity:'slope',independentSeeds:true}},
  {name:'support-faded',settings:{continuity:'slope',independentSeeds:true,fadePixels:1}},
]);

// Renderer-internal diagnostics are deliberately distinct from the image-only
// acceptance observer. Never pass this partition to reconstruction.
export function auditSeams(options={}){
  const field=createFractionalEdgeField(options),parts=field.partition();
  const truth=layeredTruth([],options),bounds=[...truth.leftBounds,...truth.rightBounds];
  const seams=[];
  for(let i=1;i<parts.length;i++){
    const x=parts[i].start;
    const jump=field.sample(x+1e-7,4)-field.sample(x-1e-7,4);
    if(Math.abs(jump)>1e-4)seams.push({x,jump,silhouetteDistance:Math.min(...bounds.map(b=>Math.abs(b-x)))});
  }
  return {partitionCount:parts.length,coveredWidth:parts.reduce((sum,p)=>sum+p.end-p.start,0),seams,
    propagated:seams.filter(s=>s.silhouetteDistance>2).length,
    maxJump:Math.max(0,...seams.map(s=>Math.abs(s.jump)))};
}

export function sampleShiftedField(options={},phase=0){
  if(!Number.isFinite(phase)||Math.abs(phase)>.5)throw Error('Invalid sampling phase');
  const field=createFractionalEdgeField({...options,width:322,height:9});
  const pixels=Uint8Array.from({length:320*9},(_,i)=>Math.round(field.area(i%320+1+phase,Math.floor(i/320))));
  return {width:320,height:9,pixels};
}

export function samplingPhaseSweep(){
  const points=[110,138,144,150,162,164,166,168,170,174,180,230].map(x=>({x,y:4})),records=[];
  for(const seed of [17,91,317])for(const phase of [-.375,-.125,0,.125,.375]){
    const options={seed,foregroundLeft:-6,foregroundRight:6};
    const decoded=reconstructFractionalPatches({...sampleShiftedField(options,phase),points});
    const truth=layeredTruth(points.map(p=>({...p,x:p.x+1+phase})),{...options,width:322});
    const compared=compareFractionalPatches(decoded,truth.records.map(p=>p.separation));
    records.push({seed,phase,...compared.summary,falseExamples:compared.samples.filter(s=>s.falseMatch)});
  }
  return {scope:'Sampling-lattice offsets, fixed observer; expected geometry uses the same physical sample locations.',records};
}

export function candidateSweep(settings={},seeds=[17,91,317]){
  const statics=[],motion=[];
  for(const seed of seeds){
    for(const fixture of edgeProtocol.cases){
      const options={...fixture.options,seed};
      statics.push({seed,name:fixture.name,...evaluateEdge(render(options,settings),options)});
    }
    for(const route of edgeRoutes()){
      let previous=null;const changes=[],stats=[];
      for(let i=0;i<route.frames.length;i++){
        const options={...route.frames[i],seed},im=render(options,settings);
        stats.push(imageStats(im.pixels,im.width));
        if(previous)changes.push(edgeTransition(previous,im,route.frames[i-1],route.frames[i]));
        previous=im;
      }
      motion.push({seed,name:route.name,peakRms:Math.max(...changes.map(c=>c.rms)),
        backgroundPeak:route.name==='far-rounding-crossing'?null:Math.max(...changes.map(c=>c.stationaryBackground.rms??0)),
        sdMin:Math.min(...stats.map(s=>s.sd)),sdMax:Math.max(...stats.map(s=>s.sd)),
        gradientMin:Math.min(...stats.map(s=>s.horizontalDifferenceRms)),gradientMax:Math.max(...stats.map(s=>s.horizontalDifferenceRms))});
    }
  }
  const summary={samples:0,accepted:0,correct:0,falseMatches:0};
  for(const row of statics)for(const key of Object.keys(summary))summary[key]+=row[key];
  return {settings,seeds,summary,statics,motion};
}

export function vanishingPostSweep(){
  const empty=renderFractionalEdge({foregroundLeft:1000,foregroundRight:1001},{quantize:false}),records=[];
  for(const width of [12,1,.1,.01,.001,.0001,.00001]){
    const options={foregroundLeft:-width/2,foregroundRight:width/2};
    const hard=createSeamMatchedField(options,{continuity:'slope',independentSeeds:true});
    const faded=createSeamMatchedField(options,{continuity:'slope',independentSeeds:true,fadePixels:1});
    records.push({width,hard:hard.diagnostics,faded:faded.diagnostics,
      hardDifference:changeStats(empty.pixels,hard.render({quantize:false}).pixels,320).rms,
      fadedDifference:changeStats(empty.pixels,faded.render({quantize:false}).pixels,320).rms,
      baselineDifference:changeStats(empty.pixels,renderFractionalEdge(options,{quantize:false}).pixels,320).rms});
  }
  return {scope:'Limit as post width tends to zero; original geometry retained, only seed projection strength fades below one projected pixel.',records};
}

// Screening thresholds are comparative engineering criteria, specified before
// the holdout sweep. They are not human comfort limits or permission to promote.
export function screening(candidate,baseline){
  const gates={sameScope:candidate.summary.samples>0&&candidate.summary.samples===baseline.summary.samples,
    depth:candidate.summary.falseMatches===0,coverage:candidate.summary.correct>=baseline.summary.correct,
    contrast:true,gradient:true,motion:true,background:true};
  const regressions=[];
  for(const expected of baseline.motion){
    const actual=candidate.motion.find(r=>r.seed===expected.seed&&r.name===expected.name);
    if(!actual){gates.sameScope=false;continue;}
    for(const [key,value,reference,minimum] of [['contrast',actual.sdMin,expected.sdMin,.95],
      ['gradient',actual.gradientMin,expected.gradientMin,.9]]){
      if(!Number.isFinite(value)||value<reference*minimum){gates[key]=false;regressions.push({seed:actual.seed,route:actual.name,metric:key,ratio:value/reference});}
    }
    for(const [key,value,reference] of [['motion',actual.peakRms,expected.peakRms],
      ['background',actual.backgroundPeak,expected.backgroundPeak]]){
      if(reference===null)continue;
      if(!Number.isFinite(value)||value>reference*1.001){gates[key]=false;regressions.push({seed:actual.seed,route:actual.name,metric:key,ratio:value/reference});}
    }
  }
  return {gates,passes:Object.values(gates).every(Boolean),regressions,
    scope:'No worse motion per matched route (0.1% numerical margin), at least 95% contrast and 90% gradient; same sample count, no false depth accepts, no reduction in correct accepted count. Boundary coverage and human acceptance remain separate.'};
}

export function holdoutSweep(){
  const points=Array.from({length:40},(_,i)=>({x:60+i*4,y:4}));
  const fixtures=[{foregroundLeft:-29.7,foregroundRight:34.3},
    {foregroundLeft:-3.2,foregroundRight:3.2,nearSeparation:33.2,farSeparation:54.3},
    {foregroundLeft:-65,foregroundRight:65,nearSeparation:39.1,farSeparation:53.7}];
  const records=[];
  for(const treatment of treatments.filter(t=>['baseline','matched-value','matched-slope','support-faded'].includes(t.name)))
    for(const seed of [101,509,2027])for(let scene=0;scene<fixtures.length;scene++){
      const options={...fixtures[scene],seed};
      records.push({name:treatment.name,seed,scene,...evaluateEdge(render(options,treatment.settings),options,points)});
    }
  return {seeds:[101,509,2027],fixtures,points,records,
    scope:'Fresh seeds and off-grid geometry, fixed original observer; not used to choose thresholds or tune candidates.'};
}

export function viewportControl(){
  const empty=renderFractionalEdge({foregroundLeft:1000,foregroundRight:1001});
  const records=[];
  for(const screenRight of [-.50001,-1,-4,-12]){
    const right=(screenRight-159.5-35.375/2)/(1-35.375/96),options={foregroundLeft:right-16,foregroundRight:right};
    records.push({screenRight,options,baselineDifference:changeStats(empty.pixels,render(options,{}).pixels,320).rms,
      candidateDifference:changeStats(empty.pixels,render(options,{continuity:'slope',independentSeeds:true,fadePixels:1}).pixels,320).rms});
  }
  return records;
}

export function runSeamResearch(){
  const candidates=treatments.map(t=>({name:t.name,...candidateSweep(t.settings)}));
  for(const candidate of candidates)candidate.screening=screening(candidate,candidates[0]);
  const holdout=holdoutSweep();
  const decisions=candidates.map(candidate=>{
    const rows=holdout.records.filter(r=>r.name===candidate.name);
    return {name:candidate.name,primaryScreenPassed:candidate.screening.passes,
      holdoutFalseMatches:rows.length?rows.reduce((sum,r)=>sum+r.falseMatches,0):null,
      promotion:'none; offline research, incomplete boundary coverage and no human acceptance'};
  });
  return {schema:1,scope:'Ten audit/adjust/test loops on offline fractional edges; no gameplay or human-vision result.',
    methodology:'Geometry and image-only observer thresholds are fixed. Finite Fourier coefficients are projected onto value/slope continuity constraints using two-pass orthogonalization. No old images, frame normalization, clipping or texture renewal.',
    source:{url:'https://pbr-book.org/4ed/Sampling_and_Reconstruction/Sampling_Theory',
      reviewed:'Sections 8.1.1-8.1.4: discontinuities are not band limited; samples and reconstruction must be distinguished. Our coefficient constraints, support fade and screening are engineering experiments, not a reproduction.'},
    seams:{wide:auditSeams(),thin:auditSeams({seed:317,foregroundLeft:-6,foregroundRight:6})},
    sampling:samplingPhaseSweep(),candidates,vanishing:vanishingPostSweep(),viewport:viewportControl(),holdout,decisions,
    limitations:['No ramps, city integration, physical viewing calibration, GPU performance or human motion acceptance.',
      'Value/slope continuity does not make the piecewise field band limited; displayed errors can persist.',
      'Orthogonal coefficient projection changes the field globally as geometry changes, and can reduce contrast/detail.',
      'Support fading relaxes seam continuity below one projected pixel while preserving the correspondence construction.',
      'Thin-foreground and newly exposed boundary coverage remains incomplete; null estimates are not successes.',
      'Historical edge evidence is not rewritten; baseline bytes in its original twelve scenes were compared directly with the prior committed source.']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const files=['src/debug/fractional-synthesis.js','src/debug/fractional-seam-synthesis.js','src/debug/fractional-reconstruct.js',
    'tests/fractional-seam-research.js','tests/fractional-seam.test.js','tests/fractional-edge-research.js',
    'tests/fractional-edge.test.js','tests/fractional-observer-fixtures.js','tests/fractional-phase-research.js'];
  const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
  const sourceSHA256=hashes(),report=runSeamResearch();
  if(JSON.stringify(sourceSHA256)!==JSON.stringify(hashes()))throw Error('Research sources changed during the sweep; rerun before retaining evidence');
  report.provenance={recordedAt:new Date().toISOString(),node:process.version,platform:process.platform,
    baseRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),uncommittedResearch:true,
    command:'node tests/fractional-seam-research.js --output evidence/fractional-seam-verification.json',
    sourceSHA256};
  const json=JSON.stringify(report,null,2)+'\n',flag=process.argv.indexOf('--output');
  if(flag>=0){if(!process.argv[flag+1])throw Error('Missing output path');writeFileSync(process.argv[flag+1],json);}
  else console.log(json);
}
