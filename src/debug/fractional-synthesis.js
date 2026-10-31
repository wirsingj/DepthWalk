// Offline two-plane SIRDS experiment. This is not the gameplay filter contract.
// Follow exact visible correspondences in continuous screen coordinates, then
// integrate the ORIGINAL finite Fourier field once over each display pixel.
// No previous frame, filtered-image feedback, depth interpolation or renewal.
const TAU=2*Math.PI;
export const edgeDefaults=Object.freeze({width:320,height:9,eyeSeparation:96,screenDistance:80,
  nearSeparation:35.375,farSeparation:51.625,foregroundLeft:-32,foregroundRight:32,seed:17});

function geometry(options){
  const g={...edgeDefaults,...options};
  for(const key of Object.keys(edgeDefaults))if(typeof g[key]!=='number'||!Number.isFinite(g[key]))throw Error('Finite edge fixture values required');
  if(!Number.isInteger(g.width)||g.width<64||g.width>2048||!Number.isInteger(g.height)||g.height<1||g.height>512||
    g.eyeSeparation<=g.farSeparation||g.screenDistance<=0||g.nearSeparation<24||g.nearSeparation>=g.farSeparation||
    g.farSeparation>=g.width/2||g.foregroundLeft>=g.foregroundRight||!Number.isInteger(g.seed)||g.seed<0||g.seed>0xffffffff)
    throw Error('Invalid two-plane edge geometry');
  const depthRatio=g.nearSeparation/(g.eyeSeparation-g.nearSeparation);
  g.origin=(g.width-1)/2;
  // Ray/plane intersection, independent of the projected-interval truth fixture.
  g.nearAt=(x,eye)=>{
    const world=eye+(x-g.origin-eye)*(1+depthRatio);
    return world>=g.foregroundLeft&&world<g.foregroundRight;
  };
  const screen=(world,eye)=>g.origin+eye+(world-eye)/(1+depthRatio);
  const left=[screen(g.foregroundLeft,-g.eyeSeparation/2),screen(g.foregroundRight,-g.eyeSeparation/2)];
  const right=[screen(g.foregroundLeft,g.eyeSeparation/2),screen(g.foregroundRight,g.eyeSeparation/2)];
  // Changes of the right-eye surface, or visibility of its left partner.
  g.cuts=[-.5,...right,...left.map(x=>x+g.farSeparation)].sort((a,b)=>a-b);
  if(g.cuts.some(v=>!Number.isFinite(v)))throw Error('Invalid projected edge geometry');
  return g;
}

function carrier(seed,height){
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const weights=Float64Array.from({length:12},(_,i)=>1/Math.sqrt(i+1));
  const amplitude=120/weights.reduce((a,b)=>a+b,0);
  const phases=Array.from({length:height},()=>Float64Array.from(weights,()=>TAU*random()));
  return {weights,amplitude,phases};
}

function action(x,g){
  if(x<-.5)return {seedKind:0,shift:0};
  const near=g.nearAt(x,g.eyeSeparation/2),shift=near?g.nearSeparation:g.farSeparation;
  if(!near&&g.nearAt(x-shift,-g.eyeSeparation/2))return {seedKind:1,shift:0};
  return {seedKind:null,shift};
}

// Each output interval maps to one untranslated-width interval in an original
// seed field. Splitting at silhouettes prevents interpolation across depth edges.
function segments(a,b,g,depth=0){
  if(depth>Math.ceil(g.width/g.nearSeparation)+2)throw Error('Correspondence chain failed to terminate');
  const cuts=[a,...g.cuts.filter(v=>v>a+1e-10&&v<b-1e-10),b],result=[];
  for(let i=1;i<cuts.length;i++){
    const lo=cuts[i-1],hi=cuts[i],branch=action((lo+hi)/2,g);
    if(branch.seedKind!==null)result.push({a:lo,b:hi,seedKind:branch.seedKind});
    else result.push(...segments(lo-branch.shift,hi-branch.shift,g,depth+1));
  }
  return result;
}

function seedValue(x,y,kind,g,c){
  let value=128;
  for(let k=0;k<c.weights.length;k++)value+=c.amplitude*c.weights[k]*Math.cos(
    TAU*(k+1)*(x-g.origin)/g.farSeparation+c.phases[y][k]+kind*(k+1)*2.173);
  return value;
}

function integral(part,y,g,c){
  let value=128*(part.b-part.a);
  for(let k=0;k<c.weights.length;k++){
    const frequency=TAU*(k+1)/g.farSeparation;
    const phase=c.phases[y][k]+part.seedKind*(k+1)*2.173-frequency*g.origin;
    value+=c.amplitude*c.weights[k]*(Math.sin(frequency*part.b+phase)-Math.sin(frequency*part.a+phase))/frequency;
  }
  return value;
}

export function createFractionalEdgeField(options={}){
  const g=geometry(options),c=carrier(g.seed,g.height);
  const sample=(x,y)=>{
    if(!Number.isFinite(x)||x<-.5||x>g.width-.5||!Number.isInteger(y)||y<0||y>=g.height)throw Error('Invalid field sample');
    let current=x;
    for(let step=0;step<=Math.ceil(g.width/g.nearSeparation)+2;step++){
      const branch=action(current,g);
      if(branch.seedKind!==null)return seedValue(current,y,branch.seedKind,g,c);
      current-=branch.shift;
    }
    throw Error('Correspondence chain failed to terminate');
  };
  const render=()=>{
    const pixels=new Float64Array(g.width*g.height);
    for(let x=0;x<g.width;x++){
      const parts=segments(x-.5,x+.5,g);
      for(let y=0;y<g.height;y++)pixels[y*g.width+x]=parts.reduce((sum,part)=>sum+integral(part,y,g,c),0);
    }
    return {width:g.width,height:g.height,pixels};
  };
  return {sample,render};
}

export function renderFractionalEdge(options={}, {mode='continuous',subpixels=8,quantize=true}={}){
  if(!['continuous','rounded','supersampled-links'].includes(mode)||typeof quantize!=='boolean'||
    !Number.isInteger(subpixels)||subpixels<1||subpixels>64)throw Error('Invalid edge sampling mode');
  const original=geometry(options);
  let image;
  if(mode==='supersampled-links'){
    const g=original,c=carrier(g.seed,g.height),count=g.width*subpixels;
    const roots=new Int32Array(count),kinds=new Uint8Array(count);
    for(let i=0;i<count;i++){
      const x=(i+.5)/subpixels-.5,branch=action(x,g);
      const partner=i-Math.round(branch.shift*subpixels);
      if(branch.seedKind!==null||partner<0){roots[i]=i;kinds[i]=branch.seedKind??0;}
      else{roots[i]=roots[partner];kinds[i]=kinds[partner];}
    }
    const pixels=new Float64Array(g.width*g.height);
    for(let y=0;y<g.height;y++)for(let i=0;i<count;i++)pixels[y*g.width+Math.floor(i/subpixels)]+=
      seedValue((roots[i]+.5)/subpixels-.5,y,kinds[i],g,c)/subpixels;
    image={width:g.width,height:g.height,pixels};
  }else{
    const target=mode==='rounded'?{...options,nearSeparation:Math.round(original.nearSeparation),farSeparation:Math.round(original.farSeparation)}:options;
    image=createFractionalEdgeField(target).render();
  }
  if(quantize)image.pixels=Uint8Array.from(image.pixels,v=>Math.round(v));
  return image;
}
