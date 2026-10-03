import {linkRow,separation} from './stereogram.js';

// Deterministic display-space support. A patch carries several adjacent matches,
// while quiet regions can retain source shading. No animated random sampling.
export function surfaceHash(x,y){let h=Math.imul(x+137,374761393)^Math.imul(y+719,668265263);h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>0;}
export function surfacePatch(x,y,scale,detail){
  x=Math.floor((x+.5)/scale);y=Math.floor((y+.5)/scale);
  const tx=Math.floor(x/32),ty=Math.floor(y/16),h=surfaceHash(tx,ty);
  const w=7+Math.round(detail*12),height=3+Math.round(detail*5);
  const ox=1+(h&255)%(31-w),oy=1+(h>>>8&255)%(15-height);
  return x%32>=ox&&x%32<ox+w&&y%16>=oy&&y%16<oy+height;
}
export function surfaceTone(r,g,b,hash,amplitude){
  const offset=(((hash&255)/255)*2-1)*amplitude;
  const channel=v=>Math.round(Math.max(0,Math.min(255,v+offset)));
  return (0xff000000|channel(r)|(channel(g)<<8)|(channel(b)<<16))>>>0;
}
export function surfaceFeature(color,at,x,width,scale){
  const r=Math.max(1,Math.round(scale));if(x<r||x+r>=width)return false;
  // Horizontal image gradients provide useful stereo features; horizontal
  // bands alone cannot identify horizontal disparity and are not promoted.
  const a=at+r*4,b=at-r*4;
  return Math.max(Math.abs(color[a]-color[b]),Math.abs(color[a+1]-color[b+1]),Math.abs(color[a+2]-color[b+2]))>32;
}

// Color is the least-squares projection of the source onto the selected
// equivalence classes. It is not a colored overlay applied after stereo coding.
export function encodeSurface({packed,color,width,height,scale,yOffset,dotSize,contours,spacing,strength,detail,quiet=false,out,workspace,history=null,ink=false}){
  const w=workspace;
  if(w.surfaceWidth!==width){Object.assign(w,{surfaceWidth:width,mask:new Uint8Array(width),count:new Uint32Array(width),sums:new Float64Array(width*3),edgeCount:new Uint32Array(width),denseSame:new Int32Array(width)});}
  if(history&&w.quietCandidate?.length!==width)Object.assign(w,{quietCandidate:new Int32Array(width),quietVotes:new Int32Array(width),quietClaims:new Uint32Array(width),quietHashes:new Uint32Array(width)});
  let selected=0,linked=0,reused=0,classes=0;
  for(let y=0;y<height;y++){
    const src=(height-1-y)*width*4,dst=y*width;
    for(let x=0;x<width;x++){
      w.z[x]=(packed[src+x*4]*256+packed[src+x*4+1])/65535;
      w.mask[x]=quiet||contours?.[dst+x]||surfacePatch(x,y+yOffset,scale,detail)||surfaceFeature(color,src+x*4,x,width,scale)?1:0;
    }
    if(!quiet){
      linkRow(w.z,spacing,strength,w.denseSame,null,null,w.quantized);
      for(let x=width-1;x>=0;x--)if(w.denseSame[x]!==x)w.denseSame[x]=w.denseSame[w.denseSame[x]];
    }
    linkRow(w.z,spacing,strength,w.same,null,w.visible,w.quantized,quiet?null:w.mask);
    w.count.fill(0);w.sums.fill(0);w.edgeCount.fill(0);
    for(let x=width-1;x>=0;x--)w.roots[x]=w.same[x]===x?x:w.roots[w.same[x]];
    for(let x=0;x<width;x++){
      const root=w.roots[x];w.count[root]++;
      for(let c=0;c<3;c++)w.sums[root*3+c]+=color[src+x*4+c];
      selected+=w.visible[x];linked+=root!==x;
      if(contours?.[dst+x]&&w.visible[x]){
        const left=x-(separation(w.z[x],spacing,strength)>>1);w.edgeCount[w.roots[left]]++;
      }
    }
    if(history){
      w.quietCandidate.fill(-1);w.quietVotes.fill(0);w.quietClaims.fill(0);
      if(history.valid){
        // A strict majority proposes an old class; one current class wins it.
        // Reuse only its seed, never its RGB or depth, so there are no color trails.
        for(let x=0;x<width;x++){
          const root=w.roots[x],old=history.roots[dst+x];
          if(!w.quietVotes[root]){w.quietCandidate[root]=old;w.quietVotes[root]=1;}
          else w.quietVotes[root]+=w.quietCandidate[root]===old?1:-1;
        }
        w.quietVotes.fill(0);
        for(let x=0;x<width;x++)if(history.roots[dst+x]===w.quietCandidate[w.roots[x]])w.quietVotes[w.roots[x]]++;
        for(let x=0;x<width;x++)if(w.roots[x]===x){
          const old=w.quietCandidate[x],votes=w.quietVotes[x];
          if(votes*2>w.count[x])w.quietClaims[old]=Math.max(w.quietClaims[old],votes*65536+x+1);
          else w.quietCandidate[x]=-1;
        }
      }
    }
    for(let x=width-1;x>=0;x--){
      const root=w.roots[x];if(root!==x){out[dst+x]=out[dst+root];continue;}
      const n=w.count[x],cell=Math.max(1,dotSize*scale),seedX=quiet?x:w.denseSame[x];
      let hash=surfaceHash(Math.floor(seedX/cell),Math.floor((y+yOffset)/cell));
      if(history){
        const old=w.quietCandidate[x];
        if(old>=0&&(w.quietClaims[old]&65535)===x+1){hash=history.hashes[dst+old];reused++;}
        w.quietHashes[x]=hash;classes++;
      }
      const edge=w.edgeCount[x]/n;
      const amplitude=quiet?((hash>>>8&255)<Math.round((.06+.24*detail)*256)?50+detail*65+edge*35:5):n>1?44+detail*46+edge*22:14+detail*16;
      // Darken the surface mean, preserving the matching texture's amplitude.
      const shade=ink?1-.45*Math.sqrt(Math.min(1,edge)):1;
      out[dst+x]=surfaceTone(w.sums[x*3]/n*shade,w.sums[x*3+1]/n*shade,w.sums[x*3+2]/n*shade,hash,amplitude);
    }
    if(history)for(let x=0;x<width;x++){history.roots[dst+x]=w.roots[x];history.hashes[dst+x]=w.quietHashes[w.roots[x]];}
  }
  if(history)history.valid=true;
  return {selected,linked,reused,classes};
}
