// Dev-only integration checks. Open /?verify to exercise the real render loop,
// DOM event handlers, WebGL depth, worker pixels, collision and collection UI.
import * as THREE from 'three';
import {createPlayer,BEACONS} from '../src/game.js';
import {separation,linkRow} from '../src/stereogram.js';
import {contrast} from './stereo-quality.js';
import {detectContours} from '../src/contours.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {prepareGeometry} from '../src/depth-frame.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const $=id=>document.getElementById(id);
const assert=(condition,message)=>{if(!condition)throw Error(message);};
function digest(a){let h=2166136261;for(let i=0;i<a.length;i+=17)h=Math.imul(h^a[i],16777619);return h>>>0;}
async function key(code,ms){window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));await wait(ms);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));await wait(300);}
async function until(predicate,message,timeout=8000){
  const deadline=performance.now()+timeout;
  while(!predicate()){assert(performance.now()<deadline,message);await wait(25);}
}
export async function runChecks({player,scene,found,stop,getWorld,getFrame,captureNormalColor}){
  const report=document.createElement('pre');report.id='verification';
  report.style.cssText='position:fixed;top:95px;left:16px;z-index:20;background:#10202bf5;color:#bbefc3;padding:16px;font:11px/1.65 monospace;max-height:65vh;max-width:660px;overflow:auto;pointer-events:none;border:1px solid #547b76;border-radius:8px';
  report.textContent='BROWSER INTEGRATION CHECKS\n';document.body.append(report);
  const results=[];
  async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail});report.textContent+=`PASS  ${name}${detail?' · '+detail:''}\n`;}catch(e){results.push({name,pass:false,error:e.message});report.textContent+=`FAIL  ${name} · ${e.message}\n`;}}
  const fixture=(position={})=>{stop();Object.assign(player,createPlayer(),position);};
  await check('quiet stereo has adjustable support and the rejected sparse experiment is outside the game',()=>{
    assert($('pattern').value==='quiet'&&$('surface-detail').value==='35','quiet defaults differ');
    assert(!$('invert-depth').checked,'parallel-view default must preserve foreground ordering');
    assert(![...$('pattern').options].some(o=>o.value==='surface'),'rejected sparse experiment must remain in the lab');
  });
  // Keep the established dense-depth checks as an unchanged reference, then
  // inspect experimental selected constraints separately below.
  $('invert-depth').checked=false;$('invert-depth').dispatchEvent(new Event('change'));
  $('pattern').value='scene';$('pattern').dispatchEvent(new Event('change'));
  for(let i=0;i<150&&getFrame()?.pattern!=='scene';i++)await wait(100);
  await check('stationary scene and stable pattern',async()=>{const a=getFrame();assert(a,'worker did not present a frame');const hash=digest(a.pixels);await wait(350);assert(digest(getFrame().pixels)===hash,'pattern changed without movement');assert(player.z===13&&player.yaw===0,'camera moved');return `${a.width} × ${a.height}`;});
  await check('GPU depth agrees with raycast geometry',()=>{
    const f=getFrame(),ray=new THREE.Raycaster(),v=new THREE.Vector3();let tested=0,maxError=0,sky=0;
    scene.updateMatrixWorld(true);f.camera.updateMatrixWorld(true);
    for(let gy=1;gy<8;gy++)for(let gx=1;gx<12;gx++){
      const x=Math.floor(gx*f.width/12),y=Math.floor(gy*f.height/8);
      ray.setFromCamera(new THREE.Vector2((x+.5)/f.width*2-1,1-(y+.5)/f.height*2),f.camera);
      const hits=ray.intersectObjects(scene.children,true).filter(h=>h.object.visible);
      const i=((f.height-1-y)*f.width+x)*4,z=(f.depth[i]*256+f.depth[i+1])/65535;
      if(!hits.length){assert(z===0,'sky is not far depth');sky++;continue;}
      v.copy(hits[0].point).applyMatrix4(f.camera.matrixWorldInverse);
      const expected=Math.exp(v.z/22),error=Math.abs(z-expected);maxError=Math.max(maxError,error);
      assert(error<.003,`depth error ${error} at ${x},${y}`);tested++;
    }
    assert(tested>25&&sky>0,'insufficient geometry/sky samples');return `${tested} surfaces, ${sky} sky, max error ${maxError.toFixed(6)}`;
  });
  await check('demo supplies scalar depth without material, color or normal metadata',()=>{
    const f=getFrame();
    for(let i=0;i<f.depth.length;i+=4)assert(f.depth[i+2]===0&&f.depth[i+3]===255,'host metadata leaked into the filter input');
    return 'RG depth only; B=0 and A=255 throughout';
  });
  await check('live stereo output agrees with the independent CPU reference',()=>{
    const f=getFrame(),filter=new DepthWalkFilter();
    const output=filter.render({depth:f.depth,color:f.color,width:f.width,height:f.height,format:'packed-proximity-rg16',origin:'bottom-left',verticalFov:f.camera.fov},{pixelRatio:f.width/innerWidth,pattern:f.pattern});
    if(f.backend!=='gpu'){
      for(let i=0;i<f.pixels.length;i++)assert(output.pixels[i]===f.pixels[i],`filter/worker mismatch at ${i}`);
      return `${f.pixels.length} exact CPU/worker pixels, no engine objects supplied`;
    }
    let absoluteError=0,exact=0;
    for(let y=0;y<f.height;y++){
      const z=Float32Array.from({length:f.width},(_,x)=>{const i=((f.height-1-y)*f.width+x)*4;return(f.depth[i]*256+f.depth[i+1])/65535;});
      const same=linkRow(z,f.spacing,f.strength,new Int32Array(f.width));
      for(let x=f.width-1;x>=0;x--){
        if(same[x]!==x)same[x]=same[same[x]];
        const at=y*f.width+x;assert(f.roots[at]===y*f.width+same[x],`GPU class mismatch at ${at}`);
        assert(f.pixels[at]===f.pixels[f.roots[at]],'GPU stereo class has unmatched colors');
        const a=output.pixels[at],b=f.pixels[at];exact+=a===b;
        for(const shift of [0,8,16])absoluteError+=Math.abs((a>>>shift&255)-(b>>>shift&255));
      }
    }
    const mae=absoluteError/(f.pixels.length*3);assert(mae<3,`GPU shading diverged from CPU: ${mae}`);
    return `${f.pixels.length} exact constraint roots; ${(100*exact/f.pixels.length).toFixed(2)}% exact RGB, mean channel difference ${mae.toFixed(3)}/255`;
  });
  await check('rendered city has correct stereo pixel pairs',()=>{
    const f=getFrame();let match=0,tested=0;
    const zAt=(x,y)=>{const i=((f.height-1-y)*f.width+x)*4;return(f.depth[i]*256+f.depth[i+1])/65535;};
    for(let y=8;y<f.height-8;y+=13)for(let x=f.spacing;x<f.width-f.spacing;x+=11){
      const z=zAt(x,y),s=separation(z,f.spacing,f.strength);
      if(Math.abs(zAt(x-8,y)-z)>.018||Math.abs(zAt(x+8,y)-z)>.018)continue;
      const l=x-(s>>1),r=l+s;tested++;match+=f.pixels[y*f.width+l]===f.pixels[y*f.width+r];
    }
    const rate=match/tested;assert(rate>.96,`matching ratio ${rate}`);return `${(rate*100).toFixed(2)}% of ${tested} interior pairs`;
  });
  $('begin').click();
  await check('live city retains strong dot contrast',()=>{
    const c=contrast(getFrame().pixels);assert(c.rms>.4,`contrast too low: ${c.rms}`);
    return `RMS contrast ${c.rms.toFixed(3)}`;
  });
  await check('optional scene-color input matches the actual normal render',()=>{
    const f=getFrame();
    assert(f.pattern==='scene'&&f.color,'scene-color mode/input missing');
    const expected=captureNormalColor();let error=0,exact=0;
    for(let i=0;i<f.color.length;i++){error+=Math.abs(f.color[i]-expected[i]);exact+=f.color[i]===expected[i];}
    const mean=error/f.color.length;assert(mean<.5,`scene copy was inverted, stale or color-transformed: ${mean}`);
    return `${(100*exact/f.color.length).toFixed(2)}% exact channels; mean difference ${mean.toFixed(4)}/255 including lighting/textures`;
  });
  await check('fine dots, wide spacing, strong depth and bold contours are the defaults',()=>{
    assert($('grain').value==='1'&&$('spacing').value==='120'&&$('strength').value==='50'&&$('edges').value==='2','viewing defaults differ');
    const dots=$('alignment').querySelectorAll('i');
    assert(Math.abs(dots[1].getBoundingClientRect().left-dots[0].getBoundingClientRect().left-120)<1,'guide dots do not match spacing');
  });
  await check('edge definition changes only contour classes and restores without camera motion',async()=>{
    const a=JSON.stringify(player),bold=getFrame(),hash=digest(bold.pixels);
    const packed=prepareGeometry({depth:bold.depth,width:bold.width,height:bold.height,format:'packed-proximity-rg16',origin:'bottom-left',verticalFov:bold.camera.fov},{pixelRatio:bold.width/innerWidth}).packed;
    const mask=detectContours(packed,bold.width,bold.height,bold.width/innerWidth);
    const count=mask.reduce((sum,v)=>sum+(v>0),0);
    assert(count>100&&count<mask.length*.2,`unexpected contour coverage: ${count/mask.length}`);
    $('edges').value='0';$('edges').dispatchEvent(new Event('change'));await wait(650);
    const plain=getFrame();let changed=0;
    for(let i=0;i<plain.pixels.length;i++)changed+=plain.pixels[i]!==bold.pixels[i];
    assert(changed>100&&changed<plain.pixels.length*.6,`unexpected changed pixel count ${changed}`);
    assert(digest(plain.depth)===digest(bold.depth),'contours moved the geometry');
    $('edges').value='1';$('edges').dispatchEvent(new Event('change'));await wait(650);
    assert(digest(getFrame().pixels)!==hash,'thin and bold contours should differ');
    $('edges').value='2';$('edges').dispatchEvent(new Event('change'));await wait(650);
    assert(digest(getFrame().pixels)===hash,'bold contours did not restore deterministically');assert(JSON.stringify(player)===a,'contours moved camera');
    return `${count} contour samples; ${(changed/plain.pixels.length*100).toFixed(1)}% of matching pixels emphasized`;
  });
  await check('scene/generated/classic styles preserve camera and restore source colors',async()=>{
    const a=JSON.stringify(player),hash=digest(getFrame().pixels),initial=$('pattern').value;
    $('pattern').value='geometry';$('pattern').dispatchEvent(new Event('change'));await until(()=>getFrame()?.pattern==='geometry','generated style was not presented');
    assert(digest(getFrame().pixels)!==hash,'generated and scene colors should differ');
    $('pattern').value='classic';$('pattern').dispatchEvent(new Event('change'));await until(()=>getFrame()?.pattern==='classic','classic style was not presented');
    assert(digest(getFrame().pixels)!==hash,'pattern style did not change');assert(JSON.stringify(player)===a,'pattern style moved camera');
    $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));await until(()=>getFrame()?.pattern===initial,'original style was not presented');
    assert(digest(getFrame().pixels)===hash,'DepthWalk style did not return deterministically');
  });
  await check('neutral pattern and dot size preserve pose and restore deterministically',async()=>{
    const a=JSON.stringify(player),hash=digest(getFrame().pixels),initial=$('pattern').value;
    $('pattern').value='mono';$('pattern').dispatchEvent(new Event('change'));await until(()=>getFrame()?.pattern==='mono','neutral style was not presented');
    const neutral=getFrame().pixels;
    for(let i=0;i<neutral.length;i+=113){const c=neutral[i];assert((c&255)===(c>>>8&255)&&(c&255)===(c>>>16&255),'neutral mode has color');}
    const neutralHash=digest(neutral);
    $('grain').value='2';$('grain').dispatchEvent(new Event('change'));await wait(500);
    assert(digest(getFrame().pixels)!==neutralHash,'dot size did not change');
    $('grain').value='1';$('grain').dispatchEvent(new Event('change'));
    $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));await until(()=>getFrame()?.pattern===initial,'original style was not presented');
    assert(digest(getFrame().pixels)===hash,'original pattern did not return');assert(JSON.stringify(player)===a,'viewing control moved camera');
  });
  await check('all views preserve camera pose',async()=>{
    const a=JSON.stringify(player);
    for(const view of ['normal','depth','stereo']){document.querySelector(`[data-view="${view}"]`).click();await wait(120);assert(JSON.stringify(player)===a,'view moved camera');}
  });
  await check('R cycles views and E cycles all styles without requesting mouse release',async()=>{
    const pose=JSON.stringify(player),initial=$('pattern').value,exit=document.exitPointerLock;let releases=0;
    document.exitPointerLock=()=>{releases++;};
    try{
      for(const view of ['normal','depth','stereo']){await key('KeyR',40);assert(document.querySelector('[data-view].selected').dataset.view===view,'R did not cycle view');}
      for(let i=0;i<$('pattern').options.length;i++)await key('KeyE',40);
      assert($('pattern').value===initial,'E did not cycle all patterns');assert(releases===0,'hotkey requested pointer release');assert(JSON.stringify(player)===pose,'hotkeys moved the camera');
    }finally{document.exitPointerLock=exit;}
    return 'no Pointer Lock exit calls; pose preserved (actual capture requires a permitted browser)';
  });
  await check('GPU/CPU renderer switching preserves position and restores stereo output',async()=>{
    const a=JSON.stringify(player),initial=$('backend').value,frame=getFrame(),hash=digest(frame.pixels);
    $('backend').value='cpu';$('backend').dispatchEvent(new Event('change'));await wait(800);
    assert(!getFrame().backend,'CPU renderer was not selected');assert(JSON.stringify(player)===a,'renderer switch moved camera');
    $('backend').value=initial;$('backend').dispatchEvent(new Event('change'));await wait(800);
    assert(digest(getFrame().pixels)===hash,'renderer did not restore stable pixels');
    return frame.backend==='gpu'?'WebGPU → CPU → WebGPU':'CPU fallback retained';
  });
  await check('quiet mode updates support, preserves all classes and reproduces CPU source fitting',async()=>{
    const pose=JSON.stringify(player),initial=$('pattern').value,initialSupport=$('surface-detail').value;
    for(const pattern of ['quiet']){
      $('pattern').value=pattern;$('pattern').dispatchEvent(new Event('change'));await wait(1000);
      const frame=getFrame();assert(frame.pattern===pattern&&frame.color,'surface frame/color missing');
      const reference=new DepthWalkFilter().render({depth:frame.depth,color:frame.color,width:frame.width,height:frame.height,format:'packed-proximity-rg16',origin:'bottom-left',verticalFov:frame.camera.fov},{pattern,pixelRatio:frame.width/innerWidth,surfaceDetail:Number($('surface-detail').value)/100}).pixels;
      let error=0;for(let i=0;i<reference.length;i++){
        if(frame.roots)assert(frame.pixels[i]===frame.pixels[frame.roots[i]],'a selected stereo class has mismatching colors');
        for(const shift of [0,8,16])error+=Math.abs((reference[i]>>>shift&255)-(frame.pixels[i]>>>shift&255));
      }
      assert(error/(reference.length*3)<.6,'CPU/GPU surface image diverged');
      const before=digest(frame.pixels);$('surface-detail').value='10';$('surface-detail').dispatchEvent(new Event('input'));await wait(700);
      assert(digest(getFrame().pixels)!==before,'support did not change the image');
      $('surface-detail').value=initialSupport;$('surface-detail').dispatchEvent(new Event('input'));await wait(700);
      assert(digest(getFrame().pixels)===before,'support change did not restore stable pixels');
    }
    $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));await wait(700);assert(JSON.stringify(player)===pose,'surface mode moved camera');
    return 'support restores deterministically; complete stereo class RGB exact';
  });
  await check('Quiet shimmer comparison is opt-in, preserves pose and restores baseline',async()=>{
    const initial=$('pattern').value,pose=JSON.stringify(player),enabled=$('quiet-stability').checked;
    try{
      $('pattern').value='quiet';$('pattern').dispatchEvent(new Event('change'));
      $('quiet-stability').checked=false;$('quiet-stability').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.pattern==='quiet'&&!getFrame().temporalStability,'Quiet baseline was not presented');
      const baseline=digest(getFrame().pixels);
      assert(!$('quiet-motion-controls').hidden&&!$('quiet-stability').disabled,'Quiet toggle is unavailable');
      $('quiet-stability').checked=true;$('quiet-stability').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.temporalStability,'Quiet history was not enabled');
      assert(digest(getFrame().pixels)===baseline,'enabling history changed the stationary baseline');
      await wait(350);assert(digest(getFrame().pixels)===baseline,'Quiet history drifts while stationary');
      $('quiet-stability').checked=false;$('quiet-stability').dispatchEvent(new Event('change'));
      await until(()=>!getFrame()?.temporalStability,'Quiet history did not disable');
      assert(digest(getFrame().pixels)===baseline,'disabling history failed to restore baseline');
      assert(JSON.stringify(player)===pose,'Quiet comparison moved camera');
      return 'on/off reaches renderer; unchanged stationary pixels and camera';
    }finally{
      $('quiet-stability').checked=enabled;$('quiet-stability').dispatchEvent(new Event('change'));
      $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));
    }
  });
  await check('depth direction reverses live relief on this backend, preserves pose and restores output',async()=>{
    const initial=$('pattern').value,pose=JSON.stringify(player),oldDirection=$('invert-depth').checked;
    try{
      $('pattern').value='quiet';$('pattern').dispatchEvent(new Event('change'));
      $('invert-depth').checked=false;$('invert-depth').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.pattern==='quiet'&&getFrame().invertDepth===false,'original direction did not present');
      const original=digest(getFrame().pixels);
      $('invert-depth').checked=true;$('invert-depth').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.invertDepth===true,'reversed direction did not present');
      const frame=getFrame(),reversed=digest(frame.pixels);
      assert(original!==reversed,'direction switch did not change pixels');
      const expected=new DepthWalkFilter().render({depth:frame.depth,color:frame.color,width:frame.width,height:frame.height,format:'packed-proximity-rg16',origin:'bottom-left',verticalFov:frame.camera.fov},{pattern:'quiet',pixelRatio:frame.width/innerWidth,surfaceDetail:Number($('surface-detail').value)/100,invertDepth:true}).pixels;
      let error=0;for(let i=0;i<expected.length;i++)for(const shift of [0,8,16])error+=Math.abs((expected[i]>>>shift&255)-(frame.pixels[i]>>>shift&255));
      assert(error/(expected.length*3)<.02,'live reversed output differs from CPU reference');
      $('invert-depth').checked=false;$('invert-depth').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.invertDepth===false,'original direction did not restore');
      assert(digest(getFrame().pixels)===original,'switching back changed original pixels');
      assert(JSON.stringify(player)===pose,'direction control moved camera');
      return 'reversed pixels match CPU reference; exact restoration; pose retained';
    }finally{
      $('invert-depth').checked=oldDirection;$('invert-depth').dispatchEvent(new Event('change'));
      $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.pattern===initial&&getFrame().invertDepth===oldDirection,'direction test cleanup did not present');
    }
  });
  await check('dark ink and wider spacing reach the renderer, retain pose and restore baseline',async()=>{
    const initial=$('pattern').value,edge=$('edges').value,spacing=$('spacing').value,pose=JSON.stringify(player);
    try{
      $('pattern').value='quiet';$('pattern').dispatchEvent(new Event('change'));
      $('edges').value='2';$('edges').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.pattern==='quiet'&&getFrame().edges===2,'baseline was not presented');
      const before=digest(getFrame().pixels);
      $('edges').value='3';$('edges').dispatchEvent(new Event('change'));
      $('spacing').value='180';$('spacing').dispatchEvent(new Event('input'));
      await until(()=>getFrame()?.edges===3&&getFrame().spacing===Math.round(180*getFrame().width/innerWidth),'ink/wide settings did not present');
      const f=getFrame(),expected=new DepthWalkFilter().render({depth:f.depth,color:f.color,width:f.width,height:f.height,format:'packed-proximity-rg16',origin:'bottom-left',verticalFov:f.camera.fov},{pattern:'quiet',spacing:180,edges:3,pixelRatio:f.width/innerWidth,surfaceDetail:Number($('surface-detail').value)/100,invertDepth:f.invertDepth}).pixels;
      let error=0;for(let i=0;i<expected.length;i++)for(const s of [0,8,16])error+=Math.abs((expected[i]>>>s&255)-(f.pixels[i]>>>s&255));
      assert(error/(expected.length*3)<.05,'live ink differs from CPU reference');
      const ink=digest(f.pixels);assert(ink!==before,'style did not change');await wait(350);assert(digest(getFrame().pixels)===ink,'ink drifts while stationary');
      $('edges').value='2';$('edges').dispatchEvent(new Event('change'));
      $('spacing').value=spacing;$('spacing').dispatchEvent(new Event('input'));
      await until(()=>getFrame()?.edges===2&&getFrame().spacing===Math.round(Number(spacing)*getFrame().width/innerWidth),'baseline did not return');
      assert(digest(getFrame().pixels)===before,'baseline pixels changed');assert(JSON.stringify(player)===pose,'style moved camera');
      return 'live CPU reference parity; stationary ink; exact baseline restoration; full image';
    }finally{
      $('edges').value=edge;$('edges').dispatchEvent(new Event('change'));$('spacing').value=spacing;$('spacing').dispatchEvent(new Event('input'));
      $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));
    }
  });
  await check('paired-color experiment preserves pose, source orientation and CPU/GPU output',async()=>{
    const initial=$('pattern').value,pose=JSON.stringify(player);
    try{
    $('pattern').value='chroma';$('pattern').dispatchEvent(new Event('change'));await wait(1200);
    const f=getFrame();assert(f.pattern==='chroma'&&f.color,'local source-color capture missing');
    assert($('edges').disabled,'copied contour accents should be disabled in local mode');
    const expected=new DepthWalkFilter().render({depth:f.depth,color:f.color,width:f.width,height:f.height,format:'packed-proximity-rg16',origin:'bottom-left',verticalFov:f.camera.fov},{pattern:'chroma',pixelRatio:f.width/innerWidth,surfaceDetail:Number($('surface-detail').value)/100,temporalStability:true}).pixels;
    let error=0;for(let i=0;i<expected.length;i++)for(const shift of [0,8,16])error+=Math.abs((expected[i]>>>shift&255)-(f.pixels[i]>>>shift&255));
    assert(error/(expected.length*3)<.02,'local GPU pixels differ from CPU source-color calculation');
    const hash=digest(f.pixels);await wait(350);assert(hash===digest(getFrame().pixels),'stationary local-color shimmer');
    assert($('motion-stability').checked,'motion stability should be enabled');
    await key('KeyW',400);await key('KeyQ',250);
    await until(()=>player.vx===0&&player.vz===0&&player.turn===0,'camera did not settle after release');
    // Worker/readback latency varies. Compare completed frames from the exact
    // stopped pose, rather than a possibly still-in-flight movement frame.
    // Camera.clone converts quaternion back to Euler angles; allow roundoff only.
    const atRest=()=>{const c=getFrame()?.camera;return c&&Math.max(Math.abs(c.position.x-player.x),Math.abs(c.position.z-player.z),Math.abs(c.rotation.y-player.yaw),Math.abs(c.rotation.x-player.pitch))<1e-12;};
    await until(atRest,'renderer did not present the stopped camera');
    let frame=getFrame();const stoppedFrame=frame,stopped=digest(frame.pixels),depth=digest(frame.depth);
    for(let i=0;i<3;i++){
      await until(()=>getFrame()!==frame,'renderer stopped presenting frames');frame=getFrame();
      assert(atRest(),`stopped camera changed: ${JSON.stringify({player,camera:{x:frame.camera.position.x,z:frame.camera.position.z,yaw:frame.camera.rotation.y,pitch:frame.camera.rotation.x}})}`);
      if(digest(frame.depth)!==depth){
        let changed=0,max=0;const samples=[];
        for(let j=0;j<frame.depth.length;j+=4)if(frame.depth[j]!==stoppedFrame.depth[j]||frame.depth[j+1]!==stoppedFrame.depth[j+1]){
          const a=stoppedFrame.depth[j]*256+stoppedFrame.depth[j+1],b=frame.depth[j]*256+frame.depth[j+1];changed++;max=Math.max(max,Math.abs(a-b));if(samples.length<4)samples.push([j/4,a,b]);
        }
        const matrixDelta=Math.max(...frame.camera.matrixWorld.elements.map((v,j)=>Math.abs(v-stoppedFrame.camera.matrixWorld.elements[j])));
        throw Error(`stationary depth changed: ${JSON.stringify({changed,max,samples,matrixDelta,poses:[stoppedFrame.camera.rotation.toArray(),frame.camera.rotation.toArray()]})}`);
      }
      assert(stopped===digest(frame.pixels),'texture drifts across identical stopped-camera frames');
    }
    }finally{
      stop();Object.assign(player,JSON.parse(pose));
      $('pattern').value=initial;$('pattern').dispatchEvent(new Event('change'));await wait(700);
    }
    assert(JSON.stringify(player)===pose&&!$('edges').disabled,'local-color exit did not preserve pose/restore controls');
    return 'aligned source colors; CPU match; stability enabled; no texture drift after walking/turning/stopping; pose restored';
  });
  await check('active stereo renderer follows walking and turning without stationary drift',async()=>{
    const initial=getFrame(),pixels=digest(initial.pixels),depth=digest(initial.depth);
    await key('KeyW',750);assert(digest(getFrame().depth)!==depth,'walking did not update stereo depth');
    const walked=digest(getFrame().depth);await key('KeyQ',450);assert(digest(getFrame().depth)!==walked,'turning did not update stereo depth');
    fixture();await wait(700);assert(digest(getFrame().pixels)===pixels,'returning to the pose did not restore the pattern');
    return initial.backend==='gpu'?'WebGPU camera/depth/pattern update':'CPU camera/depth/pattern update';
  });
  // Movement fixture resets isolate individual controls; these are test-only.
  document.querySelector('[data-view="normal"]').click();
  // The first diagnostic WebGL view may compile after GPU play. Leave enough
  // real key-held time for useful travel even if that startup delays a frame.
  await check('W/S forward and backward DOM controls',async()=>{fixture();await key('KeyW',750);assert(player.z<12,`W did not move: z=${player.z}`);fixture();await key('KeyS',750);assert(player.z>14,`S did not move: z=${player.z}`);});
  await check('A/D strafe DOM controls',async()=>{fixture();await key('KeyA',450);assert(player.x<-1,'A did not strafe');fixture();await key('KeyD',450);assert(player.x>1,'D did not strafe');});
  await check('arrow turn DOM controls',async()=>{fixture();await key('ArrowLeft',500);assert(player.yaw>.25,'left arrow did not turn');fixture();await key('ArrowRight',500);assert(player.yaw<-.25,'right arrow did not turn');});
  await check('Shift sprint is faster and key release returns to walking',async()=>{
    fixture();await key('KeyW',650);const walked=13-player.z;fixture();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',bubbles:true}));await key('KeyW',650);
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',bubbles:true}));const ran=13-player.z;
    assert(ran>walked*1.7&&ran<walked*2.3,`sprint ratio ${ran/walked}`);
    // Do not reset the fixture here: stop() would clear Shift and conceal a
    // latched key. Check released-Shift walking speed instead of timer distance.
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
    let walkSpeed;
    try{await wait(500);walkSpeed=Math.hypot(player.vx,player.vz);assert(walkSpeed>2.7&&walkSpeed<3.05,`released-Shift walking speed ${walkSpeed}`);}
    finally{window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));await wait(300);}
    return `${(ran/walked).toFixed(2)}× walking distance; ${walkSpeed.toFixed(2)} walking speed after Shift release`;
  });
  await check('Escape clears held movement immediately',async()=>{
    fixture();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));await wait(200);
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));const z=player.z;await wait(300);
    assert(player.z===z&&player.vz===0,'Escape did not stop held movement');
  });
  await check('focusing viewing controls clears held movement before tuning',async()=>{
    fixture();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));await wait(200);
    $('quality').focus();const z=player.z;await wait(250);
    assert(player.z===z&&player.vz===0,'movement continued while tuning');
    $('quality').blur();await wait(150);assert(player.z===z,'old held key resumed after leaving control');
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));
  });
  await check('building collision in the running game',async()=>{fixture();await key('KeyD',3200);assert(player.x>7.3&&player.x<7.53,`collision x=${player.x}`);return `stopped at x=${player.x.toFixed(3)}`;});
  await check('HUD hide and restore',()=>{$('hide').click();assert($('interface').hidden,'HUD did not hide');$('show-hud').click();assert(!$('interface').hidden,'HUD did not restore');});
  await check('guide pauses movement',async()=>{fixture();$('help').click();await key('KeyW',300);assert(player.z===13,'moved with guide open');$('begin').click();});
  await check('five walk-in collections and completion UI',async()=>{
    for(const b of BEACONS){fixture({x:b.x-2.1,z:b.z,yaw:-Math.PI/2});await key('KeyW',420);}
    assert(found.size===5,`collected ${found.size}`);assert($('count').textContent==='5','counter did not update');assert(!$('complete').hidden,'completion message missing');
    $('keep-walking').click();assert($('complete').hidden,'continue did not dismiss completion');
  });
  fixture();document.querySelector('[data-view="stereo"]').click();
  await check('central stereo sizes preserve pose and the outer original render',async()=>{
    const pose=JSON.stringify(player);
    for(const periods of [2,3,4]){
      $('stereo-window').value=String(periods);$('stereo-window').dispatchEvent(new Event('change'));
      await until(()=>getFrame()?.windowPeriods===periods,'window did not present');
      const f=getFrame(),size=Math.min(f.width,periods*f.spacing),left=Math.floor((f.width-size)/2),right=left+size;
      assert(f.color,'normal color missing');assert(JSON.stringify(player)===pose,'window selection moved player');
      for(let y=0;y<f.height;y+=13)for(let x=0;x<f.width;x+=11)if(x<left||x>=right){
        const at=((f.height-1-y)*f.width+x)*4,expected=(0xff000000|f.color[at]|f.color[at+1]<<8|f.color[at+2]<<16)>>>0;
        assert(f.pixels[y*f.width+x]===expected,'outside differs from aligned normal render');
      }
    }
    $('stereo-window').value='0';$('stereo-window').dispatchEvent(new Event('change'));
    await until(()=>getFrame()?.windowPeriods===0,'full image did not restore');
    return '2/3/4 widths; exact outside RGB; no camera changes';
  });
  await check('reset viewing settings preserves the walk and restores the saved baseline controls',async()=>{
    const ids=['stereo-window','pattern','grain','edges','quality','spacing','strength','surface-detail','motion-stability','quiet-stability','invert-depth'];
    const saved=Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])),pose=JSON.stringify(player),collected=[...found];
    try{
      $('edges').value='3';$('edges').dispatchEvent(new Event('change'));$('spacing').value='180';$('spacing').dispatchEvent(new Event('input'));
      $('reset-viewing').click();
      assert($('edges').value==='2'&&$('spacing').value==='120'&&$('pattern').value==='quiet'&&!$('invert-depth').checked,'baseline controls were not restored');
      assert($('spacing-value').textContent==='120 px'&&$('strength-value').textContent==='50%','readouts are stale');
      await until(()=>getFrame()?.pattern==='quiet'&&getFrame().edges===2&&getFrame().invertDepth===false,'reset did not reach renderer');
      assert(JSON.stringify(player)===pose&&JSON.stringify([...found])===JSON.stringify(collected),'reset altered the walk');
      return 'default controls, live rendering, labels, camera and collected beacons';
    }finally{
      for(const [id,value] of Object.entries(saved)){if(typeof value==='boolean')$(id).checked=value;else $(id).value=value;if($(id).type==='range')$(id).dispatchEvent(new Event('input'));$(id).dispatchEvent(new Event('change'));}
    }
  });
  await check('closing F3 restores normal and depth views without moving the camera',async()=>{
    const pose=JSON.stringify(player);
    try{
      for(const view of ['normal','depth']){
        document.querySelector(`[data-view="${view}"]`).click();$('debug-open').click();
        await until(()=>$('stereo-debug')?.open&&document.querySelector('[data-view="stereo"]').getAttribute('aria-pressed')==='true','debug capture did not open');
        $('debug-close').click();
        assert(!$('stereo-debug').open,'debugger remained open');
        assert(document.querySelector(`[data-view="${view}"]`).getAttribute('aria-pressed')==='true','previous view was lost');
        assert(JSON.stringify(player)===pose,'debugger moved the camera');
      }
    }finally{document.querySelector('[data-view="stereo"]').click();}
    return 'normal/depth views restored after capture cancellation';
  });
  await check('F3 records captured settings and exports exact native PNG pixels',async()=>{
    const saved={quality:$('quality').value,edges:$('edges').value,spacing:$('spacing').value,strength:$('strength').value},createURL=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
    let blob,filename;
    try{
      $('quality').value='0.5';$('quality').dispatchEvent(new Event('change'));
      $('edges').value='3';$('edges').dispatchEvent(new Event('change'));
      $('spacing').value='123';$('spacing').dispatchEvent(new Event('input'));
      $('strength').value='27';$('strength').dispatchEvent(new Event('input'));
      const link=new URL($('quiet-comparison').href);
      assert(link.searchParams.get('edges')==='3'&&link.searchParams.get('spacing')==='123'&&link.searchParams.get('strength')==='0.27','comparison lost tuning');
      $('debug-open').click();await until(()=>$('stereo-debug')?.dataset.complete==='true','F3 analysis failed or timed out',30000);
      const result=JSON.parse($('stereo-debug').dataset.report),canvas=$('debug-source');
      assert(result.renderSettings.edges===3&&result.renderSettings.dotSize===1&&result.renderSettings.depthRange===22&&result.renderSettings.verticalFov===62,'capture metadata missing');
      assert(result.calibration.spacing===Math.round(123*result.renderSettings.pixelRatio)&&result.calibration.strength===.27,'calibration differs from captured pixels');
      assert(!('build' in result.performance),'stale build label');
      assert(!$('debug-png').disabled,'PNG export unavailable');
      // Exercise the real button/encoder, intercept only the OS download action.
      URL.createObjectURL=value=>{blob=value;return createURL.call(URL,value);};
      HTMLAnchorElement.prototype.click=function(){filename=this.download;};
      $('debug-png').click();await until(()=>!!filename,'PNG download was not requested');
      assert(filename==='depthwalk-stereo.png'&&blob.type==='image/png','wrong export');
      const decoded=await createImageBitmap(blob),copy=document.createElement('canvas');copy.width=decoded.width;copy.height=decoded.height;copy.getContext('2d').drawImage(decoded,0,0);decoded.close();
      assert(copy.width===canvas.width&&copy.height===canvas.height,'export was rescaled');
      const actual=copy.getContext('2d').getImageData(0,0,copy.width,copy.height).data,expected=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      assert(actual.every((v,i)=>v===expected[i]),'export differs from native capture');
      return `${canvas.width}×${canvas.height} lossless pixels; captured settings; calibrated comparison link`;
    }finally{
      URL.createObjectURL=createURL;HTMLAnchorElement.prototype.click=click;$('debug-close')?.click();
      for(const [id,value] of Object.entries(saved)){$(id).value=value;$(id).dispatchEvent(new Event($(id).type==='range'?'input':'change'));}
    }
  });
  await check('demo switching preserves pose, signals, settings and backend',async()=>{
    stop();
    const before=JSON.stringify(player),signals=[...found].join(','),start=$('demo').value;
    const controls=['pattern','spacing','strength','surface-detail','edges','grain','quality','backend'];
    const settings=controls.map(id=>$(id).value).join('/'),backend=$('performance').dataset.backend;
    for(const choice of [start==='retro'?'original':'retro',start]){
      const prior=getFrame();$('demo').value=choice;$('demo').dispatchEvent(new Event('change'));
      await until(()=>!$('demo').disabled&&getFrame()&&getFrame()!==prior,'new world did not render',15000);
      assert(JSON.stringify(player)===before&&[...found].join(',')===signals,'game state changed');
      assert(controls.map(id=>$(id).value).join('/')===settings,'viewing settings changed');
      assert($('performance').dataset.backend===backend,'backend changed');
      assert(getWorld().beaconMeshes.every((beacon,i)=>beacon.visible===!found.has(i)),'collected signals reappeared');
      for(const id of ['quiet-comparison','banding-comparison'])assert(new URL($(id).href).searchParams.get('world')===choice,'comparison lost selected world');
    }
    return 'both directions; new stereo frames; source world carried into comparisons';
  });
  report.dataset.results=JSON.stringify(results);report.dataset.complete='true';
  report.textContent+=`\n${results.filter(r=>r.pass).length}/${results.length} passed. Fullscreen and pointer lock require real clicks.\n`;
}
