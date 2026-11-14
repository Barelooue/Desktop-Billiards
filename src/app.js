import {World,MODES,clamp} from './physics.js';
import {Referee,pointsRemaining} from './rules.js';
import {BilliardScene} from './scene.js';
import {zoneLabel,keyboardPlacementStart} from './placement.js';
import {PlacementUI} from './placement-ui.js';
import {KeyBindings,keyFromEvent,keyLabel} from './keybindings.js';
import {SettingsUI} from './settings.js';
import {BilliardAudio} from './audio.js';
import {OBSERVATION_HEIGHT} from './observation.js';
import {HistoryStore,RoundClock,formatTime,captureRound,restoreRound,ROUND_RETENTION_MS} from './session.js';
import {cueResponse} from './chalk.js';
import {playerShotPower,playerShotSpeed,PLAYER_SPIN_LIMIT,BREAK_MAX_POWER,isPoolBreak} from './shot-controls.js';
import {DIFFICULTIES,eliteComputer,computerPerspective,computerNeedsChalk,computerShotSearch,computerShouldConcede,practiceShotSearch} from './computer.js';
import {freshComputerFatigue,computerFatigueLevel,recordComputerStroke,nextFrameFatigue} from './computer-fatigue.js';
import {EVENTS,eventPrize,stageName,SNOOKER_BREAK_PRIZES,snookerBreakPrize} from './events.js';
import {openingStage,raceTo,raceLabel,matchLabelText,recordFrame,openingBreak,breakOrder} from './match-format.js';
import {LagView} from './lag-view.js';
import {computerLagWinner} from './lag.js';
import {OfficialCalendar,calendarStatus,calendarSource} from './calendar.js';
import {LEGACY_QUOTE,ExchangeRates,money,toPence} from './currency.js';
import {BANK,borrow,dateLabel,debt,loanRestriction,record,repay,settlePrize} from './economy.js';
const $=id=>document.getElementById(id);
let view,world,ref,mode='nine',started=false,paused=false,ballInHand=false,guide=true,spin={x:0,y:0},power=0,drag=null,keys=new Set(),accumulator=0,last=performance.now(),lastPaint=0,dirty=true,eventCursor=0;
const audio=new BilliardAudio();
let desktop=window.DESKTOP_SOURCE||{wallpaper:null};
let floatingWindow=window.BILLIARDS_WINDOW_MODE===true;
let toastTimer;
let historyExpiryTimer;
let placementUI,settingsUI,lastPointerX=null,spinDrag=false,soundEnabled=true;
let storage;try{storage=window.localStorage;}catch{}
const bindings=new KeyBindings(storage),heldCodes=new Map();
const history=new HistoryStore(storage),roundClock=new RoundClock();
const exchange=new ExchangeRates(storage);
const officialCalendar=new OfficialCalendar(storage);
let roundId=null,createdAt=0,lastCheckpoint=0,lastClockText='';
let tournament=null,pendingDifficulty=null,pendingShowcase=false,roundPayout=null,nextShowcaseFrame=0,showcaseNextRound=null;
let computerTime=0,computerPlan=null,computerSearch=null;
let coachAdvice=null,coachSearch=null;
const lagView=new LagView($('lag-table'),$('lag-power'),finishLag);
const humanSide=entry=>entry?.showcase?entry.controlledSide:0;
const computerSide=side=>side!==humanSide(tournament);
const computerTurn=()=>!!ref?.difficulty&&computerSide(ref.turn);
const sideNames=entry=>entry?.showcase?['甲方','乙方'].map((name,side)=>side===entry.controlledSide?name+'（你）':name):['你','电脑'];
const canTakeOver=()=>started&&tournament?.showcase&&tournament.controlledSide===null&&(!ref.done||roundPayout?.advance);
const canHandBack=()=>started&&tournament?.showcase&&tournament.controlledSide!==null&&(!ref.done||roundPayout?.advance);
const breakBoostAvailable=()=>started&&!computerTurn()&&!tournament?.opening&&
 !ref.done&&!ref.decision&&!world.running&&isPoolBreak(world,ref);
const powerLimit=()=>breakBoostAvailable()?BREAK_MAX_POWER:1;
const held=action=>keys.has(action);
function refreshBindingHint(){$('settings-hint').textContent=keyLabel(bindings.bindings.settings)+' · 设置';}
function updateWindowMode(){
 const toggle=$('floating-window');
 toggle.hidden=typeof window.BILLIARDS_WINDOW_MODE!=='boolean';
 toggle.textContent=floatingWindow?'返回全屏':'开启悬浮窗';
 toggle.setAttribute('aria-pressed',String(floatingWindow));
 document.body.classList.toggle('floating-window',floatingWindow);
}

function cancelAction(){keys.clear();heldCodes.clear();if(drag?.pointerId!==undefined&&$('scene').hasPointerCapture(drag.pointerId))$('scene').releasePointerCapture(drag.pointerId);drag=null;power=0;lastPointerX=null;spinDrag=false;if(placementUI)placementUI.dragging=false;updatePower();}
function canStrike(){const b=world.balls[0];return started&&!computerTurn()&&!ref.decision&&!paused&&!ballInHand&&!world.running&&!view.chalkMotion&&!ref.done&&!b.potted&&(!world.cuePlacementZone||world.canPlaceCue(b.x,b.y));}
function canShoot(){return canStrike()&&view.stance&&view.postureSettled;}
function canSetSpin(){return started&&!computerTurn()&&!paused&&!ballInHand&&!world.running&&!view.chalkMotion&&!ref.done&&!world.balls[0].potted;}
function canChalk(){return started&&!computerTurn()&&!paused&&!ref.done&&!world.running&&!view.chalkMotion;}
function chalkUp(){
 if(!canChalk())return;cancelAction();
 if(view.beginChalk()){ $('scene').style.cursor='default';$('scene').title='';refreshInteraction();dirty=true; }
}
function refreshInteraction(){
 $('placement-panel').hidden=!ballInHand;$('placement-zone').textContent=zoneLabel(world.cuePlacementZone);
 const cue=world.balls[0];$('confirm-placement').disabled=!ballInHand||paused||world.running||!!view.chalkMotion||cue.potted||!world.canPlaceCue(cue.x,cue.y);
 $('spin-pad').setAttribute('aria-disabled',String(!canSetSpin()));
 const coach=$('coach-toggle');
 coach.hidden=!started||!!ref.difficulty;
 coach.disabled=!view.coachOverhead&&(ballInHand||world.running||ref.done||!!view.chalkMotion);
 coach.textContent=view.coachOverhead?'退出指导':'指导';
 coach.setAttribute('aria-pressed',String(view.coachOverhead));
 $('coach-apply').disabled=!canSetSpin();
 $('coach-shoot').disabled=!coachAdvice||!canStrike();
 const posture=ballInHand?'母球摆位':view.stance?'俯身击球 · 站位锁定':'起身观察';
 refreshControlButtons();
 $('interaction-status').textContent=ref.difficulty?(computerTurn()?(tournament?.showcase?sideNames(tournament)[ref.turn]:'电脑')+'回合':'你的回合 · '+posture):posture;
 $('shot-message').textContent=ref.done?'本局结束':view.chalkMotion?(computerTurn()?'电脑正在擦巧粉…':'正在擦巧粉…'):world.running?'球在运动':computerTurn()?(computerPlan?'电脑瞄准中':'电脑选球中'):ballInHand?'等待确认摆位':view.stance?'准备出杆':'观察球台';
 $('chalk-button').disabled=!canChalk();$('chalk-button').textContent=view.chalkMotion?'擦粉中…':'擦巧粉';
 const grip=computerTurn()?(ref.turn===0?ref.leftComputerGrip:ref.computerGrip):world.tipCondition;
 $('chalk-status').textContent=`${computerTurn()?'电脑':''}皮头抓球 ${Math.round(grip*100)}%${!computerTurn()&&grip<.35?' · 建议擦粉':''}`;
 $('chalk-status').classList.toggle('low',grip<.35);
 refreshMatchRules();
 updatePower();
}
function observe(){if(!started||paused||view.chalkMotion)return;cancelAction();view.setStance(false);refreshInteraction();dirty=true;}
function beginPlacement(){if(!started||computerTurn()||paused||world.running||view.chalkMotion||ref.done||!world.cuePlacementZone)return;clearCoach();cancelAction();view.setStance(false);ballInHand=true;placementUI.candidate=null;placementUI.draw();view.showPlacement(world.cuePlacementZone);refreshInteraction();dirty=true;}
function confirmPlacement(){const b=world.balls[0];if(!ballInHand||paused||view.chalkMotion||b.potted||!world.canPlaceCue(b.x,b.y))return;cancelAction();ballInHand=false;view.showPlacement(null);view.playerAnchor={x:b.x,y:b.y};refreshInteraction();dirty=true;}
function placeAt(p){if(!p||paused||view.chalkMotion||!ballInHand||view.stance||world.running)return false;if(world.placeCue(p.x,p.y)){clearTimeout(toastTimer);$('toast').classList.remove('show');placementUI.draw();refreshInteraction();dirty=true;return true;}toast(`不能放在这里：限${zoneLabel(world.cuePlacementZone)}，且不能压库、入袋或与其他球重叠`);return false;}
function aimStance(){if(!started||computerTurn()||paused||world.running||view.chalkMotion||ref.done||view.coachOverhead)return;if(ballInHand){toast('请先确认母球摆位');return;}if(world.balls[0].potted)return;cancelAction();const openingTarget=mode==='nine'&&ref.shots===0?world.balls.find(b=>b.id===1&&!b.potted):null;view.setStance(true,openingTarget);refreshInteraction();dirty=true;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);dirty=true;}
function fail(error){$('error').hidden=false;$('error-text').textContent=String(error?.message||error);console.error(error);}
window.addEventListener('error',event=>fail(event.error||event.message));
window.addEventListener('unhandledrejection',event=>fail(event.reason));
function setDesktop(data){desktop=data;if(data.wallpaper)$('backdrop').style.backgroundImage=`url("${data.wallpaper}")`;$('source-status').textContent='标准台球 · 本地运行';if(!started)setup(mode);}
function setup(key){
 if(started&&!saveRound())return false;
 for(const id of ['settings','result','take-over-dialog','history','rule-choice','opening-break','difficulty','event-dialog','bank'])if($(id).open)$(id).close();
 paused=false;roundClock.reset();roundId=null;createdAt=0;updateClock();
 tournament=null;roundPayout=null;nextShowcaseFrame=0;showcaseNextRound=null;pendingDifficulty=null;pendingShowcase=false;refreshWallet();
 audio.stop();cancelAction();mode=key;started=false;ballInHand=false;spin={x:0,y:0};world=new World(mode);ref=new Referee(mode);
 computerTime=0;computerPlan=null;computerSearch=null;
 clearCoach();
 view.setup(world);dirty=true;accumulator=0;eventCursor=0;
 document.body.classList.remove('playing');$('welcome').hidden=false;$('game-hud').hidden=true;
 document.querySelectorAll('.mode').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
 updateSpin();updatePower();updateStats();refreshInteraction();
}
function matchLabel(difficulty){return difficulty?'人机对战 · '+DIFFICULTIES[difficulty]:'单人练习';}
const ruleChoices={
 'nine-short-break':['三球开球未达标',[['self','接受球位'],['other','交还开球方']]],
 'push-out':['对手已推杆',[['self','自己打'],['other','交还对手']]],
 'black-tiebreak':['黑球复位 · 你抽中选择权',[['self','自己先打'],['other','电脑先打']]],
 'break-foul':['中八开球犯规',[['accept','线后自由球'],['break-self','重新摆球，我开球'],['break-other','重新摆球，电脑开球']]],
 'missed-break':['开球未碰到球堆',[['break-self','重新摆球，我开球'],['break-other','重新摆球，电脑开球']]],
 'short-break':['中八开球未达标',[['accept','接受球位'],['break-self','重新摆球，我开球'],['break-other','重新摆球，电脑开球']]],
 'black-break':['开球进黑八',[['accept','黑八复位，继续打'],['break-self','重新开球']]],
 'snooker-foul':['斯诺克犯规',[['accept','接受球位'],['replay','让电脑从现位再打']]],
 'snooker-miss':['斯诺克犯规且未尽力击中',[['accept','接受球位'],['replay','让电脑从现位再打'],['replace','恢复原位，让电脑再打']]]
};
function presentOpeningBreak(){
 const opening=tournament?.opening;
 if(!opening)return;
 if(tournament.showcase){
  const breaker=opening.chooser??computerLagWinner(mode);
  if(completeOpeningBreak(breaker))toast(`${sideNames(tournament)[breaker]}先开球`);
  else toast('开球权尚未保存，请返回主页后重试');
  return;
 }
 roundClock.pause();updateClock();
 const dialog=$('opening-break'),lag=opening.kind==='lag';
 $('opening-title').textContent=lag?'比球决定首局开球':'抽签决定首局先手';
 $('lag-control').hidden=!lag||(!dialog.open&&opening.chooser!==undefined);
 $('lag-instructions').hidden=opening.chooser!==undefined;
 if(lag&&!dialog.open){$('lag-retry').hidden=true;if(opening.chooser===undefined)lagView.reset(mode,ref.difficulty);}
 $('opening-actions').hidden=opening.chooser===undefined;
 $('opening-other').hidden=opening.chooser===1;
 $('opening-self').textContent=opening.chooser===1?'继续，电脑先开球':'我先开球';
 const result=opening.chooser===0?'你取得选择权，请选择谁开球。':opening.chooser===1?'电脑取得选择权，并选择先开球。':
  '你打白球，电脑打黄球。各碰右侧短库一次，回球离左侧短库更近的一方取得选择权。';
 const distances=opening.distances?.map(value=>value===null?'无效':`${(value*100).toFixed(1)} 厘米`);
 $('opening-status').textContent=distances?`回球离开球端短库：你 ${distances[0]}，电脑 ${distances[1]}。${result}`:result;
 if(!dialog.open){dialog.showModal();if(lag&&opening.chooser===undefined)$('lag-table').focus();}
}
function completeOpeningBreak(breaker){
 if(!tournament?.opening||(!tournament.showcase&&!$('opening-break').open))return false;
 const previous=tournament;
 tournament={...tournament,breaker};delete tournament.opening;
 const oldTurn=ref.turn;
 ref.turn=breaker;
 ballInHand=!computerSide(breaker);
 if(!saveRound()){
  tournament=previous;ref.turn=oldTurn;ballInHand=false;
  $('opening-status').textContent='开球权尚未保存，请重试。';
  return false;
 }
 $('opening-break').close();
 roundClock.start();
 if(!computerSide(breaker))beginPlacement();
 updateStats();refreshInteraction();dirty=true;
 $('scene').focus({preventScroll:true});
 return true;
}
function refreshMatchRules(){
 const available=started&&!!ref.difficulty&&!world.running&&!ref.done;
 $('match-rules').hidden=!available;
 const player=available&&!computerTurn()&&!ref.decision;
 const warning=available&&ref.mode==='nine'&&(ref.foulStreak?.[ref.turn]??0)===2;
 $('foul-warning').textContent=warning?(computerTurn()?'电脑':'你')+'已连续两次犯规，再犯规负局':
  player&&ref.mode==='snooker'&&ref.missStreak>=2?'已警告：从原位再次未先碰目标球将负局':'';
 const push=$('push-out');
 push.hidden=!player||!ref.pushOutAvailable;
 push.textContent=ref.pushOut?'取消推杆':'声明推杆';
 push.setAttribute('aria-pressed',String(!!ref.pushOut));
 const select=$('free-ball');
 select.hidden=!player||!ref.freeBallAvailable;
 if(!select.hidden&&!select.options.length){
  const nominated=ref.freeBall;
  const on=ref.target(world).filter(id=>id!==nominated);
  select.add(new Option('不指定自由球',''));
  for(const ball of world.balls){
   if(!ball.id||ball.potted||on.includes(ball.id))continue;
   const name=['','','黄球','绿球','棕球','蓝球','粉球','黑球'][ball.value]||`红球 ${ball.id}`;
   select.add(new Option(name,String(ball.id)));
  }
  select.value=nominated??'';
 }else if(select.hidden&&select.options.length)select.replaceChildren();
 const side=humanSide(tournament);
 const concede=available&&side!==null&&!tournament?.opening&&ref.canConcede(world,side);
 $('concede-frame').hidden=!concede;
 $('concede-frame').textContent=concede?`认输本局 · 已超分 ${ref.scores[1-side]-ref.scores[side]-pointsRemaining(world,ref.phase)}`:'认输本局';
}

function maybeComputerConcedes(){
 if(tournament?.opening)return false;
 const message=ref.awardFinalBlackFrame(world);
 if(message){showResult(message);return true;}
 const side=[0,1].find(side=>computerSide(side)&&computerShouldConcede(world,computerPerspective(ref,side)));
 if(side===undefined)return false;
 const concession=ref.concede(world,side);
 if(!concession)return false;
 showResult(tournament?.showcase?`${sideNames(tournament)[side]}认输`:concession);
 return true;
}
function applyRuleChoice(action){
 const result=ref.choose(world,action);
 if(!result)return;
 $('rule-choice').close();
 cancelAction();ballInHand=false;computerTime=0;computerPlan=null;computerSearch=null;
 if(result==='rerack'){
  view.setup(world);view.start();view.snapObservation();eventCursor=0;accumulator=0;
 }
 view.showPlacement(null);
 if(!computerTurn()&&world.cuePlacementZone)beginPlacement();
 if(maybeComputerConcedes())return;
 updateStats();refreshInteraction();saveRound();dirty=true;
 if(ref.missStreak>=2)toast('裁判警告：从原位再一次未先碰目标球将判负');
 if(!computerTurn())$('scene').focus({preventScroll:true});
}
function presentRuleChoice(){
 const {kind,chooser}=ref.decision;
 if(computerSide(chooser)){
  const action={
   'nine-short-break':'self','push-out':'self','black-tiebreak':'self','break-foul':'accept',
   'missed-break':'break-self','short-break':'accept','black-break':'accept',
   'snooker-foul':'accept','snooker-miss':ref.decision.full?'replace':'accept'
  }[kind];
  applyRuleChoice(action);
  return;
 }
 const [title,choices]=ruleChoices[kind];
 $('rule-choice-title').textContent=title;
 const actions=$('rule-choice-actions');actions.replaceChildren();
 for(const [action,label] of choices){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;button.dataset.ruleAction=action;
  button.addEventListener('click',()=>applyRuleChoice(action));actions.append(button);
 }
 if(!$('rule-choice').open)$('rule-choice').showModal();
}
function updateStats(){
 $('return-home').textContent=tournament?.showcase?'结束观赛并回到主页':'保存并回到主页';
 $('mode-label').textContent=MODES[mode].en+' / '+(tournament?.showcase?'高手如云 · 双高档':matchLabel(ref.difficulty));
 $('target-label').textContent=ref.label(world);
 $('match-score').hidden=!ref.difficulty;
 $('match-score-value').textContent=ref.scores?.join(' : ')??'';
 $('match-score').querySelector('small').textContent=sideNames(tournament).join(' / ');
 $('score').parentElement.hidden=!!ref.difficulty;
 $('score').textContent=ref.score;$('shots').textContent=ref.shots;$('fouls').textContent=ref.fouls;
 $('penalty-stat').hidden=mode!=='snooker'||!!ref.difficulty;$('penalty-points').textContent=ref.penaltyPoints;
 $('event-stage').hidden=!tournament;
 if(tournament){
  const details=EVENTS[mode][tournament.key];
  $('event-stage').textContent=`${details.name} · ${stageName(details.prizes.length-1-tournament.stage)}`;
 }
 updateScoreboard();
}
function updateScoreboard(score=tournament?.matchScore??[0,0]){
 const board=$('match-scoreboard');
 board.hidden=!tournament;
 if(!tournament)return;
 const {key,stage}=tournament;
 $('scoreboard-player').textContent=score[0];
 $('scoreboard-computer').textContent=score[1];
 board.querySelectorAll('.scoreboard-side span').forEach((label,i)=>{label.textContent=sideNames(tournament)[i];});
 $('scoreboard-race').textContent=raceLabel(mode,raceTo(mode,key,EVENTS[mode][key],stage));
}
function tournamentScore(mode,entry,score=entry.matchScore??[0,0]){
 const details=EVENTS[mode][entry.key];
 return matchLabelText(mode,raceTo(mode,entry.key,details,entry.stage),score,sideNames(entry));
}
function updateClock(){const text=formatTime(roundClock.value());if(text!==lastClockText){$('round-time').textContent=text;lastClockText=text;}}
function roundSnapshot(overrides={}){
 return captureRound({id:roundId,createdAt,world,ref,elapsedMs:roundClock.value(),ballInHand,orbit:view.orbit,eyeHeight:view.eyeHeight,spin,guide,soundEnabled,tournament,...overrides});
}
function saveRound(){
 if(!started||!roundId)return true;
 if(ref.done&&tournament)return finishTournament();
 if(tournament?.showcase)return true;
 const ok=ref.done?history.remove(roundId):history.save(roundSnapshot());
 if(!ok){toast(history.error);if($('settings').open)settingsUI.message(history.error,true);}return ok;
}
function prepareClose(){
 if(started&&!ref.done){roundClock.pause();paused=true;}
 audio.stop();cancelAction();const ok=saveRound();
 if(!ok&&started){if(!$('settings').open)settingsUI.open();settingsUI.message(history.error+' 请保留当前窗口后重试。',true);}
 return ok;
}
window.prepareBilliardsClose=prepareClose;
function showResult(message){
 roundClock.pause();updateClock();cancelAction();paused=true;view.setStance(false);updateStats();refreshInteraction();saveRound();
 const names=sideNames(tournament);
 $('result-title').textContent=tournament?.showcase?`${names[ref.outcome==='win'?0:1]}赢得本局`:ref.outcome==='win'?'本局获胜':'本局失败';
 $('result-message').textContent=tournament?.showcase?'本局比分已计入比赛':message;
 const scores=ref.difficulty?`${tournament?.showcase?'高手如云':matchLabel(ref.difficulty)} · ${names[0]} ${ref.scores[0]} : ${ref.scores[1]} ${names[1]}`:`${ref.score} 分${mode==='snooker'?` · 罚分 ${ref.penaltyPoints}`:''}`;
 const maximum=ref.maximum?` · ${names[ref.maximum.player]}单杆 ${ref.maximum.points} 分`:'';
 $('result-summary').textContent=`${MODES[mode].name} · ${scores}${maximum} · ${ref.shots} 杆 · 犯规 ${ref.fouls} 次 · 用时 ${formatTime(roundClock.value())}`;
 renderPayout();
 $('result').showModal();$('play-again').focus();
 if(tournament?.showcase&&tournament.controlledSide===null&&roundPayout?.advance)nextShowcaseFrame=performance.now()+2600;
}
function finishTournament(){
 if(roundPayout)return true;
 const {key,stage}=tournament,details=EVENTS[mode][key],won=ref.outcome==='win';
 const progress=recordFrame(mode,details,tournament,won);
 if(tournament.showcase){
  if(progress.next)showcaseNextRound=nextRoundSnapshot(progress);
  roundPayout={advance:!!progress.next,kind:progress.kind,score:progress.score};
  return true;
 }
 const breaks=ref.maximum?[...(tournament.breaks??[]),{...ref.maximum,stage}]:tournament.breaks??[];
 const bestBreaks=(tournament.bestBreaks??[null,null]).map((best,player)=>{
  const frame=ref.bestBreaks?.[player];
  if(!frame||best?.points>frame.points)return best;
  return {points:frame.points,count:frame.count+(best?.points===frame.points?best.count:0)};
 });
 try{
  roundPayout=history.transact(({account,rounds})=>{
   const previousScore=(tournament.matchScore??[0,0]).join(':');
   const index=rounds.findIndex(round=>round.id===roundId&&round.tournament?.key===key&&round.tournament.stage===stage&&
    (round.tournament.matchScore??[0,0]).join(':')===previousScore);
   if(index<0)throw Error('找不到本轮报名记录，无法结算。');
   if(progress.next){
    if(breaks.length)progress.next.breaks=breaks;
    if(bestBreaks.some(Boolean))progress.next.bestBreaks=bestBreaks;
    rounds[index]=nextRoundSnapshot(progress);
    return {advance:true,kind:progress.kind,score:progress.score};
   }
   const quote=tournament.quote??LEGACY_QUOTE;
   const payout=eventPrize(details,stage,won,quote);
   const bonus=mode==='snooker'?snookerBreakPrize(key,breaks,bestBreaks):{maximum:0,high:0};
   const remaining=details.prizes.length-1-stage;
   const title=won?'冠军':remaining===1&&payout?'亚军':stageName(remaining)+'止步';
   if(won)account.wins[mode]=(account.wins[mode]??0)+1;
   const results=progress.completed.map(({stage,score})=>`${stageName(details.prizes.length-1-stage)} ${score.join(':')}`).join('，');
   const bonusLabel=(bonus.maximum?' · 147 奖金 '+money(bonus.maximum):'')+(bonus.high?' · 单杆最高分奖 '+money(bonus.high):'');
   const receipt=settlePrize(account,`${details.name} · ${title} · ${results}${bonusLabel}`,payout+bonus.maximum+bonus.high);
   rounds.splice(index,1);
   return {...receipt,title,bonusLabel,score:progress.score,balance:account.balance,quoteDate:details.currency==='GBP'?null:quote.date};
  });
  refreshWallet();
  return true;
 }catch(error){
  toast(error.message);
  return false;
 }
}
function nextRoundSnapshot({kind,next}){
 const nextWorld=new World(mode),nextRef=new Referee(mode,ref.difficulty);
 nextRef.turn=next.breaker;
 const fatigue=previous=>kind==='frame'&&previous?nextFrameFatigue(previous,roundClock.value()):freshComputerFatigue();
 nextRef.computerFatigue=fatigue(ref.computerFatigue);
 if(next.showcase){
  nextRef.leftComputerGrip=1;
  nextRef.leftComputerFatigue=fatigue(ref.leftComputerFatigue);
 }
 return roundSnapshot({
  world:nextWorld,ref:nextRef,tournament:next,ballInHand:!next.opening&&nextRef.turn===humanSide(next),
  elapsedMs:0,spin:{x:0,y:0},orbit:Math.PI
 });
}
function renderPayout(){
 const payout=$('result-payout');
 payout.hidden=!tournament;
 $('play-again').textContent=!tournament?'再来一轮':!roundPayout?'重试结算':roundPayout.kind==='frame'?'下一局':roundPayout.advance?'下一轮':'选择比赛';
 if(!tournament)return;
 if(!roundPayout){payout.textContent='结算尚未保存，请重试。';return;}
 updateScoreboard(roundPayout.score);
 const score=tournamentScore(mode,tournament,roundPayout.score);
 if(tournament.showcase){
  payout.textContent=`${score} · ${roundPayout.kind==='frame'?'本轮继续':roundPayout.advance?'进入下一轮':'赛事结束'}`;
  refreshControlButtons();
  return;
 }
 payout.textContent=roundPayout.kind==='frame'?`${score} · 本轮继续`:
  roundPayout.advance?`${score} · 晋级下一轮。奖金在赛事结束时结算。`:
  `${score} · ${roundPayout.title} · 总奖金 ${money(roundPayout.value)}${roundPayout.bonusLabel} · 偿还贷款 ${money(roundPayout.paid)} · 实际到账 ${money(roundPayout.credit)} · 余额 ${money(roundPayout.balance)}${roundPayout.quoteDate?' · 汇率日期 '+roundPayout.quoteDate:''}`;
}
function showHistory(){
 if(started)return;
 clearTimeout(historyExpiryTimer);
 const rounds=history.read(),list=$('history-list');list.replaceChildren();
 $('history-empty').textContent=history.error||'最近 3 天没有未完成的球局。中途离开时会自动保存。';$('history-empty').hidden=rounds.length>0&&!history.error;
 for(const s of rounds){const row=document.createElement('div'),text=document.createElement('div'),title=document.createElement('b'),details=document.createElement('small'),button=document.createElement('button');row.className='history-row';title.textContent=s.tournament?EVENTS[s.mode][s.tournament.key].name+' · '+stageName(EVENTS[s.mode][s.tournament.key].prizes.length-1-s.tournament.stage):MODES[s.mode].name+(s.referee.difficulty?' · '+matchLabel(s.referee.difficulty):'');details.textContent=`${s.tournament?tournamentScore(s.mode,s.tournament)+' · ':''}${formatTime(s.elapsedMs)} · ${s.referee.scores?.join(' : ')??s.referee.score+' 分'} · ${s.referee.shots} 杆 · ${new Date(s.updatedAt).toLocaleString('zh-CN')}`;text.append(title,details);button.type='button';button.textContent='继续球局';button.dataset.round=s.id;button.addEventListener('click',()=>continueRound(s.id));row.append(text,button);list.append(row);}
 if(!$('history').open)$('history').showModal();
 if(rounds.length){
  const expires=rounds.at(-1).updatedAt+ROUND_RETENTION_MS;
  historyExpiryTimer=setTimeout(()=>{if($('history').open)showHistory();},clamp(expires-Date.now(),1,ROUND_RETENTION_MS));
 }
}
function continueRound(id){
 const snapshot=history.read().find(s=>s.id===id);if(!snapshot){$('history-empty').hidden=false;$('history-empty').textContent=history.error||'未找到这局存档。';return;}
 loadRound(snapshot);
}
function loadRound(snapshot){
 let restored;try{restored=restoreRound(snapshot);}catch(e){$('history-empty').hidden=false;$('history-empty').textContent=e.message;return;}
 audio.stop();cancelAction();$('history').close();mode=snapshot.mode;world=restored.world;ref=restored.ref;
 tournament=snapshot.tournament??null;roundPayout=null;
 clearCoach();
 computerTime=0;computerPlan=null;computerSearch=null;$('opponent').value=tournament?.showcase?'showcase':ref.difficulty?'computer':'';
 if(ref.difficulty&&!ref.computerFatigue)ref.computerFatigue=freshComputerFatigue();
 const state=restored.view;started=true;paused=false;roundId=snapshot.id;createdAt=snapshot.createdAt;ballInHand=state.ballInHand;spin={...state.spin};guide=state.guide;soundEnabled=state.soundEnabled;audio.setEnabled(soundEnabled);
 view.setup(world);view.start();view.orbit=state.orbit;view.eyeHeight=state.eyeHeight;view.snapObservation();view.showPlacement(ballInHand?world.cuePlacementZone:null);
 placementUI.candidate=null;placementUI.draw();eventCursor=world.events.length;accumulator=0;last=performance.now();lastCheckpoint=last;roundClock.reset(snapshot.elapsedMs);roundClock.start();
 document.body.classList.add('playing');$('welcome').hidden=true;$('game-hud').hidden=false;updateSpin();updatePower();updateStats();updateOptions();updateClock();refreshInteraction();dirty=true;$('scene').focus({preventScroll:true});
 if(ref.decision)presentRuleChoice();
 else if(tournament?.opening)presentOpeningBreak();
 else maybeComputerConcedes();
}
function updatePower(){
 const limit=powerLimit(),breakBoost=limit>1;
 $('power-value').innerHTML=`${Math.round(power*100)}<span>%</span>`;
 $('power-track').classList.toggle('break-boost',breakBoost);
 $('power-track').classList.toggle('boost-active',breakBoost&&power>1);
 $('power-track').style.setProperty('--normal-power-end',`${100/limit}%`);
 $('power-bar').style.width=power/limit*100+'%';
 $('break-power-label').textContent=breakBoost?'爆发开球':'满力度';
 const offset=PLAYER_SPIN_LIMIT*Math.hypot(spin.x,spin.y);
 const efficiency=world?cueResponse(world.tipCondition,offset/.8).speed:1;
 $('speed-label').textContent=(power?playerShotSpeed(power,breakBoost)*efficiency:0).toFixed(1)+' m/s';
 dirty=true;
}
function updateSpin(){const length=Math.hypot(spin.x,spin.y);if(length>1){spin.x/=length;spin.y/=length;}$('spin-dot').style.left=50+spin.x*40+'%';$('spin-dot').style.top=50-spin.y*40+'%';$('spin-pad').setAttribute('aria-valuenow',String(Math.round(Math.hypot(spin.x,spin.y)*80)));$('spin-description').textContent=(Math.abs(spin.x)<.1?'':spin.x<0?'左塞 · ':'右塞 · ')+(Math.abs(spin.y)<.1?'中心击球':spin.y>0?'高杆':'低杆');dirty=true;}
function setGuide(value){guide=value;updateOptions();dirty=true;}
function updateOptions(){$('options-status').textContent=`音效 ${soundEnabled?'开':'关'}`;for(const button of document.querySelectorAll('[data-guide]')){button.textContent=`辅助线：${guide?'开':'关'}`;button.setAttribute('aria-pressed',String(guide));}}
function togglePause(){if(['result','take-over-dialog','history','rule-choice','opening-break','difficulty','event-dialog','bank'].some(id=>$(id).open))return;if($('settings').open){resume();return;}roundClock.pause();paused=true;audio.stop();cancelAction();settingsUI.open();saveRound();dirty=true;}
function resume(){$('settings').close();$('scene').focus({preventScroll:true});cancelAction();paused=false;if(started&&!ref.done)roundClock.start();last=performance.now();accumulator=0;dirty=true;}
function goBack(){
 if($('take-over-dialog').open){closeTakeOver();return;}
 if($('bank').open){closeBank();return;}
 if($('event-dialog').open){closeEvents();return;}
 if($('difficulty').open){closeDifficulty();return;}
 if($('settings').open){resume();return;}
 if($('history').open){$('history').close();$('history-open').focus();return;}
 if($('result').open){setup(mode);return;}
 if($('rule-choice').open||$('opening-break').open){setup(mode);return;}
 if(view.coachOverhead){toggleCoach();return;}
 if(started){setup(mode);return;}
 exit();
}
function exit(){if(!prepareClose())return;if(window.chrome?.webview)window.chrome.webview.postMessage({type:'exit'});else{if(started&&!ref.done&&!$('settings').open)settingsUI.open();toast(tournament?.showcase?'可关闭此标签页结束观赛':'未完成的球局已保存，可关闭此标签页退出');}}
function shot(){
 if(!canShoot()){power=0;updatePower();return;}
 if(power<.015){power=0;updatePower();return;}
 const breakBoost=breakBoostAvailable();
 strikePlayer(view.aim,playerShotSpeed(power,breakBoost),spin.x*PLAYER_SPIN_LIMIT,spin.y*PLAYER_SPIN_LIMIT,breakBoost);
 power=0;updatePower();dirty=true;
}
function strikePlayer(angle,speed,side,top,breakBoost){
 const overhead=view.coachOverhead;
 ref.begin(world);
 if(!world.strike(angle,speed,side,top,{breakBoost}))return;
 clearCoach();eventCursor=0;audio.play('cue',Math.hypot(world.balls[0].vx,world.balls[0].vy));
 if(overhead)view.snapObservation();
 observe();$('shot-message').textContent='球在运动';
}
function completeShot(){
 const result=ref.finish(world);
 computerTime=0;computerPlan=null;computerSearch=null;
 spin={x:0,y:0};updateSpin();updateStats();
 if(view.stance)observe();
 if(result.ballInHand&&!computerTurn()&&!ref.decision)beginPlacement();
 refreshInteraction();
 if(ref.done)showResult(result.message);else if(!maybeComputerConcedes()){saveRound();toast(result.message);}
 if(ref.decision&&!ref.done)presentRuleChoice();
 dirty=true;
}

function clearCoach(){
 coachSearch=null;coachAdvice=null;
 view.coachOverhead=false;view.setCoachLines(null);
 for(const id of ['coach-advice','coach-apply','coach-shoot','coach-spin'])$(id).hidden=true;
}

function toggleCoach(){
 if(!started||paused||ref.difficulty||$('coach-toggle').disabled)return;
 cancelAction();view.setStance(false);
 view.coachOverhead=!view.coachOverhead;
 if(view.coachOverhead){
  if(!coachAdvice&&!coachSearch){
   coachSearch=practiceShotSearch(world,ref);
   $('coach-advice').textContent='正在分析球位…';
   $('coach-advice').hidden=false;
  }
 }else{
  view.snapObservation();
  if(!coachAdvice&&!coachSearch)$('coach-advice').hidden=true;
 }
 refreshInteraction();dirty=true;
}

function advanceCoach(){
 if(!coachSearch)return;
 const deadline=performance.now()+5;
 let step=coachSearch.next();
 while(!step.done&&performance.now()<deadline)step=coachSearch.next();
 if(!step.done)return;
 coachSearch=null;coachAdvice=step.value;
 if(!coachAdvice){
  $('coach-advice').textContent='试算后暂未找到合法进攻或解球路线。';
  return;
 }
 const {target,nextTarget,side,top,speed,legalPot,breakBoost,cushions}=coachAdvice;
 const ballLabel=ball=>mode==='snooker'?['','','黄球','绿球','棕球','蓝球','粉球','黑球'][ball.value]||'红球':ball.id+' 号球';
 const vertical=Math.abs(top)<.01?'':top>0?'高杆':'低杆';
 const lateral=Math.abs(side)<.01?'':side>0?'右塞':'左塞';
 const spinText=[vertical,lateral].filter(Boolean).join(' + ')||'中心点，不加塞';
 const powerPercent=Number((playerShotPower(speed,breakBoost)*100).toFixed(1));
 const intention=cushions.length?`${cushions.length} 库解球，先碰`:ref.shots===0&&mode!=='snooker'?'开球先碰':legalPot?'进攻先碰':'防守先碰';
 $('coach-advice').textContent=`${intention} ${ballLabel(target)} · ${spinText} · 力度约 ${powerPercent}%${nextTarget?' · 走位衔接 '+ballLabel(nextTarget):''}`;
 $('coach-apply').hidden=false;
 $('coach-shoot').hidden=false;
 $('coach-shoot').disabled=!canStrike();
 const marker=$('coach-spin');
 marker.style.left=`${50+side/PLAYER_SPIN_LIMIT*40}%`;
 marker.style.top=`${50-top/PLAYER_SPIN_LIMIT*40}%`;
 marker.hidden=false;
 view.setCoachLines(coachAdvice);dirty=true;
}

function advanceComputer(elapsed){
 if(!started||!computerTurn()||tournament?.opening||ref.decision||ref.done||world.running||view.chalkMotion)return;
 computerTime+=elapsed;
 if(computerTime<.65)return;
 if(!computerPlan){
  const planner=computerPerspective(ref,ref.turn);
  if(!computerSearch&&computerNeedsChalk(planner)&&view.beginChalk('computer')){
   dirty=true;
   return;
  }
  computerSearch??=computerShotSearch(world,planner,Math.random,computerFatigueLevel(planner.computerFatigue,roundClock.value(),ref.difficulty));
  const deadline=performance.now()+5;
  let step=computerSearch.next();
  while(!step.done&&performance.now()<deadline)step=computerSearch.next();
  if(!step.done)return;
  computerSearch=null;
  const plan=step.value;
  if(!plan)return;
  if(computerNeedsChalk(planner,plan)&&view.beginChalk('computer')){
   dirty=true;
   return;
  }
  if(plan.placement&&!tournament?.showcase&&!world.placeCue(plan.placement.x,plan.placement.y))return;
  computerPlan=plan;computerTime=.65;dirty=true;
  return;
 }
 if(computerTime<1.45){dirty=true;return;}
 const {angle,speed,top,side,breakBoost}=computerPlan;
 const placement=computerPlan.placement;
 if(tournament?.showcase&&placement&&!world.placeCue(placement.x,placement.y)){computerPlan=null;computerTime=0;return;}
 const grip=ref.turn===0?'leftComputerGrip':'computerGrip';
 const fatigue=ref.turn===0?ref.leftComputerFatigue:ref.computerFatigue;
 const playerGrip=world.tipCondition;
 world.tipCondition=ref[grip]??1;
 ref.begin(world);
 const struck=world.strike(angle,speed,side,top,{breakBoost});
 ref[grip]=world.tipCondition;
 world.tipCondition=playerGrip;
 if(struck&&fatigue)recordComputerStroke(fatigue,computerPlan);
 computerPlan=null;computerTime=0;dirty=true;
 if(struck){
  eventCursor=0;accumulator=0;
  audio.play('cue',Math.hypot(world.balls[0].vx,world.balls[0].vy));
 }
}
function frame(now){
 requestAnimationFrame(frame);const elapsed=Math.min(.08,(now-last)/1000);last=now;
 if(nextShowcaseFrame&&now>=nextShowcaseFrame&&!document.hidden&&!$('take-over-dialog').open){nextShowcaseFrame=0;openNextEventRound();}
 if(paused||document.hidden)return;
 if(tournament?.opening?.kind==='lag'&&$('opening-break').open)lagView.update(elapsed);
 if(started&&!ref.done){updateClock();if(now-lastCheckpoint>10000){lastCheckpoint=now;saveRound();}}
 let active=world.running||!!drag||!!view.chalkMotion||keys.size>0||(started&&view.transition<1);
 if(started&&!view.coachOverhead&&!view.chalkMotion){
  const fine=held('precision')?.2:1;
  if(!drag&&!placementUI.dragging&&!view.stance){
   const step=(Number(held('walkLeft'))-Number(held('walkRight')))*elapsed*.38;
   if(step){view.walk(step);dirty=true;}
   const height=(Number(held('heightUp'))-Number(held('heightDown')))*elapsed*.4*fine;
   if(height){view.eyeHeight=clamp(view.eyeHeight+height,OBSERVATION_HEIGHT.min,OBSERVATION_HEIGHT.max);dirty=true;}
  }
  if(!world.running&&!ref.done){
   const dx=Number(held('adjustRight'))-Number(held('adjustLeft'));
   if(ballInHand&&!drag){const dy=Number(held('placeDown'))-Number(held('placeUp')),b=world.balls[0],step=elapsed*.35*fine;
    if(dx||dy){if(b.potted||!world.canPlaceCue(b.x,b.y)){placeAt(keyboardPlacementStart(world));}else{const p={x:b.x+dx*step,y:b.y+dy*step};if(world.canPlaceCue(p.x,p.y))placeAt(p);}}
   }else if(view.stance&&!drag&&dx){view.adjustAim(dx*elapsed*.9*fine);dirty=true;}
   if(canSetSpin()){
    const sx=Number(held('spinRight'))-Number(held('spinLeft')),sy=Number(held('spinUp'))-Number(held('spinDown'));
    if(sx||sy){spin.x+=sx*elapsed*.8*fine;spin.y+=sy*elapsed*.8*fine;updateSpin();}
   }
   if(drag?.type==='keyboard-shot'){power=clamp(power+elapsed*.55,0,powerLimit());updatePower();}
  }
 }
 if(world.running){accumulator+=elapsed;while(accumulator>=1/240&&world.running){world.step(1/240);accumulator-=1/240;}const newEvents=world.events.slice(eventCursor);eventCursor=world.events.length;audio.playEvents(newEvents,{cameraX:view.camera.position.x,cameraZ:view.camera.position.z,length:world.c.length});if(!world.running){accumulator=0;completeShot();}dirty=true;}
 advanceComputer(elapsed);
 advanceCoach();
 // Native refresh cadence while anything changes. No frame cap or resolution scaling.
 if(view.renderer.getPixelRatio()!==devicePixelRatio){view.resize();dirty=true;}
 if(!active&&!dirty&&!view.needsFrame&&!view.invalidated)return;
 const dt=Math.min(.1,(now-lastPaint)/1000);lastPaint=now;
 const computerShot=computerPlan?{...computerPlan,pull:.05+.18*Math.sin(Math.PI*(computerTime-.65)/.8)}:null;
 view.update(dt,{power,guide:guide&&!ref.done,spin,ballInHand,computerShot});
 audio.updateChalk(view.chalkMotion?.elapsed);
 if(view.chalkCompleted){
  const computer=view.chalkCompleted==='computer';
  view.chalkCompleted=false;
  if(computer)ref[ref.turn===0?'leftComputerGrip':'computerGrip']=1;
  else{
   world.tipCondition=1;
   if(coachAdvice||coachSearch){
    clearCoach();
    view.snapObservation();
   }
  }
  if(tournament?.showcase&&!computerTurn()&&computer)world.tipCondition=1;
  if(tournament?.showcase&&ballInHand)beginPlacement();
  updatePower();saveRound();
  if(!computer)toast('巧粉已放回桌边 · 抓球状态恢复');
 }
 view.cue.visible&&=!ref.done;
 if(started){refreshInteraction();}
 view.render();dirty=false;view.invalidated=false;
}
settingsUI=new SettingsUI($('settings'),bindings,{close:resume,changed:()=>{cancelAction();refreshBindingHint();}});
refreshBindingHint();updateOptions();
try{
 view=new BilliardScene($('scene'));placementUI=new PlacementUI($('placement-map'),()=>world,placeAt);setDesktop(desktop);requestAnimationFrame(frame);
}catch(e){fail(e);}
updateWindowMode();
window.chrome?.webview?.addEventListener('message',event=>{
 if(event.data.type==='desktop')setDesktop(event.data.payload);
 if(event.data.type==='pause'&&!floatingWindow&&started&&!paused)togglePause();
 if(event.data.type==='windowMode'){
  floatingWindow=event.data.floating===true;
  updateWindowMode();
  $('floating-window').disabled=false;
  if($('settings').open)resume();
 }
});
function start(difficulty=null,eventKey=null,quote=exchange.quote,showcase=false){
 if(started||paused)return;
 if(eventKey&&difficulty==='low'&&eventKey!=='club'){
  $('event-error').textContent='低档仅限球房周赛，其他赛事请选择中档或高档。';
  return;
 }
 const id=crypto.randomUUID(),created=Date.now(),judge=new Referee(mode,difficulty);
 if(difficulty)judge.computerFatigue=freshComputerFatigue();
 const entry=eventKey?{key:eventKey,stage:openingStage(eventKey,EVENTS[mode][eventKey]),quote,matchScore:[0,0],breaker:0,opening:openingBreak(mode)}:null;
 if(showcase){
  Object.assign(entry,{showcase:true,controlledSide:null});
  Object.assign(judge,{leftComputerGrip:1,leftComputerFatigue:freshComputerFatigue()});
 }
 if(entry&&!showcase){
  const details=EVENTS[mode][eventKey],fee=toPence(details.fee,details.currency,quote);
  try{
   history.transact(({account,rounds})=>{
    if((account.wins[mode]??0)<(details.minWins??0))throw Error('尚未达到参赛资格。');
    if(account.balance<fee)throw Error(`余额不足，还差 ${money(fee-account.balance)}。`);
    account.balance-=fee;
    if(fee)record(account,`${details.name}报名费`,-fee);
    rounds.unshift(roundSnapshot({id,createdAt:created,ref:judge,elapsedMs:0,ballInHand:false,tournament:entry}));
   });
  }catch(error){$('event-error').textContent=error.message;return;}
 }
 if(entry)$('event-dialog').close();
 cancelAction();ref=judge;tournament=entry;roundPayout=null;started=true;roundId=id;createdAt=created;
 roundClock.reset();roundClock.start();lastCheckpoint=performance.now();view.start();
 $('welcome').hidden=true;$('game-hud').hidden=false;document.body.classList.add('playing');
 updateStats();
 if(entry)presentOpeningBreak();
 else{beginPlacement();saveRound();}
 dirty=true;
 $('scene').focus({preventScroll:true});
}
function requestStart(){
 if(started||paused||$('difficulty').open||$('event-dialog').open||$('bank').open)return;
 if($('opponent').value==='computer')$('difficulty').showModal();
 else if($('opponent').value==='showcase')openEvents('high',true);
 else start();
}
function openNextEventRound(){
 const id=roundId,next=showcaseNextRound;
 if(setup(mode)===false)return;
 if(next)loadRound(next);
 else continueRound(id);
}
function refreshControlButtons(){
 const handBack=canHandBack(),visible=canTakeOver()||handBack;
 for(const id of ['take-over','take-over-result']){
  $(id).hidden=!visible;
  $(id).textContent=handBack?'交还电脑':'接管比赛';
 }
 $('hand-back-rule').hidden=!handBack;
}
function toggleShowcaseControl(){
 if(canHandBack())setShowcaseControl(null);
 else openTakeOver();
}
function openTakeOver(){
 if(!canTakeOver())return;
 if(!ref.done){roundClock.pause();paused=true;cancelAction();}
 $('take-over-status').textContent='保留当前比分和球位。正在运动的球会先完成这一杆。';
 $('take-over-dialog').showModal();
}
function closeTakeOver(){
 $('take-over-dialog').close();
 if(!ref.done){paused=false;roundClock.start();last=performance.now();$('scene').focus({preventScroll:true});}
}
function setShowcaseControl(side){
 const handBack=side===null;
 if(handBack?!canHandBack():!canTakeOver()||!$('take-over-dialog').open)return;
 if(ref.done){
  const next=showcaseNextRound;
  if(!next)return;
  next.tournament.controlledSide=side;
  next.view.ballInHand=!next.tournament.opening&&next.referee.turn===side&&!!next.world.cuePlacementZone;
  if(!handBack)next.world.tipCondition=(side===0?next.referee.leftComputerGrip:next.referee.computerGrip)??1;
  closeTakeOver();openNextEventRound();return;
 }
 const oldGrip=world.tipCondition,gripKey=tournament.controlledSide===0?'leftComputerGrip':'computerGrip';
 tournament={...tournament,controlledSide:side};
 if(handBack){ref[gripKey]=oldGrip;spin={x:0,y:0};}
 else world.tipCondition=(side===0?ref.leftComputerGrip:ref.computerGrip)??1;
 ballInHand=!world.running&&ref.turn===side&&!!world.cuePlacementZone;
 computerTime=0;computerPlan=null;computerSearch=null;
 if(handBack){
  if(view.chalkMotion)view.chalkMotion.owner='computer';
  cancelAction();view.setStance(false);view.showPlacement(null);updateSpin();
  $('scene').focus({preventScroll:true});
 }else closeTakeOver();
 if(ballInHand&&!view.chalkMotion)beginPlacement();
 updateStats();refreshInteraction();dirty=true;
 if(ref.decision)presentRuleChoice();
}
function closeDifficulty(){
 $('difficulty').close();
 $('start-game').focus({preventScroll:true});
}
function refreshWallet(){
 try{$('home-wallet').textContent='资金 '+money(history.account().balance);}
 catch{$('home-wallet').textContent='资金读取失败';}
}
function closeEvents(){
 $('event-dialog').close();pendingDifficulty=null;pendingShowcase=false;$('start-game').focus();
}
function openEvents(difficulty,showcase=false){
 pendingDifficulty=difficulty;
 pendingShowcase=showcase;
 $('event-year').closest('.event-filter').hidden=difficulty==='low';
 const years=[...new Set(Object.values(EVENTS[mode]).filter(event=>event.source).map(event=>event.edition.slice(0,4)))].sort().reverse();
 $('event-year').replaceChildren(new Option('全部年份',''),...years.map(year=>new Option(year,year)));
 const refresh=exchange.refresh();
 renderEvents();
 $('event-dialog').showModal();
 refreshCalendar();
 refresh.then(()=>{
  if($('event-dialog').open&&!$('bank').open)renderEvents();
 });
}
function refreshCalendar(force=false){
 const updating=officialCalendar.refresh(force);
 renderCalendar();
 updating.then(()=>{if($('event-dialog').open)renderCalendar();});
}
function renderCalendar(){
 const list=$('calendar-options');
 list.replaceChildren();
 const events=officialCalendar.list(mode);
 $('official-calendar').querySelector('summary').textContent=events.length?`真实赛事赛程（${events.length}）`:'真实赛事赛程';
 $('calendar-status').textContent=officialCalendar.status(mode);
 $('calendar-refresh').disabled=!!officialCalendar.pending;
 if(!events.length&&!officialCalendar.pending){
  const empty=document.createElement('p');
  empty.textContent='当前没有可显示的赛程。';
  list.append(empty);
 }
 for(const event of events){
  const card=document.createElement('article');
  const title=document.createElement('strong'),details=document.createElement('p'),link=document.createElement('a');
  title.textContent=event.name;
  const date=event.start?(event.start===event.end?event.start:`${event.start} 至 ${event.end}`):`发布于 ${event.published}`;
  details.textContent=[calendarStatus(event),date,event.location,calendarSource(event)].filter(Boolean).join(' · ');
  link.href=event.url;link.target='_blank';link.rel='noopener';link.textContent='查看官方资料';
  card.append(title,details);
  if(event.prizeFund!=null){
   const prize=document.createElement('p');
   prize.textContent=`官方总奖金 ${money(toPence(event.prizeFund,'USD',exchange.quote))}（折算）`;
   card.append(prize);
  }
  card.append(link);
  list.append(card);
 }
}
function renderEvents(){
 const list=$('event-options');list.replaceChildren();
 $('event-error').textContent='';
 $('event-title').textContent=MODES[mode].name+' · 选择比赛';
 let account;
 try{account=history.account();}
 catch(error){$('event-wallet').textContent=error.message;return;}
 const low=pendingDifficulty==='low';
 const formatNote=low?'低档仅限球房周赛，其他赛事请选择中档或高档。':'达到本轮胜局数才晋级，赛事结束按名次结算。';
 $('event-wallet').textContent=pendingShowcase?'高手如云 · 双方高档 · 观赛和接管均免费':`${DIFFICULTIES[pendingDifficulty]} · 余额 ${money(account.balance)}。${formatNote}`;
 $('event-bank').hidden=pendingShowcase;
 $('event-fx').hidden=pendingShowcase;
 const quote=exchange.quote;
 $('event-fx').textContent=`欧洲央行参考汇率 · ${quote.date} · ${exchange.status}。报名时锁定本届费用和奖金折算汇率。`;
 const format=(details,n)=>money(toPence(n,details.currency,quote));
 const year=$('event-year').value;
 const events=Object.entries(EVENTS[mode])
  .filter(([key,details])=>key==='club'||(!low&&(!year||details.edition.startsWith(year))))
  .sort(([a,first],[b,second])=>a==='club'?-1:b==='club'?1:second.edition.localeCompare(first.edition));
 for(const [key,details] of events){
  const fee=toPence(details.fee,details.currency,quote);
  const missing=Math.max(0,(details.minWins??0)-(account.wins[mode]??0));
  const card=document.createElement('div');card.className='event-option';
  const info=document.createElement('div'),title=document.createElement('strong'),terms=document.createElement('p');
  title.textContent=`${details.name} · ${details.edition}`;
  const first=openingStage(key,details),last=details.prizes.length-2;
  const rounds=Array.from({length:last-first+1},(_,i)=>{
   const stage=first+i;
   return `${stageName(details.prizes.length-1-stage)} ${raceLabel(mode,raceTo(mode,key,details,stage))}`;
  });
  terms.textContent=pendingShowcase?`${rounds[0]}起`:`${rounds[0]}起 · 冠军 ${format(details,details.prizes[0])}${details.prizes[1]?` · 亚军 ${format(details,details.prizes[1])}`:''}`;
  info.append(title,terms);
  const opening=document.createElement('p');
  opening.textContent=(mode==='snooker'?'首局抽签':'首局比球')+(key==='club'?'':breakOrder(mode,key)==='winner'?' · 胜者开球':' · 轮流开球');
  info.append(opening);
  const fees=document.createElement('p');
  fees.textContent=fee?`报名费 ${money(fee)}${details.feeSimulated?'（游戏设定）':details.feeNote?`（${details.feeNote}）`:''}`:
   details.feeSimulated?'游戏内免报名费':'免报名费';
  if(!pendingShowcase)info.append(fees);
  if(details.minWins&&!pendingShowcase){
   const qualification=document.createElement('p');
   qualification.textContent=`报名资格：在${MODES[mode].name}的人机赛事中夺冠 ${details.minWins} 次。免费球房周赛赢一局即夺冠；多轮赛事须赢下决赛。`;
   info.append(qualification);
  }
  if(details.source){
   const link=document.createElement('a');link.href=details.source;link.target='_blank';link.rel='noopener';link.textContent='赛事资料';
   info.append(link);
  }
  if(details.feeSource){
   const link=document.createElement('a');link.href=details.feeSource;link.target='_blank';link.rel='noopener';link.textContent='报名费来源';
   info.append(link);
  }
  const prizes=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent=pendingShowcase?'各轮赛制':'各轮赛制与奖金';
  prizes.append(summary);
  const amounts=document.createElement('p');
  amounts.textContent=pendingShowcase?rounds.join(' · '):[...rounds,`冠军 ${format(details,details.prizes[0])}`,...rounds.map((label,i)=>{
   const remaining=details.prizes.length-1-first-i;
   const prize=details.prizes[remaining]??0;
   return `${remaining===1&&prize?'亚军':stageName(remaining)+'止步'} ${format(details,prize)}`;
  })].join(' · ');
  prizes.append(amounts);info.append(prizes);
  const bonus=mode==='snooker'&&!pendingShowcase?SNOOKER_BREAK_PRIZES[key]:null;
  if(bonus){
   const breaks=document.createElement('p');
   breaks.textContent=[bonus.maximum&&`147 专项奖池 ${money(bonus.maximum*100)}${bonus.qualifying?'（正赛） · 资格赛 '+money(bonus.qualifying*100):''}`,
    bonus.high&&`单杆最高分奖池 ${money(bonus.high*100)}`].filter(Boolean).join(' · ');
   prizes.append(breaks);
   if(bonus.source){
    const link=document.createElement('a');link.href=bonus.source;link.target='_blank';link.rel='noopener';link.textContent='147 奖金来源';
    prizes.append(link);
   }
  }
  const button=document.createElement('button');button.type='button';button.dataset.event=key;
  const refreshing=details.currency!=='GBP'&&!!exchange.pending;
  button.disabled=!pendingShowcase&&(!!missing||account.balance<fee||refreshing);
  button.textContent=pendingShowcase?'开始观赛':missing?`还需 ${missing} 个同项目冠军`:refreshing?'正在更新汇率':account.balance<fee?'余额不足':fee?'报名并扣费':'免费报名';
  button.addEventListener('click',()=>start(pendingDifficulty,key,quote,pendingShowcase));
  card.append(info,button);list.append(card);
 }
}

function openBank(){
 $('bank-amount').value='';
 renderBank();
 $('bank').showModal();
}
function closeBank(){
 $('bank').close();refreshWallet();
 if($('event-dialog').open)renderEvents();
}
function renderBank(status=''){
 $('bank-terms').textContent=`年利率 4.5%，日利率 0.0125%，${BANK.term} 天到期。逾期日利率 0.01875%，暂停新借款 ${BANK.freeze} 天，逾期未结清时也不能借款。奖金先还利息与本金。`;
 const list=$('bank-loans'),ledger=$('bank-ledger');
 list.replaceChildren();ledger.replaceChildren();
 let account;
 try{account=history.account();}
 catch(error){
  $('bank-totals').textContent=error.message;
  $('bank-borrow').disabled=$('bank-repay').disabled=true;
  return;
 }
 const blocked=loanRestriction(account);
 $('bank-totals').textContent=`余额 ${money(account.balance)} · 待还本息 ${money(debt(account))}`;
 $('bank-status').textContent=[status,blocked].filter(Boolean).join(' · ');
 $('bank-borrow').disabled=!!blocked;
 $('bank-repay').disabled=!account.balance||!debt(account);
 for(const loan of account.loans){
  const line=document.createElement('p');
  line.textContent=`原借款 ${money(loan.original)} · 剩余本金 ${money(loan.principal)} · 利息 ${money(loan.interest)} · ${dateLabel(loan.due)} 到期${loan.overdue?' · 已逾期':''}`;
  list.append(line);
 }
 for(const entry of account.ledger){
  const line=document.createElement('li');
  line.textContent=`${dateLabel(entry.day)} · ${entry.label}${entry.change?` · ${entry.change>0?'+':''}${money(entry.change)}`:''}`;
  ledger.append(line);
 }
}
function bankSubmit(event){
 event.preventDefault();
 const input=$('bank-amount'),raw=input.value.trim();
 const value=/^\d+(?:\.\d{1,2})?$/.test(raw)?toPence(Number(raw)):0;
 try{
  const paying=event.submitter?.value==='repay';
  history.transact(({account})=>paying?repay(account,value):borrow(account,value));
  input.value='';
  refreshWallet();renderBank(paying?'还款成功':'借款已到账');
 }catch(error){renderBank(error.message);}
}
$('bank-open').addEventListener('click',openBank);
$('calendar-refresh').addEventListener('click',()=>refreshCalendar(true));
$('event-year').addEventListener('change',renderEvents);
$('event-bank').addEventListener('click',openBank);
$('event-back').addEventListener('click',closeEvents);
$('bank-close').addEventListener('click',closeBank);
$('bank-form').addEventListener('submit',bankSubmit);
for(const [difficulty,label] of Object.entries(DIFFICULTIES)){
 const button=document.createElement('button');
 button.type='button';button.textContent=label;button.dataset.difficulty=difficulty;
 button.addEventListener('click',()=>{$('difficulty').close();openEvents(difficulty);});
 $('difficulty').querySelector('.difficulty-options').append(button);
}
$('difficulty-cancel').addEventListener('click',closeDifficulty);
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(!started&&!paused)setup(button.dataset.mode);}));
$('start-game').addEventListener('click',requestStart);
document.querySelectorAll('[data-guide]').forEach(button=>button.addEventListener('click',()=>{if(!paused){setGuide(!guide);$('scene').focus({preventScroll:true});}}));
$('settings-hint').addEventListener('click',togglePause);
$('chalk-button').addEventListener('click',()=>{chalkUp();$('scene').focus({preventScroll:true});});
$('coach-toggle').addEventListener('click',()=>{toggleCoach();$('scene').focus({preventScroll:true});});
$('coach-shoot').addEventListener('click',()=>{
 if(!coachAdvice||ref.difficulty||!canStrike())return;
 const {angle,speed,side,top,breakBoost}=coachAdvice;
 $('scene').focus({preventScroll:true});
 strikePlayer(angle,speed,side,top,breakBoost);
});
$('coach-apply').addEventListener('click',()=>{
 if(coachAdvice&&canSetSpin()){
  spin={x:coachAdvice.side/PLAYER_SPIN_LIMIT,y:coachAdvice.top/PLAYER_SPIN_LIMIT};updateSpin();
 }
 $('scene').focus({preventScroll:true});
});
$('settings-close').addEventListener('click',resume);
$('floating-window').addEventListener('click',()=>{
 const bridge=window.chrome?.webview;
 if(!bridge)return;
 $('floating-window').disabled=true;
 bridge.postMessage({type:'toggleFloating'});
});
$('confirm-placement').addEventListener('click',()=>{confirmPlacement();$('scene').focus({preventScroll:true});});
$('history-open').addEventListener('click',showHistory);
$('history-close').addEventListener('click',()=>{$('history').close();$('history-open').focus();});
$('return-home').addEventListener('click',()=>setup(mode));
$('result-home').addEventListener('click',()=>setup(mode));
$('take-over').addEventListener('click',toggleShowcaseControl);
$('take-over-result').addEventListener('click',toggleShowcaseControl);
$('hand-back-rule').addEventListener('click',toggleShowcaseControl);
$('take-over-cancel').addEventListener('click',closeTakeOver);
for(const button of document.querySelectorAll('[data-take-side]'))button.addEventListener('click',()=>setShowcaseControl(Number(button.dataset.takeSide)));
$('play-again').addEventListener('click',()=>{
 const difficulty=ref.difficulty;
 const showcase=!!tournament?.showcase;
 if(tournament){
  if(!roundPayout){finishTournament();renderPayout();return;}
  if(roundPayout.advance)openNextEventRound();
  else if(setup(mode)!==false)openEvents(difficulty,showcase);
 }else if(setup(mode)!==false){
  if(difficulty)openEvents(difficulty);else start();
 }
});
for(const id of ['result','take-over-dialog','history','rule-choice','opening-break'])$(id).addEventListener('cancel',e=>e.preventDefault());
function finishLag(result){
 const opening=tournament?.opening;
 if(opening?.kind!=='lag'||opening.chooser!==undefined)return;
 opening.distances=[result.player,result.computer];
 if(result.chooser!==null)opening.chooser=result.chooser;
 saveRound();
 presentOpeningBreak();
 if(result.chooser===null)$('lag-retry').hidden=false;
}
$('lag-retry').addEventListener('click',()=>{
 lagView.reset(mode,ref.difficulty);$('lag-retry').hidden=true;$('lag-table').focus();
});
$('opening-self').addEventListener('click',()=>completeOpeningBreak(tournament?.opening?.chooser));
$('opening-other').addEventListener('click',()=>completeOpeningBreak(1));
$('push-out').addEventListener('click',()=>{
 if(ref.pushOutAvailable&&!computerTurn()&&!world.running&&!ref.decision){
  ref.pushOut=!ref.pushOut;refreshInteraction();dirty=true;
 }
 $('scene').focus({preventScroll:true});
});
$('free-ball').addEventListener('change',()=>{
 if(ref.freeBallAvailable&&!computerTurn()&&!world.running&&!ref.decision){
  ref.freeBall=Number($('free-ball').value)||null;
  updateStats();saveRound();dirty=true;
 }
 $('scene').focus({preventScroll:true});
});
$('concede-frame').addEventListener('click',()=>{
 if(!started||paused||tournament?.opening)return;
 if(eliteComputer(ref.difficulty)&&computerTurn()&&ref.breakPoints>0&&ref.canMake147(world)){
  toast('电脑选择继续冲击 147，本局继续');return;
 }
 const side=humanSide(tournament);
 if(side===null)return;
 const message=ref.concede(world,side);
 if(message)showResult(message);
});
window.addEventListener('pagehide',()=>{roundClock.pause();saveRound();});
window.addEventListener('beforeunload',()=>{roundClock.pause();saveRound();});
// Unlock Web Audio in the user's gesture, before the first delayed ball collision.
window.addEventListener('pointerdown',()=>audio.unlock(),{capture:true});
window.addEventListener('keydown',e=>{if(e.code!=='Escape')audio.unlock();},{capture:true});
const pad=$('spin-pad');
function moveSpin(e){const rect=pad.getBoundingClientRect();spin={x:(e.clientX-rect.left-rect.width/2)/(rect.width*.4),y:-(e.clientY-rect.top-rect.height/2)/(rect.height*.4)};updateSpin();}
pad.addEventListener('pointerdown',e=>{if(e.button!==0||!canSetSpin()||drag)return;spinDrag=true;pad.setPointerCapture(e.pointerId);moveSpin(e);});pad.addEventListener('pointermove',e=>{if(spinDrag&&canSetSpin())moveSpin(e);});pad.addEventListener('lostpointercapture',()=>spinDrag=false);
const canvas=$('scene');canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointermove',e=>{
 if(!started||paused||view.coachOverhead||view.chalkMotion)return;
 if(drag?.type==='keyboard-shot')return;
 if(drag?.type==='orbit'){if(!view.stance)view.walk(-(e.clientX-drag.x)*.005);drag.x=e.clientX;dirty=true;return;}
 if(drag?.type==='place'){placeAt(view.pick(e.clientX,e.clientY));return;}
 if(drag?.type==='shot'){power=clamp((e.clientY-drag.y)/Math.min(260,innerHeight*.35),0,powerLimit());updatePower();return;}
 if(computerTurn()||world.running||ref.done)return;
 if(!view.stance&&view.pickChalk(e.clientX,e.clientY)){canvas.style.cursor='pointer';canvas.title='点击擦巧粉';return;}
 if(ballInHand){canvas.style.cursor='default';canvas.title='';return;}
 if(view.stance){canvas.title='';if(lastPointerX!==null)view.adjustAim((e.clientX-lastPointerX)*Math.PI/canvas.clientWidth*(held('precision')?.2:1));lastPointerX=e.clientX;dirty=true;canvas.style.cursor='crosshair';return;}
 canvas.style.cursor='default';canvas.title='';
});
canvas.addEventListener('pointerdown',e=>{
 if(!started||paused||view.coachOverhead||view.chalkMotion||drag)return;
 if(e.button===2){if(view.stance)return;drag={type:'orbit',x:e.clientX,pointerId:e.pointerId};canvas.setPointerCapture(e.pointerId);return;}
 if(e.button!==0||computerTurn()||world.running||ref.done)return;
 if(!view.stance&&view.pickChalk(e.clientX,e.clientY)){chalkUp();return;}
 if(ballInHand){placeAt(view.pick(e.clientX,e.clientY));drag={type:'place',pointerId:e.pointerId};canvas.setPointerCapture(e.pointerId);return;}
 if(!view.stance)return;
 if(!canShoot())return;
 drag={type:'shot',y:e.clientY,pointerId:e.pointerId};power=0;canvas.setPointerCapture(e.pointerId);updatePower();
});
canvas.addEventListener('pointerup',e=>{if(!drag||drag.pointerId!==e.pointerId)return;const type=drag.type;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(type==='shot'&&!paused)shot();});
canvas.addEventListener('pointercancel',cancelAction);canvas.addEventListener('pointerleave',()=>lastPointerX=null);
canvas.addEventListener('wheel',e=>{if(!started||paused||view.chalkMotion)return;e.preventDefault();if(view.coachOverhead||view.stance||drag?.type==='place'||placementUI.dragging)return;view.eyeHeight=clamp(view.eyeHeight+e.deltaY*.0006,OBSERVATION_HEIGHT.min,OBSERVATION_HEIGHT.max);dirty=true;},{passive:false});
const continuous=new Set(['walkLeft','walkRight','heightUp','heightDown','adjustLeft','adjustRight','placeUp','placeDown','precision','spinUp','spinDown','spinLeft','spinRight']);
// Esc is fixed and must work even while a binding field or modal has focus.
window.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)goBack();}},{capture:true});
window.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.isComposing)return;
 const code=keyFromEvent(e),action=bindings.action(code);
 if(paused){ // Binding inputs stop propagation; these actions also work in settings.
  if(e.repeat||!$('settings').open)return;
  if(action==='quit'){e.preventDefault();goBack();}
  if(action==='newRack'){e.preventDefault();resume();setup(mode);}
  if(action==='guide'){e.preventDefault();setGuide(!guide);settingsUI.message('引导线已'+(guide?'开启。':'关闭。'));}
  if(action==='sound'){e.preventDefault();soundEnabled=!soundEnabled;audio.setEnabled(soundEnabled);updateOptions();settingsUI.message('音效已'+(soundEnabled?'开启。':'关闭。'));}
  return;
 }
 if(action==='settings'){e.preventDefault();if(!e.repeat)togglePause();return;}
 if(ref?.decision||$('opening-break').open||$('difficulty').open||$('event-dialog').open||$('bank').open)return;
 if(!action||e.target.closest('button,input,textarea,select,[contenteditable=true]'))return;
 e.preventDefault();if(e.repeat||heldCodes.has(e.code))return;
 if(continuous.has(action)){heldCodes.set(e.code,action);keys.add(action);return;}
 if(action==='quit'){goBack();return;}
 if(action==='newRack'){cancelAction();setup(mode);return;}
 if(action==='guide'){setGuide(!guide);return;}
 if(action==='sound'){soundEnabled=!soundEnabled;audio.setEnabled(soundEnabled);updateOptions();return;}
 if(!started){const modes={modeNine:'nine',modeEight:'eight',modeSnooker:'snooker'};if(modes[action])setup(modes[action]);if(action==='start')requestStart();return;}
 if(action==='observe')observe();
 if(action==='aim')aimStance();
 if(action==='place')beginPlacement();
 if(action==='confirm')confirmPlacement();
 if(action==='cancelShot')cancelAction();
 if(action==='spinReset'&&canSetSpin()){spin={x:0,y:0};updateSpin();}
 if(action==='shoot'&&!drag&&canShoot()){drag={type:'keyboard-shot',code:e.code};power=0;updatePower();}
});
window.addEventListener('keyup',e=>{
 const action=heldCodes.get(e.code);heldCodes.delete(e.code);
 if(action&&![...heldCodes.values()].includes(action))keys.delete(action);
 if(drag?.type==='keyboard-shot'&&drag.code===e.code){drag=null;if(!paused&&!e.ctrlKey&&!e.altKey&&!e.metaKey)shot();else cancelAction();}
});
window.addEventListener('blur',()=>{cancelAction();if(!floatingWindow&&started&&!paused)togglePause();});
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;if(document.hidden&&!floatingWindow&&started&&!paused)togglePause();dirty=true;});
// Development inspection hook, only on localhost or an explicit native test build.
if(location.hostname==='127.0.0.1'||location.hostname==='localhost'||window.BILLIARDS_TEST)window.billiards={get audio(){return audio;},get world(){return world;},get ref(){return ref;},get view(){return view;},get state(){return {started,paused,ballInHand,power,mode,posture:view.stance?'aim':'observe',placementZone:world.cuePlacementZone,spin:{...spin},guide,soundEnabled,elapsedMs:roundClock.value(),roundId};},get bindings(){return {...bindings.bindings};},setup,shot:(angle,p=.4)=>{if(canShoot()){view.aim=angle;power=p;shot();}},setDesktop};
