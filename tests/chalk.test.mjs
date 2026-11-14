import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {Referee} from '../src/rules.js';
import {cueResponse,tipWear} from '../src/chalk.js';
import {captureRound,restoreRound} from '../src/session.js';

test('Hard and off-centre strokes consume more grip than a gentle centre stroke',()=>{
 assert.ok(tipWear(.9,0)>tipWear(.2,0));assert.ok(tipWear(.9,.9)>tipWear(.9,0));
 assert.deepEqual(cueResponse(1,1),{speed:1,spin:1});
 for(const spin of [0,.5,1]){let previous={speed:1,spin:1};for(let i=10;i>=0;i--){const r=cueResponse(i/10,spin);assert.ok(r.speed<=previous.speed&&r.spin<=previous.spin);assert.ok(r.speed>=.7&&r.spin>=.35);previous=r;}}
});
test('Low grip reduces actual cue-ball velocity and angular velocity in all modes',()=>{
 for(const mode of ['nine','eight','snooker']){
  const fresh=new World(mode),dry=new World(mode);dry.tipCondition=.1;
  assert.ok(fresh.strike(.4,5,.4,.4));assert.ok(dry.strike(.4,5,.4,.4));
  const a=fresh.balls[0],b=dry.balls[0];assert.ok(Math.hypot(b.vx,b.vy)<Math.hypot(a.vx,a.vy));
  assert.ok(Math.hypot(b.wx,b.wy,b.wz)<Math.hypot(a.wx,a.wy,a.wz));assert.ok(fresh.tipCondition<1);
  const condition=fresh.tipCondition;assert.equal(fresh.strike(0,7,0,.8),false);assert.equal(fresh.tipCondition,condition,'Rejected shot must not consume grip');
  dry.running=false;dry.tipCondition=0;assert.ok(dry.strike(0,7,0,.8));assert.equal(dry.tipCondition,0);
 }
});
test('Saved grip survives continuation; legacy saves default to fresh chalk',()=>{
 const world=new World('eight');world.tipCondition=.234;
 const snapshot=captureRound({id:'chalk',createdAt:1,world,ref:new Referee('eight'),elapsedMs:100,ballInHand:true,orbit:Math.PI,eyeHeight:.95,spin:{x:0,y:0},guide:true,soundEnabled:true});
 assert.equal(restoreRound(snapshot).world.tipCondition,.234);
 for(const bad of [-.1,1.1,null,'full']){const copy=structuredClone(snapshot);copy.world.tipCondition=bad;assert.throws(()=>restoreRound(copy));}
 delete snapshot.world.tipCondition;assert.equal(restoreRound(snapshot).world.tipCondition,1);
});
