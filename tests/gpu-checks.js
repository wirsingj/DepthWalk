import {DepthWalkGPU} from '../src/gpu/depthwalk-gpu.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {linkRow,separation} from '../src/stereogram.js';
import {contrast,correlation} from './stereo-quality.js';
import {linearLuminance} from '../src/chroma-stereo.js';
const report=document.getElementById('results'),results=[];
const assert=(pass,message)=>{if(!pass)throw Error(message);};
async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail});}catch(error){results.push({name,pass:false,error:error.message});}report.textContent=JSON.stringify(results,null,2);}
try{
  if(!navigator.gpu)throw Error('WebGPU unavailable');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No GPU adapter');
  const device=await adapter.requestDevice(),validationErrors=[];device.addEventListener('uncapturederror',e=>{validationErrors.push(e.error.message);report.textContent+='\nGPU ERROR: '+e.error.message;});
  const format=navigator.gpu.getPreferredCanvasFormat(),context=document.getElementById('preview').getContext('webgpu');context.configure({device,format,alphaMode:'opaque'});
  const filter=await DepthWalkGPU.create(device,format),cpu=new DepthWalkFilter();
  const width=1000,height=220,input=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});filter.resize(width,height,input.createView());
  function source(fn){
    const depth=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const q=Math.round(fn(x,y)*65535),i=(y*width+x)*4;depth[i]=q>>8;depth[i+1]=q&255;depth[i+3]=255;}return depth;
  }
  async function render(depth,settings={}){
    device.queue.writeTexture({texture:input},depth,{bytesPerRow:width*4},[width,height]);
    const encoder=device.createCommandEncoder();filter.encode(encoder,context.getCurrentTexture().createView(),settings);device.queue.submit([encoder.finish()]);return filter.readDiagnostics();
  }
  await check('GPU flat depths have only the intended stereo correlation',async()=>{
    for(const z of [0,.15,.5,.85,1]){
      const {pixels}=await render(source(()=>z));const shift=separation(z,120,.5);
      assert(correlation(pixels,width,height,shift)>.999,'wrong GPU disparity at '+z);assert(contrast(pixels).rms>.43,'weak GPU contrast');
      for(let s=80;s<=120;s++)if(Math.abs(s-shift)>2)assert(Math.abs(correlation(pixels,width,height,s))<.16,'false GPU peak at '+s);
    }return '5 depths; exact intended correlation and strong contrast';
  });
  await check('GPU union classes match the CPU occlusion solver exactly',async()=>{
    for(const [fixtureIndex,fixture] of [(x,y)=>Math.hypot(x-500,y-110)>38&&Math.hypot(x-500,y-110)<82?.95:.05,(x,y)=>x>350&&x<650&&y>30&&y<190?.85:.1,(x,y)=>.4+.3*Math.sin(x/70)*Math.cos(y/20)].entries()){
      const depth=source(fixture),gpu=await render(depth);
      for(let y=0;y<height;y++){
        const z=Float32Array.from({length:width},(_,x)=>(depth[(y*width+x)*4]*256+depth[(y*width+x)*4+1])/65535),accepted=new Uint8Array(width),same=linkRow(z,120,.5,new Int32Array(width),null,accepted);
        for(let x=0;x<width;x++){
          const s=separation(z[x],120,.5),l=x-(s>>1),pair=accepted[x]?((l|((l+s)<<16))>>>0):0xffffffff;
          assert(pair===gpu.pairs[y*width+x],`fixture ${fixtureIndex} pair mismatch ${x},${y}: GPU ${gpu.pairs[y*width+x]}, CPU ${pair}, q ${gpu.geometry[y*width+x]&65535}, z ${z[x]}`);
        }
        for(let x=width-1;x>=0;x--){if(same[x]!==x)same[x]=same[same[x]];assert(gpu.roots[y*width+x]===y*width+same[x],`fixture ${fixtureIndex} root mismatch at ${x},${y}: GPU ${gpu.roots[y*width+x]-y*width}, CPU ${same[x]}`);}
      }
      const again=await render(depth);assert(gpu.pixels.every((v,i)=>v===again.pixels[i]),'GPU stationary shimmer');
    }return '660,000 root labels; overlaps, annulus and curved depths; stable pixels';
  });
  await check('GPU coloring agrees with the portable filter on planar depth',async()=>{
    for(const pattern of ['geometry','classic','mono']){
      const depth=source(()=>.5),gpu=await render(depth,{pattern}),expected=cpu.render({width,height,depth,format:'packed-proximity-rg16'},{pattern}).pixels;
      assert(gpu.pixels.every((v,i)=>v===expected[i]),'color mismatch in '+pattern);
    }return 'all three styles; exact RGB equality';
  });
  await check('GPU constraints and seed sizing follow all viewing controls',async()=>{
    const depth=source((x,y)=>.4+.3*Math.sin(x/70)*Math.cos(y/20));
    for(const settings of [{pixelRatio:.5,depthStrength:.32,edges:0,dotSize:3},{pixelRatio:1.5,edges:1,dotSize:2},{pixelRatio:2,spacing:48,depthStrength:.1},{depthStrength:0},{depthStrength:.0004}]){
      const gpu=await render(depth,settings),spacing=Math.round((settings.spacing??120)*(settings.pixelRatio??1)),strength=settings.depthStrength??.5;
      for(let y=0;y<height;y++){
        const z=Float32Array.from({length:width},(_,x)=>(depth[(y*width+x)*4]*256+depth[(y*width+x)*4+1])/65535),same=linkRow(z,spacing,strength,new Int32Array(width));
        for(let x=width-1;x>=0;x--){if(same[x]!==x)same[x]=same[same[x]];assert(gpu.roots[y*width+x]===y*width+same[x],'scaled GPU root mismatch');}
      }
      const flat=source(()=>.5),actual=await render(flat,settings),expected=cpu.render({width,height,depth:flat,format:'packed-proximity-rg16'},settings).pixels;
      assert(actual.pixels.every((v,i)=>v===expected[i]),'scaled GPU seed or palette mismatch');
    }return '5 settings combinations, 1.1 million exact root labels';
  });
  await check('GPU scene-color mode falls back to generated colors without an optional input',async()=>{
    const depth=source(()=>.5),a=await render(depth,{pattern:'scene'}),b=await render(depth,{pattern:'geometry'});
    assert(a.pixels.every((v,i)=>v===b.pixels[i]),'missing color texture changed fallback output');return 'exact generated-color fallback';
  });
  await check('GPU pixel-only readback equals full diagnostics in dense and paired modes',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    try{
      const color=new Uint8Array(width*height*4).fill(128);device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);
      filter.resize(width,height,input.createView(),texture.createView());
      for(const pattern of ['quiet','chroma']){
        const full=await render(source((x,y)=>x>350&&x<650&&y>30&&y<190?.85:.1),{pattern});
        const pixels=await filter.readPixels();
        assert(pixels.length===full.pixels.length&&pixels.every((v,i)=>v===full.pixels[i]),'pixel-only readback differs in '+pattern);
      }
    }finally{filter.resize(width,height,input.createView());texture.destroy();}
    return 'Exact native RGBA equality with 50% / 75% less mapped data';
  });
  await check('GPU scene colors match CPU coloring and preserve every class across overlaps',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:((Math.floor(i/4)%width*13+Math.floor(i/4/width)*7+(i%4)*79)%256));
    device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);filter.resize(width,height,input.createView(),texture.createView());
    const depth=source((x,y)=>x>350&&x<650&&y>30&&y<190?.85:.1),settings={pattern:'scene'},a=await render(depth,settings),b=await render(depth,settings);
    const expected=cpu.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
    let error=0;
    for(let i=0;i<a.pixels.length;i++){
      assert(a.pixels[i]===a.pixels[a.roots[i]],'scene color broke a stereo class');assert(a.pixels[i]===b.pixels[i],'parallel scene-color sums shimmered');
      for(const shift of [0,8,16])error+=Math.abs((a.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));
    }
    const mean=error/(a.pixels.length*3);assert(mean<.02,`CPU/GPU scene-color difference ${mean}`);assert(contrast(a.pixels).rms>.45,'scene texture weakened dot contrast');
    filter.resize(width,height,input.createView());texture.destroy();return `220,000 exact classes; deterministic RGB; mean CPU difference ${mean.toFixed(5)}/255`;
  });
  await check('GPU surface and quiet modes preserve support classes and agree with CPU color fitting',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)color.set(x%101<2?[20,30,40,255]:x>350&&x<650?[185,155,65,255]:[60,105,140,255],(y*width+x)*4);
    device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);filter.resize(width,height,input.createView(),texture.createView());
    const depth=source((x,y)=>x>350&&x<650&&y>30&&y<190?.85:.1);let worst=0,selected=0;
    for(const pattern of ['surface','quiet'])for(const setting of [{surfaceDetail:.65},{surfaceDetail:0,pixelRatio:.5,edges:0},{surfaceDetail:1,pixelRatio:1.5,depthStrength:.32,dotSize:2}]){
      const settings={pattern,...setting},a=await render(depth,settings),b=await render(depth,settings),expected=cpu.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
      let error=0;for(let i=0;i<a.pixels.length;i++){
        assert(a.pixels[i]===a.pixels[a.roots[i]],'surface support class has unequal RGB');assert(a.pixels[i]===b.pixels[i],'surface colors shimmer while stationary');
        for(const shift of [0,8,16])error+=Math.abs((a.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));
      }
      const mean=error/(a.pixels.length*3);worst=Math.max(worst,mean);assert(mean<.04,`${pattern} CPU/GPU error ${mean}`);
      if(pattern==='surface'&&setting.surfaceDetail===.65){selected=a.pairs.reduce((n,p)=>n+Number(p!==0xffffffff),0);assert(selected>width*height*.1&&selected<width*height*.5,'sparse constraints not applied');}
    }
    filter.resize(width,height,input.createView());texture.destroy();return `6 settings; stationary equality; ${selected} sparse pairs; worst mean CPU error ${worst.toFixed(5)}/255`;
  });
  await check('GPU temporal carrier agrees with CPU, reduces motion changes and holds current disparity',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),color=new Uint8Array(width*height*4).fill(128);
    for(let i=3;i<color.length;i+=4)color[i]=255;
    device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);filter.resize(width,height,input.createView(),texture.createView());
    const stable=await DepthWalkGPU.create(device,format),cpuStable=new DepthWalkFilter();stable.resize(width,height,input.createView(),texture.createView());
    const settings={pattern:'chroma',surfaceDetail:.65,temporalStability:true};let before,old,baseChange=0,stableChange=0,worst=0;
    const renderStable=async()=>{const encoder=device.createCommandEncoder();stable.encode(encoder,context.getCurrentTexture().createView(),settings);device.queue.submit([encoder.finish()]);return stable.readDiagnostics();};
    for(let t=0;t<16;t++){
      const depth=source((x,y)=>{const dx=x-(430+t),radius=110+Math.abs(y-height/2)*.4;return Math.abs(dx)<radius?.6+.24*(1-Math.abs(dx)/radius):.12;});
      const plain=await render(depth,{pattern:'chroma',surfaceDetail:.65}),now=await renderStable(),expected=cpuStable.render({depth,color,width,height,format:'packed-proximity-rg16'},settings).pixels;
      let error=0;for(let i=0;i<now.pixels.length;i++){
        assert(now.pixels[i]===now.pixels[now.roots[i]],'temporal carrier broke current depth');
        error+=Math.abs((now.pixels[i]&255)-(expected[i]&255));
        if(old){baseChange+=((plain.pixels[i]&255)-(before.pixels[i]&255))**2;stableChange+=((now.pixels[i]&255)-(old.pixels[i]&255))**2;}
      }
      worst=Math.max(worst,error/now.pixels.length);old=now;before=plain;
    }
    const again=await renderStable();assert(again.pixels.every((v,i)=>v===old.pixels[i]),'temporal pixels drift after stopping');
    const ratio=Math.sqrt(stableChange/baseChange);assert(ratio<.85,`motion RMS ratio ${ratio}`);assert(worst<.02,`temporal CPU/GPU error ${worst}`);
    stable.destroy();filter.resize(width,height,input.createView());texture.destroy();
    return `16 moving frames; brightness-change RMS ratio ${ratio.toFixed(4)}; mean CPU error ${worst.toFixed(5)}/255; exact current grayscale pairs; stable after stopping`;
  });
  await check('GPU Quiet history preserves colored pairs, CPU parity and stationary output',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:[100,130,160][i%4]);
    const reference=new DepthWalkFilter(),settings={pattern:'quiet',surfaceDetail:.35,temporalStability:true};
    let previous=null,worst=0;
    try{
      device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);filter.resize(width,height,input.createView(),texture.createView());
      for(let t=0;t<10;t++){
        const depth=source((x,y)=>{const d=Math.abs(x-430-Math.min(t,6)),r=110+Math.abs(y-height/2)*.4;return d<r?.6+.24*(1-d/r):.12;});
        const actual=await render(depth,settings),expected=reference.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
        let error=0;
        for(let i=0;i<expected.length;i++){
          assert(actual.pixels[i]===actual.pixels[actual.roots[i]],'Quiet history broke current RGB pairs');
          for(const shift of [0,8,16])error+=Math.abs((actual.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));
        }
        worst=Math.max(worst,error/(expected.length*3));
        if(t>6)assert(actual.pixels.every((v,i)=>v===previous[i]),'Quiet history drifts after stopping');
        previous=actual.pixels;
      }
      assert(worst<.02,`Quiet history CPU/GPU mean error ${worst}`);
      const resetDepth=source(()=>.5),resetSettings={...settings,spacing:96,edges:0},reset=await render(resetDepth,resetSettings);
      const expected=new DepthWalkFilter().render({width,height,depth:resetDepth,color,format:'packed-proximity-rg16'},resetSettings).pixels;
      assert(reset.pixels.every((v,i)=>v===expected[i]),'Quiet settings did not reset GPU history');
      return `10 motion/hold frames; exact RGB pairs; settings reset; worst CPU RGB error ${worst.toFixed(5)}/255`;
    }finally{filter.resize(width,height,input.createView());texture.destroy();}
  });
  await check('Explicit GPU camera-cut reset matches fresh output without reallocating buffers',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:[100,130,160][i%4]);
    const fresh=await DepthWalkGPU.create(device,format);
    try{
      device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);
      filter.resize(width,height,input.createView(),texture.createView());fresh.resize(width,height,input.createView(),texture.createView());
      const buffers=filter.buffers;let cases=0;
      for(const pattern of ['quiet','chroma','chroma-soft'])for(const windowPeriods of [0,3]){
        const settings={pattern,windowPeriods,temporalStability:true};
        for(let t=0;t<3;t++)await render(source((x,y)=>Math.abs(x-430-t*9)+Math.abs(y-110)<100?.85:.1),settings);
        filter.resetHistory();filter.resetHistory();
        assert(filter.buffers===buffers,'reset reallocated GPU buffers');
        const actual=await render(source((x,y)=>Math.abs(x-590)+Math.abs(y-90)<70?.7:.2),settings);
        fresh.resetHistory();const encoder=device.createCommandEncoder();fresh.encode(encoder,context.getCurrentTexture().createView(),settings);device.queue.submit([encoder.finish()]);
        const expected=await fresh.readDiagnostics();
        assert(actual.pixels.every((v,i)=>v===expected.pixels[i]),'camera-cut reset differs from fresh output: '+pattern+'/'+windowPeriods);
        cases++;
      }
      return `${cases} full-width/window configurations; exact post-cut pixels; retained allocations; idempotent reset`;
    }finally{fresh.destroy();filter.resize(width,height,input.createView());texture.destroy();}
  });
  await check('GPU reversed depth matches CPU near/far order, occlusion and direction resets',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:[100,130,160][i%4]);
    try{
      device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);filter.resize(width,height,input.createView(),texture.createView());
      const depth=source((x,y)=>Math.abs(x-500)+Math.abs(y-110)<80?.85:.12);let worst=0,cases=0;
      for(const pattern of ['quiet','chroma','chroma-soft','mono'])for(const windowPeriods of [0,3]){
        const reference=new DepthWalkFilter();
        for(const invertDepth of [false,true,false]){
          const settings={pattern,windowPeriods,invertDepth,temporalStability:true},actual=await render(depth,settings);
          const expected=reference.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
          let error=0;for(let i=0;i<expected.length;i++)for(const shift of [0,8,16])error+=Math.abs((actual.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));
          worst=Math.max(worst,error/(expected.length*3));
          const center=(110*width+500)*4,q=depth[center]*256+depth[center+1];
          assert((actual.geometry[110*width+500]&65535)===(invertDepth?65535-q:q),'GPU depth sign did not follow direction');
          cases++;
        }
      }
      assert(worst<.02,'reversed GPU/CPU mismatch '+worst);
      return `${cases} direction/pattern/window configurations; worst RGB error ${worst.toFixed(5)}/255; canonical near/far reversal`;
    }finally{filter.resize(width,height,input.createView());texture.destroy();}
  });
  await check('Depth direction preserves physical floor normals, palette and contour placement',async()=>{
    const focal=height/(2*Math.tan(62*Math.PI/360));
    const depth=source((_x,y)=>y>height*.54?Math.exp(-(1.8*focal/(y+.5-height/2))/22):0);
    const a=await render(depth,{pattern:'geometry'}),b=await render(depth,{pattern:'geometry',invertDepth:true});
    for(let i=0;i<a.geometry.length;i++)assert((a.geometry[i]>>>16)===(b.geometry[i]>>>16),'direction changed physical geometry');
    const expected=new DepthWalkFilter().render({width,height,depth,format:'packed-proximity-rg16'},{pattern:'geometry',invertDepth:true}).pixels;
    let error=0;for(let i=0;i<expected.length;i++)for(const shift of [0,8,16])error+=Math.abs((expected[i]>>>shift&255)-(b.pixels[i]>>>shift&255));
    assert(error/(expected.length*3)<.02,'reversed physical contours differ between CPU/GPU');
    return 'Identical physical normal/palette codes across reversal; CPU/GPU corrected contour output agrees';
  });
  await check('GPU soft paired preserves CPU projection and stationary output',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=new Uint8Array(width*height*4),reference=new DepthWalkFilter();
    let worst=0,previous=null;
    try{
      filter.resize(width,height,input.createView(),texture.createView());
      for(let t=0;t<5;t++){
        const offset=Math.min(t,2)*3,inside=(x,y)=>Math.abs(x-500-offset)+Math.abs(y-110)<85;
        const depth=source((x,y)=>inside(x,y)?.9:.1);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)color.set(inside(x,y)?[212,177,62,255]:[58,89,122,255],(y*width+x)*4);
        device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);
        const settings={pattern:'chroma-soft',surfaceDetail:.35,temporalStability:true};
        const actual=await render(depth,settings),expected=reference.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
        let error=0;
        for(let i=0;i<expected.length;i++)for(const shift of [0,8,16])error+=Math.abs((actual.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));
        worst=Math.max(worst,error/(expected.length*3));
        if(t>2)assert(actual.pixels.every((v,i)=>v===previous[i]),'soft paired stationary drift');
        previous=actual.pixels;
      }
      assert(worst<.02,`soft paired CPU/GPU mean error ${worst}`);
      return `5 frames including motion and hold; worst CPU RGB error ${worst.toFixed(5)}/255`;
    }finally{filter.resize(width,height,input.createView());texture.destroy();}
  });
  await check('GPU pipeline reports no validation errors',async()=>{await device.queue.onSubmittedWorkDone();assert(!validationErrors.length,validationErrors.join('\n'));return 'compute, atomics and presentation completed';});
  await check('GPU paired color aligns foreground hues and prevents remote object-color spill',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const object=(x,y)=>Math.hypot(x-500,y-110)>38&&Math.hypot(x-500,y-110)<82;
    const depth=source((x,y)=>object(x,y)?.95:.05),color=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)color.set(object(x,y)?[210,180,65,255]:[55,90,135,255],(y*width+x)*4);
    device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);filter.resize(width,height,input.createView(),texture.createView());
    let worst=0,maximumLuma=0;
    for(const setting of [{surfaceDetail:.65},{surfaceDetail:0,pixelRatio:.5},{surfaceDetail:1,pixelRatio:1.5,dotSize:2,depthStrength:.32}]){
      const settings={pattern:'chroma',...setting},a=await render(depth,settings),b=await render(depth,settings),expected=cpu.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
      let error=0;for(let i=0;i<a.pixels.length;i++){
        assert(a.pixels[i]===b.pixels[i],'local color stationary shimmer');
        maximumLuma=Math.max(maximumLuma,Math.abs(linearLuminance(a.pixels[i])-linearLuminance(a.pixels[a.roots[i]])));
        for(const shift of [0,8,16])error+=Math.abs((a.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));
      }
      worst=Math.max(worst,error/(width*height*3));
    }
    assert(worst<.02,`CPU/GPU local-color divergence ${worst}`);assert(maximumLuma<.008,`paired linear luminance error ${maximumLuma}`);
    const original=await render(depth,{pattern:'chroma',surfaceDetail:.65}),reference=await render(depth,{pattern:'quiet',surfaceDetail:.65});
    const changed=color.slice();for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(object(x,y))changed.set([180,50,135,255],(y*width+x)*4);
    device.queue.writeTexture({texture},changed,{bytesPerRow:width*4},[width,height]);const recolored=await render(depth,{pattern:'chroma',surfaceDetail:.65});
    const allowed=new Uint8Array(width*height);let aligned=0;
    for(let i=0;i<original.pairs.length;i++)if(object(i%width,Math.floor(i/width))&&original.pairs[i]!==0xffffffff){
      const pair=original.pairs[i],row=i-i%width,left=row+(pair&65535),right=row+(pair>>>16);allowed[left]=allowed[right]=1;
      assert(original.pixels[left]===original.pixels[right],'foreground ring color is not aligned with its depth');aligned++;
    }
    let changedInside=0;
    for(let i=0;i<original.pixels.length;i++)if(original.pixels[i]!==recolored.pixels[i]){assert(allowed[i],'ring color escaped its projected eye silhouettes');changedInside++;}
    assert(changedInside>1000,'recoloring did not reach ring');
    const preview=document.getElementById('reference');preview.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(reference.pixels.buffer),width,height),0,0);
    device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);await render(depth,{pattern:'chroma',surfaceDetail:.65,temporalStability:true});
    await device.queue.onSubmittedWorkDone();assert(!validationErrors.length,validationErrors.join('\n'));
    return `3 settings; worst mean CPU RGB error ${worst.toFixed(5)}/255; paired linear-light error ${maximumLuma.toFixed(5)}; ${aligned} foreground hue pairs aligned; zero recoloring outside projected ring silhouettes. Previews: same depth/source, different color treatment.`;
  });
  await check('Dark ink matches CPU at both depth directions, wide spacing and scaled output',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:[80,140,170][i%4]);
    const depth=source((x,y)=>Math.abs(x-width/2)+Math.abs(y-height/2)<80?.85:.1);
    let worst=0,tests=0;
    try{
      filter.resize(width,height,input.createView(),texture.createView());device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);
      for(const invertDepth of [false,true])for(const pattern of ['quiet','scene','geometry','classic','mono'])for(const pixelRatio of [.5,1.5]){
        const settings={pattern,pixelRatio,invertDepth,edges:3,spacing:180,temporalStability:true};
        const actual=await render(depth,settings),expected=cpu.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
        let error=0;for(let i=0;i<expected.length;i++)for(const s of [0,8,16])error+=Math.abs((actual.pixels[i]>>>s&255)-(expected[i]>>>s&255));
        worst=Math.max(worst,error/(expected.length*3));assert(worst<.02,'ink CPU/GPU difference '+worst);
        for(let i=0;i<actual.pairs.length;i++)if(actual.pairs[i]!==0xffffffff){const row=i-i%width,pair=actual.pairs[i];assert(actual.pixels[row+(pair&65535)]===actual.pixels[row+(pair>>>16)],'ink broke RGB matching');}
        const hold=await render(depth,settings);assert(hold.pixels.every((v,i)=>v===actual.pixels[i]),'stationary ink changed');tests++;
      }
      assert(!validationErrors.length,validationErrors.join('\n'));
      return `${tests} configurations; matched RGB, stationary output, worst CPU error ${worst.toFixed(5)}/255`;
    }finally{texture.destroy();}
  });
  await check('Bounded center: graph isolation, exact outer scene, CPU agreement and stability',async()=>{
    const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:(i*13)%240);
    try{
      filter.resize(width,height,input.createView(),texture.createView());
      const depth=source((x,y)=>Math.abs(x-width/2)+Math.abs(y-height/2)<100?.85:.1);
      let tested=0;
      for(const windowPeriods of [2,3,4])for(const pattern of ['quiet','chroma','chroma-soft','mono','scene','geometry']){
        device.queue.writeTexture({texture},color,{bytesPerRow:width*4},[width,height]);
        const settings={pattern,windowPeriods,edges:0,temporalStability:true},actual=await render(depth,settings);
        const left=(width-windowPeriods*120)/2,right=width-left;
        const expected=cpu.render({width,height,depth,color,format:'packed-proximity-rg16'},settings).pixels;
        const original=new Uint32Array(color.buffer);let error=0,n=0;
        for(let i=0;i<width*height;i++){
          const x=i%width,r=actual.roots[i]%width;
          if(x<left||x>=right){assert(actual.roots[i]===i,'outside has a stereo root');assert(actual.pixels[i]===original[i],'outside differs from source');}
          else{assert(r>=left&&r<right,'class escaped center');for(const shift of [0,8,16]){error+=Math.abs((actual.pixels[i]>>>shift&255)-(expected[i]>>>shift&255));n++;}}
          if(actual.pairs[i]!==0xffffffff){assert((actual.pairs[i]&65535)>=left&&(actual.pairs[i]>>>16)<right,'pair crossed boundary');}
        }
        assert(error/n<1,'CPU/GPU window color disagreement '+pattern+': '+error/n);
        const changed=color.slice();for(let i=0;i<width*height;i++)if(i%width<left||i%width>=right)changed.fill(0,i*4,i*4+3);
        device.queue.writeTexture({texture},changed,{bytesPerRow:width*4},[width,height]);
        const again=await render(depth,settings);
        for(let i=0;i<width*height;i++)if(i%width>=left&&i%width<right)assert(actual.pixels[i]===again.pixels[i],'outside recoloring or stationary frame altered center '+pattern);
        tested++;
      }
      assert(!validationErrors.length,validationErrors.join('\n'));
      return `${tested} configurations; no pairs or color propagation cross the boundary; outside equals source exactly`;
    }finally{texture.destroy();}
  });
  report.dataset.complete='true';report.dataset.results=JSON.stringify(results);
}catch(error){report.textContent+='\n'+error.stack;report.dataset.error=error.message;}
