import {validateDepthFrame} from './depth-frame.js';
import {linkRow} from './stereogram.js';
import {createFoundationTexture} from './foundation-texture.js';

// Depth-only research path: no source color, contours or temporal image history.
export class FoundationFilter{
  render(frame,{carrier='binary',spacing=96,strength=.333,seed=173}={},output=null){
    validateDepthFrame(frame);
    const {width,height,fullHeight=height,yOffset=0,cropTop=0,cropBottom=0,depth,origin='top-left'}=frame;
    if(!['packed-proximity-rg16','proximity'].includes(frame.format))throw Error('Foundation input requires canonical proximity');
    if(width>2048||fullHeight>2048||width*fullHeight>2097152||!Number.isInteger(spacing)||spacing<8||spacing>=width
      ||!Number.isFinite(strength)||strength<0||strength>.5||!['binary','white','pink'].includes(carrier)
      ||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid foundation settings');
    const rows=height-cropTop-cropBottom;
    if(output!==null&&(!(output instanceof Uint32Array)||output.length!==width*rows))throw Error('Foundation output must match the rendered dimensions');
    const key=`${width}/${fullHeight}/${seed}`;
    if(this.key!==key){this.key=key;this.textures=new Map();this.same=new Int32Array(width);this.z=new Float64Array(width);this.q=new Uint16Array(width);}
    if(!this.textures.has(carrier))this.textures.set(carrier,createFoundationTexture(width,fullHeight,carrier,seed));
    const texture=this.textures.get(carrier);
    if(this.output?.length!==width*rows)this.output=new Uint32Array(width*rows);
    const target=output||this.output;
    for(let y=0;y<rows;y++){
      const globalY=yOffset+cropTop+y,sourceY=origin==='bottom-left'?height-1-cropTop-y:cropTop+y;
      for(let x=0;x<width;x++){
        const i=sourceY*width+x,v=frame.format==='proximity'?depth[i]:(depth[i*4]*256+depth[i*4+1])/65535;
        this.z[x]=Number.isFinite(v)&&v>=0&&v<=1?v:0;
      }
      linkRow(this.z,spacing,strength,this.same,null,null,this.q,null,globalY);
      for(let x=width-1;x>=0;x--){
        const at=y*width+x;
        if(this.same[x]!==x)target[at]=target[y*width+this.same[x]];
        else{const v=texture[globalY*width+x];target[at]=(0xff000000|v|v<<8|v<<16)>>>0;}
      }
    }
    return {width,height:rows,pixels:target};
  }
}
