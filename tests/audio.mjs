import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('release/web');
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8444,'127.0.0.1',r));await mkdir('test-output',{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.BILLIARDS_TEST=true;});
 await page.goto('http://127.0.0.1:8444');await page.waitForFunction(()=>window.billiards?.audio);
 await page.locator('#start-game').click();await page.locator('#confirm-placement').click();
 const rendered=await page.evaluate(async()=>{
  const render=async(type,speed)=>{
   const ctx=new OfflineAudioContext(2,44100,44100),sfx=new billiards.audio.constructor({contextFactory:()=>ctx,random:()=>.5});
   if(!sfx.play(type,speed,{delay:.1}))throw Error('Failed to schedule sound');
   const buffer=await ctx.startRendering(),data=buffer.getChannelData(0);
   return {rms:Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length),peak:Math.max(...data.map(Math.abs)),samples:[...data.slice(0,30000)]};
  };
  const soft=await render('hit',.25),medium=await render('hit',2),hard=await render('hit',6),pocket=await render('pot',1);
  const ctx=new OfflineAudioContext(2,44100,44100),sfx=new billiards.audio.constructor({contextFactory:()=>ctx,random:()=>.5});
  sfx.playEvents([{type:'hit',a:0,b:1,speed:3,time:0},{type:'hit',a:2,b:3,speed:2,time:0},{type:'pot',id:4,speed:1,time:0}]);
  const simultaneous=sfx.voices.size;sfx.setEnabled(false);const stopped=sfx.voices.size;
  const muted=sfx.play('pot',1);await ctx.startRendering();
  const crowdedContext=new OfflineAudioContext(2,44100,44100),crowded=new billiards.audio.constructor({contextFactory:()=>crowdedContext,random:()=>.5});
  for(let i=0;i<24;i++)crowded.play('hit',6,{delay:.1,key:`pair:${i}`});
  const crowdedMix=await crowdedContext.startRendering(),crowdedPeak=Math.max(...crowdedMix.getChannelData(0).map(Math.abs));
  const chalkContext=new OfflineAudioContext(2,44100*2,44100);
  let seed=41;
  const chalk=new billiards.audio.constructor({contextFactory:()=>chalkContext,random:()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32)});
  chalk.updateChalk(.4);const approachSilent=!chalk.chalkVoice;
  chalk.updateChalk(.65);const voice=chalk.chalkVoice;
  chalk.updateChalk(.7);const sameVoice=!!voice&&chalk.chalkVoice===voice;
  const chalkMix=await chalkContext.startRendering();
  const chalkPeak=chalkMix.getChannelData(0).reduce((peak,v)=>Math.max(peak,Math.abs(v)),0);
  chalk.stop();
  return {soft,medium,hard,pocket,simultaneous,stopped,muted,crowdedPeak,approachSilent,sameVoice,chalkPeak,chalkStopped:!chalk.chalkVoice};
 });
 assert.ok(rendered.soft.rms>0&&rendered.soft.rms<rendered.medium.rms&&rendered.medium.rms<rendered.hard.rms);
 assert.ok(rendered.hard.peak<.99&&rendered.pocket.peak<.99);assert.ok(rendered.pocket.rms>0);
 assert.equal(rendered.simultaneous,3);assert.equal(rendered.stopped,0);assert.equal(rendered.muted,false);
 assert.ok(rendered.crowdedPeak<1,'Dense opening collisions must not clip the output');
 assert.ok(rendered.approachSilent&&rendered.sameVoice&&rendered.chalkStopped);
 assert.ok(rendered.chalkPeak>.005&&rendered.chalkPeak<.15,'Chalk friction should be audible and quiet');
 // Exercise the game's actual physics -> event batch -> playback route.
 await page.keyboard.press('Space');await page.waitForFunction(()=>billiards.view.postureSettled);
 await page.evaluate(()=>{
  const audio=billiards.audio,original=audio.play.bind(audio);window.played=[];
  audio.play=(type,speed,options)=>{window.played.push({type,speed});return original(type,speed,options);};
  billiards.shot(0,.2);
  const w=billiards.world,b=w.balls[1],p=w.pockets[0];b.x=p.x;b.y=p.y;b.vx=.3;b.vy=0;
 });
 await page.waitForFunction(()=>window.played.some(e=>e.type==='pot'));
 assert.ok(await page.evaluate(()=>window.played.some(e=>e.type==='cue'&&e.speed>1)));
 assert.ok(await page.evaluate(()=>window.played.some(e=>e.type==='pot'&&e.speed>0)));
 await page.keyboard.press('KeyM');assert.equal(await page.evaluate(()=>billiards.audio.enabled),false);
 assert.equal(await page.evaluate(()=>billiards.audio.voices.size),0);
 // Produce an audition file from the actual Web Audio mix: soft / medium / hard / pocket.
 const samples=new Float32Array(44100*5);
 for(const [i,name] of ['soft','medium','hard','pocket'].entries())samples.set(rendered[name].samples,Math.round((.2+i*1.15)*44100));
 const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
 await writeFile('test-output/audio-preview.wav',wav);
 for(const name of ['soft','medium','hard','pocket'])delete rendered[name].samples;
 assert.deepEqual(errors,[]);await writeFile('test-output/audio-report.json',JSON.stringify({passed:true,...rendered,errors},null,2));console.log('Recorded audio, dynamics, simultaneous contacts, pot routing and mute checks passed',rendered);
}finally{await browser?.close();server.close();}
