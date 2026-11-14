import {test} from 'node:test';
import assert from 'node:assert/strict';
import {impactSound,soundEvents} from '../src/audio.js';
import {World,ball} from '../src/physics.js';

test('Recorded impact loudness grows with contact speed and silent grazing contacts stay silent',()=>{
 for(const type of ['hit','rail','cue','pot']){
  const gains=[.04,.2,1,3,6].map(speed=>impactSound(type,speed).gain);
  assert.ok(gains.every((g,i)=>i===0||g>gains[i-1]));
  assert.ok(impactSound(type,100).gain<=.8);
 }
 assert.equal(impactSound('hit',0),null);assert.equal(impactSound('hit',NaN),null);
 assert.ok(impactSound('pot',0).gain>.2,'Gravity still makes a softly potted ball land audibly');
 assert.equal(impactSound('pot',1).sample,'pocket');assert.equal(impactSound('hit',1).sample,'ball');
});

test('Pocket event preserves entry speed before stopping the ball, and cannot fire twice',()=>{
 const w=new World(),b=w.balls[1];b.vx=3;b.vy=4;w.elapsed=1.25;
 w.pot(b);w.pot(b);
 assert.equal(w.events.length,1);assert.equal(w.events[0].speed,5);
 assert.equal(w.events[0].time,1.25);assert.equal(w.events[0].pocket,true);
 assert.equal(b.vx,0);assert.equal(b.vy,0);
});

test('Simultaneous balls stay audible, and an escaped ball is not a pocket sound',()=>{
 const w=new World(),r=w.c.radius,a=ball(0,0,0,r),b=ball(1,r*2-.0001,0,r);a.vx=2;
 w.collide(a,b);assert.equal(w.events[0].speed,2);
 assert.equal(w.events[0].x,(a.x+b.x)/2);
 const pocket=w.balls[2];w.pot(pocket);w.pot(w.balls[3],false);
 assert.deepEqual(soundEvents(w.events).map(e=>e.type),['hit','pot']);
 assert.equal(soundEvents([{type:'hit',speed:1},{type:'hit',speed:2},{type:'pot',speed:0}]).length,3);
});
