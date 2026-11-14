import {AUDIO_SAMPLES} from './audio-samples.js';
import {CHALK_CONTACT_START,CHALK_CONTACT_END} from './chalk.js';

const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
const chalkDuration=CHALK_CONTACT_END-CHALK_CONTACT_START;
function makeChalkBuffer(ctx,random){
 const rate=22050,buffer=ctx.createBuffer(1,Math.ceil(chalkDuration*rate),rate);
 const samples=buffer.getChannelData(0);
 let fast=0,slow=0;
 for(let i=0;i<samples.length;i++){
  const t=i/rate,noise=2*random()-1;
  fast+=(noise-fast)*.30;
  slow+=(noise-slow)*.037;
  const rub=Math.abs(Math.sin(6*Math.PI*t/chalkDuration));
  const fade=clamp(Math.min(t,chalkDuration-t)/.045,0,1);
  samples[i]=(fast-slow)*fade*(.16+.84*rub*rub)*.14;
 }
 return buffer;
}
export function impactSound(type,speed,variation=.5){
 if(!Number.isFinite(speed)||speed<0||!['hit','pot','rail','cue'].includes(type))return null;
 if(type!=='pot'&&speed<.025)return null;
 const strength=Math.pow(clamp(speed/6,0,1),.65),jitter=(variation-.5)*.045;
 const properties={
  hit:{sample:'ball',gain:.78*strength,rate:1+jitter,cutoff:6500+strength*8500},
  pot:{sample:'pocket',gain:.28+.50*strength,rate:1+jitter*.5,cutoff:11000},
  cue:{sample:'ball',gain:.58*strength,rate:.86+jitter,cutoff:3400+strength*2500},
  rail:{sample:'ball',gain:.42*strength,rate:.68+jitter,cutoff:900+strength*1300}
 };
 return properties[type];
}

export function soundEvents(events){
 return events.filter(e=>e.type==='hit'||e.type==='rail'||(e.type==='pot'&&e.pocket!==false));
}

export class BilliardAudio{
 constructor({contextFactory=()=>new AudioContext(),random=Math.random}={}){
  this.contextFactory=contextFactory;this.random=random;this.enabled=true;this.context=null;
  this.buffers={};this.voices=new Set();this.recent=new Map();this.chalkVoice=null;
 }
 unlock(){
  if(!this.enabled)return;
  try{
   if(!this.context){
    const ctx=this.context=this.contextFactory();
    this.master=ctx.createGain();this.master.gain.value=.7;
    this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-10;
    this.limiter.knee.value=6;this.limiter.ratio.value=12;this.limiter.attack.value=.001;this.limiter.release.value=.09;
    // A final soft knee catches coincident sub-millisecond attack peaks that
    // can escape the compressor during a break, leaving normal hits unchanged.
    this.peakGuard=ctx.createWaveShaper();const curve=new Float32Array(4097);
    for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.6?a:.6+.35*(1-Math.exp(-(a-.6)/.35)));}
    this.peakGuard.curve=curve;this.peakGuard.oversample='4x';
    this.master.connect(this.limiter);this.limiter.connect(this.peakGuard);this.peakGuard.connect(ctx.destination);
    for(const [name,sample] of Object.entries(AUDIO_SAMPLES)){
     const bytes=Uint8Array.from(atob(sample.pcm),c=>c.charCodeAt(0)),pcm=new DataView(bytes.buffer);
     const buffer=ctx.createBuffer(1,bytes.length/2,sample.sampleRate),channel=buffer.getChannelData(0);
     for(let i=0;i<channel.length;i++)channel[i]=pcm.getInt16(i*2,true)/32768;
     this.buffers[name]=buffer;
    }
   }
   if(this.context.state==='suspended'&&!this.context.startRendering)this.context.resume().catch(()=>{});
  }catch{this.context=null;}
 }
 setEnabled(enabled){this.enabled=enabled;if(!enabled)this.stop();else this.unlock();}
 stop(){
  this.stopChalk();
  for(const voice of [...this.voices]){try{voice.source.stop();}catch{}voice.cleanup();}
  this.recent.clear();
 }
 stopChalk(){
  const source=this.chalkVoice;
  if(!source)return;
  this.chalkVoice=null;
  source.onended=null;
  try{source.stop();}catch{}
  source.disconnect();
 }
 updateChalk(elapsed){
  if(!this.enabled||elapsed==null||elapsed<CHALK_CONTACT_START||elapsed>=CHALK_CONTACT_END){
   this.stopChalk();
   return;
  }
  if(this.chalkVoice)return;
  this.unlock();
  const ctx=this.context;
  if(!ctx||ctx.state==='closed'||(ctx.state==='suspended'&&!ctx.startRendering))return;
  const source=ctx.createBufferSource();
  source.buffer=this.buffers.chalk??=makeChalkBuffer(ctx,this.random);
  source.connect(this.master);
  source.onended=()=>source.disconnect();
  this.chalkVoice=source;
  source.start(ctx.currentTime,elapsed-CHALK_CONTACT_START);
 }
 play(type,speed,{pan=0,delay=0,key=null}={}){
  if(!this.enabled)return false;
  const sound=impactSound(type,speed,this.random());if(!sound)return false;
  this.unlock();const ctx=this.context;
  if(!ctx||ctx.state==='closed'||(ctx.state==='suspended'&&!ctx.startRendering))return false;
  const when=ctx.currentTime+.004+Math.max(0,delay);
  // Deduplicate only repeated contacts of the same objects, never the whole mix.
  if(key&&type!=='pot'){
   if(when-(this.recent.get(key)??-Infinity)<.012)return false;
   this.recent.set(key,when);
   for(const [id,time] of this.recent)if(when-time>1)this.recent.delete(id);
  }
  if(this.voices.size>=48){const oldest=this.voices.values().next().value;oldest.source.stop();oldest.cleanup();}
  const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),panner=ctx.createStereoPanner();
  source.buffer=this.buffers[sound.sample];source.playbackRate.value=sound.rate;gain.gain.value=sound.gain;
  filter.type='lowpass';filter.frequency.value=Math.min(sound.cutoff,ctx.sampleRate*.45);filter.Q.value=.5;
  panner.pan.value=clamp(pan,-.8,.8);
  source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(this.master);
  const voice={source,cleanup:()=>{source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();this.voices.delete(voice);}};
  source.onended=voice.cleanup;this.voices.add(voice);source.start(when);return true;
 }
 playEvents(events,{cameraX=0,cameraZ=1,length=2.54}={}){
  const audible=soundEvents(events);if(!audible.length)return;
  const first=audible[0].time??0,denominator=Math.hypot(cameraX,cameraZ)*length*.5;
  for(const event of audible){
   const pan=denominator?((event.x??0)*cameraZ-(event.y??0)*cameraX)/denominator:0;
   const key=event.type==='hit'?`hit:${Math.min(event.a,event.b)}:${Math.max(event.a,event.b)}`:`${event.type}:${event.id}`;
   this.play(event.type,event.speed,{pan,key,delay:clamp((event.time??first)-first,0,.08)});
  }
 }
}
