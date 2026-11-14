import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {Referee} from '../src/rules.js';
import {HistoryStore,HISTORY_KEY,ROUND_RETENTION_MS,RoundClock,formatTime,captureRound,restoreRound} from '../src/session.js';
import {freshComputerFatigue,computerFatigueLevel,recordComputerStroke,nextFrameFatigue} from '../src/computer-fatigue.js';
const snapshot=(world=new World('eight'),ref=new Referee(world.mode),id='round-1')=>captureRound({id,createdAt:100,world,ref,elapsedMs:12345,ballInHand:!world.running,orbit:Math.PI,eyeHeight:.95,spin:{x:0,y:0},guide:true,soundEnabled:true});
const memory=()=>{let raw=null;return {getItem:()=>raw,setItem:(_,value)=>raw=value};};
test('Stopwatch excludes pauses and closed-app time; restored elapsed time continues',()=>{
 let now=100;const clock=new RoundClock(()=>now);clock.start();now+=1234;assert.equal(clock.value(),1234);
 clock.pause();now+=60000;assert.equal(clock.value(),1234);clock.start();now+=500;assert.equal(clock.value(),1734);
 clock.reset(90000);now+=99999;assert.equal(clock.value(),90000);clock.start();now+=250;assert.equal(clock.value(),90250);
 assert.equal(formatTime(90250),'01:30.2');assert.equal(formatTime(3661234),'01:01:01.2');
});
test('Computer fatigue grows gradually with time, workload and shot difficulty and survives saves',()=>{
 const easy={speed:1,top:0,side:0,quality:2};
 const hard={speed:4,top:.4,side:.3,quality:-1,placement:{x:0,y:0}};
 const light=freshComputerFatigue(()=>.5),busy=freshComputerFatigue(()=>.5),fast=freshComputerFatigue(()=>1);
 for(let n=0;n<40;n++){
  recordComputerStroke(light,easy);recordComputerStroke(busy,hard);recordComputerStroke(fast,hard);
 }
 const level=(s,min,difficulty='low')=>computerFatigueLevel(s,min*60000,difficulty);
 assert.equal(level(freshComputerFatigue(),0),0);
 assert.ok(level(busy,5)<.05);
 assert.ok(level(busy,30)>level(light,30));
 assert.ok(level(fast,30)>level(busy,30));
 assert.ok(level(busy,60)>level(busy,30));
 assert.ok(level(busy,60,'high')<level(busy,60,'medium'));
 assert.ok(level(busy,60,'medium')<level(busy,60));
 assert.ok(level(busy,600)<=1);
 const carried=nextFrameFatigue(busy,30*60000);
 assert.ok(level(carried,0)>0&&level(carried,0)<level(busy,30));
 const world=new World('snooker'),ref=new Referee('snooker','high');
 ref.computerFatigue=carried;
 assert.deepEqual(restoreRound(snapshot(world,ref)).ref.computerFatigue,carried);
});
test('Moving-shot roundtrip preserves physics and referee state, including already-recorded pots',()=>{
 const w=new World('nine'),r=new Referee('nine');r.begin(w);w.strike(0,5);for(let i=0;i<100;i++)w.step(1/240);
 const saved=snapshot(w,r),restored=restoreRound(saved);assert.deepEqual(restored.world.balls,w.balls);assert.deepEqual(restored.world.events,w.events);
 for(let i=0;i<10000&&(w.running||restored.world.running);i++){w.step(1/240);restored.world.step(1/240);}
 assert.deepEqual(restored.world.balls,w.balls);assert.deepEqual(restored.ref.finish(restored.world),r.finish(w));assert.equal(restored.ref.score,r.score);
});
test('History upserts one round, keeps independent rounds and deletes completed entries',()=>{
 const storage=memory(),h=new HistoryStore(storage),s=snapshot();assert.ok(h.save(s));
 s.elapsedMs=99999;assert.ok(h.save(s));assert.equal(h.read().length,1);assert.equal(h.read()[0].elapsedMs,99999);
 assert.ok(h.save(snapshot(undefined,undefined,'round-2')));assert.equal(h.read().length,2);
 assert.ok(h.remove('round-1'));assert.equal(h.read()[0].id,'round-2');
 const r=new Referee('eight');r.done=true;assert.equal(snapshot(new World('eight'),r),null);
 assert.equal(h.save({...s,referee:{...s.referee,done:true}}),false);assert.equal(h.read().length,1);
});
test('Corrupt or unavailable storage is reported and never overwritten',()=>{
 const storage=memory();storage.setItem(HISTORY_KEY,'broken');const h=new HistoryStore(storage);
 assert.deepEqual(h.read(),[]);assert.ok(h.error);assert.equal(h.save(snapshot()),false);assert.equal(storage.getItem(HISTORY_KEY),'broken');
 const full=new HistoryStore({getItem:()=>null,setItem(){throw Error('quota');}});assert.equal(full.save(snapshot()),false);assert.ok(full.error);
 const bad=snapshot();bad.world.balls[0].x=null;assert.throws(()=>restoreRound(bad));
});

test('History deletes rounds 72 hours after the last save and preserves account data',()=>{
 const storage=memory();let now=Date.now();
 const history=new HistoryStore(storage,()=>now);
 const older={...snapshot(undefined,undefined,'older'),updatedAt:now};
 const newer={...snapshot(undefined,undefined,'newer'),updatedAt:now+1};
 history.transact(data=>{data.rounds=[older,newer];data.account.balance=12345;});
 const account=JSON.parse(storage.getItem(HISTORY_KEY)).account;
 now+=ROUND_RETENTION_MS-1;
 assert.equal(history.read().length,2);
 now++;
 assert.deepEqual(history.read().map(round=>round.id),['newer']);
 const saved=JSON.parse(storage.getItem(HISTORY_KEY));
 assert.deepEqual(saved.rounds.map(round=>round.id),['newer']);
 assert.deepEqual(saved.account,account);
 now++;
 assert.equal(history.account().balance,12345);
 assert.deepEqual(JSON.parse(storage.getItem(HISTORY_KEY)).rounds,[]);
});

test('History removes legacy showcase rounds while retaining other saved games',()=>{
 const storage=memory(),history=new HistoryStore(storage);
 const regular=snapshot();
 const showcase=snapshot(new World('eight'),new Referee('eight','high'),'showcase');
 showcase.tournament={key:'club',stage:0,showcase:true,controlledSide:null};
 storage.setItem(HISTORY_KEY,JSON.stringify({version:1,rounds:[regular,showcase]}));
 assert.deepEqual(history.read().map(round=>round.id),[regular.id]);
 assert.deepEqual(JSON.parse(storage.getItem(HISTORY_KEY)).rounds.map(round=>round.id),[regular.id]);
});
