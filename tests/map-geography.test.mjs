import test from 'node:test';
import assert from 'node:assert/strict';
import {areaCounts, areaMode, overviewPoint, combineCoincidentFeatures} from '../site/map-geography.js';

test('coincident source and supplemental locations expose every linked record through one clickable shape', () => {
  const geometry = {type:'LineString',coordinates:[[9.72,52.37],[9.74,52.39]]};
  const original = {type:'Feature',geometry,properties:{geometryId:'original',label:'Straße',recordIds:['city:a','city:b']}};
  const extra = {type:'Feature',geometry:structuredClone(geometry),properties:{geometryId:'supplement',label:'Straße',recordIds:['city:b','city:c']}};
  const other = {type:'Feature',geometry:{type:'Point',coordinates:[9.72,52.37]},properties:{geometryId:'point',label:'Haus',recordIds:['city:d']}};
  const before = JSON.stringify([original,extra,other]);
  const combined = combineCoincidentFeatures([original,extra,other]);
  assert.equal(combined.length,2);
  assert.deepEqual(combined[0].properties.recordIds,['city:a','city:b','city:c']);
  assert.deepEqual(combined[1].properties.recordIds,['city:d']);
  assert.equal(JSON.stringify([original,extra,other]),before,'render grouping modified source evidence');
});

test('area counts intersect current results once per qualified record and area', () => {
  const areas = [
    {properties: {areaId: 'bezirk:01', recordIds: ['stadt:1','stadt:1','stadt:2','region:1']}},
    {properties: {areaId: 'bezirk:02', recordIds: ['stadt:1','stadt:3']}},
  ];
  assert.deepEqual([...areaCounts(areas, new Set(['stadt:1','stadt:2']))], [['bezirk:01',2],['bezirk:02',1]]);
  assert.deepEqual([...areaCounts(areas, new Set())], [['bezirk:01',0],['bezirk:02',0]]);
  assert.deepEqual([...areaCounts(areas, null)], [['bezirk:01',null],['bezirk:02',null]]);
});

test('city opens districts, district opens neighborhoods, neighborhood opens locations', () => {
  assert.equal(areaMode(), 'districts');
  assert.equal(areaMode(null, 14), 'places');
  assert.equal(areaMode({properties: {kind: 'bezirk'}}, 15), 'neighborhoods');
  assert.equal(areaMode({properties: {kind: 'bezirk'}}, 13, true), 'places');
  assert.equal(areaMode({properties: {kind: 'stadtteil'}}), 'places');
});

test('line overview symbols use a point on the original line', () => {
  assert.deepEqual(overviewPoint({type: 'Point',coordinates: [9,52]}), [9,52]);
  assert.deepEqual(overviewPoint({type: 'LineString',coordinates: [[0,0],[0,2],[4,2]]}), [1,2]);
  assert.deepEqual(overviewPoint({type: 'MultiLineString',coordinates: [[[0,0],[1,0]],[[2,2],[2,8]]]}), [2,5]);
});
