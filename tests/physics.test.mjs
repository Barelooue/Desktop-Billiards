import test from 'node:test';
import assert from 'node:assert/strict';
import {World,MODES,ball,rack,sample} from '../src/physics.js';
import {Referee} from '../src/rules.js';
import {BREAK_MAX_SPEED,BREAK_MAX_POWER,PLAYER_MAX_SPEED,playerShotSpeed,isPoolBreak} from '../src/shot-controls.js';
const run=(w,seconds=30)=>{for(let i=0;i<seconds*240&&w.running;i++)w.step(1/240);};
const energy=b=>.5*(b.vx*b.vx+b.vy*b.vy)+.2*b.r*b.r*(b.wx*b.wx+b.wy*b.wy+b.wz*b.wz);
test('three modes have regulation counts, no overlaps, and valid rack anchors',()=>{
 for(const mode of Object.keys(MODES)){const balls=rack(mode,()=>.42),c=MODES[mode];assert.equal(balls.length,c.count+1);assert.equal(new Set(balls.map(b=>b.id)).size,balls.length);
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++)assert.ok(Math.hypot(balls[i].x-balls[j].x,balls[i].y-balls[j].y)>=c.radius*2-1e-8,`${mode} overlap`);
 }assert.equal(rack('nine')[1].id,1);assert.equal(rack('nine')[5].id,9);assert.equal(rack('eight')[5].id,8);
});
test('rack shuffle has no duplicates and preserves its input',()=>{const a=Array.from({length:100},(_,i)=>i);assert.equal(new Set(sample(a,21)).size,21);assert.equal(sample(a,200).length,100);assert.equal(a[0],0);});
test('head-on collision conserves momentum and does not add energy',()=>{const w=new World(),r=w.c.radius,a=ball(0,0,0,r),b=ball(1,r*2-.0001,0,r);a.vx=2;const before=energy(a)+energy(b);w.collide(a,b);assert.ok(Math.abs(a.vx+b.vx-2)<1e-9);assert.ok(b.vx>1.9);assert.ok(energy(a)+energy(b)<=before);});
test('cloth transitions from sliding to rolling and eventually rests',()=>{const w=new World();w.segments=[];w.pockets=[];w.c={...w.c,length:100,width:100};w.balls=[ball(0,0,0,w.c.radius)];w.strike(0,1);for(let i=0;i<100;i++)w.step(1/240);const b=w.balls[0];assert.ok(Math.abs(b.vx-b.r*b.wy)<1e-5);run(w);assert.equal(w.running,false);assert.equal(b.vx,0);});
test('draw follows contact torque and returns cue ball after object contact',()=>{const w=new World(),r=w.c.radius;w.segments=[];w.pockets=[];w.balls=[ball(0,-.12,0,r),ball(1,0,0,r)];w.strike(0,2,0,-.7);for(let i=0;i<75;i++)w.step(1/240);assert.equal(w.firstHit,1);assert.ok(w.balls[0].vx<-.1,`vx ${w.balls[0].vx}`);});
test('side spin changes cushion rebound tangent and dissipates energy',()=>{const w=new World(),r=w.c.radius;const s={ax:1,ay:-1,bx:1,by:1};const a=ball(0,1-r+.0001,0,r);a.vx=2;a.wz=50;const before=energy(a);w.cushion(a,s);assert.ok(a.vx<0);assert.ok(Math.abs(a.vy)>.01);assert.ok(energy(a)<before);});
test('fast break resolves collisions without tunneling or nonfinite positions',()=>{const w=new World();w.strike(0,7);run(w,40);assert.equal(w.firstHit,1);assert.equal(w.running,false);for(const b of w.balls){assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));assert.ok(b.potted||(Math.abs(b.x)<=w.c.length/2+.15&&Math.abs(b.y)<=w.c.width/2+.15));}});
test('Nine-ball and Heyball can break above normal full power, with the limit restored after the stroke',()=>{
 assert.equal(playerShotSpeed(BREAK_MAX_POWER),PLAYER_MAX_SPEED);
 assert.ok(BREAK_MAX_SPEED>PLAYER_MAX_SPEED&&BREAK_MAX_SPEED<PLAYER_MAX_SPEED*1.13);
 for(const mode of ['nine','eight']){
  const w=new World(mode),ref=new Referee(mode);
  assert.equal(isPoolBreak(w,ref),true);
  ref.begin(w);
  assert.equal(w.strike(0,BREAK_MAX_SPEED,0,0,{breakBoost:true}),true);
  assert.equal(w.balls[0].vx,BREAK_MAX_SPEED);
  run(w,40);
  assert.equal(w.running,false);
  assert.equal(w.firstHit,w.balls[1].id);
  ref.finish(w);
  w.cuePlacementZone='head';
  assert.equal(isPoolBreak(w,ref),false);
 }
 const snooker=new World('snooker');
 assert.equal(isPoolBreak(snooker,new Referee('snooker')),false);
 assert.equal(snooker.strike(0,BREAK_MAX_SPEED,0,0,{breakBoost:true}),true);
 assert.equal(snooker.balls[0].vx,7);
});
test('corner pocket pots and legal placement rejects overlaps and pocket openings',()=>{const w=new World(),p=w.pockets[0];const b=w.balls[0];b.x=p.x;b.y=p.y;w.running=true;w.step(1/240);w.cuePlacementZone='table';assert.ok(b.potted);assert.ok(!w.placeCue(w.balls[1].x,w.balls[1].y));assert.ok(!w.placeCue(p.x,p.y));assert.ok(w.placeCue(-.3,0));});
test('resting simulation does not drift or allocate event spam',()=>{const w=new World();const old=JSON.stringify(w.balls);for(let i=0;i<1000;i++)w.step(1/240);assert.equal(JSON.stringify(w.balls),old);assert.equal(w.events.length,0);});
test('nine-ball referee rejects wrong first contact and respots foul nine',()=>{const w=new World(),ref=new Referee('nine');ref.begin(w);w.firstHit=2;w.balls.find(b=>b.id===9).potted=true;w.events=[{type:'hit',a:0,b:2},{type:'pot',id:9,value:9}];const result=ref.finish(w);assert.ok(result.ballInHand);assert.equal(ref.done,false);assert.equal(w.balls.find(b=>b.id===9).potted,false);});
test('eight-ball black before group clearance ends the rack',()=>{const w=new World('eight'),ref=new Referee('eight');ref.begin(w);w.firstHit=8;w.events=[{type:'pot',id:8,value:8}];const result=ref.finish(w);assert.equal(ref.done,true);assert.match(result.message,/提前/);});
test('snooker alternates red and color, scores, and respots color',()=>{const w=new World('snooker'),ref=new Referee('snooker');ref.begin(w);w.firstHit=1;w.balls.find(b=>b.id===1).potted=true;w.events=[{type:'pot',id:1,value:1}];ref.finish(w);assert.equal(ref.phase,'color');assert.equal(ref.score,1);ref.begin(w);w.firstHit=21;w.balls.find(b=>b.id===21).potted=true;w.events=[{type:'pot',id:21,value:7}];ref.finish(w);assert.equal(ref.phase,'red');assert.equal(ref.score,8);assert.equal(w.balls.find(b=>b.id===21).potted,false);});
