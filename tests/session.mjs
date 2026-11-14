import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('release/web'),key='desktop-billiards.history.v1';
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8445,'127.0.0.1',r));await mkdir('test-output',{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.BILLIARDS_TEST=true;});
 const history=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{"rounds":[]}').rounds,key);
 const state=()=>page.evaluate(()=>billiards.state);
 await page.goto('http://127.0.0.1:8445');await page.waitForFunction(()=>window.billiards);
 assert.match(await page.title(),/一个人的台球/);
 await page.locator('[data-mode=eight]').click();await page.locator('#start-game').click();
 await page.waitForTimeout(250);assert.ok((await state()).elapsedMs>200);
 await page.keyboard.press('F1');const pausedTime=(await state()).elapsedMs;await page.waitForTimeout(200);assert.equal((await state()).elapsedMs,pausedTime);
 await page.keyboard.press('F1');await page.locator('#confirm-placement').click();await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 const saved=await page.evaluate(key=>{
  billiards.shot(0,.3);const ok=window.prepareBilliardsClose();return {ok,snapshot:JSON.parse(localStorage.getItem(key)).rounds[0]};
 },key);
 assert.equal(saved.ok,true);assert.equal(saved.snapshot.world.running,true);
 await page.reload();await page.waitForFunction(()=>window.billiards);await page.locator('#history-open').click();assert.equal(await page.locator('[data-round]').count(),1);
 await page.screenshot({path:'test-output/20-history.png'});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#history').isVisible(),false);
 assert.equal((await state()).started,false);await page.locator('#history-open').click();
 const restored=await page.evaluate(()=>{document.querySelector('[data-round]').click();return {balls:billiards.world.balls,events:billiards.world.events,elapsedMs:billiards.state.elapsedMs,id:billiards.state.roundId,shots:billiards.ref.shots};});
 assert.deepEqual(restored.balls,saved.snapshot.world.balls);assert.deepEqual(restored.events,saved.snapshot.world.events);
 assert.equal(restored.id,saved.snapshot.id);assert.ok(restored.elapsedMs>=saved.snapshot.elapsedMs&&restored.elapsedMs<saved.snapshot.elapsedMs+100);
 // Finish a legal black with the opposite group still on the table.
 await page.evaluate(()=>{const w=billiards.world,r=billiards.ref;for(const b of w.balls){b.vx=b.vy=b.wx=b.wy=b.wz=0;b.potted=b.id>0&&b.id<8;}r.group='solid';r.score=7;r.begin(w);w.firstHit=8;w.events=[{type:'hit',a:0,b:8,speed:1}];w.pot(w.balls.find(b=>b.id===8));w.running=true;});
 await page.locator('#result').waitFor({state:'visible'});assert.equal(await page.locator('#result-title').textContent(),'本局获胜');assert.equal((await history()).length,0);
 const wonTime=(await state()).elapsedMs;await page.waitForTimeout(150);assert.equal((await state()).elapsedMs,wonTime);
 assert.equal(await page.evaluate(()=>billiards.world.balls.filter(b=>b.id&&!b.potted).length),7);
 await page.screenshot({path:'test-output/21-result-win.png'});
 await page.locator('#play-again').click();assert.equal((await state()).mode,'eight');assert.ok((await state()).elapsedMs<500);assert.notEqual((await state()).roundId,saved.snapshot.id);
 await page.locator('#confirm-placement').click();
 await page.evaluate(()=>{const w=billiards.world,r=billiards.ref;r.begin(w);w.firstHit=8;w.events=[{type:'hit',a:0,b:8,speed:1}];w.pot(w.balls.find(b=>b.id===8));w.running=true;});
 await page.locator('#result').waitFor({state:'visible'});assert.equal(await page.locator('#result-title').textContent(),'本局失败');assert.equal((await history()).length,0);
 await page.screenshot({path:'test-output/22-result-loss.png'});await page.keyboard.press('Escape');assert.equal((await state()).started,false);
 await page.reload();await page.waitForFunction(()=>window.billiards);assert.equal((await history()).length,0,'Neither win nor loss leaves a resumable round');
 // Multiple unfinished rounds, native Escape route, and pause/menu navigation.
 await page.locator('#start-game').click();await page.keyboard.press('F1');await page.locator('#return-home').click();
 await page.locator('[data-mode=snooker]').click();await page.locator('#start-game').click();
 await page.evaluate(()=>{window.exitMessages=[];window.chrome??={};window.chrome.webview={postMessage:m=>window.exitMessages.push(m)};});
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.exitMessages.length),0);assert.equal((await state()).started,false);assert.equal((await history()).length,2);
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.exitMessages.length),1);
 await page.reload();await page.waitForFunction(()=>window.billiards);await page.locator('#history-open').click();assert.equal(await page.locator('[data-round]').count(),2);
 const snooker=(await history()).find(s=>s.mode==='snooker');await page.locator(`[data-round="${snooker.id}"]`).click();await page.locator('#confirm-placement').click();
 await page.evaluate(()=>{const w=billiards.world,r=billiards.ref;for(const b of w.balls)if(b.id&&b.id!==21)b.potted=true;r.phase='clear';r.score=140;r.begin(w);w.firstHit=21;w.events=[{type:'hit',a:0,b:21,speed:1}];w.pot(w.balls.find(b=>b.id===21));w.running=true;});
 await page.locator('#result').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>billiards.ref.score),147);assert.equal((await history()).length,1);
 assert.equal((await history())[0].mode,'nine');await page.screenshot({path:'test-output/23-snooker-complete.png'});
 assert.deepEqual(errors,[]);await writeFile('test-output/session-report.json',JSON.stringify({passed:true,errors,movingShotRestored:true,timerPauses:true,winAndLossRemoved:true,snookerScore:147},null,2));
 console.log('History, moving-shot restore, timer, result dialogs, replay, home and snooker scoring checks passed');
}finally{await browser?.close();server.close();}
