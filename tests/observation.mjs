import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('release/web');
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8446,'127.0.0.1',r));await mkdir('test-output',{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));

 await page.goto('http://127.0.0.1:8446');await page.waitForFunction(()=>window.billiards);
 const views=[];
 for(const mode of ['nine','eight','snooker']){
  await page.locator(`[data-mode=${mode}]`).click();await page.locator('#start-game').click();
  for(const viewport of [{width:1440,height:900},{width:900,height:500}]){
   await page.setViewportSize(viewport);
   await page.waitForFunction(()=>Math.abs(billiards.view.camera.aspect-innerWidth/innerHeight)<1e-8);
   const point=await page.evaluate(()=>{
    const {view,world}=billiards,{length,width}=world.c;
    view.orbit=Math.PI;view.snapObservation();
    const x=world.mode==='snooker'?-length/2+.5:-length/2+.075;
    const y=world.mode==='snooker'?.15:width/2-.12;
    const p=view.camera.position.clone().set(x,0,y).project(view.camera);
    const sx=(p.x+1)*innerWidth/2,sy=(1-p.y)*innerHeight/2;
    return {x,y,sx,sy,hit:document.elementFromPoint(sx,sy)?.id};
   });
   assert.equal(point.hit,'scene',`${mode} ${viewport.width}: placement point must be clickable`);
   await page.mouse.click(point.sx,point.sy);
   await page.waitForFunction(({x,y})=>Math.hypot(billiards.world.balls[0].x-x,billiards.world.balls[0].y-y)<.01,point,{timeout:3000});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>Math.abs(billiards.view.camera.aspect-innerWidth/innerHeight)<1e-8);
  await page.locator('#confirm-placement').click();
  const original=await page.evaluate(()=>billiards.view.table.matrix.elements.slice());
  for(const [name,phase] of [['end',Math.PI],['corner',Math.PI*.75],['side',Math.PI*.5]]){
   const state=await page.evaluate(phase=>{const v=billiards.view;v.orbit=phase;v.snapObservation();v.updateCamera(1);v.render();return {position:v.camera.position.toArray(),fov:v.camera.fov,table:v.table.matrix.elements.slice()};},phase);
   assert.deepEqual(state.table,original);assert.equal(state.position[1],.95);
   assert.equal(state.fov,54);views.push({mode,name,...state});
   await page.screenshot({path:`test-output/observation-${mode}-${name}.png`});
  }
  await page.evaluate(()=>{billiards.view.orbit=Math.PI;billiards.view.snapObservation();});
  const before=await page.evaluate(()=>billiards.view.camera.position.toArray());
  await page.keyboard.down('KeyD');await page.waitForTimeout(800);await page.keyboard.up('KeyD');
  const after=await page.evaluate(()=>({position:billiards.view.camera.position.toArray(),fov:billiards.view.camera.fov,table:billiards.view.table.matrix.elements.slice()}));
  assert.notDeepEqual(after.position,before);assert.equal(after.position[1],.95);assert.equal(after.fov,54);assert.deepEqual(after.table,original);
  await page.keyboard.press('Escape');
 }
 assert.deepEqual(errors,[]);
 await writeFile('test-output/observation-report.json',JSON.stringify({passed:true,errors,views},null,2));
 console.log('Standing camera, fixed table and walking controls verified for all three modes');
}finally{await browser?.close();server.close();}
