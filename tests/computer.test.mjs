import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,rack} from '../src/physics.js';
import {BREAK_MAX_SPEED} from '../src/shot-controls.js';
import {Referee} from '../src/rules.js';
import {computerNeedsChalk,computerPerspective,computerShouldConcede,escapeWindow,planComputerShot,practiceShotSearch} from '../src/computer.js';
import {captureRound,restoreRound} from '../src/session.js';

function finish(world,ref,firstHit,pots=[],rail=false){
 ref.begin(world);
 world.firstHit=firstHit;
 world.events=firstHit===null?[]:[{type:'hit',a:0,b:firstHit}];
 if(rail)world.events.push({type:'rail',id:0});
 for(const id of pots)world.pot(world.balls.find(ball=>ball.id===id));
 return ref.finish(world);
}

test('The left computer evaluates a legal finish from its own perspective',()=>{
 const world=new World('nine'),ref=new Referee('nine','high');
 for(const ball of world.balls)if(ball.id&&ball.id!==9)ball.potted=true;
 Object.assign(world.balls[0],{x:.15,y:0});
 Object.assign(world.balls.find(ball=>ball.id===9),{x:0,y:world.c.width/2-.12});
 world.cuePlacementZone=null;
 Object.assign(ref,{turn:0,shots:4,scores:[5,2],foulStreak:[2,0],leftComputerGrip:.91});
 const planner=computerPerspective(ref,0);
 assert.deepEqual(planner.scores,[2,5]);
 assert.deepEqual(planner.foulStreak,[0,2]);
 assert.equal(planner.computerGrip,.91);
 const shot=planComputerShot(world,planner,()=>.5);
 ref.begin(world);world.strike(shot.angle,shot.speed,shot.side,shot.top);
 while(world.running)world.step(1/240);
 assert.equal(ref.finish(world).foul,false);
 assert.equal(ref.outcome,'win');
});

test('All computer levels default to a legal full-power pool break',()=>{
 for(const mode of ['nine','eight'])for(const level of ['low','medium','high','star']){
  const world=new World(mode),ref=new Referee(mode,level);
  world.balls=rack(mode,()=>.42);ref.turn=1;
  const shot=planComputerShot(world,ref,()=>.1);
  assert.equal(shot.speed,BREAK_MAX_SPEED);
  assert.equal(shot.breakBoost,true);
  assert.ok(world.placeCue(shot.placement.x,shot.placement.y));
  ref.begin(world);world.strike(shot.angle,shot.speed,shot.side,shot.top,{breakBoost:shot.breakBoost});
  while(world.running)world.step(1/240);
  assert.equal(ref.finish(world).foul,false);
  assert.ok(!ref.decision);
 }
});

test('Pool breaks vary placement among legal full-power options for the same rack',()=>{
 for(const mode of ['nine','eight']){
  const placements=new Set();
  for(const roll of [0,.45,.99]){
   const world=new World(mode),ref=new Referee(mode,'high');
   world.balls=rack(mode,()=>.42);ref.turn=1;
   const shot=planComputerShot(world,ref,()=>roll);
   assert.equal(shot.speed,BREAK_MAX_SPEED);
   placements.add(`${shot.placement.x},${shot.placement.y}`);
   assert.ok(world.placeCue(shot.placement.x,shot.placement.y));
   ref.begin(world);world.strike(shot.angle,shot.speed,shot.side,shot.top,{breakBoost:shot.breakBoost});
   while(world.running)world.step(1/240);
   assert.equal(ref.finish(world).foul,false);
   assert.ok(!ref.decision);
  }
  assert.ok(placements.size>=2,mode);
 }
});

test('Nine-ball keeps the turn on a pot, gives the computer ball in hand on a foul and records a computer win',()=>{
 const world=new World('nine'),ref=new Referee('nine','medium');
 finish(world,ref,1,[1]);
 assert.equal(ref.turn,0);
 assert.equal(finish(world,ref,null).placementZone,'table');
 assert.equal(ref.turn,1);
 finish(world,ref,2,[9]);
 assert.equal(ref.done,true);
 assert.equal(ref.outcome,'loss');
 assert.deepEqual(ref.scores,[1,1]);
});

test('Eight-ball assigns opposite groups and a computer foul on the black loses the rack',()=>{
 const world=new World('eight'),ref=new Referee('eight','high');
 finish(world,ref,1,[1]);
 assert.equal(ref.group,null);
 finish(world,ref,2,[2]);
 assert.equal(ref.group,'solid');
 finish(world,ref,3,[],true);
 assert.equal(ref.turn,1);
 assert.equal(ref.group,'stripe');
 finish(world,ref,9,[8]);
 assert.equal(ref.outcome,'win');
});

test('Snooker awards foul points to the opponent and determines the winner by total score',()=>{
 const world=new World('snooker'),ref=new Referee('snooker','low');
 finish(world,ref,null);
 assert.equal(ref.turn,1);
 assert.deepEqual(ref.scores,[0,4]);
 for(const ball of world.balls)if(ball.id>0&&ball.id!==21)ball.potted=true;
 ref.turn=0;ref.phase='clear';ref.scores=[0,20];
 finish(world,ref,21,[21]);
 assert.equal(ref.outcome,'loss');
 assert.deepEqual(ref.scores,[7,20]);
});

test('A 147 stays live after pink and the high computer pots the final black',()=>{
 const world=new World('snooker'),ref=new Referee('snooker','high');
 ref.turn=1;
 for(let red=1;red<=15;red++){
  finish(world,ref,red,[red]);
  assert.equal(ref.canMake147(world),true);
  finish(world,ref,21,[21]);
 }
 for(let color=16;color<=20;color++)finish(world,ref,color,[color]);
 assert.deepEqual(ref.scores,[0,140]);
 assert.equal(ref.done,false);
 assert.equal(ref.canConcede(world,0),true);
 Object.assign(world.balls[0],{x:.84,y:.38});
 Object.assign(world.balls[21],{x:1.35,y:.64});
 const shot=planComputerShot(world,ref,()=>.5);
 ref.begin(world);
 assert.ok(world.strike(shot.angle,shot.speed,shot.side,shot.top));
 while(world.running)world.step(1/240);
 assert.equal(ref.finish(world).legalPot,true);
 assert.deepEqual(ref.scores,[0,147]);
 assert.deepEqual(ref.maximum,{player:1,points:147});
 assert.deepEqual(ref.bestBreaks,[null,{points:147,count:1}]);
});

test('Computer concession depends on difficulty and protects a live player maximum',()=>{
 const world=new World('snooker'),ref=new Referee('snooker','medium');
 for(const ball of world.balls)if(ball.value>=1&&ball.value<5)ball.potted=true;
 world.cuePlacementZone=null;
 ref.phase='clear';ref.turn=1;ref.scores=[30,0];
 assert.equal(computerShouldConcede(world,ref),true);
 ref.difficulty='high';
 assert.equal(computerShouldConcede(world,ref),false);
 ref.scores[0]=75;
 assert.equal(computerShouldConcede(world,ref),true);
 assert.match(ref.concede(world,1),/电脑认输/);
 assert.equal(ref.outcome,'win');
 ref.done=false;ref.turn=0;ref.scores[0]=129;ref.breakPoints=129;
 assert.equal(computerShouldConcede(world,ref),false);
});

test('Single breaks reset on a missed pot or foul and exclude foul points',()=>{
 const world=new World('snooker'),ref=new Referee('snooker','high');
 finish(world,ref,1,[1]);finish(world,ref,21,[21]);
 finish(world,ref,2);
 finish(world,ref,null);
 ref.choose(world,'accept');
 finish(world,ref,2,[2]);
 assert.deepEqual(ref.scores,[13,0]);
 assert.equal(ref.breakPoints,1);
 assert.equal(ref.canMake147(world),false);
 assert.deepEqual(ref.bestBreaks,[{points:8,count:1},null]);
});

test('Computer level and turn survive a save, and the planner does not mutate the live table',()=>{
 const world=new World('nine'),ref=new Referee('nine','high');
 finish(world,ref,null,[0]);
 const snapshot=captureRound({id:'match',createdAt:0,world,ref,elapsedMs:0,ballInHand:false,orbit:0,eyeHeight:.95,spin:{x:0,y:0},guide:true,soundEnabled:true});
 const restored=restoreRound(snapshot);
 assert.equal(restored.ref.turn,1);
 assert.equal(restored.ref.difficulty,'high');
 for(const difficulty of ['low','medium','high']){
  restored.ref.difficulty=difficulty;
  const before=JSON.stringify(restored.world);
  const shot=planComputerShot(restored.world,restored.ref,()=>.5);
  assert.ok(Number.isFinite(shot.angle)&&shot.speed>=.12&&shot.speed<=7);
  assert.ok(restored.world.canPlaceCue(shot.placement.x,shot.placement.y));
  assert.equal(JSON.stringify(restored.world),before);
 }
});

for(const difficulty of ['high','star'])test(`${difficulty} snooker opening returns the white to baulk`,()=>{
 const world=new World('snooker'),ref=new Referee('snooker',difficulty);
 ref.turn=1;
 const shot=planComputerShot(world,ref,()=>.5);
 assert.ok(world.placeCue(shot.placement.x,shot.placement.y));
 ref.begin(world);world.strike(shot.angle,shot.speed,shot.side,shot.top);
 while(world.running)world.step(1/240);
 const result=ref.finish(world);
 assert.equal(result.foul,false);
 assert.equal(result.legalPot,false);
 assert.equal(ref.turn,0);
 assert.ok(world.balls[0].x< -world.c.length/2+.737);
});

for(const difficulty of ['high','star'])test(`${difficulty} snooker player hides every direct line to the red and can escape off a cushion`,()=>{
 const world=new World('snooker'),ref=new Referee('snooker',difficulty);
 const positions=new Map([
  [0,[-.75,0]],[1,[.25,.15]],[16,[.081409,.063902]],[17,[.433165,.02598]],
  [18,[.055283,.220728]],[19,[.403999,.224164]],[20,[.204768,-.040156]],[21,[.182557,.3526]]
 ]);
 for(const ball of world.balls){
  const position=positions.get(ball.id);
  if(position)[ball.x,ball.y]=position;else ball.potted=true;
 }
 world.cuePlacementZone=null;
 ref.turn=1;ref.shots=6;
 const red=world.balls.find(ball=>ball.id===1);
 const shoot=()=>{
  const shot=planComputerShot(world,ref,()=>.5);
  ref.begin(world);
  assert.ok(world.strike(shot.angle,shot.speed,shot.side,shot.top));
  while(world.running)world.step(1/240);
  return ref.finish(world);
 };
 assert.ok(escapeWindow(world,[red]).visible>0);
 const safety=shoot();
 assert.equal(safety.foul,false);
 assert.equal(safety.legalPot,false);
 assert.equal(ref.turn,0);
 assert.equal(escapeWindow(world,[red]).visible,0);
 ref.turn=1;
 assert.equal(shoot().foul,false);
 const firstContact=world.events.findIndex(e=>e.type==='hit'&&(e.a===0||e.b===0));
 assert.ok(firstContact>0&&world.events.slice(0,firstContact).some(e=>e.type==='rail'&&e.id===0));
});

test('Computer chalk timing distinguishes ordinary, professional and demanding elite shots',()=>{
 const player=new World('nine'),ref=new Referee('nine','low');
 ref.computerGrip=.65;
 assert.equal(computerNeedsChalk(ref),false);
 ref.difficulty='medium';
 assert.equal(computerNeedsChalk(ref),true);
 ref.difficulty='high';ref.computerGrip=.88;
 assert.equal(computerNeedsChalk(ref,{speed:2,top:.1}),false);
 assert.equal(computerNeedsChalk(ref,{speed:2,top:-.48}),true);
 assert.equal(player.tipCondition,1);
});

test('All levels choose a legal new hand-in position, with different pool placement plans',()=>{
 for(const mode of ['nine','eight','snooker']){
  const positions=[];
  for(const difficulty of ['low','medium','high']){
   const world=new World(mode),ref=new Referee(mode,difficulty);
   for(const ball of world.balls)if(ball.id&&ball.id!==1)ball.potted=true;
   const cue=world.balls[0];
   Object.assign(cue,{x:-.6,y:0,potted:mode==='snooker'});
   Object.assign(world.balls.find(ball=>ball.id===1),{x:0,y:world.c.width/2-.20});
   world.cuePlacementZone=mode==='snooker'?'d':'table';
   ref.turn=1;ref.shots=2;
   const shot=planComputerShot(world,ref,()=>.5);
   assert.ok(world.canPlaceCue(shot.placement.x,shot.placement.y));
   assert.ok(Math.hypot(shot.placement.x-cue.x,shot.placement.y-cue.y)>.05);
   positions.push(shot.placement);
   assert.ok(world.placeCue(shot.placement.x,shot.placement.y));
   ref.begin(world);
   world.strike(shot.angle,shot.speed,shot.side,shot.top);
   while(world.running)world.step(1/240);
   assert.equal(ref.finish(world).foul,false);
  }
  if(mode!=='snooker')assert.equal(new Set(positions.map(p=>p.x.toFixed(3)+':'+p.y.toFixed(3))).size,3);
 }
});

test('Execution variation cannot turn a planned straight pot into a scratch on any level',()=>{
 for(const mode of ['nine','eight','snooker'])for(const difficulty of ['low','medium','high']){
  const world=new World(mode),ref=new Referee(mode,difficulty);
  const id=mode==='nine'?9:mode==='eight'?8:21;
  for(const b of world.balls)if(b.id&&b.id!==id)b.potted=true;
  Object.assign(world.balls[0],{x:.15,y:0});
  Object.assign(world.balls.find(b=>b.id===id),{x:0,y:world.c.width/2-.12});
  world.cuePlacementZone=null;ref.turn=1;ref.shots=4;
  if(mode==='eight')ref.group='solid';
  if(mode==='snooker')ref.phase='clear';
  const shot=planComputerShot(world,ref,()=>1);
  if(difficulty==='high'){
   assert.equal(shot.side,0);
   assert.equal(shot.top,0);
   assert.ok(shot.speed<1.5,'A simple finish should not require power or spin');
   const tired=planComputerShot(world,ref,()=>1,.64);
   assert.ok(Math.abs(tired.angle-shot.angle)<=.001&&Math.abs(tired.speed-shot.speed)<.02);
   assert.ok(tired.angle!==shot.angle||tired.speed!==shot.speed);
   Object.assign(shot,tired);
  }
  ref.begin(world);
  world.strike(shot.angle,shot.speed,shot.side,shot.top);
  for(let i=0;world.running&&i<3000;i++)world.step(1/240);
  assert.equal(world.running,false);
  assert.equal(ref.finish(world).foul,false,`${mode} ${difficulty}`);
  assert.equal(ref.outcome,'loss',`${mode} ${difficulty} must pot the winning ball`);
 }
});

test('The star clears simple finishes with visible cue-ball action in each discipline',()=>{
 for(const [mode,id] of [['nine',9],['eight',8],['snooker',21]]){
  const world=new World(mode),ref=new Referee(mode,'star');
  for(const b of world.balls)if(b.id&&b.id!==id)b.potted=true;
  Object.assign(world.balls[0],{x:.15,y:0});
  Object.assign(world.balls.find(b=>b.id===id),{x:0,y:world.c.width/2-.12});
  world.cuePlacementZone=null;ref.turn=1;ref.shots=4;
  if(mode==='eight')ref.group='solid';
  if(mode==='snooker')ref.phase='clear';
  const shot=planComputerShot(world,ref,()=>.5);
  assert.ok(Math.hypot(shot.top,shot.side)>.4||shot.speed>2,`${mode} star should play an expressive stroke`);
  ref.begin(world);
  world.strike(shot.angle,shot.speed,shot.side,shot.top);
  while(world.running)world.step(1/240);
  assert.equal(ref.finish(world).foul,false,mode);
  assert.equal(ref.outcome,'loss',mode);
  assert.ok(world.events.some(e=>e.type==='rail'&&e.id===0),mode);
 }
});

test('Practice guidance uses the high planner and traces playable shots without changing the table',()=>{
 for(const mode of ['nine','eight','snooker']){
  const world=new World(mode),ref=new Referee(mode);
  const id=mode==='nine'?9:mode==='eight'?8:21;
  for(const b of world.balls)if(b.id&&b.id!==id)b.potted=true;
  Object.assign(world.balls[0],{x:.15,y:0});
  Object.assign(world.balls.find(b=>b.id===id),{x:0,y:world.c.width/2-.12});
  world.cuePlacementZone=null;ref.shots=4;
  if(mode==='eight')ref.group='solid';
  if(mode==='snooker')ref.phase='clear';
  const before=JSON.stringify({world,ref}),search=practiceShotSearch(world,ref);
  let step=search.next();while(!step.done)step=search.next();
  const advice=step.value;
  assert.equal(advice.target.id,id,mode);
  assert.equal(advice.legalPot,true,mode);
  assert.ok(advice.paths.length>=2,mode);
  assert.equal(advice.paths[0].length,2,mode);
  const [start,contact]=advice.paths[0];
  assert.ok(Math.abs((contact.y-start.y)*Math.cos(advice.angle)-(contact.x-start.x)*Math.sin(advice.angle))<.003,mode);
  assert.equal(JSON.stringify({world,ref}),before,mode);
  ref.begin(world);
  assert.ok(world.strike(advice.angle,advice.speed,advice.side,advice.top));
  while(world.running)world.step(1/240);
  assert.equal(ref.finish(world).foul,false,mode);
  assert.equal(ref.outcome,'win',mode);
 }
});

test('Practice guidance marks the cushion and finds a legal escape when every direct line is blocked',()=>{
 for(const [mode,blocker] of [['nine',2],['eight',9],['snooker',16]]){
  const world=new World(mode),ref=new Referee(mode);
  world.cuePlacementZone=null;ref.shots=4;
  if(mode==='eight')ref.group='solid';
  for(const b of world.balls)b.potted=![0,1,blocker].includes(b.id);
  const cue=world.balls[0],target=world.balls.find(b=>b.id===1);
  Object.assign(cue,{x:-.5,y:0});Object.assign(target,{x:.55,y:0});
  Object.assign(world.balls.find(b=>b.id===blocker),{x:-.3,y:0});
  assert.equal(escapeWindow(world,[target]).visible,0);
  const search=practiceShotSearch(world,ref);
  let step=search.next();while(!step.done)step=search.next();
  const advice=step.value;
  assert.equal(advice.target.id,1,mode);
  assert.ok(advice.cushions.length>0,mode);
  assert.ok(advice.cushions.every(point=>advice.paths[0].includes(point)),mode);
  ref.begin(world);world.strike(advice.angle,advice.speed,advice.side,advice.top);
  while(world.running)world.step(1/240);
  assert.equal(world.firstHit,1,mode);
  assert.equal(ref.finish(world).foul,false,mode);
 }
});
