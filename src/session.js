import {World,MODES} from './physics.js';
import {Referee} from './rules.js';
import {DIFFICULTIES} from './computer.js';
import {validComputerFatigue} from './computer-fatigue.js';
import {EVENTS} from './events.js';
import {validQuote} from './currency.js';
import {openingStage,raceTo} from './match-format.js';
import {newAccount,validAccount,accrue,migrateAccount} from './economy.js';
export const HISTORY_KEY='desktop-billiards.history.v1';
export const ROUND_RETENTION_MS=72*60*60*1000;
const validBestBreaks=breaks=>Array.isArray(breaks)&&breaks.length===2&&breaks.every(b=>b===null||
 (b&&Number.isInteger(b.points)&&b.points>0&&b.points<=155&&Number.isInteger(b.count)&&b.count>0));
export function formatTime(ms){const tenths=Math.floor(Math.max(0,ms)/100),seconds=Math.floor(tenths/10),hours=Math.floor(seconds/3600);return `${hours?String(hours).padStart(2,'0')+':':''}${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}.${tenths%10}`;}
export class RoundClock{
 constructor(now=()=>performance.now()){this.now=now;this.elapsed=0;this.since=null;}
 value(){return this.elapsed+(this.since===null?0:Math.max(0,this.now()-this.since));}
 start(){if(this.since===null)this.since=this.now();}
 pause(){this.elapsed=this.value();this.since=null;}
 reset(ms=0){this.elapsed=ms;this.since=null;}
}
export function captureRound({id,createdAt,world,ref,elapsedMs,ballInHand,orbit,eyeHeight,spin,guide,soundEnabled,tournament}){
 if(ref.done)return null;
 return JSON.parse(JSON.stringify({version:1,id,createdAt,updatedAt:Date.now(),mode:world.mode,elapsedMs,
  world:{balls:world.balls,events:world.events,firstHit:world.firstHit,firstContacts:world.firstContacts,running:world.running,elapsed:world.elapsed,cuePlacementZone:world.cuePlacementZone,tipCondition:world.tipCondition,headStringCrossings:world.headStringCrossings,hitBeforeHeadString:world.hitBeforeHeadString},
  referee:{...ref},tournament:tournament??undefined,view:{ballInHand,orbit,eyeHeight,spin,guide,soundEnabled}}));
}
export function validateRound(s){
 if(!s||s.version!==1||typeof s.id!=='string'||!s.id||!Object.hasOwn(MODES,s.mode)||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0||!Number.isFinite(s.createdAt)||!Number.isFinite(s.updatedAt))return false;
 const w=s.world,r=s.referee,v=s.view;
 if(!w||!r||!v||r.done!==false||r.mode!==s.mode||typeof w.running!=='boolean'||!Number.isFinite(w.elapsed)||w.elapsed<0||![null,'head','d','table'].includes(w.cuePlacementZone))return false;
 if(w.tipCondition!==undefined&&(!Number.isFinite(w.tipCondition)||w.tipCondition<0||w.tipCondition>1))return false;
 if(!Array.isArray(w.balls)||w.balls.length!==MODES[s.mode].count+1||new Set(w.balls.map(b=>b.id)).size!==w.balls.length)return false;
 if(!w.balls.every(b=>Number.isInteger(b.id)&&b.id>=0&&b.id<w.balls.length&&typeof b.potted==='boolean'&&['x','y','vx','vy','wx','wy','wz','r','value'].every(k=>Number.isFinite(b[k]))&&Math.abs(b.x)<100&&Math.abs(b.y)<100&&b.r>0))return false;
 if(w.balls[0].id!==0||!(w.firstHit===null||w.balls.some(b=>b.id===w.firstHit)))return false;
 if(w.firstContacts!==undefined&&(!Array.isArray(w.firstContacts)||!w.firstContacts.every(id=>w.balls.some(b=>b.id===id&&id!==0))))return false;
 if(!Array.isArray(w.events)||w.events.some(e=>!e||!['hit','pot','rail','offtable'].includes(e.type)))return false;
 if(!['shots','score','fouls','penaltyPoints'].every(k=>Number.isFinite(r[k])&&r[k]>=0)||!Array.isArray(r.targetBefore)||![null,'solid','stripe'].includes(r.group)||!['open','red','color','clear'].includes(r.phase))return false;
 if(r.difficulty!==undefined&&(!Object.hasOwn(DIFFICULTIES,r.difficulty)||![0,1].includes(r.turn)||!Array.isArray(r.scores)||r.scores.length!==2||!r.scores.every(n=>Number.isInteger(n)&&n>=0)||!Number.isFinite(r.computerGrip)||r.computerGrip<0||r.computerGrip>1))return false;
 if(r.computerFatigue!==undefined&&(!r.difficulty||!validComputerFatigue(r.computerFatigue)))return false;
 if(r.leftComputerFatigue!==undefined&&(!r.difficulty||!validComputerFatigue(r.leftComputerFatigue)))return false;
 if(r.leftComputerGrip!==undefined&&(!Number.isFinite(r.leftComputerGrip)||r.leftComputerGrip<0||r.leftComputerGrip>1))return false;
 if(r.foulStreak!==undefined&&(!Array.isArray(r.foulStreak)||r.foulStreak.length!==2||!r.foulStreak.every(n=>[0,1,2].includes(n))))return false;
 if(r.breakPoints!==undefined&&(!Number.isInteger(r.breakPoints)||r.breakPoints<0||r.breakPoints>155))return false;
 if(r.bestBreaks!==undefined&&!validBestBreaks(r.bestBreaks))return false;
 if(w.running&&(!['open','red','color','clear'].includes(r.prePhase)||!r.targetBefore.length))return false;
 if(s.tournament!==undefined){
  const t=s.tournament,details=t&&EVENTS[s.mode][t.key];
  if(!r.difficulty||!t||!Object.hasOwn(EVENTS[s.mode],t.key)||!Number.isInteger(t.stage)||t.stage<openingStage(t.key,details)||t.stage>=details.prizes.length-1)return false;
  if(t.quote!==undefined&&!validQuote(t.quote))return false;
  const wins=raceTo(s.mode,t.key,details,t.stage);
  const validScore=(score,limit)=>Array.isArray(score)&&score.length===2&&score.every(n=>Number.isInteger(n)&&n>=0&&n<limit);
  if(t.matchScore!==undefined&&!validScore(t.matchScore,wins))return false;
  if(t.breaker!==undefined&&![0,1].includes(t.breaker))return false;
  if(t.showcase!==undefined&&(t.showcase!==true||r.difficulty!=='high'||![null,0,1].includes(t.controlledSide)))return false;
  if(t.bestBreaks!==undefined&&!validBestBreaks(t.bestBreaks))return false;
  if(t.breaks!==undefined&&(!Array.isArray(t.breaks)||!t.breaks.every(b=>b&&[0,1].includes(b.player)&&
   Number.isInteger(b.points)&&b.points>=147&&b.points<=155&&Number.isInteger(b.stage)&&b.stage>=openingStage(t.key,details)&&b.stage<=t.stage)))return false;
  if(t.opening!==undefined&&(!t.opening||!['lag','draw'].includes(t.opening.kind)||
   (t.opening.kind==='lag'&&s.mode==='snooker')||(t.opening.kind==='draw'&&s.mode!=='snooker')||
   (t.opening.chooser!==undefined&&![0,1].includes(t.opening.chooser))||
   (t.opening.kind==='draw'&&t.opening.chooser===undefined)||
   (t.opening.distances!==undefined&&(!Array.isArray(t.opening.distances)||t.opening.distances.length!==2||
    !t.opening.distances.every(n=>n===null||(Number.isFinite(n)&&n>=0))))||
   (t.matchScore??[0,0]).some(Boolean)||r.shots!==0||w.running||!w.cuePlacementZone||v.ballInHand))return false;
  if(t.completed!==undefined&&(!Array.isArray(t.completed)||!t.completed.every((round,i)=>{
   if(!round||!Number.isInteger(round.stage)||round.stage!==t.stage-t.completed.length+i||round.stage<openingStage(t.key,details))return false;
   const limit=raceTo(s.mode,t.key,details,round.stage);
   return validScore(round.score,limit+1)&&(t.showcase?Math.max(...round.score)===limit&&Math.min(...round.score)<limit:round.score[0]===limit&&round.score[1]<limit);
  })))return false;
 }
 return ['orbit','eyeHeight'].every(k=>Number.isFinite(v[k]))&&v.eyeHeight>=.85&&v.eyeHeight<=1.1&&typeof v.ballInHand==='boolean'&&typeof v.guide==='boolean'&&typeof v.soundEnabled==='boolean'&&v.spin&&['x','y'].every(k=>Number.isFinite(v.spin[k])&&Math.abs(v.spin[k])<=1);
}
export function restoreRound(snapshot){
 if(!validateRound(snapshot))throw Error('这局存档不完整，无法继续。');
 const s=JSON.parse(JSON.stringify(snapshot)),world=new World(s.mode),ref=new Referee(s.mode);
 // Keep the current mode's canonical ball sizes and values.
 const originals=new Map(world.balls.map(b=>[b.id,b]));
 Object.assign(world,s.world);
 for(const b of world.balls){b.r=originals.get(b.id).r;b.value=originals.get(b.id).value;}
 Object.assign(ref,s.referee);return {world,ref,view:s.view};
}
export class HistoryStore{
 constructor(storage,now=Date.now){this.storage=storage;this.now=now;this.error='';}
 readData(){
  const raw=this.storage?.getItem(HISTORY_KEY);
  if(!raw)return {version:1,rounds:[],account:newAccount()};
  const data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.rounds)||!data.rounds.every(validateRound)||
   (data.account!==undefined&&!validAccount(data.account)))throw Error('存档读取失败，原存档未被覆盖。');
  data.account=data.account?migrateAccount(data.account):newAccount();
  return data;
 }
 read(){
  this.error='';
  try{return this.readRecentData().rounds.sort((a,b)=>b.updatedAt-a.updatedAt);}
  catch{this.error='历史球局读取失败，原存档未被覆盖。';return [];}
 }
 keepRecentRounds(data){
  const cutoff=this.now()-ROUND_RETENTION_MS;
  const previous=data.rounds.length;
  data.rounds=data.rounds.filter(round=>!round.tournament?.showcase&&round.updatedAt>cutoff);
  return data.rounds.length!==previous;
 }
 readRecentData(){
  const data=this.readData();
  if(this.keepRecentRounds(data)){
   try{this.storage.setItem(HISTORY_KEY,JSON.stringify(data));}
   catch{this.error='部分球局已隐藏，本机存储暂时无法清理。';}
  }
  return data;
 }
 account(){return accrue(this.readRecentData().account);}
 transact(change){
  const data=this.readData();
  accrue(data.account);
  const result=change(data);
  if(!validAccount(data.account)||!data.rounds.every(validateRound))throw Error('存档数据不完整，未写入。');
  this.keepRecentRounds(data);
  try{
   if(!this.storage)throw Error();
   this.storage.setItem(HISTORY_KEY,JSON.stringify(data));
  }catch{throw Error('无法保存，请检查本机存储空间。');}
  return result;
 }
 update(change){
  this.error='';
  try{this.transact(change);return true;}
  catch(error){this.error=error.message;return false;}
 }
 save(snapshot){return this.update(data=>{
  if(!validateRound(snapshot))throw Error('当前球局数据不完整，未覆盖存档。');
  data.rounds=[snapshot,...data.rounds.filter(r=>r.id!==snapshot.id)];
 });}
 remove(id){return this.update(data=>{data.rounds=data.rounds.filter(r=>r.id!==id);});}
}
