import fs from 'node:fs';
import {runBenchmark,syntheticFrames,PROFILES} from '../src/debug/benchmark.js';
const full=process.argv.includes('--full'),outputIndex=process.argv.indexOf('--output'),output=outputIndex>=0?process.argv[outputIndex+1]:null;
const {report}=await runBenchmark(syntheticFrames(),full?PROFILES:PROFILES.slice(0,4),{onProgress:p=>{if(p.frame===p.frames)process.stderr.write(p.profile+' complete\n');}});
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
