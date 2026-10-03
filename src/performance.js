// Explicit Auto quality only. Fixed quality never changes behind the user's back.
export function targetFrameRate(refresh, cpu=false){
  const hz=Math.max(1,refresh);
  // A 25 ms CPU interval rounds up to whole RAFs: 30 fps at 60 Hz, 40 at
  // 120 Hz. Tolerate small counting jitter near an exact interval boundary.
  return cpu?hz/Math.max(1,Math.ceil(hz/40-.05)):Math.min(60,hz);
}
export class AdaptiveQuality{
  constructor(){this.factor=1;this.lastChange=0;this.slow=0;this.fast=0;}
  update(fps,workMs,now,targetFps=60){
    // The CPU renderer intentionally caps at 40 fps. Compare with its actual
    // ceiling so it can recover quality after transient load subsides.
    this.slow=fps<targetFps*.8&&workMs>20?this.slow+1:0;
    this.fast=fps>targetFps*.95&&workMs<11?this.fast+1:0;
    if(now-this.lastChange<2500)return false;
    let next=this.factor;
    if(this.slow>=2)next=Math.max(.35,this.factor*.8);
    else if(this.fast>=8)next=Math.min(1,this.factor/ .8);
    if(Math.abs(next-this.factor)<.001)return false;
    this.factor=next;this.lastChange=now;this.slow=this.fast=0;return true;
  }
}
