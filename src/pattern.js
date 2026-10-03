// All hues share a tone index. Shade that tone once per stereo class; never
// average independent dot signals or tint the two eye samples separately.
export const CONTRAST_LEVELS = [40,58,79,103,158,183,209,232];
// Stronger ink/highlight contrast on geometry contours, with almost the same
// mean luminance. Keeping all eight tones avoids flat, repeated outline bands.
export const CONTOUR_LEVELS = [12,31,50,72,190,211,232,250];
// A coherent environment palette: dusk blue, slate, paving, cool concrete,
// warm masonry, shaded stone, blue-grey walls, and two foliage greens.
// Opposite facets belong to the same material family, not opposite rainbow hues.
const surfaceHues=['#384e79','#374d63','#b7b39e','#92afb4','#b58d7c','#7d8b89','#8897af','#6f9f67','#795b43','#52794b'];
// DepthWalk owns these geometry colors; no host-engine materials are read.
export const COLOR_BAND_COUNT=surfaceHues.length;
const classicHues=['#68859b','#a690bb','#58a6a0','#a7b77a','#c99677','#b482a0','#7e96ba','#c2b789'];
function pack(r,g,b){return (0xff000000|r|(g<<8)|(b<<16))>>>0;}
function ramp(hex,levels=CONTRAST_LEVELS,chroma=.98){
  const value=parseInt(hex.slice(1),16),rgb=[value>>>16,(value>>>8)&255,value&255];
  const l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],delta=rgb.map(c=>(c-l)*chroma);
  return levels.map(level=>{
    let saturation=1;
    for(const d of delta)if(d!==0)saturation=Math.min(saturation,d>0?(255-level)/d:level/-d);
    return pack(...delta.map(d=>Math.round(level+saturation*d)));
  });
}
export const MATERIAL_PALETTE=Uint32Array.from(surfaceHues.flatMap(hue=>ramp(hue)));
export const CLASSIC_PALETTE=Uint32Array.from(classicHues.flatMap(hue=>ramp(hue,CONTRAST_LEVELS,.85)));
export const NEUTRAL_PALETTE=Uint32Array.from(CONTRAST_LEVELS.map(l=>pack(l,l,l)));
export const CONTOUR_MATERIAL_PALETTE=Uint32Array.from(surfaceHues.flatMap(hue=>ramp(hue,CONTOUR_LEVELS)));
export const CONTOUR_CLASSIC_PALETTE=Uint32Array.from(classicHues.flatMap(hue=>ramp(hue,CONTOUR_LEVELS,.85)));
export const CONTOUR_NEUTRAL_PALETTE=Uint32Array.from(CONTOUR_LEVELS.map(l=>pack(l,l,l)));
export const GEOMETRY_PALETTE=MATERIAL_PALETTE;
// Fixed distance shading, not frame-relative normalization. Preserve the full
// ordering/contrast of eight tones even in the darkest far-plane colors.
// 256 steps avoid posterized depth bands while keeping the row encoder cheap.
export const SHADE_STEPS=256;
function shadedPalette(levels){
  const colors=[];
  for(let shade=0;shade<SHADE_STEPS;shade++){
    const near=shade/(SHADE_STEPS-1),scale=.46+.54*near,lift=12*near;
    const tones=levels.map(tone=>Math.min(254,tone*scale+lift));
    for(const hue of surfaceHues)colors.push(...ramp(hue,tones));
  }
  return Uint32Array.from(colors);
}
export const SHADED_GEOMETRY_PALETTE=shadedPalette(CONTRAST_LEVELS);
export const SHADED_CONTOUR_PALETTE=shadedPalette(CONTOUR_LEVELS);
function hash(x,y){
  let h=Math.imul(x+137,374761393)^Math.imul(y+719,668265263);
  h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0;
}
export function createSeedField(width,height,scale,yOffset=0,grain=2){
  const seeds=new Uint32Array(width*height),cell=Math.max(1,grain*scale);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    seeds[y*width+x]=hash(Math.floor(x/cell),Math.floor((y+yOffset)/cell));
  // This field NEVER wraps at pattern spacing. Only valid scene constraints
  // create repetition. Occluded/unlinked roots must have independent seeds.
  return seeds;
}
