import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const executable=resolve('release/DesktopBilliards.exe');
const key='desktop-billiards.history.v1';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,browser;
async function launch(){
 child=spawn(executable,['--test'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Test window exited before connecting');
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9339');break;}catch{await delay(100);}
 }
 assert.ok(browser,'Native debugging endpoint is available');
 const context=browser.contexts()[0];
 let page;
 for(let i=0;i<100;i++){
  page=context.pages().find(p=>p.url().includes('billiards.local'));
  if(page)break;
  await delay(100);
 }
 assert.ok(page);await page.waitForFunction(()=>window.billiards?.world);
 return page;
}
async function waitClosed(){
 for(let i=0;i<100&&child.exitCode===null;i++)await delay(100);
 assert.ok(child.exitCode!==null||child.signalCode!==null,`Native process closes after saving (exit=${child.exitCode}, signal=${child.signalCode})`);
 await browser.close().catch(()=>{});browser=null;
}
try{
 let page=await launch();
 assert.match(await page.title(),/一个人的台球/);
 await page.locator('[data-mode=eight]').click();await page.locator('#start-game').click();
 if(await page.locator('#settings').isVisible())await page.locator('#settings-close').click();
 await page.waitForTimeout(350);
 await page.evaluate(()=>{billiards.world.tipCondition=.43;});
 const before=await page.evaluate(()=>({id:billiards.state.roundId,balls:billiards.world.balls,elapsedMs:billiards.state.elapsedMs}));
 assert.ok(before.elapsedMs>0);
 // Request native Form.Close directly, bypassing the frontend save helper.
 await page.evaluate(()=>window.chrome.webview.postMessage({type:'exit'}));
 await waitClosed();
 page=await launch();
 await page.locator('#history-open').click();
 const entry=await page.evaluate(({key,id})=>JSON.parse(localStorage.getItem(key)).rounds.find(s=>s.id===id),{key,id:before.id});
 assert.ok(entry,'Closing the real native window saves the active round');
 assert.equal(entry.world.tipCondition,.43);
 assert.deepEqual(entry.world.balls,before.balls);assert.ok(entry.elapsedMs>=before.elapsedMs);
 await page.locator(`[data-round="${before.id}"]`).click();
 if(await page.locator('#settings').isVisible())await page.locator('#settings-close').click();
 const resumed=await page.evaluate(()=>billiards.state);
 assert.equal(resumed.roundId,before.id);assert.ok(resumed.elapsedMs>=entry.elapsedMs);
 assert.equal(await page.evaluate(()=>billiards.world.tipCondition),.43);
 assert.ok(resumed.elapsedMs<entry.elapsedMs+2000,'Closed-app time is excluded');
 await page.locator('#confirm-placement').click();
 await page.evaluate(()=>{const w=billiards.world,r=billiards.ref;r.begin(w);w.firstHit=8;w.events=[{type:'hit',a:0,b:8}];w.pot(w.balls.find(b=>b.id===8));w.running=true;});
 await page.locator('#result').waitFor({state:'visible'});
 assert.equal(await page.locator('#result-title').textContent(),'本局失败');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#welcome').isVisible(),true);
 await page.keyboard.press('Escape');await waitClosed();
 page=await launch();
 assert.equal(await page.evaluate(({key,id})=>JSON.parse(localStorage.getItem(key)).rounds.some(s=>s.id===id),{key,id:before.id}),false);
 await page.keyboard.press('Escape');await waitClosed();
 await writeFile('test-output/native-session-report.json',JSON.stringify({passed:true,windowCloseSaved:true,relaunchRestored:true,closedTimeExcluded:true,finishedRoundRemoved:true},null,2));
 console.log('Native window close, relaunch, resume, and completed-round removal passed');
}finally{
 if(child?.exitCode===null){
  const page=browser?.contexts()[0]?.pages()[0];
  await page?.evaluate(()=>window.chrome.webview.postMessage({type:'exit'})).catch(()=>{});
 }
 await browser?.close().catch(()=>{});
}
