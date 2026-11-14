import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=resolve('release/web');
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8442,'127.0.0.1',r));await mkdir('test-output',{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8442');await page.waitForFunction(()=>window.billiards?.world);
 const press=key=>page.keyboard.press(key),hold=async(key,time=250)=>{await page.keyboard.down(key);await page.waitForTimeout(time);await page.keyboard.up(key);};
 const remap=async(action,key)=>{await page.locator(`[data-binding="${action}"]`).focus();await press(key);};
 const state=()=>page.evaluate(()=>billiards.state),orbit=()=>page.evaluate(()=>billiards.view.orbit);
 assert.equal(await page.locator('button[data-mode]').count(),3);
 await press('F1');assert.equal((await state()).paused,true);
 await remap('walkLeft','KeyD');assert.match(await page.locator('#binding-status').textContent(),/D 已用于「向右绕台」/);
 assert.equal(await page.locator('[data-binding="walkLeft"]').inputValue(),'A');
 await page.screenshot({path:'test-output/15-key-conflict.png'});
 await page.locator('#settings-title').click();assert.equal((await state()).paused,true); // Leave the edit field.
 await remap('walkLeft','KeyQ');await remap('settings','KeyH');
 await press('KeyH');assert.equal((await state()).paused,false);
 await page.locator('#settings-hint').click();assert.equal((await state()).paused,true); // Mouse access survives remapping.
 await page.locator('#settings-close').click();await page.reload();await page.waitForFunction(()=>window.billiards?.world);
 assert.equal(await page.evaluate(()=>billiards.bindings.walkLeft),'KeyQ');
 assert.match(await page.locator('#settings-hint').textContent(),/H/);
 await press('Enter');await page.waitForTimeout(1800);
 const y=await page.evaluate(()=>billiards.world.balls[0].y);await hold('ArrowDown');assert.ok(await page.evaluate(y=>billiards.world.balls[0].y>y,y));
 const placementOrbit=await orbit(),placementBall=await page.evaluate(()=>({x:billiards.world.balls[0].x,y:billiards.world.balls[0].y}));
 await hold('KeyQ');assert.ok(Math.abs(await orbit()-placementOrbit)>.02,'Remapped walking works during placement');
 assert.equal((await state()).ballInHand,true);
 assert.deepEqual(await page.evaluate(()=>({x:billiards.world.balls[0].x,y:billiards.world.balls[0].y})),placementBall);
 await press('KeyV');let angle=await orbit();await hold('KeyA');assert.equal(await orbit(),angle);
 await hold('KeyQ');assert.ok(Math.abs(await orbit()-angle)>.02);
 // Settings suspend held movement and key editing must never trigger the game.
 await page.keyboard.down('KeyQ');await page.waitForTimeout(120);await press('KeyH');angle=await orbit();
 await page.waitForTimeout(200);assert.equal(await orbit(),angle);await remap('walkLeft','KeyA');assert.equal(await orbit(),angle);
 await page.keyboard.up('KeyQ');await press('KeyH');await page.waitForTimeout(150);assert.equal(await orbit(),angle);
 assert.equal((await state()).posture,'observe');
 await hold('KeyW');assert.ok((await state()).spin.y>0);await press('KeyR');assert.deepEqual((await state()).spin,{x:0,y:0});
 await press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 await press('KeyG');assert.equal((await state()).guide,false);await press('KeyM');assert.equal((await state()).soundEnabled,false);
 // Holding the charge key, then cancelling, pausing, or losing focus cannot fire.
 for(const reason of ['KeyC','KeyO','KeyH','blur']){
  await press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
  await page.keyboard.down('KeyF');await page.waitForTimeout(220);assert.ok((await state()).power>.01);
  if(reason==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));else await press(reason);
  await page.keyboard.up('KeyF');assert.equal(await page.evaluate(()=>billiards.ref.shots),0);assert.equal((await state()).power,0);
  if((await state()).paused)await press('KeyH');
 }
 // Rebind shoot; previous F does nothing, new T charges and releases exactly once.
 await press('KeyH');await remap('shoot','KeyT');await press('KeyH');
 await press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 await hold('KeyF');assert.equal((await state()).power,0);assert.equal(await page.evaluate(()=>billiards.ref.shots),0);
 await hold('KeyW',160);await hold('KeyT',450);assert.equal(await page.evaluate(()=>billiards.world.running),true);
 assert.equal((await state()).posture,'observe','Releasing a successful shot immediately stands up');
 const target=await page.evaluate(()=>billiards.view.desiredCamera().toArray());
 await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>billiards.view.desiredCamera().toArray()),target,'Moving balls must not move the observation route');
 angle=await orbit();await hold('KeyD');assert.ok(Math.abs(await orbit()-angle)>.02,'Walking is available while balls move');
 await page.waitForFunction(()=>!billiards.world.running,{},{timeout:45000});assert.equal(await page.evaluate(()=>billiards.ref.shots),1);assert.deepEqual((await state()).spin,{x:0,y:0});
 // Restore all defaults, including settings; refresh must retain the reset.
 await press('KeyH');await press('Control+Backspace');assert.match(await page.locator('#binding-status').textContent(),/恢复默认/);
 await page.screenshot({path:'test-output/16-settings.png'});
 await page.locator('#settings-close').click();await page.reload();await page.waitForFunction(()=>window.billiards?.world);
 assert.equal(await page.evaluate(()=>billiards.bindings.settings),'F1');assert.equal(await page.evaluate(()=>billiards.bindings.shoot),'KeyF');
 // Esc goes back one level even with a binding input focused, without remapping it.
 await press('F1');assert.equal(await page.locator('[data-binding=quit]').isDisabled(),true);
 assert.equal(await page.locator('[data-binding=quit]').inputValue(),'Esc');
 await page.evaluate(()=>{window.exitMessages=[];window.chrome??={};window.chrome.webview={postMessage:m=>window.exitMessages.push(m)};});
 await page.locator('[data-binding=walkLeft]').focus();await press('Escape');
 assert.deepEqual(await page.evaluate(()=>window.exitMessages),[]);
 assert.equal(await page.locator('#settings').isVisible(),false);
 assert.equal((await state()).paused,false);
 assert.equal(await page.evaluate(()=>billiards.bindings.walkLeft),'KeyA');
 await press('Escape');
 assert.equal(await page.evaluate(()=>window.exitMessages.length),1);
 await press('Enter');await press('F1');
 const pausedTime=(await state()).elapsedMs;
 await page.keyboard.down('Escape');
 assert.equal(await page.locator('#settings').isVisible(),false);
 await page.keyboard.down('Escape'); // Holding the same key must not also exit.
 assert.equal(await page.evaluate(()=>window.exitMessages.length),1);
 await page.keyboard.up('Escape');
 await page.waitForTimeout(150);assert.ok((await state()).elapsedMs>pausedTime);
 await press('Escape');
 assert.equal((await state()).started,false);
 assert.equal(await page.locator('#welcome').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.exitMessages.length),1);
 await press('Escape');
 assert.equal(await page.evaluate(()=>window.exitMessages.length),2);
 for(const [mode,method,expected] of [['nine','keyboard',1.12],['eight','mouse',1.12],['snooker','mouse',1]]){
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('#start-game').click();
  await page.locator('#confirm-placement').click();
  await press('Space');
  await page.waitForFunction(()=>billiards.view.stance&&billiards.view.postureSettled);
  assert.equal(await page.locator('#power-track').evaluate(el=>el.classList.contains('break-boost')),expected>1);
  if(method==='keyboard'){
   await page.keyboard.down('KeyF');
   await page.waitForFunction(limit=>billiards.state.power===limit,expected);
   assert.match(await page.locator('#power-value').textContent(),/112%/);
   await page.keyboard.up('KeyF');
  }else{
   await page.mouse.move(640,245);await page.mouse.down();await page.mouse.move(640,555);
   assert.equal((await state()).power,expected);
   await page.mouse.up();
  }
  assert.equal(await page.locator('#power-track').evaluate(el=>el.classList.contains('break-boost')),false);
  await page.waitForFunction(()=>!billiards.world.running&&billiards.ref.shots===1,{},{timeout:45000});
  assert.equal(await page.locator('#break-power-label').textContent(),'满力度');
  await press('Escape');
 }
 assert.deepEqual(errors,[]);await writeFile('test-output/keyboard-report.json',JSON.stringify({passed:true,errors},null,2));console.log('Keyboard remapping and interaction checks passed');
}finally{await browser?.close();server.close();}
