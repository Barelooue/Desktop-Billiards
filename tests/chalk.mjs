import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('release/web');
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8447,'127.0.0.1',r));await mkdir('test-output',{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.BILLIARDS_TEST=true;});

 await page.goto('http://127.0.0.1:8447');await page.waitForFunction(()=>window.billiards);

 const state=()=>page.evaluate(()=>({condition:billiards.world.tipCondition,motion:billiards.view.chalkMotion?.elapsed??null,home:billiards.view.chalkHome.toArray(),position:billiards.view.chalk.position.toArray(),shots:billiards.ref.shots,orbit:billiards.view.orbit}));
 await page.locator('#start-game').click();await page.locator('#confirm-placement').click();
 await page.evaluate(()=>{billiards.world.tipCondition=.2;billiards.view.invalidated=true;});
 const before=await state();
 await page.screenshot({path:'test-output/chalk-on-rail.png'});
 // Click the actual 3D cube, not an inspection-only action.
 const point=await page.evaluate(()=>{const v=billiards.view;v.camera.updateMatrixWorld(true);const p=v.chalk.position.clone().project(v.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.move(point.x,point.y);assert.equal(await page.locator('#scene').evaluate(e=>e.style.cursor),'pointer');
 await page.mouse.click(point.x,point.y);assert.notEqual((await state()).motion,null);assert.equal(await page.locator('#chalk-button').isDisabled(),true);
 await page.waitForTimeout(1050);await page.screenshot({path:'test-output/chalk-rubbing.png'});
 assert.equal((await state()).condition,.2);assert.notDeepEqual((await state()).position,before.home);
 await page.keyboard.press('F1');const paused=await state();await page.waitForTimeout(200);assert.equal((await state()).motion,paused.motion);
 await page.keyboard.press('Escape');await page.keyboard.press('Space');await page.keyboard.down('KeyD');await page.keyboard.press('KeyF');await page.keyboard.up('KeyD');
 assert.equal((await state()).shots,0);assert.equal((await state()).orbit,before.orbit);assert.equal(await page.evaluate(()=>billiards.world.running),false);
 await page.waitForFunction(()=>!billiards.view.chalkMotion);assert.equal((await state()).condition,1);assert.deepEqual((await state()).position,before.home);
 assert.deepEqual(await page.evaluate(()=>billiards.view.chalk.quaternion.toArray()),[0,0,0,1]);
 await page.screenshot({path:'test-output/chalk-restored.png'});
 // A real strike consumes condition, and the action is unavailable while balls move.
 await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 const afterShot=await page.evaluate(()=>{billiards.shot(0,.12);return {condition:billiards.world.tipCondition,running:billiards.world.running};});
 assert.ok(afterShot.condition<1);assert.ok(afterShot.running);await page.waitForTimeout(100);assert.equal(await page.locator('#chalk-button').isDisabled(),true);
 await page.waitForFunction(()=>!billiards.world.running);
 // Chalking can start from aiming; returning home mid-animation cannot grant fresh grip.
 if(await page.evaluate(()=>billiards.state.ballInHand)){await page.keyboard.down('ArrowLeft');await page.waitForTimeout(80);await page.keyboard.up('ArrowLeft');await page.locator('#confirm-placement').click();}
 await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 const worn=(await state()).condition;await page.locator('#chalk-button').click();assert.equal(await page.evaluate(()=>billiards.view.stance),false);
 await page.waitForTimeout(200);const id=await page.evaluate(()=>billiards.state.roundId);await page.keyboard.press('Escape');
 assert.equal(await page.locator('#welcome').isVisible(),true);
 await page.locator('#history-open').click();await page.locator(`[data-round="${id}"]`).click();
 assert.equal((await state()).condition,worn);assert.equal((await state()).motion,null);assert.deepEqual((await state()).position,(await state()).home);
 await page.locator('#chalk-button').click();await page.waitForFunction(()=>!billiards.view.chalkMotion);assert.equal((await state()).condition,1);
 for(const mode of ['eight','snooker']){await page.keyboard.press('Escape');await page.locator(`[data-mode=${mode}]`).click();await page.locator('#start-game').click();assert.equal((await state()).condition,1);assert.deepEqual((await state()).position,(await state()).home);}
 assert.deepEqual(errors,[]);await writeFile('test-output/chalk-report.json',JSON.stringify({passed:true,errors,modelClickable:true,pauseRespected:true,gripRestored:true,midAnimationSavePreserved:true},null,2));
 console.log('Chalk object, animation, grip recovery, shot locks and history continuation passed');
}finally{await browser?.close();server.close();}
