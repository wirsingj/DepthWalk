// Dev-only host tests. Fault injection affects this test page's own device/worker.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const $ = id => document.getElementById(id);
function assert(value, message) { if (!value) throw Error(message); }
async function until(predicate, message, timeout = 20000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    assert(performance.now() < deadline, message);
    await wait(25);
  }
}

export async function runRuntimeChecks({player, stop, getFrame, getRuntime, setDiagnosticCapture, loseGPU, terminateCPUWorker}) {
  const report = document.createElement('pre');
  report.id = 'verification';
  report.style.cssText = 'position:fixed;top:90px;left:16px;z-index:50;background:#10202b;color:#bbefc3;padding:16px;max-width:750px;max-height:75vh;overflow:auto';
  report.textContent = 'HOST LIFECYCLE CHECKS\n';
  document.body.append(report);
  const results = [];
  async function check(name, fn) {
    try { results.push({name, pass: true, detail: await fn()}); }
    catch (error) { results.push({name, pass: false, error: error.message}); }
    const result = results.at(-1);
    report.textContent += `${result.pass ? 'PASS' : 'FAIL'} ${name}: ${result.detail || result.error}\n`;
  }
  const idle = () => { const state = getRuntime(); return state.ready && state.holdingFrame && !state.busy && state.pending === 0; };
  const original = {...player};
  try {
    stop();
    setDiagnosticCapture(false);
    await check('stationary foundation stops submissions without changing grain or quality', async () => {
      await until(idle, 'renderer did not reach idle');
      const before = getRuntime();
      await wait(1200);
      const after = getRuntime();
      assert(after.presented === before.presented, 'unchanged scene was rendered again');
      assert(after.noiseFrame === before.noiseFrame && after.autoScale === before.autoScale, 'idle changed grain or quality');
      assert($('live-fps').textContent === 'Still · grain held', 'idle mislabeled as low FPS');
      return `${after.backend}; 0 extra frames over 1200 ms; grain/quality held`;
    });
    await check('walking wakes rendering and returning to rest holds again', async () => {
      $('begin').click();
      const before = getRuntime().presented, z = player.z;
      window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true}));
      await wait(120);
      window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyW', bubbles: true}));
      await until(() => player.vz === 0 && idle(), 'movement did not settle');
      assert(player.z < z && getRuntime().presented > before, 'input failed to wake renderer');
      const held = getRuntime().presented;
      await wait(300);
      assert(getRuntime().presented === held, 'rest did not hold after movement');
      return `${held - before} frames during the walk; 0 extra frames at rest`;
    });
    await check('settings wake an idle renderer; sight guides do not alter pixels', async () => {
      const before = getRuntime().presented;
      $('texture').value = 'foundation-binary';
      $('texture').dispatchEvent(new Event('change'));
      await until(() => getRuntime().presented > before && idle(), 'texture change did not render');
      const held = getRuntime().presented;
      window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyT', bubbles: true}));
      assert($('center-alignment').hidden && !$('alignment').hidden, 'T changed the upper dots');
      window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyT', bubbles: true}));
      assert(!$('center-alignment').hidden && $('center-alignment').parentElement.id === 'interface', 'crosses missing from UI');
      await wait(200);
      assert(getRuntime().presented === held, 'sight guides caused a stereo redraw');
      return 'texture updated; independent UI crosses; no guide-induced render';
    });
    await check('diagnostic capture obtains a current frame while gameplay is held', async () => {
      const before = getRuntime().presented;
      setDiagnosticCapture(true);
      await until(() => getFrame() && getRuntime().presented > before, 'held scene did not produce capture');
      const frame = getFrame();
      assert(Math.abs(frame.camera.position.z - player.z) < 1e-6, 'capture contains an old pose');
      setDiagnosticCapture(false);
      await until(idle, 'capture did not return to idle');
      return `${frame.width} × ${frame.height}; current camera captured`;
    });
    await check('actual GPU device destruction falls back to live CPU frames', async () => {
      assert(getRuntime().backend === 'gpu', 'WebGPU unavailable: device-loss case not exercised');
      const before = getRuntime().presented;
      loseGPU();
      await until(() => getRuntime().backend === 'cpu' && getRuntime().presented > before && idle(), 'CPU fallback failed after device loss');
      assert($('backend-status').textContent.includes('CPU fallback') && $('fatal').hidden, 'fallback UI is incorrect');
      const held = getRuntime().presented;
      player.z -= .001;
      await until(() => getRuntime().presented > held && idle(), 'CPU fallback did not respond to a new pose');
      return 'real GPUDevice.destroy(); CPU presented both fallback and changed pose';
    });
    await check('silent CPU worker failure settles the frame and shows recovery guidance', async () => {
      assert(getRuntime().backend === 'cpu', 'CPU fallback required for silence test');
      terminateCPUWorker();
      const start = performance.now();
      player.z -= .001;
      await until(() => getRuntime().cpuFailed, 'silent worker never reached its deadline');
      assert(!getRuntime().busy && !$('fatal').hidden && $('fatal').textContent.includes('Reload'), 'failed frame remained busy or invisible');
      return `terminated worker detected after ${Math.round(performance.now() - start)} ms; visible reload guidance`;
    });
  } finally {
    stop();
    Object.assign(player, original);
    setDiagnosticCapture(false);
    report.dataset.results = JSON.stringify(results);
    report.dataset.complete = 'true';
    report.textContent += `\n${results.filter(result => result.pass).length}/${results.length} passed.\n`;
  }
}
