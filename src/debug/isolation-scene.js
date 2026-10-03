// A controlled depth fixture, not a second game map. No scene assets required.
export function isolationFrames({width=640,height=360,spacing=120,shape='diamond'}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<16||width*height>8294400
    ||!Number.isFinite(spacing)||spacing<8||spacing>8192||!['diamond','ring'].includes(shape))throw Error('Invalid isolation scene');
  const frames=[];
  for(let t=0;t<10;t++){
    if(t===1||t>6){frames.push({...frames.at(-1),phase:'hold',frameIndex:t,nominalTimeMs:t*1000/15});continue;}
    const shift=Math.max(0,t-1)*3,depth=new Uint8Array(width*height*4),color=new Uint8Array(depth.length),radius=Math.min(height*.28,width*.2);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const dx=x-width*.5-shift,dy=y-height*.46,r=Math.hypot(dx,dy);
      const inside=shape==='diamond'?Math.abs(dx)+Math.abs(dy)<radius:r<radius&&r>radius*.48;
      const at=(y*width+x)*4,q=Math.round((inside?.82:.12)*65535);
      depth[at]=q>>8;depth[at+1]=q&255;depth[at+3]=255;
      color.set(inside?[210,177,70,255]:[65,95,121,255],at);
    }
    frames.push({width,height,depth,color,origin:'top-left',format:'packed-proximity-rg16',spacing,strength:.5,phase:t<2?'hold':'move',name:`Isolated ${shape}`,frameIndex:t,nominalTimeMs:t*1000/15});
  }
  return frames;
}
