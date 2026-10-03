import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  server:{host:'127.0.0.1',port:5174,strictPort:true},
  preview:{host:'127.0.0.1',port:4173,strictPort:true},
  build:{rollupOptions:{input:{
  game:fileURLToPath(new URL('./index.html',import.meta.url)),
  observer:fileURLToPath(new URL('./tests/observer-lab.html',import.meta.url)),
  foundations:fileURLToPath(new URL('./tests/foundations.html',import.meta.url)),
  gpuChecks:fileURLToPath(new URL('./tests/gpu-checks.html',import.meta.url)),
}}}});
