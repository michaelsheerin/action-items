import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveMatches,compareArchived} from './archive-tools.js';
test('archive filters combine columns and preserve multiline search text',()=>{
  const task={account:'Goldman',category:'Capacity',title:'Review\nallocation',due:'2026-10-27',owner:'Michael Sheerin'};
  assert.equal(archiveMatches(task,{category:'CAP',owner:'Sheerin',due:'2026-10'}),true);
  assert.equal(archiveMatches(task,{category:'CAP',owner:'Other'}),false);
  assert.equal(archiveMatches(task,{notes:'missing'}),false);
});
test('archive dates sort chronologically with unknown completion dates last in both directions',()=>{
  const rows=[{id:'unknown',completedAt:null},{id:'old',completedAt:'2026-09-01T12:00:00Z'},{id:'new',completedAt:'2026-10-27T10:00:00Z'}];
  assert.deepEqual([...rows].sort((a,b)=>compareArchived(a,b)).map(r=>r.id),['new','old','unknown']);
  assert.deepEqual([...rows].sort((a,b)=>compareArchived(a,b,{field:'completedAt',direction:'asc'})).map(r=>r.id),['old','new','unknown']);
  assert.deepEqual([{id:'10',title:'Item 10'},{id:'2',title:'Item 2'}].sort((a,b)=>compareArchived(a,b,{field:'title',direction:'asc'})).map(r=>r.id),['2','10']);
});
