import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Offline sampling-model control. No runtime imports, equality-class graph,
// old rendered pixels, depth blending, or per-frame contrast normalization.
const TAU=2*Math.PI;
export const fixture=Object.freeze({width:384,height:12,harmonics:12,seed:173,
  anchor:191.5,mean:128,peakBound:120,separationMin:47.25,separationMax:47.75});
export const decoderSettings=Object.freeze({min:40,max:56,step:1/32,radius:12,
  sampleStep:3,minSD:2,minCorrelation:.97,minPeakMargin:.03,competitorDistance:2});

function randomGenerator(seed){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
const sinc=x=>Math.abs(x)<1e-12?1:Math.sin(Math.PI*x)/(Math.PI*x);

export function createCarrier({height=fixture.height,harmonics=fixture.harmonics,seed=fixture.seed}={}){
  if(!Number.isInteger(height)||height<1||!Number.isInteger(harmonics)||harmonics<1)throw new Error('positive integer carrier dimensions required');
  const random=randomGenerator(seed),weights=Float64Array.from({length:harmonics},(_,k)=>1/Math.sqrt(k+1));
  const normalizer=Math.sqrt(weights.reduce((s,w)=>s+w*w,0)/2);
  for(let k=0;k<harmonics;k++)weights[k]/=normalizer;
  const phases=Array.from({length:height},()=>Float64Array.from(weights,()=>TAU*random()));
  const absoluteBound=weights.reduce((s,w)=>s+w,0);
  // One fixed amplitude for every frame and row; triangle inequality proves gamut.
  return {height,harmonics,weights,phases,absoluteBound,amplitude:fixture.peakBound/absoluteBound};
}

export function renderPlane(carrier,separation,{width=fixture.width,anchor=fixture.anchor,
  mean=fixture.mean,rounded=false,quantize=false}={}){
  const period=rounded?Math.round(separation):separation;
  if(!Number.isFinite(period)||period<=2*carrier.harmonics)throw new Error('separation must keep all harmonics below Nyquist');
  if(!Number.isInteger(width)||width<1||!Number.isFinite(anchor)||!Number.isFinite(mean))throw new Error('invalid image geometry');
  const pixels=new Float64Array(width*carrier.height);
  const scales=Float64Array.from(carrier.weights,(weight,k)=>carrier.amplitude*weight*sinc((k+1)/period));
  for(let y=0;y<carrier.height;y++)for(let x=0;x<width;x++){
    let value=mean;
    // Exact integral over [x-.5,x+.5] of each finite Fourier component.
    for(let k=0;k<carrier.harmonics;k++)value+=scales[k]*Math.cos(TAU*(k+1)*(x-anchor)/period+carrier.phases[y][k]);
    pixels[y*width+x]=quantize?Math.round(value):value;
  }
  return pixels;
}

export function imageStats(pixels,width){
  let sum=0,squares=0,min=Infinity,max=-Infinity,outOfGamut=0,horizontalSquares=0;
  for(let i=0;i<pixels.length;i++){
    const value=pixels[i];sum+=value;squares+=value*value;min=Math.min(min,value);max=Math.max(max,value);
    outOfGamut+=value<0||value>255;
    if(i%width)horizontalSquares+=(value-pixels[i-1])**2;
  }
  const mean=sum/pixels.length;
  return {mean,sd:Math.sqrt(Math.max(0,squares/pixels.length-mean*mean)),min,max,outOfGamut,
    horizontalDifferenceRms:Math.sqrt(horizontalSquares/(pixels.length-pixels.length/width))};
}

export function changeStats(before,after,width){
  if(before.length!==after.length||!before.length||before.length%width)throw new Error('matching nonempty frames required');
  const columnEnergy=new Float64Array(width);
  let squares=0,changed=0,maxAbs=0;
  for(let i=0;i<before.length;i++){
    const delta=after[i]-before[i];squares+=delta*delta;columnEnergy[i%width]+=delta*delta;
    changed+=Math.abs(delta)>1e-10;maxAbs=Math.max(maxAbs,Math.abs(delta));
  }
  const columnMean=squares/width;
  return {rms:Math.sqrt(squares/before.length),maxAbs,changedFraction:changed/before.length,
    columnEnergyCV:columnMean?Math.sqrt(columnEnergy.reduce((sum,e)=>sum+(e-columnMean)**2,0)/width)/columnMean:null};
}

// Independent image-only reconstruction: finite-window sinc interpolation of
// luminance samples, never the generating Fourier coefficients or true disparity.
function shiftKernel(shift,radius){
  const integer=Math.floor(shift),fraction=shift-integer,weights=[];
  let total=0;
  for(let offset=1-radius;offset<=radius;offset++){
    const distance=fraction-offset,weight=sinc(distance)*sinc(distance/radius);
    weights.push({offset:integer+offset,weight});total+=weight;
  }
  for(const item of weights)item.weight/=total;
  return weights;
}

function matchAtShift(before,after,width,height,shift,{radius,sampleStep},left,right){
  const kernel=shiftKernel(shift,radius);
  let a=0,b=0,aa=0,bb=0,ab=0,count=0;
  for(let y=0;y<height;y++)for(let x=left;x<=right;x+=sampleStep){
    const first=before[y*width+x];let second=0;
    for(const {offset,weight} of kernel)second+=after[y*width+x+offset]*weight;
    a+=first;b+=second;aa+=first*first;bb+=second*second;ab+=first*second;count++;
  }
  const va=aa-a*a/count,vb=bb-b*b/count;
  return {correlation:va>1e-10&&vb>1e-10?(ab-a*b/count)/Math.sqrt(va*vb):null,
    sd:Math.sqrt(Math.max(0,va/count))};
}

export function decodeDisparity(pixels,width,height,settings=decoderSettings){
  const {min,max,step,radius,minSD,minCorrelation,minPeakMargin,competitorDistance}=settings;
  if(pixels.length!==width*height||min<=0||max<=min||step<=0||width<=max+2*radius)throw new Error('invalid decoder domain');
  // Common support for every candidate avoids lag-dependent sample-count bias.
  const left=radius,right=width-1-Math.ceil(max)-radius,records=[];
  for(let i=0;i<=Math.round((max-min)/step);i++){
    const separation=min+i*step;
    records.push({separation,...matchAtShift(pixels,pixels,width,height,separation,settings,left,right)});
  }
  const valid=records.filter(r=>r.correlation!==null).sort((a,b)=>b.correlation-a.correlation);
  if(!valid.length)return {accepted:false,separation:null,correlation:null,peakMargin:null,sd:0,reason:'no contrast'};
  const best=valid[0],competitor=valid.find(r=>Math.abs(r.separation-best.separation)>=competitorDistance);
  const peakMargin=competitor?best.correlation-competitor.correlation:null;
  const accepted=best.sd>=minSD&&best.correlation>=minCorrelation&&peakMargin!==null&&peakMargin>=minPeakMargin;
  return {accepted,separation:best.separation,correlation:best.correlation,peakMargin,sd:best.sd,
    reason:accepted?'local disparity peak':'weak, ambiguous or uncorrelated'};
}

export function patchMotion(before,after,width,height){
  const settings={radius:12,sampleStep:2},records=[];
  for(const center of [48,144,240,336]){
    const left=center-14,right=center+14,candidates=[];
    for(let k=-48;k<=48;k++)candidates.push({shift:k/16,
      ...matchAtShift(before,after,width,height,k/16,settings,left,right)});
    const valid=candidates.filter(r=>r.correlation!==null).sort((a,b)=>b.correlation-a.correlation),best=valid[0];
    const zero=candidates.find(r=>r.shift===0);
    records.push({center,shift:best?.shift??null,correlation:best?.correlation??null,
      zeroCorrelation:zero.correlation,improvement:best&&zero.correlation!==null?best.correlation-zero.correlation:null});
  }
  return records;
}

function range(values){return {min:Math.min(...values),max:Math.max(...values)};}
function summarizeSequence(images,width){
  const changes=images.slice(1).map((image,i)=>changeStats(images[i],image,width));
  const stats=images.map(image=>imageStats(image,width));
  return {transitions:changes.length,changeRms:range(changes.map(v=>v.rms)),
    maxColumnEnergyCV:Math.max(...changes.map(v=>v.columnEnergyCV??0)),
    contrastSD:range(stats.map(v=>v.sd)),horizontalDifferenceRms:range(stats.map(v=>v.horizontalDifferenceRms)),
    pixelRange:{min:Math.min(...stats.map(v=>v.min)),max:Math.max(...stats.map(v=>v.max))},
    outOfGamut:stats.reduce((sum,v)=>sum+v.outOfGamut,0),
    exactReturn:images[0].every((v,i)=>v===images.at(-1)[i])};
}

export function runFractionalPhaseResearch(){
  const {width,height,anchor,separationMin,separationMax}=fixture,carrier=createCarrier();
  const outward=Array.from({length:9},(_,i)=>separationMin+i/16),route=[...outward,...outward.slice(0,-1).reverse()];
  const treatments=['continuous','rounded'],sequences={},crossings=[];
  for(const treatment of treatments){
    const rounded=treatment==='rounded',images=route.map(s=>renderPlane(carrier,s,{rounded}));
    const byteImages=images.map(image=>Float64Array.from(image,Math.round));
    sequences[treatment]={float:summarizeSequence(images,width),byte:summarizeSequence(byteImages,width),
      heldExact:renderPlane(carrier,route[0],{rounded}).every((v,i)=>v===images[0][i])};
  }
  for(const step of [1/4,1/8,1/16]){
    const record={step,from:47.5-step/2,to:47.5+step/2};
    for(const treatment of treatments){
      const rounded=treatment==='rounded',a=renderPlane(carrier,record.from,{rounded}),b=renderPlane(carrier,record.to,{rounded});
      record[treatment]={float:changeStats(a,b,width),byte:changeStats(Float64Array.from(a,Math.round),Float64Array.from(b,Math.round),width),
        reverseRms:changeStats(b,a,width).rms};
    }
    crossings.push(record);
  }
  const decoded=outward.map(separation=>({separation,
    float:decodeDisparity(renderPlane(carrier,separation),width,height),
    byte:decodeDisparity(renderPlane(carrier,separation,{quantize:true}),width,height)}));
  const roundedDecoded=[47,48].map(separation=>({separation,
    result:decodeDisparity(renderPlane(carrier,separation,{quantize:true}),width,height)}));
  const random=randomGenerator(9181),otherCarrier=createCarrier({seed:921});
  const controls={
    knownDifferentCarrier:[43.375,51.25].map(separation=>({separation,
      result:decodeDisparity(renderPlane(otherCarrier,separation,{quantize:true}),width,height)})),
    flat:decodeDisparity(new Float64Array(width*height).fill(128),width,height),
    unrelatedNoise:decodeDisparity(Float64Array.from({length:width*height},()=>32+192*random()),width,height),
    ambiguousPeriodic:decodeDisparity(Float64Array.from({length:width*height},(_,i)=>128+64*Math.cos(TAU*(i%width)/8)),width,height),
  };
  const before=renderPlane(carrier,separationMin,{quantize:true}),after=renderPlane(carrier,separationMax,{quantize:true});
  const withPrediction=(from,to,first,second)=>patchMotion(first,second,width,height).map(record=>({...record,
    predictedShift:(record.center-anchor)*(to/from-1)}));
  const motion={separationSpan:separationMax-separationMin,
    expansion:withPrediction(separationMin,separationMax,before,after),
    contraction:withPrediction(separationMax,separationMin,after,before),
    stationary:patchMotion(before,before,width,height)};
  const powers=carrier.weights.map(weight=>weight*weight/2);
  const matchedPeriodBounds=[Math.round(separationMin),Math.round(separationMax)];
  const spectrum={construction:'fixed harmonic power proportional to 1/k; independent phases by row; no temporal renewal',
    scope:'Analytic unquantized field across continuous and rounded periods; byte rounding adds quantization error and is not strictly band-limited.',
    periodBounds:matchedPeriodBounds,maxCyclesPerPixel:carrier.harmonics/matchedPeriodBounds[0],nyquist:.5,
    analyticFullPeriodSD:range(matchedPeriodBounds.map(s=>carrier.amplitude*Math.sqrt(powers.reduce((sum,p,k)=>sum+p*sinc((k+1)/s)**2,0)))),
    pixelAreaPowerRetention:range(matchedPeriodBounds.map(s=>powers.reduce((sum,p,k)=>sum+p*sinc((k+1)/s)**2,0))),
    repeatedFiltering:false};
  return {scope:'Offline synthetic flat plane only; no occlusion, gameplay, timed display or human comfort validation. No promotion.',
    hypothesis:'Continuous current-frame spatial phase removes an integer-separation jump without rendered-frame blending; coherent texture motion may remain.',
    fixture:{...fixture,amplitude:carrier.amplitude,carrierRmsBeforePixelArea:1,
      analyticUnfilteredRange:[fixture.mean-fixture.peakBound,fixture.mean+fixture.peakBound]},
    sources:[
      {url:'https://christophertyler.org/CWTyler/TylerPDFs/TylerClarkeAutosterSPIE1979.pdf',
        citation:'Tyler and Clarke (1990), The Autostereogram, p.187',
        evidence:'Proposes fractional repetition phase through grayscale sampling of higher-resolution noise; no tested temporal algorithm.'},
      {url:'https://cvai.cit.tum.de/_media/spezial/bib/pgm03_has.pdf',
        citation:'Petz, Goldluecke and Magnor (2003), Hardware-accelerated Autostereogram Rendering, sections 3-5',
        evidence:'Fractional texture coordinates smooth depth steps; repeated spatial texture filtering blurs the pattern. Dynamic claims lack a specified controlled observer protocol.'},
    ],
    engineeringInterpretation:'Finite Fourier phase, analytic pixel integration, fixed amplitude and anchor, decoder and thresholds are our controls, not a reproduction of either paper. Real separation replaces exact integer equality; no runtime gate is relaxed.',
    decoder:{...decoderSettings,scope:'Image-only local search; no true separation or carrier coefficients passed. Does not inspect other harmonic periods outside [40,56], or establish human fusion.',
      method:'Normalized image correlation with radius-12 Lanczos reconstruction; competitor peak at least two pixels from best.'},
    route,sequences,crossings,decoded,roundedDecoded,controls,spectrum,motion,
    limitations:[
      'Carrier contrast differs from the runtime procedural field; only the continuous/rounded matched pair is compared.',
      'Finite sample interpolation and byte quantization are approximations; mathematical temporal continuity applies to the real-valued field, not byte values.',
      'Phase anchoring induces expansion/contraction; lower frame RMS is insufficient for motion acceptance.',
      'No visibility boundaries or disocclusion; a separate two-eye visibility experiment is required before any scene extension.',
      'Grayscale code-value integration is not calibrated display luminance; no physical display reconstruction, viewing geometry calibration, color or comfort claim.',
    ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const evidence=runFractionalPhaseResearch();
  evidence.provenance={date:new Date().toISOString().slice(0,10),node:process.version,platform:process.platform,
    revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    uncommittedResearch:true,command:'node tests/fractional-phase-research.js',
    sourceSHA256:Object.fromEntries(['tests/fractional-phase-research.js','tests/fractional-phase.test.js'].map(path=>
      [path,createHash('sha256').update(readFileSync(path)).digest('hex')]))};
  console.log(JSON.stringify(evidence,(_key,value)=>typeof value==='number'?Number(value.toFixed(7)):value,2));
}
