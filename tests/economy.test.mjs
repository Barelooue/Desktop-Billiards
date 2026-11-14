import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newAccount,accrue,borrow,repay,debt,loanRestriction,settlePrize} from '../src/economy.js';
import {EVENTS,eventPrize,snookerBreakPrize} from '../src/events.js';
import {ExchangeRates,parseEcbQuote,money,toPence} from '../src/currency.js';
import {HistoryStore,HISTORY_KEY} from '../src/session.js';
import {openingStage,raceTo,recordFrame,openingBreak,breakOrder} from '../src/match-format.js';
import {makeLagWorld,strikeLag,lagResult} from '../src/lag.js';

test('Showcase preserves race length and uses the chosen side for tournament progression',()=>{
 const mode='nine',key='uk',details=EVENTS[mode][key],stage=openingStage(key,details);
 const target=raceTo(mode,key,details,stage);
 const event={key,stage,breaker:0,matchScore:[0,target-1],showcase:true,controlledSide:null};
 const next=recordFrame(mode,details,event,false);
 assert.equal(next.kind,'round');
 assert.deepEqual(next.completed[0].score,[0,target]);
 assert.equal(recordFrame(mode,details,{...event,controlledSide:0},false).kind,'event');
 assert.equal(recordFrame(mode,details,{...event,controlledSide:1},false).kind,'round');
});

test('Edition-specific 147 and high-break prize pools are settled independently',()=>{
 const maximum={player:0,points:147,stage:0},other={...maximum,player:1};
 assert.deepEqual(snookerBreakPrize('club',[maximum]),{maximum:0,high:0});
 assert.deepEqual(snookerBreakPrize('world2024',[maximum,other],[{points:147,count:1},{points:147,count:1}]),{maximum:2000000,high:750000});
 assert.deepEqual(snookerBreakPrize('saudi2025',[maximum,maximum,other]),{maximum:3333333,high:0});
 assert.deepEqual(snookerBreakPrize('world2022',[{...maximum,stage:-1}]),{maximum:1000000,high:0});
 assert.deepEqual(snookerBreakPrize('worldopen2026',[maximum],[{points:147,count:1},{points:153,count:1}]),{maximum:0,high:0});
 assert.deepEqual(snookerBreakPrize('wuhan2026',[],[{points:98,count:1},{points:82,count:1}]),{maximum:0,high:500000});
});

test('Thirty day loan accrues interest on unpaid principal and keeps the freeze after repayment',()=>{
 const a=accrue(newAccount(),20000);
 borrow(a,1000000);
 accrue(a,20030);
 assert.equal(debt(a),1003750);
 assert.equal(loanRestriction(a),'');
 accrue(a,20031);
 assert.equal(debt(a),1003937);
 assert.ok(loanRestriction(a));
 assert.equal(a.loans[0].original,1000000);
 assert.equal(a.freezeUntil,20061);
 repay(a,debt(a));
 assert.equal(debt(a),0);
 assert.throws(()=>borrow(a,100),/暂停借款/);
 accrue(a,20061);
 borrow(a,100);
 assert.equal(debt(a),100);
});

test('Prize pays interest, principal, then credits the remainder',()=>{
 const a=accrue(newAccount(),20000);
 borrow(a,100000);
 accrue(a,20008);
 const receipt=settlePrize(a,'奖项',5000);
 assert.deepEqual(receipt,{value:5000,paid:5000,credit:0});
 assert.equal(a.loans[0].interest,0);
 assert.equal(a.loans[0].principal,95100);
 assert.equal(a.loans[0].original,100000);
 assert.deepEqual(settlePrize(a,'冠军',100000),{value:100000,paid:95100,credit:4900});
 assert.equal(a.balance,129900);
});

test('One knockout stage maps to the published placement payout',()=>{
 const event=EVENTS.snooker.qtour;
 assert.equal(eventPrize(event,0,false),0);
 assert.equal(eventPrize(event,1,false),35000);
 assert.equal(eventPrize(event,5,false),300000);
 assert.equal(eventPrize(event,5,true),600000);
 assert.equal(toPence(EVENTS.nine.uk.fee,'USD'),18860);
 assert.equal(money(18860),'£188.60');
});

test('New tournament entries start exactly one round before the first paid placement',()=>{
 for(const [mode,events] of Object.entries(EVENTS))for(const [key,event] of Object.entries(events)){
  const start=openingStage(key,event);
  assert.equal(eventPrize(event,start,false),0);
  if(key==='club')assert.equal(raceTo(mode,key,event,start),1);
  else{
   assert.ok(eventPrize(event,start+1,false)>0);
   assert.ok(raceTo(mode,key,event,start)>1);
  }
 }
});

test('The big score advances by rack and only resets when a match is won',()=>{
 const event=EVENTS.nine.uk;
 const start={key:'uk',stage:openingStage('uk',event),matchScore:[0,0],breaker:0};
 const loss=recordFrame('nine',event,start,false);
 assert.equal(loss.kind,'frame');
 assert.deepEqual(loss.next.matchScore,[0,1]);
 assert.equal(loss.next.breaker,1);
 let match=loss.next;
 for(let i=1;i<9;i++){
  const win=recordFrame('nine',event,match,true);
  assert.equal(win.kind,'frame');
  assert.equal(win.next.stage,start.stage);
  match=win.next;
 }
 const next=recordFrame('nine',event,match,true);
 assert.equal(next.kind,'round');
 assert.deepEqual(next.score,[9,1]);
 assert.deepEqual(next.next.matchScore,[0,0]);
 assert.deepEqual(next.next.opening,{kind:'lag'});
 assert.deepEqual(next.next.completed,[{stage:-1,score:[9,1]}]);
 assert.equal(raceTo('snooker','world',EVENTS.snooker.world,4),18);
});

test('Each event schedules the next rack by its break rule',()=>{
 for(const [mode,key,expected] of [['nine','world2025',0],['eight','world2024',1],['snooker','world',1]]){
  const event=EVENTS[mode][key];
  const start={key,stage:openingStage(key,event),matchScore:[0,0],breaker:0};
  assert.equal(recordFrame(mode,event,start,true).next.breaker,expected);
  assert.equal(recordFrame(mode,event,{...start,breaker:1},true).next.breaker,0);
 }
 assert.equal(breakOrder('nine','club'),'alternate');
});

test('Lag awards the choice to the closer legal return, and a snooker draw can select either side',()=>{
 const run=(mode,power,difficulty,angle=0,rng=()=>.5)=>{
  const world=makeLagWorld(mode),crossed=[false,false];
  assert.ok(strikeLag(world,power,angle,difficulty,rng));
  assert.ok(world.balls.every(ball=>ball.vx>0));
  while(world.running){
   world.step(1/240);
   world.balls.forEach((ball,id)=>{crossed[id]||=id===0?ball.y<=0:ball.y>=0;});
  }
  return lagResult(world,crossed);
 };
 for(const mode of ['eight','nine']){
  const player=run(mode,.668,'medium');
  assert.equal(player.chooser,0);
  assert.ok(player.player<player.computer);
  const computer=run(mode,.5,'medium');
  assert.equal(computer.chooser,1);
  assert.ok(computer.computer<computer.player);
  assert.equal(run(mode,.04,'medium').player,null);
  assert.equal(run(mode,.668,'medium',-.25).player,null);
  const levels=['low','medium','high','star'].map(level=>run(mode,.5,level).computer);
  assert.ok(levels.every((value,index)=>!index||value<levels[index-1]));
 }
 assert.deepEqual(openingBreak('snooker',()=>0),{kind:'draw',chooser:0});
 assert.deepEqual(openingBreak('snooker',()=>.5),{kind:'draw',chooser:1});
});

test('ECB quotes update from CSV and the last valid quote remains available offline',async()=>{
 const csv='CURRENCY,TIME_PERIOD,OBS_VALUE\nGBP,2026-11-13,0.84\nUSD,2026-11-13,1.12\nCNY,2026-11-13,7.40';
 assert.throws(()=>parseEcbQuote(csv.replace('USD,2026-11-13','USD,2026-11-12')),/日期/);
 const cache=new Map();
 const storage={getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)};
 const rates=new ExchangeRates(storage,async()=>({ok:true,text:async()=>csv}));
 await rates.refresh();
 assert.equal(rates.status,'已同步');
 assert.equal(toPence(250,'USD',rates.quote),18750);
 const offline=new ExchangeRates(storage,async()=>{throw Error('offline');});
 await offline.refresh();
 assert.equal(offline.status,'离线 · 缓存报价');
 assert.deepEqual(offline.quote,rates.quote);
});

test('Account writes preserve legacy history and rejected transactions leave the balance unchanged',()=>{
 const data=new Map([[HISTORY_KEY,JSON.stringify({version:1,rounds:[]})]]);
 const history=new HistoryStore({getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)});
 assert.equal(history.account().balance,25000);
 history.transact(({account})=>borrow(account,12345));
 const before=data.get(HISTORY_KEY);
 assert.throws(()=>history.transact(({account})=>{account.balance=-1;}),/未写入/);
 assert.equal(data.get(HISTORY_KEY),before);
 assert.equal(history.account().balance,37345);
 assert.equal(history.read().length,0);
});

test('Legacy yuan balances, loan amounts and ledger entries convert once without changing due dates',()=>{
 const old=accrue(newAccount());
 const opened=old.lastDay;
 old.balance=200000;
 borrow(old,89500);
 old.loans[0].interest=895;
 delete old.currency;
 const data=new Map([[HISTORY_KEY,JSON.stringify({version:1,rounds:[],account:old})]]);
 const history=new HistoryStore({getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)});
 const migrated=history.account();
 assert.equal(migrated.currency,'GBP');
 assert.equal(migrated.balance,32346);
 assert.equal(migrated.loans[0].principal,10000);
 assert.equal(migrated.loans[0].due,opened+30);
 assert.equal(migrated.loans[0].interest,100);
 assert.equal(migrated.ledger[0].change,10000);
 history.transact(()=>{});
 assert.deepEqual(history.account(),migrated);
});
