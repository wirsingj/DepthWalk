export const BUILDINGS = [
  [-13,-12,10,10,10],[-25,-12,8,10,17],[-13,-25,10,9,19],[-25,-25,8,9,9],
  [13,-12,10,10,14],[25,-12,8,10,8],[13,-25,10,9,10],[25,-25,8,9,21],
  [-13,13,10,10,8],[-25,13,8,10,14],[-13,26,10,8,16],[-25,26,8,8,10],
  [13,13,10,10,11],[25,13,8,10,18],[13,26,10,8,8],[25,26,8,8,12],
];
export const BEACONS = [
  { name:'Prism · Central plaza', x:0, z:-2, shape:'prism' },
  { name:'Halo · East promenade', x:25, z:1, shape:'halo' },
  { name:'Spire · North passage', x:0, z:-29, shape:'spire' },
  { name:'Portal · West alley', x:-25, z:-19, shape:'portal' },
  { name:'Crown · South gardens', x:-4, z:28, shape:'crown' },
];
export const PLANTERS = [
  [-5.6,-5.3,1.7,1.7],[5.6,-5.3,1.7,1.7],[-5.6,5.4,1.7,1.7],[5.6,5.4,1.7,1.7],
  [-32.6,6,1.7,1.7],[32.6,6,1.7,1.7],[-5.6,23,1.7,1.7],[5.6,23,1.7,1.7],
  [-32.6,-29,1.7,1.7],[32.6,-29,1.7,1.7],
];
const obstacles = [...BUILDINGS,...PLANTERS];
export function createPlayer() { return { x:0, z:13, yaw:0, pitch:0, vx:0, vz:0, turn:0 }; }
export function blocked(x,z) {
  const r = .48;
  if (Math.abs(x) > 34-r || Math.abs(z) > 35-r) return true;
  return obstacles.some(([bx,bz,w,d]) => {
    const dx = Math.max(Math.abs(x-bx)-w/2,0), dz = Math.max(Math.abs(z-bz)-d/2,0);
    return dx*dx + dz*dz < r*r;
  });
}
export function stepPlayer(p, keys, dt) {
  dt = Math.min(dt, .05);
  let f = Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
  let s = Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  const len = Math.hypot(f,s) || 1; f/=len; s/=len;
  const turn = Number(keys.has('KeyQ')||keys.has('ArrowLeft'))-Number(keys.has('ArrowRight'));
  const smooth = 1-Math.exp(-dt*12);
  // Release settles promptly: imperceptible camera drift otherwise keeps
  // replacing the entire stereogram carrier long after input has stopped.
  const release = 1-Math.exp(-dt*36);
  p.turn += (turn*.65-p.turn)*(turn?smooth:release);
  if(!turn&&Math.abs(p.turn)<.002)p.turn=0;
  p.yaw += p.turn*dt;
  const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?6:3;
  const tx = (-Math.sin(p.yaw)*f+Math.cos(p.yaw)*s)*speed;
  const tz = (-Math.cos(p.yaw)*f-Math.sin(p.yaw)*s)*speed;
  const movementSmooth=f||s?smooth:release;
  p.vx += (tx-p.vx)*movementSmooth; p.vz += (tz-p.vz)*movementSmooth;
  // Stop below a visually negligible speed instead of perturbing depth forever.
  if(!f&&!s){if(Math.abs(p.vx)<.02)p.vx=0;if(Math.abs(p.vz)<.02)p.vz=0;}
  if (!blocked(p.x+p.vx*dt,p.z)) p.x+=p.vx*dt; else p.vx=0;
  if (!blocked(p.x,p.z+p.vz*dt)) p.z+=p.vz*dt; else p.vz=0;
}
export function collectNearby(player, found) {
  const newly = [];
  BEACONS.forEach((b,i) => { if (!found.has(i) && Math.hypot(player.x-b.x,player.z-b.z)<1.45) { found.add(i); newly.push(i); } });
  return newly;
}
