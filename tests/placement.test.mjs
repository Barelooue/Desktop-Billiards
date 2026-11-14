import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {Referee} from '../src/rules.js';
test('pool opening permits repeated moves behind the head string, not on or beyond it',()=>{
 for(const mode of ['nine','eight']){const w=new World(mode);assert.equal(w.cuePlacementZone,'head');assert.ok(w.canPlaceCue(w.balls[0].x,w.balls[0].y));assert.ok(w.placeCue(-.9,.25));assert.ok(w.placeCue(-1,-.3));assert.equal(w.placeCue(-w.c.length/4,.25),false);assert.equal(w.placeCue(-.1,.25),false);assert.equal(w.placeCue(NaN,0),false);}
});
test('snooker cue ball in hand is limited to the D and cannot overlap colored spots',()=>{
 const w=new World('snooker'),bx=-w.c.length/2+.737;assert.equal(w.cuePlacementZone,'d');assert.ok(w.placeCue(bx-.15,.12));assert.ok(w.placeCue(bx-.25,0));assert.equal(w.placeCue(bx+.01,.1),false);assert.equal(w.placeCue(bx-.28,.2),false);assert.equal(w.placeCue(bx,0),false);
});
test('placement is disallowed during motion and after the right has been consumed by a shot',()=>{
 const w=new World();assert.ok(w.strike(0,.7));assert.equal(w.cuePlacementZone,null);assert.equal(w.placeCue(-.9,.2),false);w.running=false;assert.equal(w.placeCue(-.9,.2),false);
});
test('table ball in hand still excludes cushions, pockets and overlapping balls',()=>{
 const w=new World();w.cuePlacementZone='table';assert.ok(w.placeCue(.1,.3));const other=w.balls[1];assert.equal(w.placeCue(other.x,other.y),false);assert.equal(w.placeCue(w.c.length/2,0),false);assert.equal(w.placeCue(0,w.c.width/2),false);assert.equal(w.placeCue(w.pockets[0].x,w.pockets[0].y),false);
});
function scratch(mode,shots=0){const w=new World(mode),ref=new Referee(mode);ref.shots=shots;ref.begin(w);w.firstHit=1;w.balls[0].potted=true;w.events=[{type:'hit',a:0,b:1},{type:'pot',id:0,value:0}];const result=ref.finish(w);return {w,ref,result};}
test('nine-ball fouls grant table placement; Chinese eight-ball break foul grants head area',()=>{
 assert.equal(scratch('nine').result.placementZone,'table');assert.equal(scratch('eight').result.placementZone,'head');assert.equal(scratch('eight',1).result.placementZone,'table');
});
test('snooker scratch grants D placement and retains off-table cue until valid placement',()=>{
 const {w,result}=scratch('snooker');assert.equal(result.placementZone,'d');assert.ok(w.balls[0].potted);assert.equal(w.placeCue(0,.2),false);assert.ok(w.placeCue(-w.c.length/2+.6,.1));assert.equal(w.balls[0].potted,false);
});
test('ordinary snooker foul does not grant arbitrary placement or move the cue ball',()=>{
 const w=new World('snooker'),ref=new Referee('snooker');ref.begin(w);const before={x:w.balls[0].x,y:w.balls[0].y};w.firstHit=21;w.events=[{type:'hit',a:0,b:21}];const result=ref.finish(w);assert.equal(result.ballInHand,false);assert.equal(w.cuePlacementZone,null);assert.equal(w.placeCue(-1.2,0),false);assert.deepEqual({x:w.balls[0].x,y:w.balls[0].y},before);
});
