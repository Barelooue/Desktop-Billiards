import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {Referee} from '../src/rules.js';
function pot(w,r,id,also=[]){r.begin(w);w.events=[{type:'hit',a:0,b:id}];w.firstHit=id;for(const ballId of [id,...also])w.pot(w.balls.find(b=>b.id===ballId));return r.finish(w);}
test('Eight-ball wins after either complete group and black, leaving the other group on the table',()=>{
 for(const ids of [[1,2,3,4,5,6,7],[9,10,11,12,13,14,15]]){
  const w=new World('eight'),r=new Referee('eight');for(const id of ids)pot(w,r,id);
  assert.equal(r.done,false);assert.deepEqual(r.target(w),[8]);pot(w,r,8);
  assert.equal(r.outcome,'win');assert.equal(r.done,true);assert.equal(w.balls.filter(b=>b.id&&!b.potted).length,7);
  const shots=r.shots;r.finish(w);assert.equal(r.shots,shots);
 }
});
test('Early black and a cue scratch with final black both lose',()=>{
 const w=new World('eight'),r=new Referee('eight');pot(w,r,8);assert.equal(r.outcome,'loss');
 const w2=new World('eight'),r2=new Referee('eight');for(let id=1;id<=7;id++)pot(w2,r2,id);pot(w2,r2,8,[0]);assert.equal(r2.outcome,'loss');
});
test('Snooker maximum route scores 147, respots colors during reds, then completes without respotting final black',()=>{
 const w=new World('snooker'),r=new Referee('snooker');
 for(let id=1;id<=15;id++){pot(w,r,id);assert.equal(r.phase,'color');pot(w,r,21);assert.equal(w.balls.find(b=>b.id===21).potted,false);}
 assert.equal(r.score,120);assert.equal(r.phase,'clear');
 for(let id=16;id<=21;id++)pot(w,r,id);
 assert.equal(r.score,147);assert.equal(r.outcome,'win');assert.equal(r.done,true);assert.equal(w.balls.filter(b=>b.id&&!b.potted).length,0);
});
test('Snooker foul points are separate from legal score; final-black foul ends the challenge',()=>{
 const w=new World('snooker'),r=new Referee('snooker');pot(w,r,1);assert.equal(r.score,1);
 r.begin(w);w.events=[{type:'hit',a:0,b:19}];w.firstHit=19;w.pot(w.balls.find(b=>b.id===21));r.finish(w);
 assert.equal(r.score,1);assert.equal(r.penaltyPoints,7);assert.equal(w.balls.find(b=>b.id===21).potted,false);
 for(const b of w.balls)if(b.id&&b.id!==21)b.potted=true;r.phase='clear';r.begin(w);w.events=[];w.firstHit=null;r.finish(w);
 assert.equal(r.outcome,'loss');assert.equal(r.done,true);assert.equal(r.penaltyPoints,14);
});
