// Dynamic uncorrelated carrier: fresh matching texture removes directional
// motion cues from a persistent pattern. No previous image or depth is mixed.
// Tyler: https://www.scholarpedia.org/article/Autostereogram
function hash(x,y,frame,seed){
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(frame,2246822519)^seed;
  h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return (h^(h>>>16))>>>0;
}
function noise(x,y,frame,seed){const h=hash(x,y,frame,seed);return (h&255)+(h>>>8&255)+(h>>>16&255)+(h>>>24)-510;}
export function motionTone(x,y,carrier,frame,seed=173){
  if(carrier==='binary')return hash(x,y,frame,seed)&1?255:0;
  let value=noise(x,y,frame,seed),variance=1;
  if(carrier==='pink')for(let octave=1,scale=2;octave<=8;octave++,scale*=2){
    const sx=x/scale,sy=y/scale,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    const key=(seed+Math.imul(octave,2654435761))>>>0;
    const a=noise(ix,iy,frame,key)*(1-fx)+noise(ix+1,iy,frame,key)*fx;
    const b=noise(ix,iy+1,frame,key)*(1-fx)+noise(ix+1,iy+1,frame,key)*fx;
    const weight=1.5/Math.sqrt(scale);
    value+=(a*(1-fy)+b*fy)*weight;
    variance+=weight*weight*((1-fx)**2+fx*fx)*((1-fy)**2+fy*fy);
  }
  return Math.max(0,Math.min(255,Math.floor(128+value*48/Math.sqrt(21845*variance)+.5)));
}

// The accepted baseline retains its <=60 Hz timer. The frame-sync comparison
// refreshes on each accepted moving frame instead, avoiding skipped updates when
// render intervals straddle 1/60 s. Neither mode changes a held scene.
export class FoundationMotion{
  constructor(){this.frame=0;this.key=null;this.last=-Infinity;this.movingFrames=0;this.refreshes=0;}
  update(key,now,enabled,cadence='baseline'){
    if(!['baseline','frame'].includes(cadence))throw Error('Invalid grain cadence');
    const changed=this.key!==null&&key!==this.key;this.key=key;
    if(!enabled)return 0;
    if(changed){
      this.movingFrames++;
      if(cadence==='frame'||now-this.last>=1000/60){this.frame=(this.frame+1)>>>0||1;this.last=now;this.refreshes++;}
    }
    return this.frame;
  }
}
