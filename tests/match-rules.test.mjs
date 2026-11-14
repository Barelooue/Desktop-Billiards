import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {Referee} from '../src/rules.js';
import {BilliardScene} from '../src/scene.js';

function stroke(world,ref,{hit=null,pots=[],rails=[],crossings,escaped=[]}={}){
 ref.begin(world);
 world.firstHit=hit;
 world.headStringCrossings=crossings;
 world.events=hit===null?[]:[{type:'hit',a:0,b:hit}];
 for(const id of rails)world.events.push({type:'rail',id});
 for(const id of pots)world.pot(world.balls.find(ball=>ball.id===id));
 for(const id of escaped){
  world.pot(world.balls.find(ball=>ball.id===id),false);
  world.events.push({type:'offtable',id});
 }
 return ref.finish(world);
}

test('WPA nine-ball awards the rack on a third consecutive foul by the same player',()=>{
 const world=new World('nine'),ref=new Referee('nine','high');
 ref.shots=1;
 for(let i=0;i<2;i++){
  stroke(world,ref);
  assert.equal(ref.foulStreak[0],i+1);
  stroke(world,ref,{hit:1,rails:[0]});
  assert.equal(ref.turn,0);
 }
 stroke(world,ref);
 assert.equal(ref.outcome,'loss');
 assert.equal(world.cuePlacementZone,null);
});

test('An otherwise legal short nine-ball break spots the 9 and gives the opponent a choice',()=>{
 const world=new World('nine'),ref=new Referee('nine','high');
 const result=stroke(world,ref,{hit:1,pots:[9],crossings:[1]});
 assert.equal(result.foul,false);
 assert.equal(ref.done,false);
 assert.equal(world.balls.find(ball=>ball.id===9).potted,false);
 assert.equal(ref.decision.kind,'nine-short-break');
 assert.equal(ref.choose(world,'other'),'continue');
 assert.equal(ref.turn,0);
 assert.equal(ref.pushOutAvailable,true);
 ref.pushOut=true;
 stroke(world,ref,{pots:[9]});
 assert.equal(ref.done,false);
 assert.equal(ref.decision.kind,'push-out');
 assert.equal(ref.choose(world,'self'),'continue');
 assert.equal(ref.turn,1);
});

test('Nine-ball opens with the 9 on the foot spot and aims from side placement at the 1',()=>{
 const world=new World('nine'),ref=new Referee('nine','high');
 assert.equal(world.balls.find(ball=>ball.id===9).x,world.c.length/4);
 assert.ok(world.placeCue(-.85,.25));
 const scene=Object.assign(Object.create(BilliardScene.prototype),{
  world,c:world.c,stance:false,orbit:Math.PI
 });
 scene.setStance(true,world.balls.find(ball=>ball.id===1));
 ref.begin(world);world.strike(scene.aim,6.7);
 for(let i=0;world.running&&i<12000;i++)world.step(1/240);
 assert.equal(world.firstHit,1);
 assert.doesNotMatch(ref.finish(world).message,/实际先碰/);
});

test('A true wrong first contact on a nine-ball break identifies both balls',()=>{
 const world=new World('nine'),ref=new Referee('nine','medium');
 const result=stroke(world,ref,{hit:2,rails:[1,2,3,4],crossings:[1,2,3]});
 assert.equal(result.foul,true);
 assert.match(result.message,/开球须先碰 1 号球，实际先碰 2 号球/);
});

test('Pool accepts simultaneous legal and illegal contact while snooker penalizes red and color contact',()=>{
 const pool=new World('nine'),nine=new Referee('nine','high');
 pool.firstContacts=[2,1];
 assert.equal(stroke(pool,nine,{hit:2,pots:[1],crossings:[2,3]}).foul,false);
 const table=new World('snooker'),snooker=new Referee('snooker','high');
 table.firstContacts=[1,21];
 assert.equal(stroke(table,snooker,{hit:1}).foul,true);
 assert.deepEqual(snooker.scores,[0,7]);
});

test('Heyball keeps an open table after a break and loses the rack if the 8 is driven off',()=>{
 const world=new World('eight'),ref=new Referee('eight','high');
 stroke(world,ref,{hit:1,pots:[8]});
 assert.equal(ref.decision.kind,'black-break');
 assert.equal(ref.choose(world,'accept'),'continue');
 assert.equal(ref.turn,0);
 assert.equal(ref.group,null);
 stroke(world,ref,{hit:1,pots:[9],rails:[0]});
 assert.equal(ref.group,null);
 assert.equal(ref.turn,1);
 stroke(world,ref,{hit:2,escaped:[8]});
 assert.equal(ref.outcome,'win');
});

test('A Heyball break miss can be re-racked with the selected breaker',()=>{
 const world=new World('eight'),ref=new Referee('eight','high');
 stroke(world,ref);
 assert.equal(ref.decision.kind,'missed-break');
 assert.equal(ref.choose(world,'break-self'),'rerack');
 assert.equal(ref.turn,1);
 assert.equal(ref.shots,0);
 assert.equal(world.cuePlacementZone,'head');
});

test('Snooker scores a final-black foul before awarding the frame or re-spotting on a tie',()=>{
 for(const lead of [6,7,8]){
  const world=new World('snooker'),ref=new Referee('snooker','medium');
  ref.phase='clear';ref.scores=[lead,0];
  for(const ball of world.balls)if(ball.id>0&&ball.value!==7)ball.potted=true;
  stroke(world,ref,{hit:21,pots:[0]});
  assert.deepEqual(ref.scores,[lead,7]);
  if(lead===7){
   assert.equal(ref.done,false);
   assert.equal(ref.decision.kind,'black-tiebreak');
   const chooser=ref.decision.chooser;
   ref.choose(world,'self');
   assert.equal(ref.turn,chooser);
   assert.equal(world.cuePlacementZone,'d');
  }else assert.equal(ref.outcome,lead<7?'loss':'win');
 }
});

test('Snooker awards the frame after a warned third miss from the restored position',()=>{
 const world=new World('snooker'),ref=new Referee('snooker','high');
 const cue=world.balls[0],red=world.balls[1];
 Object.assign(cue,{x:-.2,y:.4});
 Object.assign(red,{x:.2,y:.4});
 for(const ball of world.balls)if(ball.id>1&&ball.value===1)ball.potted=true;
 world.cuePlacementZone=null;
 for(let i=0;i<2;i++){
  stroke(world,ref);
  assert.equal(ref.decision.kind,'snooker-miss');
  assert.equal(ref.choose(world,'replace'),'continue');
  assert.equal(ref.missStreak,i+1);
  assert.equal(ref.turn,0);
 }
 stroke(world,ref);
 assert.equal(ref.done,true);
 assert.equal(ref.outcome,'loss');
});
