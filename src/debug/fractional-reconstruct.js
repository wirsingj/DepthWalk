// Image-only research observer. No renderer, scene, depth or expected disparity.
// Coordinates name the LEFT image sample, not the scene/cyclopean midpoint.
// Pass one image for an autostereogram, two images for stereo calibration controls.
export const fractionalDefaults=Object.freeze({min:32,max:56,step:1/32,kernelRadius:8,
  windowRadii:Object.freeze([5,11]),verticalRadius:2,minSD:5,minCorrelation:.97,
  minPeakMargin:.03,competitorDistance:2,scaleTolerance:1/8,roundTripTolerance:1/8});

const sinc=x=>Math.abs(x)<1e-12?1:Math.sin(Math.PI*x)/(Math.PI*x);
function kernel(x,radius){
  const integer=Math.floor(x),fraction=x-integer;
  if(fraction<1e-12)return {integer,weights:[{offset:0,weight:1}]};
  const weights=[];let sum=0;
  for(let offset=1-radius;offset<=radius;offset++){
    const d=fraction-offset,weight=sinc(d)*sinc(d/radius);
    weights.push({offset,weight});sum+=weight;
  }
  for(const item of weights)item.weight/=sum;
  return {integer,weights};
}
function sample(pixels,base,k){
  let value=0;for(const {offset,weight} of k.weights)value+=pixels[base+k.integer+offset]*weight;
  return value;
}
function validate(pixels,otherPixels,width,height,points,s){
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<16||height<1||
    !Number.isSafeInteger(width*height))throw Error('Invalid fractional image dimensions');
  for(const image of [pixels,otherPixels]){
    if(!(image instanceof Float32Array||image instanceof Float64Array||image instanceof Uint8Array)||
      image.length!==width*height||image.some(v=>!finite(v)||v<0||v>255))throw Error('Expected finite scalar image samples in [0,255]');
  }
  if(!Array.isArray(points)||!points.length||points.length>4096||points.some(p=>!p||!finite(p.x)||
    !Number.isInteger(p.y)||p.x<0||p.x>=width||p.y<0||p.y>=height))throw Error('Invalid fractional sample points');
  if(!finite(s.min)||!finite(s.max)||!finite(s.step)||s.min<=0||s.max<=s.min||s.max>=width||
    s.step<=0||s.step>1||!Number.isInteger(s.kernelRadius)||s.kernelRadius<2||s.kernelRadius>32||
    !Number.isInteger(s.verticalRadius)||s.verticalRadius<0||s.verticalRadius>16||
    !Array.isArray(s.windowRadii)||s.windowRadii.length!==2||s.windowRadii.some(v=>!Number.isInteger(v)||v<2||v>64)||
    s.windowRadii[0]>=s.windowRadii[1])throw Error('Invalid fractional search geometry');
  const count=(s.max-s.min)/s.step;
  if(count>4096||Math.abs(count-Math.round(count))>1e-8)throw Error('Invalid fractional search grid');
  for(const key of ['minSD','minPeakMargin','competitorDistance','scaleTolerance','roundTripTolerance']){
    if(!finite(s[key])||s[key]<=0)throw Error('Invalid fractional acceptance settings');
  }
  if(!finite(s.minCorrelation)||s.minCorrelation<=0||s.minCorrelation>1||s.minPeakMargin>2||
    s.competitorDistance>s.max-s.min)throw Error('Invalid fractional acceptance settings');
}
function search(a,b,width,height,x,y,direction,radius,s){
  const margin=radius+s.kernelRadius;
  // Every candidate uses the same full window; never trim support at a border.
  const low=x+(direction<0?-s.max:0)-margin,high=x+(direction>0?s.max:0)+margin;
  if(low<0||high>=width||y<s.verticalRadius||y>=height-s.verticalRadius)
    return {accepted:false,separation:null,reason:'unsupported window',correlation:null,peakMargin:null};
  const sourceKernel=kernel(x,s.kernelRadius),source=[];
  let sumA=0,squaresA=0,gradientSquares=0,gradientCount=0;
  for(let dy=-s.verticalRadius;dy<=s.verticalRadius;dy++){
    let previous=null;
    for(let dx=-radius;dx<=radius;dx++){
      const base=(y+dy)*width+dx,value=sample(a,base,sourceKernel);
      source.push({base,value});sumA+=value;squaresA+=value*value;
      if(previous!==null){gradientSquares+=(value-previous)**2;gradientCount++;}previous=value;
    }
  }
  const n=source.length,varA=Math.max(0,squaresA-sumA*sumA/n),sdLeft=Math.sqrt(varA/n);
  const gradientRms=Math.sqrt(gradientSquares/gradientCount),records=[];
  if(sdLeft<s.minSD)return {accepted:false,separation:null,reason:'weak contrast',sdLeft,gradientRms,correlation:null,peakMargin:null};
  for(let index=0;index<=Math.round((s.max-s.min)/s.step);index++){
    const separation=s.min+index*s.step,k=kernel(x+direction*separation,s.kernelRadius);
    let sumB=0,squaresB=0,cross=0;
    for(const {base,value} of source){const v=sample(b,base,k);sumB+=v;squaresB+=v*v;cross+=value*v;}
    const varB=Math.max(0,squaresB-sumB*sumB/n),sdRight=Math.sqrt(varB/n);
    const correlation=varB>1e-12?Math.max(-1,Math.min(1,(cross-sumA*sumB/n)/Math.sqrt(varA*varB))):null;
    records.push({separation,correlation,sdRight});
  }
  const ranked=records.filter(r=>r.correlation!==null).sort((u,v)=>v.correlation-u.correlation),best=ranked[0];
  if(!best)return {accepted:false,separation:null,reason:'weak contrast',sdLeft,gradientRms,correlation:null,peakMargin:null};
  const competitor=ranked.find(r=>Math.abs(r.separation-best.separation)>=s.competitorDistance);
  const peakMargin=competitor?best.correlation-competitor.correlation:null;
  const rangeEdge=best.separation===s.min||best.separation===s.max;
  const accepted=!rangeEdge&&best.sdRight>=s.minSD&&best.correlation>=s.minCorrelation&&
    peakMargin!==null&&peakMargin>=s.minPeakMargin;
  return {...best,accepted,sdLeft,gradientRms,peakMargin,competitor:competitor??null,
    reason:accepted?'supported peak':rangeEdge?'search range edge':'weak or ambiguous match'};
}

export function reconstructFractionalPatches({pixels,otherPixels=pixels,width,height,points,settings={}}){
  const s={...fractionalDefaults,...settings};validate(pixels,otherPixels,width,height,points,s);
  const patches=points.map(({x,y})=>{
    const scales=s.windowRadii.map(r=>search(pixels,otherPixels,width,height,x,y,1,r,s));
    const supported=scales.every(v=>v.accepted);
    const disagreement=scales.every(v=>v.separation!==null)?Math.abs(scales[0].separation-scales[1].separation):null;
    const best=scales[0],consistent=supported&&disagreement<=s.scaleTolerance;
    // Search the entire declared domain in reverse; no truth-guided neighborhood.
    const reverse=consistent?search(otherPixels,pixels,width,height,x+best.separation,y,-1,s.windowRadii[0],s):null;
    const roundTripError=reverse&&reverse.separation!==null?Math.abs(reverse.separation-best.separation):null;
    const accepted=consistent&&!!reverse?.accepted&&roundTripError<=s.roundTripTolerance;
    const reason=!supported?'unsupported scale':!consistent?'scale disagreement':!accepted?'round-trip failure':'supported local disparity';
    return {x,y,accepted,separation:accepted?best.separation:null,candidate:best.separation,
      reason,scaleDisagreement:disagreement,roundTripError,scales,reverse};
  });
  return {coordinateConvention:'left-image sample; partner at x + separation',width,height,settings:s,patches,
    scope:'Local constant-disparity image evidence inside the declared search range; not human fusion, exhaustive visibility or a dense scene reconstruction.'};
}

// Comparison is deliberately separate. Null denotes no expected correspondence
// (e.g. an occluded sample or a negative control), not a zero-depth target.
export function compareFractionalPatches(decoded,expected,{tolerance=1/16}={}){
  if(!Array.isArray(decoded?.patches)||decoded.patches.some(p=>!p||typeof p.accepted!=='boolean'||
    (p.accepted?(typeof p.separation!=='number'||!Number.isFinite(p.separation)||p.separation<=0):p.separation!==null))||
    !Array.isArray(expected)||expected.length!==decoded.patches.length||
    expected.some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<=0))||
    typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<=0)throw Error('Invalid fractional comparison targets');
  const samples=decoded.patches.map((p,i)=>({x:p.x,y:p.y,expected:expected[i],accepted:p.accepted,
    separation:p.separation,error:p.accepted&&expected[i]!==null?Math.abs(p.separation-expected[i]):null,
    falseMatch:p.accepted&&(expected[i]===null||Math.abs(p.separation-expected[i])>tolerance)}));
  const accepted=samples.filter(s=>s.accepted),visible=samples.filter(s=>s.expected!==null);
  return {tolerance,samples,summary:{samples:samples.length,visible:visible.length,withoutCorrespondence:samples.length-visible.length,
    accepted:accepted.length,correct:accepted.filter(s=>s.error!==null&&s.error<=tolerance).length,
    falseMatches:accepted.filter(s=>s.falseMatch).length,
    maxAcceptedError:accepted.some(s=>s.error!==null)?Math.max(...accepted.filter(s=>s.error!==null).map(s=>s.error)):null}};
}
