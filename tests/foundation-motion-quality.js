// Legacy image-only correlation peak, INCLUDING zero displacement. Identical
// stationary texture scores one; this cannot distinguish persistence from travel.
// Retained unchanged for historical comparisons, not human fusion or all banding.
export function motionCoherence(a,b,width,height){
  const peaks=[];
  for(let cy=20;cy<height-20;cy+=40)for(let cx=40;cx<width-40;cx+=80){
    let best=0;
    for(let dy=-4;dy<=4;dy+=2)for(let dx=-12;dx<=12;dx+=2){
      let sa=0,sb=0,aa=0,bb=0,ab=0,n=0;
      for(let y=cy-16;y<cy+16;y+=2)for(let x=cx-32;x<cx+32;x+=2){
        const u=a[y*width+x]&255,v=b[(y+dy)*width+x+dx]&255;
        sa+=u;sb+=v;aa+=u*u;bb+=v*v;ab+=u*v;n++;
      }
      const den=Math.sqrt(Math.max(0,(aa-sa*sa/n)*(bb-sb*sb/n)));
      if(den)best=Math.max(best,(ab-sa*sb/n)/den);
    }
    peaks.push(best);
  }
  return peaks.reduce((sum,v)=>sum+v,0)/peaks.length;
}

const temporalDefaults=Object.freeze({
  patchRadiusX:16,patchRadiusY:8,gridStepX:48,gridStepY:32,sampleStep:2,
  maxShiftX:12,maxShiftY:4,minTextureRms:2,
  minCorrelation:.65,minImprovement:.1,minPeakMargin:.03,
});
const mean=values=>values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;

function correlationAt(a,b,width,x,y,dx,dy,settings){
  const {patchRadiusX,patchRadiusY,sampleStep,minTextureRms}=settings;
  let sa=0,sb=0,aa=0,bb=0,ab=0,n=0;
  for(let py=y-patchRadiusY;py<y+patchRadiusY;py+=sampleStep){
    for(let px=x-patchRadiusX;px<x+patchRadiusX;px+=sampleStep){
      const u=a[py*width+px],v=b[(py+dy)*width+px+dx];
      sa+=u;sb+=v;aa+=u*u;bb+=v*v;ab+=u*v;n++;
    }
  }
  const va=Math.max(0,aa-sa*sa/n),vb=Math.max(0,bb-sb*sb/n);
  if(va/n<minTextureRms**2||vb/n<minTextureRms**2)return null;
  return Math.max(-1,Math.min(1,(ab-sa*sb/n)/Math.sqrt(va*vb)));
}

/** Image-only temporal evidence, not a motion/comfort acceptance gate.
 * Byte metrics use display luma (54R + 183G + 19B)/256; alpha is ignored.
 * +dx/+dy follows a first-frame feature right/down in the second frame.
 * Displacement requires a textured, strong, unambiguous translated match which
 * improves on zero shift. Missing evidence is null; inspect patches for opposing
 * motion or expansion that cancels in mean displacement. Search is integer-pixel
 * and bounded: subpixel motion, occlusion, repetitive texture and out-of-range
 * movement can remain unresolved. Reliability thresholds are engineering choices.
 */
export function temporalDiagnostics(a,b,width,height,options={}){
  if(!(a instanceof Uint32Array)||!(b instanceof Uint32Array)
    ||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1
    ||a.length!==width*height||b.length!==a.length)throw Error('Invalid temporal images');
  const settings={...temporalDefaults,...options};
  for(const key of ['patchRadiusX','patchRadiusY','gridStepX','gridStepY','sampleStep']){
    if(!Number.isSafeInteger(settings[key])||settings[key]<1)throw Error('Invalid temporal sampling');
  }
  for(const key of ['maxShiftX','maxShiftY']){
    if(!Number.isSafeInteger(settings[key])||settings[key]<0)throw Error('Invalid temporal search');
  }
  if(settings.maxShiftX+settings.maxShiftY===0
    ||!Number.isFinite(settings.minTextureRms)||settings.minTextureRms<=0
    ||!Number.isFinite(settings.minCorrelation)||settings.minCorrelation<0||settings.minCorrelation>1
    ||![settings.minImprovement,settings.minPeakMargin].every(v=>Number.isFinite(v)&&v>=0&&v<=2))throw Error('Invalid temporal thresholds');
  const luma=pixels=>Float32Array.from(pixels,c=>((c&255)*54+(c>>>8&255)*183+(c>>>16&255)*19)/256);
  const first=luma(a),second=luma(b),columnEnergy=new Float64Array(width);
  let absolute=0,square=0,signed=0,changed=0;
  for(let i=0;i<a.length;i++){
    const d=second[i]-first[i];absolute+=Math.abs(d);square+=d*d;signed+=d;changed+=d!==0;
    columnEnergy[i%width]+=d*d;
  }
  const energyMean=square/width;
  const columnEnergyCV=energyMean>0?Math.sqrt(columnEnergy.reduce((sum,v)=>sum+(v-energyMean)**2,0)/width)/energyMean:null;
  const patches=[],marginX=settings.patchRadiusX+settings.maxShiftX,marginY=settings.patchRadiusY+settings.maxShiftY;
  for(let y=marginY;y<=height-marginY;y+=settings.gridStepY){
    for(let x=marginX;x<=width-marginX;x+=settings.gridStepX){
      const zeroCorrelation=correlationAt(first,second,width,x,y,0,0,settings);
      let translatedCorrelation=null,runnerUp=null,dx=null,dy=null;
      for(let sy=-settings.maxShiftY;sy<=settings.maxShiftY;sy++){
        for(let sx=-settings.maxShiftX;sx<=settings.maxShiftX;sx++){
          if(sx===0&&sy===0)continue;
          const value=correlationAt(first,second,width,x,y,sx,sy,settings);
          if(value===null)continue;
          if(translatedCorrelation===null||value>translatedCorrelation){
            runnerUp=translatedCorrelation;translatedCorrelation=value;dx=sx;dy=sy;
          }else if(runnerUp===null||value>runnerUp)runnerUp=value;
        }
      }
      const translatedImprovement=zeroCorrelation===null||translatedCorrelation===null?null:translatedCorrelation-zeroCorrelation;
      const peakMargin=runnerUp===null||translatedCorrelation===null?null:translatedCorrelation-runnerUp;
      const reliable=translatedImprovement!==null&&peakMargin!==null
        &&translatedCorrelation>=settings.minCorrelation&&translatedImprovement>=settings.minImprovement&&peakMargin>=settings.minPeakMargin;
      const rx=x-.5-(width-1)/2,ry=y-.5-(height-1)/2,radius=Math.hypot(rx,ry);
      const radialDisplacement=reliable&&radius>0?(dx*rx+dy*ry)/radius:null;
      patches.push({x,y,zeroCorrelation,translatedCorrelation,translatedImprovement,peakMargin,dx,dy,reliable,radialDisplacement});
    }
  }
  const measured=patches.filter(p=>p.translatedImprovement!==null),reliable=measured.filter(p=>p.reliable),radial=reliable.filter(p=>p.radialDisplacement!==null);
  return {
    samples:patches.length,validSamples:measured.length,
    zeroCorrelation:mean(measured.map(p=>p.zeroCorrelation)),
    translatedCorrelation:mean(measured.map(p=>p.translatedCorrelation)),
    translatedImprovement:mean(measured.map(p=>p.translatedImprovement)),
    reliableFraction:measured.length?reliable.length/measured.length:null,
    meanDx:mean(reliable.map(p=>p.dx)),meanDy:mean(reliable.map(p=>p.dy)),
    radialDisplacement:mean(radial.map(p=>p.radialDisplacement)),
    outwardFraction:radial.length?radial.filter(p=>p.radialDisplacement>.5).length/radial.length:null,
    inwardFraction:radial.length?radial.filter(p=>p.radialDisplacement<-.5).length/radial.length:null,
    frameMeanAbsByte:absolute/a.length,frameRmsByte:Math.sqrt(square/a.length),
    frameMeanSignedByte:signed/a.length,changedFraction:changed/a.length,columnEnergyCV,
    settings,patches,
    scope:'Image-only luma change and bounded local displacement evidence; not a human comfort or banding score.',
  };
}
