/** Bounds in render pixels; spacing remains specified in display pixels. */
export function stereoWindow(width,spacing=120,pixelRatio=1,periods=0){
  if(![0,2,3,4].includes(periods))throw Error('Stereo window must be 0, 2, 3 or 4 periods');
  const size=periods?Math.min(width,periods*Math.max(8,Math.round(spacing*pixelRatio))):width;
  const left=Math.floor((width-size)/2);
  return {left,right:left+size,width:size};
}

export function cropColumns(source,width,height,left,size,channels=1,target=null){
  const output=target||new source.constructor(size*height*channels);
  for(let y=0;y<height;y++)output.set(source.subarray((y*width+left)*channels,(y*width+left+size)*channels),y*size*channels);
  return output;
}
