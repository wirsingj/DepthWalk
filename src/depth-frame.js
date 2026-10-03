// Engine-independent depth ingestion and geometry styling. Only the scalar
// depth samples are inputs; colors and normals are generated here by DepthWalk.
const logDepth=new Float32Array(65536);
logDepth[0]=Infinity;
for(let i=1;i<65536;i++)logDepth[i]=-Math.log(i/65535);

export function normalRadius(pixelRatio){return Math.max(1,Math.round(pixelRatio));}

export function validateDepthFrame(frame){
  const {width,height,depth,format='view-z',origin='top-left',fullHeight=height,yOffset=0,cropTop=0,cropBottom=0,verticalFov=62}=frame;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Depth dimensions must be positive integers');
  if(!['view-z','device-depth','proximity','packed-proximity-rg16'].includes(format))throw Error(`Unsupported depth format: ${format}`);
  if(!['top-left','bottom-left'].includes(origin))throw Error('Depth origin must be top-left or bottom-left');
  const packed=format==='packed-proximity-rg16';
  if(!ArrayBuffer.isView(depth)||depth instanceof DataView||depth.length!==width*height*(packed?4:1))throw Error('Depth buffer length does not match its format and dimensions');
  if(typeof depth[0]!=='number')throw Error('Depth samples must use a numeric typed array, not BigInt');
  if(packed&&!(depth instanceof Uint8Array||depth instanceof Uint8ClampedArray))throw Error('Packed depth requires RGBA bytes');
  if(![fullHeight,yOffset,cropTop,cropBottom].every(Number.isInteger)||fullHeight<height||yOffset<0||yOffset+height>fullHeight||cropTop<0||cropBottom<0||cropTop+cropBottom>=height)throw Error('Invalid depth stripe bounds');
  if(!(Number.isFinite(verticalFov)&&verticalFov>0&&verticalFov<179))throw Error('verticalFov must be a finite number of degrees between 0 and 179');
  if(frame.projection!==undefined&&!['perspective','orthographic'].includes(frame.projection))throw Error('Unsupported depth projection');
  if(frame.reverseZ!==undefined&&typeof frame.reverseZ!=='boolean')throw Error('reverseZ must be boolean');
  if(frame.orthographicHeight!==undefined&&!(Number.isFinite(frame.orthographicHeight)&&frame.orthographicHeight>0))throw Error('orthographicHeight must be positive');
  if(frame.depthRange!==undefined&&!(Number.isFinite(frame.depthRange)&&frame.depthRange>0))throw Error('Source depthRange must be positive');
  if(format==='device-depth'){
    const {near,far,projection='perspective'}=frame;
    if(!['perspective','orthographic'].includes(projection))throw Error('Unsupported depth projection');
    if(!(Number.isFinite(near)&&near>0&&far>near&&(Number.isFinite(far)||far===Infinity)))throw Error('Device depth needs valid near and far planes');
    if(projection==='orthographic'&&!Number.isFinite(far))throw Error('Orthographic depth requires a finite far plane');
  }
}

// Convert to positive view-space Z distance (not radial camera distance).
// Missing, invalid and clear-depth samples become Infinity/background.
export function decodeDepth(frame,out=new Float32Array(frame.width*frame.height)){
  validateDepthFrame(frame);
  if(!(out instanceof Float32Array||out instanceof Float64Array)||out.length!==frame.width*frame.height)throw Error('Decoded depth output must be a matching floating-point array');
  const {width,height,depth,format='view-z',origin='top-left',depthRange=22,near,far,reverseZ=false,projection='perspective'}=frame;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const source=(origin==='bottom-left'?height-1-y:y)*width+x;
    let d;
    if(format==='packed-proximity-rg16')d=logDepth[depth[source*4]*256+depth[source*4+1]]*depthRange;
    else if(format==='proximity'){
      const p=depth[source];d=p>0&&p<=1?-Math.log(p)*depthRange:Infinity;
    }else if(format==='device-depth'){
      const raw=depth[source],v=reverseZ?1-raw:raw;
      d=raw>=0&&raw<=1&&v<1?(projection==='orthographic'?near+v*(far-near):far===Infinity?near/(1-v):near*far/(far-v*(far-near))):Infinity;
    }else d=depth[source];
    out[y*width+x]=Number.isFinite(d)&&d>=0?d:Infinity;
  }
  return out;
}

function normalCode(nx,ny,nz){
  if(nx===0&&ny===0&&nz>0)return 136;
  const sum=Math.abs(nx)+Math.abs(ny)+Math.abs(nz);
  if(sum<1e-20)return 136;
  let x=nx/sum,y=ny/sum;
  if(nz<0){const old=x;x=(1-Math.abs(y))*(x<0?-1:1);y=(1-Math.abs(old))*(y<0?-1:1);}
  return Math.round((x*.5+.5)*15)+Math.round((y*.5+.5)*15)*16;
}

export function geometryColor(nx,ny,nz){
  const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
  // Broad shape families, not semantic recognition: stone horizontal tops,
  // coordinated masonry walls and green inclined facets on BOTH sides.
  // A tree crown and a faceted beacon can therefore differ from a flat wall
  // without requiring object labels. Distance controls shading separately.
  if(ay>ax*2.5&&ay>az*2.5)return ny>0?2:5;
  if(ay>(ax+az)*.24)return ny>0?7:9;
  if(ax>az*1.2)return nx>0?4:6;
  return 3;
}

export function prepareGeometry(frame,{pixelRatio=1,depthRange=22}={},cache={}){
  validateDepthFrame(frame);
  const {width,height,fullHeight=height,yOffset=0,verticalFov=62}=frame,length=width*height;
  if(cache.distance?.length!==length){cache.distance=new Float32Array(length);cache.packed=new Uint8Array(length*4);}
  const distance=decodeDepth(frame,cache.distance),packed=cache.packed;
  const orthographic=frame.projection==='orthographic';
  const radius=normalRadius(pixelRatio),invFocal=orthographic?(frame.orthographicHeight??2)/fullHeight:2*Math.tan(verticalFov*Math.PI/360)/fullHeight;
  const step=radius*invFocal;
  const sameRange=(frame.depthRange??22)===depthRange;
  const reusePacked=frame.format==='packed-proximity-rg16'&&sameRange,reuseProximity=frame.format==='proximity'&&sameRange;
  for(let y=0;y<height;y++){
    const sourceRow=(frame.origin==='bottom-left'?height-1-y:y)*width,sy=(fullHeight/2-(y+yOffset+.5))*invFocal;
    for(let x=0;x<width;x++){
    const at=y*width+x,d=distance[at],dst=((height-1-y)*width+x)*4;
    if(!Number.isFinite(d)){packed[dst]=packed[dst+1]=packed[dst+2]=0;packed[dst+3]=136;continue;}
    // The common GPU adapter already supplies the desired proximity encoding;
    // keep its exact depth bits instead of doing a log/exp round trip per pixel.
    let q;
    if(reusePacked){const i=(sourceRow+x)*4;q=frame.depth[i]*256+frame.depth[i+1];}
    else{const proximity=reuseProximity?frame.depth[sourceRow+x]:Math.exp(-d/depthRange);q=Math.round(proximity*65535);}
    packed[dst]=q>>8;packed[dst+1]=q&255;
    const left=x>=radius?distance[at-radius]:Infinity,right=x+radius<width?distance[at+radius]:Infinity;
    const up=y>=radius?distance[at-radius*width]:Infinity,down=y+radius<height?distance[at+radius*width]:Infinity;
    const useRight=Math.abs(right-d)<=Math.abs(left-d),useUp=Math.abs(up-d)<=Math.abs(down-d);
    const dx=useRight?right:left,dy=useUp?up:down;
    let nx=0,ny=0,nz=1;
    // Select the least discontinuous neighbor on each axis. This avoids
    // reconstructing a tilted face across a silhouette or occlusion boundary.
    if(Number.isFinite(dx)&&Number.isFinite(dy)&&d>0&&Math.abs(dx-d)<d*.12&&Math.abs(dy-d)<d*.12){
      const deltaX=(dx-d)*(useRight?1:-1),deltaY=(dy-d)*(useUp?1:-1);
      const sx=(x+.5-width/2)*invFocal;
      if(orthographic){nx=deltaX*step;ny=deltaY*step;nz=step*step;}
      else if(deltaX===0){ny=deltaY;nz=sy*deltaY+step*dy;}
      else if(deltaY===0){nx=deltaX;nz=sx*deltaX+step*dx;}
      else{
        nx=deltaX*step*dy;ny=deltaY*step*dx;
        nz=sx*deltaX*step*dy+sy*deltaY*step*dx+step*step*dx*dy;
      }
    }
    packed[dst+2]=geometryColor(nx,ny,nz);
    packed[dst+3]=normalCode(nx,ny,nz);
    }
  }
  return {packed,distance,width,height};
}
