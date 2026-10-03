// Independent image-only decoder. Deliberately imports NO encoder, scene,
// geometry, depth image, equivalence links, or renderer internals.
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export function reconstructStereogram({pixels,width,height,spacing=120,strength=.5,maxColumns=320,maxRows=200}){
  if(!(pixels instanceof Uint32Array)||pixels.length!==width*height||width<16||height<3||!(spacing>=8)||!(strength>=0&&strength<=.5))throw Error('Invalid reconstruction image or calibration');
  const step=Math.max(1,Math.ceil(width/maxColumns),Math.ceil(height/maxRows)),columns=Math.ceil(width/step),rows=Math.ceil(height/step),length=columns*rows;
  const minimum=Math.round(2*spacing*(1-strength)/(2-strength)),maximum=Math.round(spacing);
  const searchMin=Math.max(4,Math.floor(spacing*.45)),searchMax=Math.min(width-8,Math.ceil(spacing*2.25));
  const gray=new Float32Array(pixels.length);
  for(let i=0;i<pixels.length;i++){const c=pixels[i];gray[i]=((c&255)*54+(c>>>8&255)*183+(c>>>16&255)*19)/256;}
  const disparity=new Float32Array(length).fill(NaN),near=new Float32Array(length).fill(NaN),confidence=new Float32Array(length),ambiguity=new Float32Array(length),echo=new Float32Array(length),score=new Float32Array(length).fill(1),alternative=new Float32Array(length).fill(NaN);
  const scores=new Float32Array(searchMax+1);
  let valid=0,reliable=0,ambiguous=0,echoes=0,contrastSum=0,weakContrast=0;
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<columns;gx++){
    const x=Math.min(width-1,Math.floor((gx+.5)*step)),y=Math.min(height-1,Math.floor((gy+.5)*step)),at=gy*columns+gx;
    // A partial disparity range near the image border can manufacture a false
    // best match simply because the true partner lies outside the screenshot.
    if(y<1||y>=height-1||x<Math.ceil(maximum/2)+3||x>=width-Math.ceil(maximum/2)-3)continue;
    scores.fill(Infinity);let best=Infinity,bestShift=0,bestContrast=0;
    for(let s=searchMin;s<=searchMax;s++){
      const l=x-(s>>1),r=l+s;if(l<3||r>=width-3)continue;
      let a=0,b=0,aa=0,bb=0,ab=0;
      // Native pixels, never a resized preview. Local normalized correlation
      // discounts broad tint bands and compares the actual fine-dot signal.
      for(let dy=-1;dy<=1;dy++)for(let dx=-3;dx<=3;dx++){
        const base=(y+dy)*width+dx,A=gray[base+l],B=gray[base+r];
        a+=A;b+=B;aa+=A*A;bb+=B*B;ab+=A*B;
      }
      const va=aa-a*a/21,vb=bb-b*b/21;
      if(va<84||vb<84)continue;
      const cost=(1-clamp((ab-a*b/21)/Math.sqrt(va*vb),-1,1))*.5;
      scores[s]=cost;
      if(s>=minimum&&s<=maximum&&cost<best){best=cost;bestShift=s;bestContrast=Math.sqrt((va+vb)/42)/Math.max(1,(a+b)/42);}
    }
    if(!bestShift)continue;
    let second=1,other=1,otherShift=0;
    for(let s=searchMin;s<=searchMax;s++){
      if(Math.abs(s-bestShift)<=2)continue;
      if(s>=minimum&&s<=maximum)second=Math.min(second,scores[s]);
      else if(scores[s]<other){other=scores[s];otherShift=s;}
    }
    disparity[at]=bestShift;score[at]=best;
    if(strength>0)near[at]=clamp(2*(spacing-bestShift)/(strength*(2*spacing-bestShift)));
    confidence[at]=clamp((second-best)/.12)*clamp((.22-best)/.2)*clamp((bestContrast-.12)/.28);
    ambiguity[at]=clamp(1-(second-best)/.12);echo[at]=clamp(1-(other-best)/.12);
    alternative[at]=otherShift||NaN;valid++;reliable+=confidence[at]>.35;contrastSum+=bestContrast;weakContrast+=bestContrast<.25;
    ambiguous+=ambiguity[at]>.5&&best<.22;echoes+=echo[at]>.5&&other<.22;
  }
  return {columns,rows,step,width,height,spacing,strength,minimum,maximum,searchMin,searchMax,disparity,near,confidence,ambiguity,echo,score,alternative,
    summary:{sampled:length,valid,reliableFraction:valid?reliable/valid:null,ambiguousFraction:valid?ambiguous/valid:null,alternateLayerFraction:valid?echoes/valid:null,meanDotContrast:valid?contrastSum/valid:null,weakContrastFraction:valid?weakContrast/valid:null,zeroStrength:strength===0}};
}

// Ground truth is introduced ONLY AFTER reconstruction has finished.
export function compareReconstruction(decoded,{depth,origin='bottom-left'}){
  const {width,height,columns,rows,step,spacing,strength}=decoded;
  if(!(depth instanceof Uint8Array)||depth.length!==width*height*4)throw Error('Comparison needs matching packed RG16 depth');
  const expected=new Float32Array(columns*rows),error=new Float32Array(columns*rows).fill(NaN);
  const zAt=(x,y)=>{const i=((origin==='bottom-left'?height-1-y:y)*width+x)*4;return(depth[i]*256+depth[i+1])/65535;};
  let count=0,total=0,within=0,confidentWrong=0,confident=0,interior=0,interiorWithin=0;
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<columns;gx++){
    const x=Math.min(width-1,Math.floor((gx+.5)*step)),y=Math.min(height-1,Math.floor((gy+.5)*step)),at=gy*columns+gx,z=zAt(x,y);
    expected[at]=z;if(!Number.isFinite(decoded.disparity[at]))continue;
    const target=Math.round(2*spacing*(1-strength*z)/(2-strength*z)),e=Math.abs(decoded.disparity[at]-target);
    error[at]=e;count++;total+=e;within+=e<=2;
    if(decoded.confidence[at]>.35){confident++;confidentWrong+=e>2;}
    if(x>4&&x<width-5&&y>4&&y<height-5&&Math.abs(z-zAt(x-4,y))<.025&&Math.abs(z-zAt(x+4,y))<.025&&Math.abs(z-zAt(x,y-4))<.025&&Math.abs(z-zAt(x,y+4))<.025){interior++;interiorWithin+=e<=2;}
  }
  return {expected,error,summary:{compared:count,meanDisparityError:count?total/count:null,withinTwoPixels:count?within/count:null,confident,confidentWrongFraction:confident?confidentWrong/confident:null,interior,interiorWithinTwoPixels:interior?interiorWithin/interior:null}};
}
