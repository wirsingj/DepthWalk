import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayer,stepPlayer,blocked,collectNearby,BEACONS,BUILDINGS,PLANTERS} from '../src/game.js';
import {FoundationMotion} from '../src/foundation-motion.js';
const walk=(p,keys,seconds)=>{for(let t=0;t<seconds;t+=1/120)stepPlayer(p,new Set(keys),1/120);};
test('stationary startup has no camera motion',()=>{const p=createPlayer();walk(p,[],5);assert.equal(p.x,0);assert.equal(p.z,13);assert.equal(p.yaw,0);});
test('released movement and turn ease out and then stop exactly',()=>{
  for(const hz of [30,60,144,240])for(const controls of [['KeyW'],['KeyW','KeyD','ShiftLeft'],['ArrowRight']]){
    const p=createPlayer(),keys=new Set(controls),motion=new FoundationMotion();let now=0;
    const sample=()=>motion.update([p.x,p.z,p.yaw,p.pitch].join('/'),now,true);
    for(let i=0;i<hz;i++){stepPlayer(p,keys,1/hz);now+=1000/hz;sample();}
    const speed=Math.hypot(p.vx,p.vz,p.turn),released=now;
    stepPlayer(p,new Set(),1/hz);now+=1000/hz;sample();
    assert.ok(Math.hypot(p.vx,p.vz,p.turn)>0&&Math.hypot(p.vx,p.vz,p.turn)<speed,'release should ease out');
    while((p.vx||p.vz||p.turn)&&now-released<1000){stepPlayer(p,new Set(),1/hz);now+=1000/hz;sample();}
    assert.ok(now-released<=180,`${hz} Hz release took ${now-released} ms`);
    const pose={...p},epoch=motion.frame;
    for(let i=0;i<hz*2;i++){stepPlayer(p,new Set(),1/hz);now+=1000/hz;sample();}
    assert.deepEqual(p,pose,'residual motion changed depth after stopping');
    assert.equal(motion.frame,epoch,'grain kept changing after the camera stopped');
  }
});
test('W/S and A/D move on the ground in the expected camera axes',()=>{
  for(const [key,axis,sign] of [['KeyW','z',-1],['KeyS','z',1],['KeyA','x',-1],['KeyD','x',1]]){
    const p=createPlayer(),before=p[axis];walk(p,[key],.5);assert.ok((p[axis]-before)*sign>1);
  }
});
test('arrow keys turn smoothly and movement follows orientation',()=>{
  for(const [key,sign] of [['ArrowLeft',1],['ArrowRight',-1]]){const p=createPlayer();walk(p,[key],1);assert.ok(p.yaw*sign>.5);assert.ok(Math.abs(p.yaw)<.66);}
  const p=createPlayer();p.yaw=Math.PI/2;walk(p,['KeyW'],1);assert.ok(p.x<-2.5);assert.ok(Math.abs(p.z-13)<1e-6);
});
test('either Shift sprints, releases smoothly and retains collision protection',()=>{
  for(const shift of ['ShiftLeft','ShiftRight']){
    const walkPlayer=createPlayer(),runner=createPlayer();walk(walkPlayer,['KeyW'],.7);walk(runner,['KeyW',shift],.7);
    assert.ok(Math.abs((13-runner.z)/(13-walkPlayer.z)-2)<1e-6);
    walk(runner,['KeyW'],.5);assert.ok(Math.abs(runner.vz)<3.1);
    const wall=createPlayer();walk(wall,['KeyD',shift],3);assert.ok(wall.x<7.53&&!blocked(wall.x,wall.z));
  }
  const p=createPlayer();walk(p,['KeyE'],1);assert.equal(p.yaw,0,'E is reserved for pattern switching');
});
test('diagonal speed is normalized',()=>{const a=createPlayer(),b=createPlayer();walk(a,['KeyW'],1);walk(b,['KeyW','KeyD'],1);assert.ok(Math.abs(Math.hypot(b.x,b.z-13)-(13-a.z))<1e-8);});
test('building collisions stop the player and allow sliding',()=>{
  const p=createPlayer();walk(p,['KeyD'],8);assert.ok(p.x<7.53&&p.x>7.4);assert.equal(p.z,13);
  walk(p,['KeyD','KeyW'],2);assert.ok(p.z<10);assert.ok(!blocked(p.x,p.z));
});
test('perimeter containment and long-frame protection',()=>{
  const p=createPlayer();walk(p,['KeyS'],30);assert.ok(p.z<=34.52);
  const q=createPlayer();stepPlayer(q,new Set(['KeyW']),60);assert.ok(q.z>12.8);
});
test('all beacon positions are walkable and collections are unique',()=>{
  const found=new Set();
  BEACONS.forEach(b=>{assert.equal(blocked(b.x,b.z),false);assert.equal(collectNearby(b,found).length,1);assert.equal(collectNearby(b,found).length,0);});
  assert.equal(found.size,5);
});
test('every beacon is reachable from the plaza through collision-free routes',()=>{
  const p=createPlayer(),found=new Set();
  const targets=[[0,-2],[0,1],[25,1],[0,1],[0,-29],[0,-19.5],[-25,-19.5],[-31,-19.5],[-31,32],[-4,32],[-4,28]];
  for(const [x,z] of targets){
    let steps=0;
    while(Math.hypot(p.x-x,p.z-z)>.1&&steps++<10000){
      p.yaw=Math.atan2(-(x-p.x),-(z-p.z));p.turn=0;
      stepPlayer(p,new Set(['KeyW']),1/120);collectNearby(p,found);
      assert.ok(!blocked(p.x,p.z));
    }
    assert.ok(steps<10000,`route stalled at ${x}, ${z}`);p.vx=p.vz=0;
  }
  assert.equal(found.size,5);
});
test('building interiors are solid',()=>{BUILDINGS.forEach(([x,z])=>assert.equal(blocked(x,z),true));});
test('new planters are solid while center streets remain open',()=>{
  PLANTERS.forEach(([x,z])=>assert.equal(blocked(x,z),true));
  for(let z=-34;z<34;z++)assert.equal(blocked(0,z),false);
  for(let x=-33;x<33;x++)assert.equal(blocked(x,1),false);
});
