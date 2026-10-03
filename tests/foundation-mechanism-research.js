import assert from 'node:assert/strict';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {linkRow} from '../src/stereogram.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';

// Diagnostic projection of frame differences onto constant/region means. This
// is NOT an image correction: subtracting separate regional means can break
// stereo pairs. The residual is a bound on what brightness-only correction can
// explain, not a comfort score or a proposed rendering algorithm.
export function changeEnergy(a,b,width,height,columns=3,rows=3){
  if(!(a instanceof Uint32Array)||!(b instanceof Uint32Array)
    ||![width,height,columns,rows].every(v=>Number.isSafeInteger(v)&&v>0)
    ||a.length!==width*height||b.length!==a.length||columns>width||rows>height)throw Error('Invalid change-energy input');
  const sums=new Float64Array(columns*rows),counts=new Uint32Array(sums.length);
  let sum=0,square=0;
  for(let i=0;i<a.length;i++){
    for(const pixel of [a[i],b[i]])assert.equal((pixel&255)*0x010101,pixel&0xffffff,'expected grayscale');
    const difference=(b[i]&255)-(a[i]&255),x=i%width,y=Math.floor(i/width);
    const at=Math.floor(y*rows/height)*columns+Math.floor(x*columns/width);
    sum+=difference;square+=difference*difference;sums[at]+=difference;counts[at]++;
  }
  const meanSquare=square/a.length,globalMeanSquare=(sum/a.length)**2;
  const regionalMeanSquare=sums.reduce((total,value,i)=>total+value*value/counts[i],0)/a.length;
  return {rms:Math.sqrt(meanSquare),signedMean:sum/a.length,meanSquare,
    globalMeanEnergyFraction:meanSquare?globalMeanSquare/meanSquare:null,
    regionalMeanEnergyFraction:meanSquare?regionalMeanSquare/meanSquare:null,
    residualAfterGlobalMean:Math.sqrt(Math.max(0,meanSquare-globalMeanSquare)),
    residualAfterRegionalMeans:Math.sqrt(Math.max(0,meanSquare-regionalMeanSquare))};
}

export function splitChange(before,after,heldCarrier,width,height){
  const total=changeEnergy(before,after,width,height);
  const depth=changeEnergy(before,heldCarrier,width,height);
  const carrier=changeEnergy(heldCarrier,after,width,height);
  let cross=0;
  for(let i=0;i<before.length;i++)cross+=((heldCarrier[i]&255)-(before[i]&255))*((after[i]&255)-(heldCarrier[i]&255));
  const crossTerm=2*cross/before.length;
  assert.ok(Math.abs(total.meanSquare-depth.meanSquare-carrier.meanSquare-crossTerm)<1e-8,'energy accounting failed');
  return {total,depthAtHeldCarrier:depth,carrierAtCurrentDepth:carrier,crossTerm,
    interpretation:'Depth then carrier counterfactual; component energies are not additive without the signed cross term.'};
}

// Least-change bounds for this old image and this exact new partition. Real-
// valued intensities are allowed, so byte/gamut and distinctive-pattern demands
// can only restrict the feasible set further. No projected image is rendered.
export function leastChangeBound(previous,roots,width,height){
  if(!(previous instanceof Uint32Array)||!(roots instanceof Uint32Array)
    ||![width,height].every(v=>Number.isSafeInteger(v)&&v>0)
    ||previous.length!==width*height||roots.length!==previous.length)throw Error('Invalid bound input');
  const sums=new Float64Array(roots.length),counts=new Uint32Array(roots.length);
  const rowSum=new Float64Array(height),rowSquares=new Float64Array(height),rowClasses=new Uint32Array(height);
  let total=0,squares=0;
  for(let i=0;i<previous.length;i++){
    const root=roots[i],row=Math.floor(i/width),value=previous[i]&255;
    if(root>=roots.length||roots[root]!==root||Math.floor(root/width)!==row)throw Error('Invalid class labels');
    assert.equal(value*0x010101,previous[i]&0xffffff,'expected grayscale');
    if(!counts[root])rowClasses[row]++;
    counts[root]++;sums[root]+=value;rowSum[row]+=value;rowSquares[row]+=value*value;
    total+=value;squares+=value*value;
  }
  const means=Float64Array.from(sums,(sum,i)=>counts[i]?sum/counts[i]:0),rowProjectedSquares=new Float64Array(height);
  const rowErrors=new Float64Array(height);
  let error=0,projectedSquares=0;
  for(let i=0;i<previous.length;i++){
    const projected=means[roots[i]],difference=(previous[i]&255)-projected;
    error+=difference*difference;projectedSquares+=projected*projected;
    rowProjectedSquares[Math.floor(i/width)]+=projected*projected;
    rowErrors[Math.floor(i/width)]+=difference*difference;
  }
  const mean=total/previous.length,variance=Math.max(0,squares/previous.length-mean*mean);
  const projectedVariance=Math.max(0,projectedSquares/previous.length-mean*mean);
  const sd=Math.sqrt(variance),projectedSD=Math.sqrt(projectedVariance);
  let horizontalVariance=0,projectedHorizontalVariance=0,rowBound=0,rowFeasible=true;
  for(let row=0;row<height;row++){
    const rowMean=rowSum[row]/width;
    const a=Math.max(0,rowSquares[row]/width-rowMean*rowMean);
    const b=Math.max(0,rowProjectedSquares[row]/width-rowMean*rowMean);
    horizontalVariance+=a;projectedHorizontalVariance+=b;
    if(a>0&&rowClasses[row]<2)rowFeasible=false;
    const rowSD=Math.sqrt(a),projectedRowSD=Math.sqrt(b);
    if(rowSD+projectedRowSD>0)rowBound+=2*rowSD*(rowErrors[row]/width)/(rowSD+projectedRowSD);
  }
  const globalFeasible=variance===0||rowClasses.reduce((sum,value)=>sum+value,0)>1;
  return {minimumRmsAnyContrast:Math.sqrt(error/previous.length),oldContrastSD:sd,projectedContrastSD:projectedSD,
    retainedHorizontalVariance:horizontalVariance?projectedHorizontalVariance/horizontalVariance:null,
    minimumRmsSameGlobalMeanAndSD:globalFeasible?(sd+projectedSD>0?Math.sqrt(2*sd*(error/previous.length)/(sd+projectedSD)):0):null,
    minimumRmsSameEachRowMeanAndSD:rowFeasible?Math.sqrt(Math.max(0,rowBound/height)):null,
    globalContrastFeasible:globalFeasible,rowContrastFeasible:rowFeasible,
    scope:'Optimistic real-valued exact-class bounds for this old image. Row bound additionally fixes each old row mean/SD. Not a renderer, pixel-count bound or perceptual threshold.'};
}

function rootsFor(depth,width,height,spacing,strength){
  const roots=new Uint32Array(depth.length),same=new Int32Array(width);
  for(let y=0;y<height;y++){
    linkRow(depth.subarray(y*width,(y+1)*width),spacing,strength,same,null,null,undefined,null,y);
    for(let x=width-1;x>=0;x--){const at=y*width+x;roots[at]=same[x]===x?at:roots[y*width+same[x]];}
  }
  return roots;
}

export function runMechanismResearch(){
  const width=640,height=360,spacing=96,strength=.33,filter=new FoundationFilter();
  const plane=value=>new Float64Array(width*height).fill(value);
  const object=(shift,proximity=.78)=>Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);return x+shift>200&&x+shift<430&&y>50&&y<320?proximity:.15;
  });
  // Find the first exact separation transition in a fixed small approach range;
  // the criterion is topology, not a favorable image-difference result.
  let beforePlane=plane(.25),beforeRoots=rootsFor(beforePlane,width,height,spacing,strength),afterPlane,afterRoots;
  let transition;
  for(let step=1;step<=48;step++){
    afterPlane=plane(.25+step*.008);afterRoots=rootsFor(afterPlane,width,height,spacing,strength);
    if(afterRoots.some((root,i)=>root!==beforeRoots[i])){transition={from:.25+(step-1)*.008,to:.25+step*.008};break;}
    beforePlane=afterPlane;beforeRoots=afterRoots;
  }
  assert.ok(transition,'fixture failed to cross a disparity transition');
  const cases=[
    {name:'fixed-depth-brightness-peak',before:plane(.5),after:plane(.5),epochs:[51,52]},
    {name:'unchanged-graph-tiny-depth-step',before:object(0),after:object(0,.780001),epochs:[51,52]},
    {name:'flat-disparity-transition',before:beforePlane,after:afterPlane,epochs:[1,2],transition},
    {name:'occluding-edge-turn',before:object(0),after:object(2),epochs:[1,2]},
  ];
  const results=cases.map(({name,before,after,epochs,transition})=>{
    const render=(depth,noiseFrame)=>filter.render({width,height,depth,format:'proximity'},
      {carrier:'pink',spacing,strength,noiseFrame}).pixels.slice();
    const previous=render(before,epochs[0]),heldCarrier=render(after,epochs[0]),current=render(after,epochs[1]);
    const oldRoots=rootsFor(before,width,height,spacing,strength),roots=rootsFor(after,width,height,spacing,strength);
    let changedRoots=0;
    for(let i=0;i<roots.length;i++){
      changedRoots+=roots[i]!==oldRoots[i];assert.equal(current[i],current[roots[i]]);assert.equal(heldCarrier[i],heldCarrier[roots[i]]);
    }
    if(name==='unchanged-graph-tiny-depth-step')assert.equal(changedRoots,0);
    const packed=new Uint8Array(width*height*4);
    for(let i=0;i<after.length;i++){const q=Math.round(after[i]*65535);packed[i*4]=q>>8;packed[i*4+1]=q&255;packed[i*4+3]=255;}
    const decoded=reconstructStereogram({pixels:current,width,height,spacing,strength,maxColumns:64,maxRows:36});
    return {name,epochs,transition,classChangeFraction:changedRoots/roots.length,exactCurrentPairs:true,
      change:splitChange(previous,current,heldCarrier,width,height),
      exactGraphBound:leastChangeBound(previous,roots,width,height),
      reconstruction:compareReconstruction(decoded,{depth:packed,origin:'top-left'}).summary};
  });
  return {scope:'Synthetic CPU mechanism isolation, not gameplay or perceptual acceptance. No renderer candidate or changed defaults.',
    width,height,spacing,strength,seed:173,regions:[3,3],results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(runMechanismResearch(),null,2));
