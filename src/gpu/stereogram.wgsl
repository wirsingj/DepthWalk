struct Params { size:vec4u, view:vec4f, style:vec4f, window:vec4u, motion:vec4u }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var source:texture_2d<f32>;
@group(0) @binding(2) var<storage,read_write> geometry:array<u32>;
@group(0) @binding(3) var<storage,read_write> parents:array<atomic<u32>>;
@group(0) @binding(4) var<storage,read_write> heads:array<atomic<u32>>;
@group(0) @binding(5) var<storage,read_write> nextSample:array<u32>;
@group(0) @binding(6) var<storage,read_write> pairs:array<u32>;
@group(0) @binding(7) var<storage,read_write> colors:array<atomic<u32>>;
@group(0) @binding(8) var<storage,read_write> rows:array<u32>;
@group(0) @binding(9) var<storage,read> palettes:array<u32>;
@group(0) @binding(10) var sceneColor:texture_2d<f32>;
@group(0) @binding(11) var foundationCarrier:texture_2d<f32>;
const NONE=0xffffffffu;
var<workgroup> rowSums:array<atomic<u32>,3>;
fn sceneRGB(i:u32)->vec3u{return vec3u(floor(textureLoad(sceneColor,vec2i(i32(i%p.size.x),i32(i/p.size.x)),0).rgb*255.+.5));}
fn sceneLuma(c:vec3f)->f32{return dot(c,vec3f(54.,183.,19.))/256.;}
fn rounded(v:f32)->u32{return u32(floor(v+.5));}
fn rawQ(x:i32,y:i32)->u32{
  if(x<i32(p.window.x)||y<0||x>=i32(p.window.y)||y>=i32(p.size.y)){return 0u;}
  let rg=textureLoad(source,vec2i(x,y),0).rg;
  let q=rounded(rg.r*255.)*256u+rounded(rg.g*255.);
  return q;
}
fn distance(q:u32)->f32{if(q==0u){return 1e20;}return -log(f32(q)/65535.)*p.style.y;}
fn qAt(i:u32)->u32{return geometry[i]&65535u;}
fn physicalQAt(i:u32)->u32{let q=qAt(i);return select(q,65535u-q,p.window.w==1u);}
fn zAt(i:u32)->f32{return f32(qAt(i))/65535.;}
// Exact wide products keep round-half-up disparity and occlusion decisions
// identical to the CPU reference, including depths lying on pixel thresholds.
fn wide(a:u32,b:u32)->vec2u{
  let lo=(a&65535u)*(b&65535u);let t=(a>>16u)*(b&65535u)+(lo>>16u);
  let mid=(t&65535u)+(a&65535u)*(b>>16u);
  return vec2u((mid<<16u)|(lo&65535u),(a>>16u)*(b>>16u)+(t>>16u)+(mid>>16u));
}
fn ge(a:vec2u,b:vec2u)->bool{return a.y>b.y||(a.y==b.y&&a.x>=b.x);}
fn spacing(z:f32)->u32{
  let product=rounded(z*65535.)*rounded(p.view.z*1000.);let denominator=131070000u-product;
  let numerator=wide(4u*u32(p.view.y),65535000u-product);
  var s=rounded(2.*p.view.y*(1.-p.view.z*z)/(2.-p.view.z*z));
  if(ge(numerator,wide(2u*s+1u,denominator))){s++;}
  else if(!ge(numerator,wide(2u*s-1u,denominator))){s--;}
  return s;
}
fn codeNormal(n:vec3f)->u32{
  let total=abs(n.x)+abs(n.y)+abs(n.z);if(total<1e-20){return 136u;}
  var v=n.xy/total;
  if(n.z<0.){v=(1.-abs(v.yx))*select(vec2f(1.),vec2f(-1.),v<vec2f(0.));}
  let code=vec2u(floor((v*.5+.5)*15.+.5));return code.x+code.y*16u;
}
fn normal(code:u32)->vec3f{
  var xy=vec2f(f32(code&15u),f32(code>>4u))/15.*2.-1.;let z=1.-abs(xy.x)-abs(xy.y);
  if(z<0.){xy=(1.-abs(xy.yx))*select(vec2f(1.),vec2f(-1.),xy<vec2f(0.));}
  return normalize(vec3f(xy,z));
}
fn family(n:vec3f)->u32{
  let a=abs(n);
  if(a.y>a.x*2.5&&a.y>a.z*2.5){return select(5u,2u,n.y>0.);}
  if(a.y>(a.x+a.z)*.24){return select(9u,7u,n.y>0.);}
  if(a.x>a.z*1.2){return select(6u,4u,n.x>0.);}
  return 3u;
}
@compute @workgroup_size(8,8)
fn prepare(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x>=p.size.x||gid.y>=p.size.y){return;}
  let x=i32(gid.x);let y=i32(gid.y);let i=gid.y*p.size.x+gid.x;
  if(p.size.z>=8u){
    atomicStore(&parents[i],i);atomicStore(&colors[i],0u);pairs[i]=NONE;
    geometry[i]=rawQ(x,y);return;
  }
  atomicStore(&parents[i],i);atomicStore(&heads[i],select(NONE,0u,p.size.z>=6u));atomicStore(&colors[i],0u);pairs[i]=NONE;
  if(p.size.z>=6u){atomicStore(&parents[p.size.x*p.size.y*2u+i],0u);atomicStore(&heads[p.size.x*p.size.y+i],NONE);}
  if(p.size.z==5u&&p.style.w>=2.){atomicStore(&parents[p.size.x*p.size.y*2u+i],0u);}
  if(p.size.z==4u){atomicStore(&parents[p.size.x*p.size.y+i],i);}
  let q=rawQ(x,y);var n=vec3f(0.,0.,1.);var id=0u;
  if(q>0u){
    let d=distance(q);let radius=i32(max(1u,rounded(p.view.x)));let step=f32(radius)*p.view.w;
    let left=distance(rawQ(x-radius,y));let right=distance(rawQ(x+radius,y));
    let up=distance(rawQ(x,y-radius));let down=distance(rawQ(x,y+radius));
    let useRight=abs(right-d)<=abs(left-d);let useUp=abs(up-d)<=abs(down-d);
    let dx=select(left,right,useRight);let dy=select(down,up,useUp);
    if(d>0.&&abs(dx-d)<d*.12&&abs(dy-d)<d*.12){
      let deltaX=(dx-d)*select(-1.,1.,useRight);let deltaY=(dy-d)*select(-1.,1.,useUp);
      let sx=(f32(x)+.5-f32(p.size.x)*.5)*p.view.w;let sy=(f32(p.size.y)*.5-f32(y)-.5)*p.view.w;
      if(deltaX==0.){n=vec3f(0.,deltaY,sy*deltaY+step*dy);}
      else if(deltaY==0.){n=vec3f(deltaX,0.,sx*deltaX+step*dx);}
      else{n=vec3f(deltaX*step*dy,deltaY*step*dx,sx*deltaX*step*dy+sy*deltaY*step*dx+step*step*dx*dy);}
    }
    id=family(n);
  }
  geometry[i]=select(q,65535u-q,p.window.w==1u)|(id<<16u)|(codeNormal(n)<<24u);
}
fn root(at:u32)->u32{
  var current=at;
  for(var k=0u;k<p.size.x;k++){
    let parent=atomicLoad(&parents[current]);if(parent==current){break;}current=parent;
  }
  return current;
}
// Monotonic atomic union: every parent moves right. No locks, cycles or
// cross-row dependencies; the following dispatch observes completed unions.
fn unite(a:u32,b:u32){
  var left=a;var right=b;
  for(var k=0u;k<p.size.x;k++){
    left=root(left);right=root(right);if(left==right){return;}
    let lo=min(left,right);let hi=max(left,right);let old=atomicMax(&parents[lo],hi);
    if(old==lo||old==hi){return;}left=old;right=hi;
  }
}
fn denseRoot(at:u32)->u32{
  var current=at;let offset=p.size.x*p.size.y;
  for(var k=0u;k<p.size.x;k++){let parent=atomicLoad(&parents[offset+current]);if(parent==current){break;}current=parent;}
  return current;
}
fn denseUnite(a:u32,b:u32){
  var left=a;var right=b;let offset=p.size.x*p.size.y;
  for(var k=0u;k<p.size.x;k++){
    left=denseRoot(left);right=denseRoot(right);if(left==right){return;}
    let lo=min(left,right);let hi=max(left,right);let old=atomicMax(&parents[offset+lo],hi);
    if(old==lo||old==hi){return;}left=old;right=hi;
  }
}
fn surfacePatch(x:u32,y:u32)->bool{
  let sx=u32(floor((f32(x)+.5)/p.view.x));let sy=u32(floor((f32(y)+.5)/p.view.x));
  let h=hashCell(sx/32u,sy/16u);let w=7u+rounded(p.style.z*12.);let height=3u+rounded(p.style.z*5.);
  let ox=1u+(h&255u)%(31u-w);let oy=1u+((h>>8u)&255u)%(15u-height);
  return sx%32u>=ox&&sx%32u<ox+w&&sy%16u>=oy&&sy%16u<oy+height;
}
fn surfaceFeature(i:u32)->bool{
  let r=max(1u,rounded(p.view.x));let x=i%p.size.x;if(x<r||x+r>=p.size.x){return false;}
  let d=abs(vec3i(sceneRGB(i+r))-vec3i(sceneRGB(i-r)));return max(d.x,max(d.y,d.z))>32;
}
@compute @workgroup_size(64)
fn link(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x>=p.size.x||gid.y>=p.size.y){return;}let i=gid.y*p.size.x+gid.x;let x=gid.x;let row=i-x;let z=zAt(i);let s=spacing(z);
  let half=(s+select(0u,(s&1u)*(gid.y&1u),p.size.z>=8u))/2u;
  if(x<half){return;}let left=x-half;let right=left+s;if(left<p.window.x||right>=p.window.y){return;}
  if(p.view.z>0.){
    let center=qAt(i);let mu=rounded(p.view.z*1000.);let denominator=131070000u-mu*center;let factor=mu*u32(p.view.y);
    for(var t=1u;t<=p.size.x;t++){
      let ray=wide(denominator,t);if(ge(ray,wide(65535u-center,factor))){break;}
      if(x>=p.window.x+t){let other=qAt(i-t);if(other>=center&&ge(wide(other-center,factor),ray)){return;}}
      if(x+t<p.window.y){let other=qAt(i+t);if(other>=center&&ge(wide(other-center,factor),ray)){return;}}
    }
  }
  if(p.size.z==4u){
    denseUnite(row+left,row+right);
    if(!surfacePatch(x,gid.y)&&!contour(i)&&!surfaceFeature(i)){return;}
  }
  pairs[i]=left|(right<<16u);unite(row+left,row+right);
  if(p.size.z==6u||p.size.z==7u){
    let owner=(qAt(i)<<16u)|(x+1u);atomicMax(&heads[row+left],owner);atomicMax(&heads[row+right],owner);
  }
}
fn plane(q:u32)->f32{if(q==0u){return 0.;}if(q==65535u){return 1e6;}return 1./(-log(f32(q)/65535.));}
fn physicalContour(i:u32)->bool{
  if(p.size.w==0u){return false;}let q=physicalQAt(i);if(q==0u){return false;}
  let x=i%p.size.x;let y=i/p.size.x;let radius=max(1u,rounded(f32(min(p.size.w,2u))*p.view.x));
  let threshold=max(100.,f32(q)*.045);let n=normal(geometry[i]>>24u);
  for(var side=0u;side<4u;side++){
    if((side==0u&&x<p.window.x+radius)||(side==1u&&x+radius>=p.window.y)||(side==2u&&y<radius)||(side==3u&&y+radius>=p.size.y)){continue;}
    var offset=i32(radius);if(side<2u){if(side==0u){offset=-offset;}}else{offset*=i32(p.size.x);if(side==2u){offset=-offset;}}
    let j=u32(i32(i)+offset);let neighbor=physicalQAt(j);let delta=f32(q)-f32(neighbor);
    if(delta>threshold){
      if(neighbor==0u){return true;}
      let canCompare=select((y>=radius&&y+radius<p.size.y),(x>=p.window.x+radius&&x+radius<p.window.y),(side<2u));
      if(canCompare){let other=physicalQAt(u32(i32(i)-offset));let center=plane(q);
        if(abs(2.*center-plane(neighbor)-plane(other))>max(1e-6,center*.015)){return true;}}
    }
    if(neighbor>0u&&delta>=-threshold&&dot(n,normal(geometry[j]>>24u))<.57){return true;}
  }
  return false;
}
fn contour(i:u32)->bool{
  if(physicalContour(i)){return true;}if(p.size.w!=3u){return false;}
  let x=i%p.size.x;let y=i/p.size.x;let r=max(1u,rounded(2.*p.view.x));
  if(x>=p.window.x+r){if(physicalContour(i-r)){return true;}}
  if(x+r<p.window.y){if(physicalContour(i+r)){return true;}}
  if(y>=r){if(physicalContour(i-r*p.size.x)){return true;}}
  if(y+r<p.size.y){if(physicalContour(i+r*p.size.x)){return true;}}
  return false;
}
@compute @workgroup_size(64)
fn gather(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_index) lane:u32){
  let y=group.x;let row=y*p.size.x;
  if(p.size.z>=8u){
    for(var x=lane;x<p.size.x;x+=64u){let i=row+x;atomicMax(&parents[i],root(i));}
    return;
  }
  if(lane<3u){atomicStore(&rowSums[lane],0u);}workgroupBarrier();
  for(var x=lane;x<p.size.x;x+=64u){
    if(x<p.window.x||x>=p.window.y){continue;}
    let i=row+x;let z=zAt(i);let w=rounded((.08+z*z)*256.);
    if(p.size.z>=6u){let r=root(i);atomicMax(&parents[i],r);nextSample[i]=atomicExchange(&heads[p.size.x*p.size.y+r],i);continue;}
    atomicAdd(&rowSums[0],w);atomicAdd(&rowSums[1],rounded(z*1024.)*w);
    if(p.size.z==3u){atomicAdd(&rowSums[2],rounded(sceneLuma(vec3f(sceneRGB(i))))*w);}
    // Path compression never changes membership.
    atomicMax(&parents[i],root(i));
    if(p.size.z>=4u){
      let r=root(i);nextSample[i]=atomicExchange(&heads[r],i);
      let pair=pairs[i];if(pair!=NONE&&contour(i)){atomicAdd(&colors[root(row+(pair&65535u))],1u);}continue;
    }
    let pair=pairs[i];if(pair==NONE){continue;}
    let r=root(row+(pair&65535u));
    nextSample[i]=atomicExchange(&heads[r],i);
    if(contour(i)){atomicOr(&colors[r],1u);}
  }
  workgroupBarrier();if(lane<3u){rows[y*3u+lane]=atomicLoad(&rowSums[lane]);}
}
fn hashCell(a:u32,b:u32)->u32{
  var h=((a+137u)*374761393u)^((b+719u)*668265263u);h=(h^(h>>13u))*1274126177u;return h^(h>>16u);
}
fn seed(x:u32,y:u32)->u32{
  let cell=max(1.,p.style.x*p.view.x);return hashCell(u32(floor(f32(max(x,p.window.x)-p.window.x)/cell)),u32(floor(f32(y)/cell)));
}
fn rgb(c:u32)->vec3f{return vec3f(f32(c&255u),f32((c>>8u)&255u),f32((c>>16u)&255u));}
fn packed(c:vec3f)->u32{let v=vec3u(floor(c+.5));return 0xff000000u|v.x|(v.y<<8u)|(v.z<<16u);}
fn motionHash(x:u32,y:u32,key:u32)->u32{
  var h=(x*374761393u)^(y*668265263u)^(p.motion.x*2246822519u)^key;
  h=(h^(h>>16u))*2246822507u;h=(h^(h>>13u))*3266489909u;return h^(h>>16u);
}
fn motionNoise(x:u32,y:u32,key:u32)->f32{
  let h=motionHash(x,y,key);return f32((h&255u)+((h>>8u)&255u)+((h>>16u)&255u)+(h>>24u))-510.;
}
fn motionTone(x:u32,y:u32)->u32{
  if(p.size.z==8u){return (motionHash(x,y,p.motion.y)&1u)*255u;}
  var value=motionNoise(x,y,p.motion.y);var variance=1.;var scale=2.;
  if(p.size.z==10u){for(var octave=1u;octave<=8u;octave++){
    let s=vec2f(f32(x),f32(y))/scale;let at=vec2u(floor(s));let f=fract(s);let key=p.motion.y+octave*2654435761u;
    let a=motionNoise(at.x,at.y,key)*(1.-f.x)+motionNoise(at.x+1u,at.y,key)*f.x;
    let b=motionNoise(at.x,at.y+1u,key)*(1.-f.x)+motionNoise(at.x+1u,at.y+1u,key)*f.x;
    let weight=1.5/sqrt(scale);value+=(a*(1.-f.y)+b*f.y)*weight;
    variance+=weight*weight*((1.-f.x)*(1.-f.x)+f.x*f.x)*((1.-f.y)*(1.-f.y)+f.y*f.y);scale*=2.;
  }}
  return rounded(clamp(128.+value*48./sqrt(21845.*variance),0.,255.));
}
fn inkColor(c:u32,edge:bool)->u32{if(p.size.w==3u&&edge){return packed(rgb(c)*.55);}return c;}
@compute @workgroup_size(64)
fn reuseCarrier(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x>=p.size.x||gid.y>=p.size.y){return;}let i=gid.y*p.size.x+gid.x;
  if(gid.x<p.window.x||gid.x>=p.window.y){return;}
  if(atomicLoad(&parents[i])!=i){return;}
  let total=p.size.x*p.size.y;let quiet=p.size.z==5u;
  if(quiet){atomicStore(&heads[total+i],NONE);}else{atomicStore(&colors[i],NONE);}if(p.style.w<3.){return;}
  let list=select(total+i,i,quiet);var member=atomicLoad(&heads[list]);var candidate=NONE;var votes=0i;var n=0u;
  for(var k=0u;k<p.size.x;k++){if(member==NONE){break;}let previous=atomicLoad(&parents[total+member]);
    if(votes==0){candidate=previous;votes=1;}else{votes+=select(-1,1,previous==candidate);}n++;member=nextSample[member];
  }
  member=atomicLoad(&heads[list]);var count=0u;
  for(var k=0u;k<p.size.x;k++){if(member==NONE){break;}count+=select(0u,1u,atomicLoad(&parents[total+member])==candidate);member=nextSample[member];}
  if(count*2u>n){
    if(quiet){atomicStore(&heads[total+i],candidate);}else{atomicStore(&colors[i],candidate);}
    atomicMax(&parents[total*2u+candidate],(count<<16u)|(gid.x+1u));
  }
}
@compute @workgroup_size(64)
fn shade(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x>=p.size.x||gid.y>=p.size.y){return;}let i=gid.y*p.size.x+gid.x;if(atomicLoad(&parents[i])!=i){return;}
  if(p.size.z>=8u){
    var value=rounded(textureLoad(foundationCarrier,vec2i(gid.xy),0).r*255.);
    if(p.motion.x>0u){value=motionTone(gid.x,gid.y);}
    value=rounded(128.+(f32(value)-128.)*bitcast<f32>(p.motion.z));
    atomicStore(&colors[i],0xff000000u|value|(value<<8u)|(value<<16u));return;
  }
  if(gid.x<p.window.x||gid.x>=p.window.y){atomicStore(&colors[i],packed(vec3f(sceneRGB(i))));return;}
  let x=i%p.size.x;let y=i/p.size.x;let random=seed(x,y);let tone=random&7u;let edge=atomicLoad(&colors[i])>0u;
  if(p.size.z>=6u){
    let candidate=atomicLoad(&colors[i]);let total=p.size.x*p.size.y;
    if(p.style.w>=3.&&candidate!=NONE){if((atomicLoad(&parents[total*2u+candidate])&65535u)==x+1u){atomicStore(&colors[i],atomicLoad(&colors[total+candidate]));return;}}
    if(p.style.w>=2.){
      let r=max(1u,rounded(p.view.x));let a=carrierLevelAt(u32(max(0,i32(x)-i32(r))),y);let b=carrierLevelAt(x,y);let c=carrierLevelAt(x+r,y);
      atomicStore(&colors[i],rounded(clamp(128.+(a+2.*b+c-512.)/sqrt(6.),24.,232.)));return;
    }
    let detail=p.style.z;let strong=((random>>8u)&255u)<rounded((.22+.3*detail)*256.);
    let amplitude=select(8.+detail*8.,65.+detail*30.,strong);
    atomicStore(&colors[i],rounded(128.+(f32(random&255u)/255.*2.-1.)*amplitude));return;
  }
  if(p.size.z>=4u){
    var c=vec3u(0u);var n=0u;var member=atomicLoad(&heads[i]);
    for(var k=0u;k<p.size.x;k++){if(member==NONE){break;}c+=sceneRGB(member);n++;member=nextSample[member];}
    var h=random;if(p.size.z==4u){h=seed(denseRoot(i)%p.size.x,y);}
    if(p.size.z==5u&&p.style.w>=2.){
      let total=p.size.x*p.size.y;let candidate=atomicLoad(&heads[total+i]);
      if(p.style.w>=3.&&candidate!=NONE){if((atomicLoad(&parents[total*2u+candidate])&65535u)==x+1u){h=atomicLoad(&colors[total+candidate]);}}
      atomicStore(&heads[total+i],h);
    }
    let edgeFraction=f32(atomicLoad(&colors[i]))/f32(n);let detail=p.style.z;
    var amplitude=select(14.+detail*16.,44.+detail*46.+edgeFraction*22.,n>1u);
    if(p.size.z==5u){amplitude=select(5.,50.+detail*65.+edgeFraction*35.,((h>>8u)&255u)<rounded((.06+.24*detail)*256.));}
    let offset=(f32(h&255u)/255.*2.-1.)*amplitude;
    var ink=1.;if(p.size.w==3u){ink=1.-.45*sqrt(min(1.,edgeFraction));}
    atomicStore(&colors[i],packed(clamp(vec3f(c)/f32(n)*ink+vec3f(offset),vec3f(0.),vec3f(255.))));return;
  }
  if(p.size.z==1u||p.size.z==2u){
    var offset=40960u;if(p.size.z==2u){offset+=128u;}
    else{offset+=((random>>8u)&7u)*8u;}
    if(edge){offset+=select(64u,8u,p.size.z==2u);}
    atomicStore(&colors[i],inkColor(palettes[offset+tone],edge));return;
  }
  var votes:array<u32,10>;var total=0u;var proximity=0u;var sceneSum=vec3u(0u);var sample=atomicLoad(&heads[i]);
  for(var k=0u;k<p.size.x;k++){
    if(sample==NONE){break;}let z=zAt(sample);let weight=rounded((.08+z*z)*256.);
    votes[(geometry[sample]>>16u)&255u]+=weight;total+=weight;proximity+=rounded(z*1024.)*weight;
    if(p.size.z==3u){sceneSum+=sceneRGB(sample)*weight;}sample=nextSample[sample];
  }
  let row=y*3u;let rowWeight=f32(rows[row]);let rowDepth=f32(rows[row+1u])/rowWeight;
  var localDepth=rowDepth;if(total>0u){localDepth=f32(proximity)/f32(total);}
  let shade=rounded((localDepth*.25+rowDepth*.75)/1024.*255.);
  let center=y*p.size.x+u32(max(i32(p.window.x),i32(x)-i32(spacing(zAt(i))/2u)));
  if(p.size.z==3u){
    var c=vec3f(sceneRGB(center));if(total>0u){c=vec3f(sceneSum)/f32(total);}
    let l=sceneLuma(c);let mean=48.+.38*(.25*l+.75*f32(rows[row+2u])/rowWeight);
    let toneValue=f32(palettes[41088u+select(0u,8u,edge)+tone]&255u);
    let value=min(250.,mean*toneValue/138.);let delta=c-vec3f(l);var chroma=1.;
    for(var k=0u;k<3u;k++){if(delta[k]>0.){chroma=min(chroma,(255.-value)/delta[k]);}else if(delta[k]<0.){chroma=min(chroma,value/-delta[k]);}}
    atomicStore(&colors[i],inkColor(packed(vec3f(value)+delta*chroma),edge));return;
  }
  let fallback=(geometry[center]>>16u)&255u;
  let offset=select(0u,20480u,edge);var color=vec3f(0.);
  for(var id=0u;id<10u;id++){
    let localColor=rgb(palettes[offset+shade*80u+id*8u+tone]);
    var local=select(0.,1.,id==fallback);if(total>0u){local=f32(votes[id])/f32(total);}
    color+=localColor*local;
  }
  atomicStore(&colors[i],inkColor(packed(color),edge));
}

fn carrierLevelAt(x:u32,y:u32)->f32{
  let h=seed(x,y);let detail=p.style.z;let strong=((h>>8u)&255u)<rounded((.22+.3*detail)*256.);
  let amplitude=select(8.+detail*8.,65.+detail*30.,strong);
  return f32(rounded(128.+(f32(h&255u)/255.*2.-1.)*amplitude));
}

fn linearChannel(v:f32)->f32{if(v<=.04045){return v/12.92;}return pow((v+.055)/1.055,2.4);}
fn srgbChannel(v:f32)->f32{if(v<=.0031308){return v*12.92;}return 1.055*pow(v,1./2.4)-.055;}
fn linearRGB(i:u32)->vec3f{let c=vec3f(sceneRGB(i))/255.;return vec3f(linearChannel(c.r),linearChannel(c.g),linearChannel(c.b));}
// Source lighting is projected through visible owners, never overlaid in screen space.
// Only the experimental soft mode relaxes the matched luminance carrier.
fn softColor(pixel:u32,source:vec3f)->u32{
  if(p.size.z!=7u){return pixel;}
  return packed(rgb(pixel)*.75+source*.25);
}
@compute @workgroup_size(64)
fn localColor(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x>=p.size.x||gid.y>=p.size.y){return;}let i=gid.y*p.size.x+gid.x;
  if(gid.x<p.window.x||gid.x>=p.window.y){nextSample[i]=packed(vec3f(sceneRGB(i)));return;}
  if(p.size.z==5u){
    let total=p.size.x*p.size.y;let r=atomicLoad(&parents[i]);
    atomicStore(&parents[total+i],r);atomicStore(&colors[total+i],atomicLoad(&heads[total+r]));return;
  }
  let level=atomicLoad(&colors[atomicLoad(&parents[i])]);let y=linearChannel(f32(level)/255.);
  let total=p.size.x*p.size.y;atomicStore(&parents[total+i],atomicLoad(&parents[i]));atomicStore(&colors[total+i],level);
  let owner=atomicLoad(&heads[i])&65535u;if(owner==0u){nextSample[i]=softColor(0xff000000u|level|(level<<8u)|(level<<16u),vec3f(128.));return;}
  let at=gid.y*p.size.x+owner-1u;
  let source=linearRGB(at);let s=spacing(zAt(at));let left=owner-1u-s/2u;let other=gid.y*p.size.x+select(left,left+s,gid.x==left);let partner=atomicLoad(&heads[other])&65535u;
  if(partner==0u){nextSample[i]=softColor(0xff000000u|level|(level<<8u)|(level<<16u),vec3f(128.));return;}
  let otherSource=linearRGB(gid.y*p.size.x+partner-1u);
  let difference=abs(source/max(.001,source.r+source.g+source.b)-otherSource/max(.001,otherSource.r+otherSource.g+otherSource.b));
  if(max(difference.r,max(difference.g,difference.b))>.1){nextSample[i]=softColor(0xff000000u|level|(level<<8u)|(level<<16u),vec3f(128.));return;}
  let sourceY=dot(source,vec3f(.2126,.7152,.0722));let delta=(source-vec3f(sourceY))/max(sourceY,.025)*y*.8;
  var gamut=1.;
  for(var k=0u;k<3u;k++){if(delta[k]>0.){gamut=min(gamut,(1.-y)/delta[k]);}else if(delta[k]<0.){gamut=min(gamut,-y/delta[k]);}}
  let value=clamp(vec3f(y)+delta*gamut,vec3f(0.),vec3f(1.));
  // The class list is no longer needed. Reuse its buffer for final local colors.
  nextSample[i]=softColor(packed(vec3f(srgbChannel(value.r),srgbChannel(value.g),srgbChannel(value.b))*255.),vec3f(sceneRGB(at)));
}
