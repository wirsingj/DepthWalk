import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonQuery,readComparisonSettings} from '../src/debug/comparison-settings.js';
test('city calibration survives comparison links in both directions, including custom spacing and zero depth',()=>{
  for(const invertDepth of [true,false])for(const strength of [0,.27,.5]){
    const settings={spacing:123,strength,surfaceDetail:.62,edges:3,dotSize:2,invertDepth};
    assert.deepEqual(readComparisonSettings(new URLSearchParams(comparisonQuery(settings))),settings);
  }
});
test('missing or malformed replay calibration falls back to valid defaults',()=>{
  const baseline={spacing:120,strength:.5,surfaceDetail:.35,edges:2,dotSize:1,invertDepth:false};
  for(const query of ['', 'spacing=&strength=NaN&surfaceDetail=Infinity&edges=2.5&dotSize=-1','spacing=100000&strength=-.2&surfaceDetail=2&edges=4&dotSize=0'])assert.deepEqual(readComparisonSettings(new URLSearchParams(query)),baseline);
});
test('only explicit reversed replay links swap near and far',()=>{
  for(const direction of ['', 'original','false','typo'])assert.equal(readComparisonSettings(new URLSearchParams({direction})).invertDepth,false);
  assert.equal(readComparisonSettings(new URLSearchParams({direction:'reversed'})).invertDepth,true);
});
