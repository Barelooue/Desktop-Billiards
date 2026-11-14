import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {playerShotPower} from '../src/shot-controls.js';
import {EVENTS} from '../src/events.js';
import {raceTo} from '../src/match-format.js';

const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
const server=createServer(async(req,res)=>{
 const file=files[req.url];
 if(!file){res.writeHead(404).end();return;}
 const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
 res.setHeader('Content-Type',type);
 res.end(await readFile('release/web/'+file));
});
await new Promise(resolve=>server.listen(8449,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://data-api.ecb.europa.eu/**',route=>route.fulfill({
  headers:{'access-control-allow-origin':'*','content-type':'text/csv'},
  body:'CURRENCY,TIME_PERIOD,OBS_VALUE\nGBP,2026-11-13,0.84\nUSD,2026-11-13,1.12\nCNY,2026-11-13,7.40'
 }));
 const calendarDate=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const [calendarYear,calendarMonth,calendarDay]=calendarDate.split('-').map(Number);
 const monthLabel=new Date(Date.UTC(calendarYear,calendarMonth-1,calendarDay)).toLocaleString('en',{month:'long',timeZone:'UTC'});
 await page.route('https://worldnineballtour.com/schedule/',route=>route.fulfill({
  headers:{'access-control-allow-origin':'*','content-type':'text/html'},
  body:`<div class="card-event" data-type="major"><a href="https://worldnineballtour.com/events/test/"><div class="support-content"><strong>${monthLabel} ${calendarDay} ${calendarYear}</strong></div><div class="title">Sample International Open</div><div class="venue">Sample venue</div></a></div>`
 }));
 await page.goto('http://127.0.0.1:8449');
 await page.waitForFunction(()=>window.billiards?.world);
 const opponent=page.locator('#opponent');
 await opponent.click({timeout:3000});
 await opponent.press('ArrowDown');
 await opponent.press('Enter');
 assert.equal(await opponent.inputValue(),'computer');
 const difficultyDialog=page.locator('#difficulty');
 await page.locator('#start-game').click();
 await difficultyDialog.waitFor({state:'visible'});
 assert.equal(await difficultyDialog.locator('[data-difficulty]').count(),4);
 assert.equal(await page.evaluate(()=>billiards.state.started),false);
 await page.keyboard.press('Escape');
 await difficultyDialog.waitFor({state:'hidden'});
 await page.keyboard.press('Enter');
 await difficultyDialog.waitFor({state:'visible'});
 await page.locator('#difficulty-cancel').click();
 await opponent.selectOption('');
 await page.locator('#start-game').click();
 assert.equal(await difficultyDialog.isVisible(),false);
 await page.locator('#confirm-placement').click();
 const coach=page.locator('#coach-toggle');
 const initial=await page.evaluate(()=>billiards.world.balls.map(({x,y})=>[x,y]));
 await coach.click();
 await page.waitForFunction(()=>billiards.view.coachOverhead&&billiards.view.coachLines.children.length>2);
 assert.ok(await page.evaluate(()=>{
  const v=billiards.view,dir=v.camera.getWorldDirection(v.camera.position.clone());
  return dir.y<-.99999&&Math.abs(dir.x)+Math.abs(dir.z)<1e-6;
 }));
 assert.match(await page.locator('#coach-advice').textContent(),/1 号球/);
 assert.deepEqual(await page.evaluate(()=>billiards.world.balls.map(({x,y})=>[x,y])),initial);
 await page.locator('#coach-apply').click();
 await page.screenshot({path:'test-output/coach-overhead.png'});
 const lineIds=()=>page.evaluate(()=>billiards.view.coachLines.children.map(line=>line.id));
 const lines=await lineIds();
 await coach.click();
 assert.equal(await page.evaluate(()=>billiards.view.coachOverhead),false);
 assert.deepEqual(await lineIds(),lines);
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>billiards.view.postureSettled);
 assert.deepEqual(await lineIds(),lines);
 const aimGuide=page.locator('#game-hud [data-guide]');
 assert.equal(await aimGuide.getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>billiards.view.guides.visible);
 await aimGuide.click();
 await page.waitForFunction(()=>!billiards.view.guides.visible);
 assert.deepEqual(await lineIds(),lines);
 await aimGuide.click();
 await page.waitForFunction(()=>billiards.view.guides.visible);
 // The demonstration uses the forecast even after the player changes aim.
 await page.evaluate(()=>{billiards.view.aim+=.24;});
 await page.locator('#coach-shoot').click();
 assert.deepEqual(await lineIds(),[]);
 await page.waitForFunction(()=>billiards.world.firstHit===1);
 await page.keyboard.press('Escape');
 // A paid event keeps its registration through a saved round and credits the placement once.
 const storeKey='desktop-billiards.history.v1';
 const account=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).account,storeKey);
 await opponent.selectOption('computer');
 await page.locator('#start-game').click();
 await difficultyDialog.locator('[data-difficulty="medium"]').click();
 const events=page.locator('#event-dialog');
 await page.locator('#official-calendar > summary').click();
 assert.equal(await page.locator('#calendar-refresh').isVisible(),true);
 const scheduled=page.locator('#calendar-options article').filter({hasText:'Sample International Open'});
 await scheduled.waitFor({state:'visible'});
 assert.match(await scheduled.textContent(),/Sample venue/);
 assert.equal(await scheduled.getByRole('button').count(),0);
 await page.locator('#official-calendar > summary').click();
 const year=events.locator('#event-year');
 await year.selectOption('2026');
 assert.equal(await events.locator('[data-event="us2026"]').count(),1);
 assert.equal(await events.locator('[data-event="us"]').count(),0);
 assert.equal(await events.locator('[data-event="club"]').count(),1);
 await year.selectOption('2021');
 assert.equal(await events.locator('[data-event="us"]').count(),1);
 await year.selectOption('');
 await page.waitForFunction(()=>document.querySelector('#event-fx').textContent.includes('2026-11-13 · 已同步'));
 assert.match(await page.locator('#home-wallet').textContent(),/£250\.00/);
 assert.equal(await events.locator('[data-event="us"]').isDisabled(),true);
 await events.locator('#event-bank').click();
 await page.locator('#bank-amount').fill('250.75');
 await page.locator('#bank-borrow').click();
 assert.equal((await account()).loans[0].original,25075);
 await page.locator('#bank-close').click();
 const before=(await account()).balance;
 const chooseOpener=async(player)=>{
  const dialog=page.locator('#opening-break');
  await dialog.waitFor({state:'visible'});
  const lag=dialog.locator('#lag-table');
  if(await lag.isVisible()){
   await page.evaluate(()=>{window.lagTestRandom=Math.random;Math.random=()=>.5;});
   const box=await lag.boundingBox();
   const x=box.x+box.width*.61,y=box.y+box.height*(.5+(744-52)/390/8);
   await page.mouse.move(x,y);
   await page.mouse.down();
   await page.mouse.move(x-box.width*.38*(player ? .668 : .5),y);
   await page.mouse.up();
   await page.evaluate(()=>{Math.random=window.lagTestRandom;delete window.lagTestRandom;});
   await dialog.locator('#opening-self').waitFor({state:'visible',timeout:30000});
  }
  const self=dialog.locator('#opening-self');
  if(player){
   assert.equal(await self.textContent(),'我先开球');
   await self.click();
  }else{
   const other=dialog.locator('#opening-other');
   if(await other.isVisible())await other.click();else await self.click();
  }
 };
 await events.locator('[data-event="uk"]').click();
 assert.equal(before-(await account()).balance,18750);
 const entry=await page.evaluate(()=>billiards.state.roundId);
 const lockedQuote=()=>page.evaluate(({key,id})=>JSON.parse(localStorage.getItem(key)).rounds.find(round=>round.id===id).tournament.quote,{key:storeKey,id:entry});
 assert.equal((await lockedQuote()).USD,1.12);
 const scoreboard=page.locator('#match-scoreboard');
 const checkScoreboard=async(player,computer,race)=>{
  assert.equal(await scoreboard.isVisible(),true);
  assert.equal(await scoreboard.locator('#scoreboard-player').textContent(),String(player));
  assert.equal(await scoreboard.locator('#scoreboard-computer').textContent(),String(computer));
  if(race)assert.equal(await scoreboard.locator('#scoreboard-race').textContent(),race);
 };
 assert.match(await page.locator('#event-stage').textContent(),/32 强/);
 await checkScoreboard(0,0,'抢 9');
 for(const width of [1280,620,420]){
  await page.setViewportSize({width,height:800});
  const board=await scoreboard.boundingBox(),settings=await page.locator('#settings-hint').boundingBox();
  assert.ok(Math.abs(board.x+board.width/2-width/2)<1);
  assert.ok(board.y>=0&&board.y+board.height<=80);
  assert.ok(board.x+board.width<=settings.x,`Scoreboard overlaps Settings at ${width}px`);
 }
 await page.setViewportSize({width:1280,height:800});
 await page.keyboard.press('Escape');
 await page.locator('#history-open').click();
 await page.locator(`[data-round="${entry}"]`).click();
 assert.equal(before-(await account()).balance,18750);
 await chooseOpener(true);
 await page.evaluate(()=>{
  Object.assign(billiards.ref.computerFatigue,{strokes:20,effort:8,priorMs:600000});
 });
 await page.locator('#confirm-placement').click();
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>billiards.view.postureSettled);
 const testShot=async(angle,power)=>{
  await page.evaluate(value=>{billiards.view.aim=value;billiards.view.invalidated=true;},angle);
  await page.waitForFunction(()=>billiards.view.stance&&billiards.view.postureSettled);
  await page.evaluate(({angle,power})=>billiards.shot(angle,power),{angle,power});
 };
 const winRack=async()=>{
 await page.evaluate(()=>{
  const {world,ref}=billiards;
  ref.shots=3;
  world.cuePlacementZone=null;
  for(const b of world.balls)if(b.id&&b.id!==9)b.potted=true;
  Object.assign(world.balls[0],{x:.15,y:0});
  Object.assign(world.balls.find(b=>b.id===9),{x:0,y:.5});
 });
 await testShot(Math.atan2(.5-.05715,-.15),playerShotPower(1.8));
 };
 await winRack();
 await page.locator('#result').waitFor({state:'visible'});
 assert.match(await page.locator('#result-payout').textContent(),/1 : 0.*本轮继续/);
 await checkScoreboard(1,0,'抢 9');
 assert.equal(await page.locator('#play-again').textContent(),'下一局');
 await page.locator('#result-home').click();
 const resumeEntry=async()=>{
  await page.locator('#history-open').click();
  await page.locator(`[data-round="${entry}"]`).click();
 };
 const setScore=score=>page.evaluate(({key,id,score})=>{
  const data=JSON.parse(localStorage.getItem(key));
  data.rounds.find(round=>round.id===id).tournament.matchScore=score;
  localStorage.setItem(key,JSON.stringify(data));
 },{key:storeKey,id:entry,score});
 await resumeEntry();
 assert.match(await page.locator('#event-stage').textContent(),/32 强/);
 await checkScoreboard(1,0,'抢 9');
 const carriedFatigue=await page.evaluate(()=>billiards.ref.computerFatigue);
 assert.equal(carriedFatigue.strokes,19);
 assert.equal(carriedFatigue.effort,7.5);
 assert.ok(carriedFatigue.priorMs>500000);
 await page.keyboard.press('Escape');
 await setScore([raceTo('nine','uk',EVENTS.nine.uk,-1)-1,0]);
 await resumeEntry();
 await page.locator('#confirm-placement').click();
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>billiards.view.postureSettled);
 await winRack();
 await page.locator('#result').waitFor({state:'visible'});
 assert.match(await page.locator('#result-payout').textContent(),/9 : 0.*晋级/);
 await page.locator('#play-again').click();
 assert.match(await page.locator('#event-stage').textContent(),/16 强/);
 await checkScoreboard(0,0);
 assert.equal(await page.evaluate(()=>billiards.ref.computerFatigue.strokes),0);
 assert.equal((await lockedQuote()).date,'2026-11-13');
 assert.equal(before-(await account()).balance,18750);
 assert.equal(await page.locator('#opening-break').isVisible(),true);
 await page.keyboard.press('Escape');
 await resumeEntry();
 await chooseOpener(true);
 await page.keyboard.press('Escape');
 await setScore([0,raceTo('nine','uk',EVENTS.nine.uk,0)-1]);
 await resumeEntry();
 await page.locator('#confirm-placement').click();
 await page.evaluate(()=>{
  billiards.ref.turn=0;
  billiards.world.cuePlacementZone=null;
 });
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>billiards.view.postureSettled);
 await page.evaluate(()=>{
  const {world,ref}=billiards;
  ref.shots=3;ref.turn=0;ref.foulStreak[0]=2;
 });
 await testShot(Math.PI/2,.02);
 await page.locator('#result').waitFor({state:'visible'});
 assert.match(await page.locator('#result-payout').textContent(),/偿还贷款 .*250\.75/);
 assert.match(await page.locator('#result-payout').textContent(),/£250\.75/);
 assert.match(await page.locator('#result-payout').textContent(),/汇率日期 2026-11-13/);
 assert.match(await page.locator('#result-payout').textContent(),/奖金 £2,812\.50/);
 assert.equal((await account()).loans.length,0);
 const finalBalance=(await account()).balance;
 await page.locator('#result-home').click();
 assert.equal((await account()).balance,finalBalance);
 for(const [mode,difficulty] of [['nine','low'],['eight','medium'],['snooker','high'],['nine','star']]){
  await page.locator(`[data-mode="${mode}"]`).click();
  await opponent.selectOption('computer');
  await page.locator('#start-game').click();
  await difficultyDialog.locator(`[data-difficulty="${difficulty}"]`).click();
  if(difficulty==='low'){
   assert.deepEqual(await events.locator('[data-event]').evaluateAll(buttons=>buttons.map(button=>button.dataset.event)),['club']);
   assert.equal(await year.isVisible(),false);
  }else{
   assert.ok(await events.locator('[data-event]').count()>1);
   assert.equal(await year.isVisible(),true);
  }
  await page.locator('#event-dialog [data-event="club"]').click();
  assert.equal(await page.evaluate(()=>billiards.ref.difficulty),difficulty);
  assert.equal(await coach.isVisible(),false);
  await chooseOpener(mode==='eight');
  if(mode!=='eight'){
   assert.equal(await page.evaluate(()=>billiards.ref.turn),1);
   assert.equal(await page.locator('#confirm-placement').isVisible(),false);
  }else{
   await page.locator('#confirm-placement').click();
   await page.keyboard.press('Space');
   await testShot(Math.PI/2,.02);
   await page.waitForFunction(()=>billiards.ref.turn===1&&billiards.ref.shots===0);
   assert.equal(await page.evaluate(()=>billiards.world.cuePlacementZone),'head');
  }
  await page.waitForFunction(()=>billiards.ref.turn===1);
  assert.match(await page.locator('#interaction-status').textContent(),/电脑回合/);
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>billiards.state.posture),'observe');
  if(difficulty==='high'||difficulty==='star'){
   const id=await page.evaluate(()=>billiards.state.roundId);
   await page.keyboard.press('Escape');
   await page.locator('#history-open').click();
   await page.locator(`[data-round="${id}"]`).click();
   assert.equal(await page.evaluate(()=>billiards.ref.difficulty),difficulty);
   assert.equal(await page.evaluate(()=>billiards.ref.turn),1);
   await page.evaluate(()=>{billiards.ref.computerGrip=.74;billiards.world.tipCondition=.59;});
   await page.waitForFunction(()=>billiards.view.chalkMotion?.owner==='computer');
   assert.match(await page.locator('#shot-message').textContent(),/电脑正在擦巧粉/);
   assert.equal(await page.evaluate(()=>billiards.ref.computerGrip),.74);
   await page.waitForFunction(()=>!billiards.view.chalkMotion&&billiards.ref.computerGrip===1);
   assert.equal(await page.evaluate(()=>billiards.world.tipCondition),.59);
  }
  await page.waitForFunction(()=>billiards.view.cue.visible&&!billiards.view.chalkMotion&&!billiards.world.running&&billiards.ref.turn===1,{},{timeout:60000});
  await page.waitForFunction(()=>billiards.ref.shots>=1,{},{timeout:60000}).catch(async error=>{
   const state=await page.evaluate(()=>({state:billiards.state,shots:billiards.ref.shots,turn:billiards.ref.turn,decision:billiards.ref.decision,status:document.querySelector('#shot-message').textContent}));
   throw new Error(`${mode} computer shot did not complete: ${JSON.stringify(state)}`,{cause:error});
  });
  if(difficulty==='star')assert.match(await page.locator('#mode-label').textContent(),/巅峰球星/);
  assert.ok(await page.evaluate(()=>billiards.ref.computerFatigue.strokes>=1));
  if(await page.locator('#rule-choice').isVisible())await page.locator('#rule-choice-actions button').first().click();
  await page.keyboard.press('Escape');
  await page.locator('#welcome').waitFor({state:'visible'});
 }
 const startSnookerConcessionFixture=async(score)=>{
  await page.locator('[data-mode="snooker"]').click();
  await opponent.selectOption('computer');
  await page.locator('#start-game').click();
  await difficultyDialog.locator('[data-difficulty="medium"]').click();
  await events.locator('[data-event="club"]').click();
  const id=await page.evaluate(()=>billiards.state.roundId);
  await page.keyboard.press('Escape');
  await page.evaluate(({key,id,score})=>{
   const data=JSON.parse(localStorage.getItem(key));
   const round=data.rounds.find(round=>round.id===id);
   delete round.tournament.opening;
   Object.assign(round.referee,{phase:'clear',shots:9,scores:score,turn:0});
   round.world.cuePlacementZone=null;
   for(const ball of round.world.balls)if(ball.id&&ball.value<5)ball.potted=true;
   localStorage.setItem(key,JSON.stringify(data));
  },{key:storeKey,id,score});
  await page.locator('#history-open').click();
  await page.locator(`[data-round="${id}"]`).click();
 };
 await startSnookerConcessionFixture([0,30]);
 assert.match(await page.locator('#concede-frame').textContent(),/超分 12/);
 await page.locator('#concede-frame').click();
 assert.match(await page.locator('#result-message').textContent(),/你认输/);
 await page.locator('#result-home').click();
 await startSnookerConcessionFixture([75,0]);
 await page.locator('#result').waitFor({state:'visible'});
 assert.match(await page.locator('#result-message').textContent(),/电脑认输/);
 await page.locator('#result-home').click();
 await page.evaluate(key=>{
  const data=JSON.parse(localStorage.getItem(key));
  data.account.wins.snooker=4;
  localStorage.setItem(key,JSON.stringify(data));
 },storeKey);
 await page.locator('#start-game').click();
 await difficultyDialog.locator('[data-difficulty="high"]').click();
 const world2024=events.locator('[data-event="world2024"]');
 await world2024.locator('..').locator('summary').click();
 assert.match(await world2024.locator('..').textContent(),/147 专项奖池 £40,000\.00/);
 await world2024.click();
 const maximumId=await page.evaluate(()=>billiards.state.roundId);
 await page.keyboard.press('Escape');
 const finalBlackAngle=Math.atan2(.889-.64,1.7845-1.35);
 await page.evaluate(({key,id,angle})=>{
  const data=JSON.parse(localStorage.getItem(key));
  const round=data.rounds.find(round=>round.id===id);
  delete round.tournament.opening;
  Object.assign(round.tournament,{stage:0,matchScore:[17,0]});
  Object.assign(round.referee,{phase:'clear',shots:35,scores:[140,0],score:140,breakPoints:140,turn:0});
  round.world.cuePlacementZone=null;
  const black=round.world.balls.find(ball=>ball.id===21);
  for(const ball of round.world.balls)if(ball.id&&ball.id!==21)ball.potted=true;
  Object.assign(round.world.balls[0],{x:1.35-.5*Math.cos(angle),y:.64-.5*Math.sin(angle)});
  Object.assign(black,{x:1.35,y:.64});
  localStorage.setItem(key,JSON.stringify(data));
 },{key:storeKey,id:maximumId,angle:finalBlackAngle});
 const balanceBeforeMaximum=(await account()).balance;
 await page.locator('#history-open').click();
 await page.locator(`[data-round="${maximumId}"]`).click();
 await page.keyboard.press('Space');
 await testShot(finalBlackAngle,playerShotPower(1.15));
 await page.locator('#result').waitFor({state:'visible'});
 assert.match(await page.locator('#result-summary').textContent(),/你单杆 147 分/);
 assert.match(await page.locator('#result-payout').textContent(),/147 奖金 £40,000\.00.*单杆最高分奖 £15,000\.00/);
 assert.equal((await account()).balance-balanceBeforeMaximum,55500000);
 assert.deepEqual(errors,[]);
 console.log('All four computer levels played a turn. Saved computer turn resumed successfully.');
}finally{
 await browser?.close();
 server.close();
}
