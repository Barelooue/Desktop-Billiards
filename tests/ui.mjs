import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=resolve('release/web');
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.split('?')[0].slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8441,'127.0.0.1',r));await mkdir('test-output',{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.5}),errors=[];
 await page.addInitScript(()=>{window.BILLIARDS_TEST=true;});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8441');await page.waitForFunction(()=>window.billiards?.world);
 assert.equal(await page.locator('button[data-mode]').count(),3);
 assert.equal(await page.locator('#start-game').isVisible(),true);
 const quality=await page.evaluate(()=>{const v=billiards.view,r=v.renderer;return {ratio:r.getPixelRatio(),dpr:devicePixelRatio,width:r.domElement.width,cssWidth:innerWidth,shadows:r.shadowMap.enabled,environment:!!v.scene.environment,clearcoat:v.meshes.get(0).mesh.material.clearcoat};});
 assert.equal(quality.ratio,quality.dpr);assert.equal(quality.width,Math.floor(quality.cssWidth*quality.dpr));assert.ok(quality.shadows&&quality.environment);assert.equal(quality.clearcoat,1);
 assert.equal(await page.evaluate(()=>billiards.view.hand),undefined);
 await page.screenshot({path:'test-output/01-welcome.png'});
 assert.equal(await page.evaluate(()=>billiards.world.balls.length),10);
 await page.locator('[data-mode=snooker]').click();assert.equal(await page.evaluate(()=>billiards.world.balls.length),22);
 await page.screenshot({path:'test-output/02-snooker.png'});
 await page.locator('[data-mode=eight]').click();assert.equal(await page.evaluate(()=>billiards.world.balls.length),16);
 await page.locator('[data-mode=nine]').click();
 await page.locator('#welcome [data-guide]').click();assert.equal(await page.evaluate(()=>billiards.state.guide),false);
 await page.locator('#start-game').click();
 await page.locator('#game-hud [data-guide]').click();assert.equal(await page.evaluate(()=>billiards.state.guide),true);
 assert.equal(await page.evaluate(()=>billiards.view.phase),'play');assert.ok(await page.evaluate(()=>billiards.view.camera.position.y<1.3));

 assert.equal(await page.evaluate(()=>billiards.state.ballInHand),true);
 assert.equal(await page.evaluate(()=>billiards.state.placementZone),'head');
 const assertPlacementView=async()=>{
  const framed=await page.evaluate(()=>{const v=billiards.view;
   return !v.stance&&v.camera.position.y>=.85&&v.camera.position.y<=1.1&&v.camera.fov<=54&&v.camera.position.distanceTo(v.desiredCamera())<1e-8;
  });assert.ok(framed,'Placement immediately uses the close standing view with a stable lens');
 };
 await assertPlacementView();
 const cueStart=await page.evaluate(()=>({x:billiards.world.balls[0].x,y:billiards.world.balls[0].y}));
 const placementView=await page.evaluate(()=>({orbit:billiards.view.orbit,height:billiards.view.eyeHeight}));
 await page.mouse.move(700,350);await page.mouse.down({button:'right'});await page.mouse.move(780,350);await page.mouse.up({button:'right'});
 await page.mouse.wheel(0,100);await page.waitForTimeout(800);
 assert.ok(await page.evaluate(o=>Math.abs(billiards.view.orbit-o)>.1,placementView.orbit));
 assert.ok(await page.evaluate(h=>billiards.view.eyeHeight>h,placementView.height));
 assert.deepEqual(await page.evaluate(()=>({x:billiards.world.balls[0].x,y:billiards.world.balls[0].y})),cueStart,'Walking during placement must not move the cue ball');
 assert.equal(await page.evaluate(()=>billiards.state.ballInHand),true);
 const placeScreen=await page.evaluate(()=>{const v=billiards.view,p=v.camera.position.clone().set(-.95,0,.1).project(v.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(placeScreen.x,placeScreen.y);
 assert.ok(await page.evaluate(()=>Math.hypot(billiards.world.balls[0].x+.95,billiards.world.balls[0].y-.1)<.015),'Placement uses the new camera angle');
 assert.equal(await page.evaluate(()=>billiards.ref.shots),0);
 await page.evaluate(p=>{const v=billiards.view;v.orbit=p.orbit;v.eyeHeight=p.height;v.snapObservation();},placementView);
 const clickMap=async(x,y)=>{const box=await page.locator('#placement-map').boundingBox(),c=await page.evaluate(()=>billiards.world.c);await page.mouse.click(box.x+(140+x*256/c.length)/280*box.width,box.y+(76+y*256/c.length)/152*box.height);};
 const beforeInvalidPlacement=await page.evaluate(()=>({x:billiards.world.balls[0].x,y:billiards.world.balls[0].y}));
 await clickMap(.1,.2);assert.deepEqual(await page.evaluate(()=>({x:billiards.world.balls[0].x,y:billiards.world.balls[0].y})),beforeInvalidPlacement);
 await clickMap(-.95,.2);assert.ok(await page.evaluate(()=>Math.abs(billiards.world.balls[0].x+.95)<.015));
 await clickMap(-.85,-.2);assert.ok(await page.evaluate(()=>Math.abs(billiards.world.balls[0].y+.2)<.015));
 assert.equal(await page.evaluate(()=>billiards.state.ballInHand),true,'A click must not consume the right to reposition');
 await page.screenshot({path:'test-output/13-placement.png'});
 await page.locator('#confirm-placement').click();assert.equal(await page.evaluate(()=>billiards.state.posture),'observe');assert.equal(await page.locator('#placement-panel').isVisible(),false);
 await page.keyboard.press('KeyB');assert.equal(await page.evaluate(()=>billiards.state.ballInHand),true);await clickMap(cueStart.x,cueStart.y);await page.keyboard.press('KeyV');
 // Dragging in observation mode cannot charge or strike the cue ball.
 await page.mouse.move(700,350);await page.mouse.down();await page.mouse.move(700,500);assert.equal(await page.evaluate(()=>billiards.state.power),0);await page.mouse.up();assert.equal(await page.evaluate(()=>billiards.world.running),false);
 await page.screenshot({path:'test-output/03-first-person.png'});

 // A close view makes surface highlights, shadow contact and outline smoothness reviewable.
 await page.evaluate(()=>{const v=billiards.view,b=billiards.world.balls.find(b=>b.id===1);v.camera.position.set(b.x-.24,.17,b.y+.18);v.camera.lookAt(b.x,b.r,b.y);v.render();});
 await page.screenshot({path:'test-output/11-surface-detail.png'});await page.evaluate(()=>{billiards.view.invalidated=true;});await page.waitForTimeout(1400);

 // Aim mode locks feet while letting the cue sweep a semicircle around the ball.
 await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);await page.waitForTimeout(300);
 const frozen=await page.evaluate(()=>({orbit:billiards.view.orbit,x:billiards.view.camera.position.x,z:billiards.view.camera.position.z,angle:billiards.view.aim}));
 await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');
 await page.mouse.move(700,350);await page.mouse.down({button:'right'});await page.mouse.move(760,350);await page.mouse.up({button:'right'});await page.mouse.wheel(0,180);
 assert.equal(await page.evaluate(()=>billiards.state.posture),'aim');assert.equal(await page.evaluate(()=>billiards.view.orbit),frozen.orbit);
 const seat=await page.evaluate(()=>({x:billiards.view.camera.position.x,z:billiards.view.camera.position.z}));assert.ok(Math.abs(seat.x-frozen.x)<.02&&Math.abs(seat.z-frozen.z)<.02);
 const beforeHead=await page.evaluate(()=>billiards.view.camera.quaternion.toArray());await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');await page.waitForTimeout(400);
 assert.ok(await page.evaluate(a=>Math.abs(billiards.view.aim-a)>.01,frozen.angle));assert.notDeepEqual(await page.evaluate(()=>billiards.view.camera.quaternion.toArray()),beforeHead);
 await page.screenshot({path:'test-output/14-aim-locked.png'});
 // Real mouse input passes the old 15-degree stop and reaches both 90-degree ends.
 await page.mouse.move(10,350);await page.mouse.move(1430,350);
 assert.ok(await page.evaluate(()=>Math.abs(billiards.view.aim-billiards.view.aimBase-Math.PI/2)<1e-10));
 await page.mouse.move(10,350);await page.mouse.move(1430,350);await page.mouse.move(10,350);
 assert.ok(await page.evaluate(()=>billiards.view.aim-billiards.view.aimBase<-Math.PI/3));
 // Push to the left stop, then verify immediate reversal and fine mouse control.
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(250);await page.keyboard.up('ArrowLeft');
 assert.ok(await page.evaluate(()=>Math.abs(billiards.view.aim-billiards.view.aimBase+Math.PI/2)<1e-10));
 const leftStop=await page.evaluate(()=>billiards.view.aim);
 await page.keyboard.down('Shift');await page.mouse.move(154,350);await page.keyboard.up('Shift');
 assert.ok(Math.abs((await page.evaluate(()=>billiards.view.aim))-leftStop-Math.PI*.02)<1e-10);
 await page.waitForTimeout(500);await page.screenshot({path:'test-output/18-aim-wide.png'});
 const ballInFrame=await page.evaluate(()=>{const v=billiards.view,b=billiards.world.balls[0];v.camera.updateMatrixWorld();const p=v.cue.position.clone().set(b.x,b.r,b.y).project(v.camera);return {x:p.x,y:p.y};});
 assert.ok(Math.abs(ballInFrame.x)<.75&&Math.abs(ballInFrame.y)<.75,'Wide aim must keep the cue ball comfortably in frame');
 assert.equal(await page.evaluate(()=>billiards.view.orbit),frozen.orbit);
 assert.equal(await page.evaluate(()=>billiards.ref.shots),0);
 await page.evaluate(()=>{const v=billiards.view;v.adjustAim(v.aimBase-v.aim);});
 // Re-enter placement from the low aiming camera, without waiting for an animation.
 await page.keyboard.press('KeyB');assert.equal(await page.evaluate(()=>billiards.state.ballInHand),true);await assertPlacementView();
 await page.keyboard.press('KeyV');await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 // Standing up mid-drag cancels the shot; releasing the button afterwards must do nothing.
 await page.mouse.move(700,350);await page.mouse.down();await page.mouse.move(700,500);assert.ok(await page.evaluate(()=>billiards.state.power>.2));await page.keyboard.press('KeyO');await page.mouse.up();assert.equal(await page.evaluate(()=>billiards.world.running),false);assert.equal(await page.evaluate(()=>billiards.state.posture),'observe');
 const tableBefore=await page.evaluate(()=>billiards.view.table.matrix.elements.slice());

 const orbitBefore=await page.evaluate(()=>billiards.view.orbit);await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');assert.ok(Math.abs(await page.evaluate(()=>billiards.view.orbit)-orbitBefore)>.1);assert.deepEqual(await page.evaluate(()=>billiards.view.table.matrix.elements.slice()),tableBefore);
 const spinPad=page.locator('#spin-pad');
 await spinPad.click({position:{x:56,y:58}});
 const selectedSpin=await page.evaluate(()=>billiards.state.spin);
 assert.ok(selectedSpin.x>0&&selectedSpin.y<0,'The spin pad accepts a low-right hit point while standing');
 assert.equal(await page.evaluate(()=>billiards.state.posture),'observe');
 await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 assert.deepEqual(await page.evaluate(()=>billiards.state.spin),selectedSpin);
 await page.keyboard.press('KeyG');
 await page.screenshot({path:'test-output/04-spin.png'});
 await page.evaluate(()=>billiards.shot(0,.65));assert.equal(await page.evaluate(()=>billiards.state.posture),'observe');assert.equal(await page.evaluate(()=>billiards.world.running),true);
 await page.waitForTimeout(1100);await page.screenshot({path:'test-output/17-moving-balls-overview.png'});
 // One uninterrupted circuit in each direction, using the same walking method as the keys.
 const circuit=await page.evaluate(()=>{const v=billiards.view,start=v.orbit,points=[],table=v.table.matrix.elements.slice();for(let i=0;i<240;i++){v.walk(Math.PI*2/240);v.updateCamera(1/30);if(i%60===59)points.push(v.camera.position.toArray());}const end=v.desiredCamera().toArray();for(let i=0;i<240;i++)v.walk(-Math.PI*2/240);const back=v.desiredCamera().toArray();return {points,start,finish:v.orbit,end,back,table,after:v.table.matrix.elements.slice()};});
 assert.ok(Math.abs(circuit.finish-circuit.start)<1e-10);assert.ok(Math.hypot(...circuit.end.map((x,i)=>x-circuit.back[i]))<1e-10);assert.deepEqual(circuit.table,circuit.after);assert.equal(new Set(circuit.points.map(p=>`${Math.sign(p[0])},${Math.sign(p[2])}`)).size,4);
 await page.waitForFunction(()=>!billiards.world.running,{},{timeout:45000});assert.equal(await page.evaluate(()=>billiards.ref.shots),1);assert.equal(await page.evaluate(()=>billiards.state.posture),'observe');
 await page.screenshot({path:'test-output/05-after-break.png'});
 await page.keyboard.press('F1');await page.locator('#settings').waitFor({state:'visible'});await page.keyboard.press('F1');await page.keyboard.press('KeyN');
 // Repeated racks must not grow GPU resources with each mode change.
 await page.keyboard.press('Digit3');await page.waitForTimeout(300);const baseline=await page.evaluate(()=>({...billiards.view.renderer.info.memory}));
 for(let i=0;i<12;i++)await page.keyboard.press(['Digit1','Digit2','Digit3'][i%3]);await page.waitForTimeout(300);
 const memory=await page.evaluate(()=>({...billiards.view.renderer.info.memory}));assert.deepEqual(memory,baseline,'Switching racks must not leak GPU assets');
 assert.deepEqual(errors,[]);await writeFile('test-output/ui-report.json',JSON.stringify({passed:true,errors,memory,quality},null,2));console.log('UI checks passed',memory,quality);
}finally{await browser?.close();server.close();}
