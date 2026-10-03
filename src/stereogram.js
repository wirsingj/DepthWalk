// Parallel-view SIRDS. Centered stereo constraints, hidden-surface rejection,
// and rightward equivalence links (Thimbleby / Inglis / Witten construction).
// Pure module shared by the worker and numeric regression tests.
import { COLOR_BAND_COUNT as SURFACE_COUNT, CLASSIC_PALETTE, NEUTRAL_PALETTE, CONTOUR_MATERIAL_PALETTE, CONTOUR_CLASSIC_PALETTE, CONTOUR_NEUTRAL_PALETTE, SHADE_STEPS, SHADED_GEOMETRY_PALETTE, SHADED_CONTOUR_PALETTE } from './pattern.js';
import {sceneLuma,shadeSceneColor} from './scene-color.js';
export function separation(depth, spacing, strength) {
  // Canonical depth/strength integers remove CPU/GPU half-pixel disagreement.
  return canonicalSeparation(Math.round(depth*65535),spacing,Math.round(strength*1000));
}
function canonicalSeparation(q,spacing,mu){
  const product=q*mu;
  return Math.floor((4*spacing*(65535000-product)+(131070000-product))/(2*(131070000-product)));
}

export function createWorkspace(width) {
  return { same: new Int32Array(width), z: new Float32Array(width), quantized:new Uint16Array(width), roots:new Int32Array(width),
    votes:new Float32Array(width*SURFACE_COUNT), weight:new Float32Array(width),
    visible:new Uint8Array(width), edges:new Uint8Array(width), proximity:new Float64Array(width), sceneSums:new Float64Array(width*3), rowWeight:0, rowProximity:0, rowLuma:0 };
}

export function linkRow(z, spacing, strength, same, stats, accepted=null,quantized=new Uint16Array(z.length),mask=null,rowParity=0) {
  const width = z.length,mu=Math.round(strength*1000);
  for (let x = 0; x < width; x++){same[x]=x;quantized[x]=Math.round(z[x]*65535);}
  if(accepted)accepted.fill(0);
  for (let x = 0; x < width; x++) {
    if(mask&&!mask[x])continue;
    const s = canonicalSeparation(quantized[x],spacing,mu);
    // TIW figure 3 alternates odd-separation centering by row. Legacy callers
    // retain their original centering; only the foundation reference opts in.
    let left = x - ((s + (s & 1) * (rowParity & 1)) >> 1), right = left + s;
    if (left < 0 || right >= width) continue;
    // Check both eye rays. Nearer samples on either ray hide this constraint.
    // E = 2 * far-plane spacing; z increases toward the observer.
    let visible = true;
    if (strength > 0) {
      const center=quantized[x],denominator=131070000-mu*center;
      for (let t = 1; ; t++) {
        const ray=denominator*t;if(ray>=(65535-center)*mu*spacing)break;
        if ((x-t>=0&&(quantized[x-t]-center)*mu*spacing>=ray)||(x+t<width&&(quantized[x+t]-center)*mu*spacing>=ray)){visible=false;break;}
      }
    }
    if (!visible) { if (stats) stats.occluded++; continue; }
    if (stats) stats.visible++;
    if(accepted)accepted[x]=1;
    // Resolve crossing constraints without overwriting existing equivalences.
    let next = same[left];
    while (next !== left && next !== right) {
      if (next < right) left = next;
      else { same[left] = right; left = right; right = next; }
      next = same[left];
    }
    same[left] = right;
  }
  return same;
}

function colorClasses(pixels,src,width,spacing,strength,workspace,materials,contours,dst,shaded,sceneColor){
  const {same,z,roots,votes,weight,edges,visible,proximity}=workspace;
  workspace.rowWeight=0;workspace.rowProximity=0;workspace.rowLuma=0;
  if(materials&&shaded)for(let x=0;x<width;x++){
    const w=Math.round((.08+z[x]*z[x])*256);
    workspace.rowWeight+=w;workspace.rowProximity+=Math.round(z[x]*1024)*w;
    if(sceneColor){const at=src+x*4;workspace.rowLuma+=Math.round(sceneLuma(sceneColor[at],sceneColor[at+1],sceneColor[at+2]))*w;}
  }
  // Compress equivalence links, then give each entire class one blended color.
  // Tinting individual screen pixels would destroy the binocular constraints.
  for(let x=width-1;x>=0;x--){
    roots[x]=same[x]===x?x:roots[same[x]];
    if(same[x]===x){
      if(materials){votes.fill(0,x*SURFACE_COUNT,(x+1)*SURFACE_COUNT);weight[x]=0;proximity[x]=0;}
      if(sceneColor)workspace.sceneSums.fill(0,x*3,x*3+3);
      edges[x]=0;
    }
  }
  for(let x=0;x<width;x++){
    const s=separation(z[x],spacing,strength),left=x-(s>>1),right=left+s;
    if(left<0||right>=width||roots[left]!==roots[right])continue;
    const root=roots[left];
    // Only a visible geometric constraint can emphasize a contour. The whole
    // equivalence class gets the same palette, including both eye samples.
    if(contours&&visible[x]&&contours[dst+x])edges[root]=1;
    if(materials&&visible[x]){
      // Favor visible foreground geometry over long runs of sky. Hidden scene
      // samples must not wash out either hue or distance shading.
      const material=Math.min(SURFACE_COUNT-1,pixels[src+x*4+2]),w=shaded?Math.round((.08+z[x]*z[x])*256):.4+z[x]*z[x];
      votes[root*SURFACE_COUNT+material]+=w;weight[root]+=w;proximity[root]+=(shaded?Math.round(z[x]*1024):z[x])*w;
      if(sceneColor)for(let c=0;c<3;c++)workspace.sceneSums[root*3+c]+=sceneColor[src+x*4+c]*w;
    }
  }
}
export function encodeFrame(pixels, width, height, spacing, strength, workspace, seeds, out, surfacePalette=null, neutral=false, contours=null, shaded=false,sceneColor=null,ink=false) {
  if(seeds.length!==width*height)throw Error('Seed field must cover the full image without wrapping');
  const { z, same } = workspace;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4, dst = y * width;
    for (let x = 0; x < width; x++) z[x] = (pixels[src + x*4] * 256 + pixels[src + x*4 + 1]) / 65535;
    linkRow(z, spacing, strength, same, null, contours||surfacePalette?workspace.visible:null,workspace.quantized);
    if(surfacePalette||contours)colorClasses(pixels,src,width,spacing,strength,workspace,!!surfacePalette,contours,dst,shaded,sceneColor);
    for (let x = width - 1; x >= 0; x--) {
      if(same[x]!==x){out[dst+x]=out[dst+same[x]];continue;}
      const seed=seeds[dst+x],level=seed&7;
      const edge=contours&&workspace.edges[x];
      if(neutral){out[dst+x]=(edge?CONTOUR_NEUTRAL_PALETTE:NEUTRAL_PALETTE)[level];continue;}
      if(!surfacePalette){out[dst+x]=(edge?CONTOUR_CLASSIC_PALETTE:CLASSIC_PALETTE)[((seed>>>8)&7)*8+level];continue;}
      const palette=shaded?(edge?SHADED_CONTOUR_PALETTE:SHADED_GEOMETRY_PALETTE):(edge?CONTOUR_MATERIAL_PALETTE:surfacePalette);
      let r=0,g=0,b=0;
      const total=workspace.weight[x];
      if(sceneColor){
        const center=Math.max(0,x-(separation(z[x],spacing,strength)>>1)),at=src+center*4;
        r=total?workspace.sceneSums[x*3]/total:sceneColor[at];
        g=total?workspace.sceneSums[x*3+1]/total:sceneColor[at+1];
        b=total?workspace.sceneSums[x*3+2]/total:sceneColor[at+2];
        out[dst+x]=shadeSceneColor(r,g,b,workspace.rowLuma/workspace.rowWeight,level,edge);continue;
      }
      if(shaded){
        // Share brightness to prevent dark occlusion ribbons, never the hue of
        // unrelated objects across an entire scanline. The local class keeps its
        // own chroma and a single sharp noise tone, identical for both eyes.
        const rowDepth=workspace.rowProximity/workspace.rowWeight;
        const localDepth=total?workspace.proximity[x]/total:rowDepth;
        const shade=Math.round((localDepth*.25+rowDepth*.75)/1024*(SHADE_STEPS-1))*SURFACE_COUNT*8;
        const center=Math.max(0,x-(separation(z[x],spacing,strength)>>1));
        const fallback=Math.min(SURFACE_COUNT-1,pixels[src+center*4+2]);
        for(let id=0;id<SURFACE_COUNT;id++){
          const color=palette[shade+id*8+level];
          const local=total?workspace.votes[x*SURFACE_COUNT+id]/total:Number(id===fallback);
          r+=(color&255)*local;
          g+=(color>>>8&255)*local;
          b+=(color>>>16&255)*local;
        }
        out[dst+x]=(0xff000000|Math.round(r)|(Math.round(g)<<8)|(Math.round(b)<<16))>>>0;
        continue;
      }
      if(!total){
        // Newly exposed/unconstrained pixels inherit nearby scene material.
        // A universal sky fallback would draw dark repeated edge outlines.
        const center=Math.max(0,x-(separation(z[x],spacing,strength)>>1));
        const id=Math.min(SURFACE_COUNT-1,pixels[src+center*4+2]);
        const shade=shaded?Math.round(z[center]*(SHADE_STEPS-1))*SURFACE_COUNT*8:0;
        out[dst+x]=palette[shade+id*8+level];continue;
      }
      const shade=shaded?Math.round(workspace.proximity[x]/total*(SHADE_STEPS-1))*SURFACE_COUNT*8:0;
      for(let id=0;id<SURFACE_COUNT;id++){
        const w=workspace.votes[x*SURFACE_COUNT+id];if(!w)continue;
        const color=palette[shade+id*8+level];
        r+=(color&255)*w;g+=(color>>>8&255)*w;b+=(color>>>16&255)*w;
      }
      const brightness=1/total;
      out[dst+x]=(0xff000000|Math.round(r*brightness)|(Math.round(g*brightness)<<8)|(Math.round(b*brightness)<<16))>>>0;
    }
    if(ink&&contours)for(let x=0;x<width;x++)if(workspace.edges[workspace.roots[x]]){
      const c=out[dst+x];out[dst+x]=(0xff000000|Math.round((c&255)*.55)|Math.round((c>>>8&255)*.55)<<8|Math.round((c>>>16&255)*.55)<<16)>>>0;
    }
  }
  return out;
}

