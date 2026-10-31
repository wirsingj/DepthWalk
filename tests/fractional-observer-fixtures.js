// Independent observer calibration: physically projected two-eye views, NOT a
// single-image stereogram renderer. Ray intersections generate the images;
// projected interval geometry supplies truth separately after decoding.
export const layeredFixture=Object.freeze({width:320,height:9,eyeSeparation:96,screenDistance:80,
  nearSeparation:35.375,farSeparation:51.625,foregroundLeft:-32,foregroundRight:32,seed:17});
const frequencies=[.0431,.0897,.1373,.1931,.2279],amplitudes=[15,19,23,17,11];
function texture(plane,u,y,seed){
  let value=128;
  for(let k=0;k<frequencies.length;k++){
    const phase=((seed*(k+3)*.731+plane*2.17+y*(k+1)*.417)%(2*Math.PI));
    value+=amplitudes[k]*Math.sin(2*Math.PI*frequencies[k]*u+phase);
  }
  return value;
}
function geometry(options){
  const s={...layeredFixture,...options};
  const nearZ=s.screenDistance*s.nearSeparation/(s.eyeSeparation-s.nearSeparation);
  const farZ=s.screenDistance*s.farSeparation/(s.eyeSeparation-s.farSeparation);
  return {...s,nearZ,farZ,origin:(s.width-1)/2};
}
export function renderLayeredPair(options={}){
  const g=geometry(options),{width,height,eyeSeparation,screenDistance,nearZ,farZ,origin,seed}=g;
  const images=[-eyeSeparation/2,eyeSeparation/2].map(eye=>{
    const pixels=new Float64Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let sum=0;const samples=32;
      for(let k=0;k<samples;k++){
        const screenX=x-origin-.5+(k+.5)/samples;
        const nearX=eye+(screenX-eye)*(screenDistance+nearZ)/screenDistance;
        const foreground=nearX>=g.foregroundLeft&&nearX<g.foregroundRight;
        const z=foreground?nearZ:farZ,worldX=eye+(screenX-eye)*(screenDistance+z)/screenDistance;
        sum+=texture(foreground?1:0,worldX*screenDistance/(screenDistance+z),y,seed);
      }
      pixels[y*width+x]=Math.round(sum/samples);
    }
    return pixels;
  });
  return {width,height,pixels:images[0],otherPixels:images[1]};
}
export function layeredTruth(points,options={}){
  const g=geometry(options);
  const project=(eye,x,z)=>g.origin+eye+(x-eye)*g.screenDistance/(g.screenDistance+z);
  const l=-g.eyeSeparation/2,r=-l;
  const leftBounds=[project(l,g.foregroundLeft,g.nearZ),project(l,g.foregroundRight,g.nearZ)];
  const rightBounds=[project(r,g.foregroundLeft,g.nearZ),project(r,g.foregroundRight,g.nearZ)];
  const records=points.map(({x,y})=>{
    const near=x>=leftBounds[0]&&x<leftBounds[1],z=near?g.nearZ:g.farZ;
    const separation=project(r,0,z)-project(l,0,z),partner=x+separation;
    const occluded=!near&&partner>=rightBounds[0]&&partner<rightBounds[1];
    const edgeDistance=Math.min(...leftBounds.map(v=>Math.abs(v-x)),...rightBounds.map(v=>Math.abs(v-partner)));
    return {x,y,separation:occluded?null:separation,plane:near?'foreground':'background',occluded,edgeDistance};
  });
  return {leftBounds,rightBounds,records};
}
export function independentPeriodicImage({width=320,height=9,period=47.375,seed=17,amplitude=1}={}){
  return Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width),a=2*Math.PI*x/period;
    return Math.round(128+amplitude*(35*Math.sin(a+.17*y+seed)+28*Math.cos(3*a+.61*y+seed*.31)+23*Math.sin(7*a+.37*y+seed*.19)));
  });
}
