import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9339');
try{
 const pages=browser.contexts().flatMap(c=>c.pages());const page=pages.find(p=>p.url().includes('billiards.local'));assert.ok(page,'Native WebView must navigate to packaged app');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.reload();await page.waitForFunction(()=>window.billiards?.world);if(await page.locator('#settings').isVisible())await page.keyboard.press('F1');
 const source=await page.evaluate(()=>({hasIcons:'icons' in window.DESKTOP_SOURCE,wallpaper:!!window.DESKTOP_SOURCE.wallpaper,viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null}));
 assert.equal(source.hasIcons,false,'Native host must not collect desktop icons');assert.ok(source.wallpaper,'Read wallpaper');
 const quality=await page.evaluate(()=>({pixelRatio:billiards.view.renderer.getPixelRatio(),devicePixelRatio,canvasWidth:document.querySelector('#scene').width,canvasHeight:document.querySelector('#scene').height,cssWidth:innerWidth,cssHeight:innerHeight,shadow:billiards.view.renderer.shadowMap.enabled,hasEco:!!document.querySelector('#eco')}));
 assert.equal(quality.pixelRatio,quality.devicePixelRatio);assert.equal(quality.canvasWidth,Math.floor(quality.cssWidth*quality.devicePixelRatio));assert.equal(quality.canvasHeight,Math.floor(quality.cssHeight*quality.devicePixelRatio));assert.ok(quality.shadow);assert.equal(quality.hasEco,false);
 await page.screenshot({path:'test-output/06-native-desktop.png'});
 await page.keyboard.press('Enter');await page.waitForTimeout(2400);
 if(await page.locator('#settings').isVisible())await page.keyboard.press('F1');
 await page.keyboard.press('KeyV');
 await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 await page.screenshot({path:'test-output/07-native-first-person.png'});
 // Exercise the real pointer drag, not the developer strike helper.
 await page.mouse.move(700,380);await page.mouse.down();await page.mouse.move(700,540,{steps:10});assert.ok(await page.evaluate(()=>billiards.state.power>.3));await page.mouse.up();assert.ok(await page.evaluate(()=>billiards.world.running));
 await page.keyboard.press('F1');assert.ok(await page.evaluate(()=>billiards.state.paused));
 await page.screenshot({path:'test-output/12-quality-settings.png'});
 assert.deepEqual(errors,[]);if(process.argv.includes('--fullscreen')){assert.equal(source.viewport.width,source.screen.width);assert.equal(source.viewport.height,source.screen.height);}
 await writeFile('test-output/native-report.json',JSON.stringify({passed:true,source,errors,quality},null,2));console.log('Native checks passed',source,quality);
 // Verify native close through the same exit shortcut the user operates.
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>billiards.state.started),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#welcome').isVisible(),true);
 await page.keyboard.press('Escape');
}finally{await browser.close().catch(()=>{});}
