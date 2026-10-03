import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDepth} from '../src/depth-frame.js';
import {imageFidelity} from '../src/debug/image-fidelity.js';
import {loadPreferences,savePreferences,sanitizePreferences} from '../src/preferences.js';

test('depth ingestion rejects truncated outputs and BigInt samples before writing',()=>{
  const frame={width:2,height:1,depth:new Float32Array([4,8])},short=new Float32Array([99]);
  assert.throws(()=>decodeDepth(frame,short),/matching floating-point/);
  assert.equal(short[0],99);
  assert.throws(()=>decodeDepth(frame,new Uint8Array(2)),/floating-point/);
  assert.throws(()=>decodeDepth({...frame,depth:new BigInt64Array([4n,8n])}),/BigInt/);
  assert.deepEqual([...decodeDepth(frame,new Float64Array(2))],[4,8]);
});

test('reverse-Z metadata rejects truthy strings and numeric flags before depth decoding',()=>{
  const frame={width:2,height:1,depth:Float32Array.of(0,1),format:'device-depth',near:1,far:10};
  assert.deepEqual([...decodeDepth({...frame,reverseZ:false})],[1,Infinity]);
  assert.deepEqual([...decodeDepth({...frame,reverseZ:true})],[Infinity,1]);
  for(const reverseZ of ['false','true',0,1,null])assert.throws(()=>decodeDepth({...frame,reverseZ}),/reverseZ must be boolean/);
});

test('image fidelity rejects malformed comparisons instead of emitting NaN scores',()=>{
  const pixels=new Uint32Array(2).fill(0xff808080),color=new Uint8Array([128,128,128,255,128,128,128,255]);
  assert.equal(imageFidelity(pixels,color,2,1).sourceRMSE,0);
  assert.equal(imageFidelity(pixels,null,2,1),null);
  for(const args of [[pixels,color,0,1],[pixels,color,2,1,'guess'],[pixels,color.subarray(0,1),2,1],[pixels.subarray(0,1),color,2,1]])assert.throws(()=>imageFidelity(...args),/aligned/);
});

test('quieter preferences survive reload and corrupt or blocked storage stays usable',()=>{
  let saved=null;const storage={getItem:()=>saved,setItem:(_,value)=>saved=value};
  assert.equal(loadPreferences(storage)['surface-detail'],'35');
  assert.equal(loadPreferences(storage)['quiet-stability'],false);
  assert.equal(savePreferences(storage,{pattern:'quiet','surface-detail':'15',spacing:'110'}),true);
  assert.equal(loadPreferences(storage)['surface-detail'],'15');
  assert.equal(loadPreferences(storage).spacing,'110');saved='{broken';assert.equal(loadPreferences(storage).pattern,'quiet');
  savePreferences(storage,{'quiet-stability':true});assert.equal(loadPreferences(storage)['quiet-stability'],true);
  assert.equal(sanitizePreferences({'quiet-stability':'true'})['quiet-stability'],false);
  assert.equal(sanitizePreferences({spacing:'',strength:'900'}).strength,'50');
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(loadPreferences(blocked)['surface-detail'],'35');assert.equal(savePreferences(blocked,{}),false);
});
