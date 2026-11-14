import {foulZone} from './placement.js';
const OPPOSITE_GROUP={solid:'stripe',stripe:'solid'};
function straightContact(world,cue,targets,full){
 const diameter=2*world.c.radius;
 return targets.some(target=>{
  const dx=target.x-cue.x,dy=target.y-cue.y,distance=Math.hypot(dx,dy);
  const angle=Math.atan2(dy,dx),edge=Math.asin(Math.min(1,diameter/distance));
  const open=offset=>{
   const x=Math.cos(angle+offset),y=Math.sin(angle+offset);
   const reach=distance*Math.cos(offset)-Math.sqrt(Math.max(0,diameter**2-(distance*Math.sin(offset))**2));
   return world.balls.every(ball=>{
    if(!ball.id||ball.id===target.id||ball.potted)return true;
    const bx=ball.x-cue.x,by=ball.y-cue.y,projection=Math.max(0,Math.min(reach,bx*x+by*y));
    return Math.hypot(bx-x*projection,by-y*projection)>=diameter-1e-7;
   });
  };
  if(full&&target.value===1)return open(0)&&open(-.999*edge)&&open(.999*edge);
  return full?open(0):[-.999,-.75,-.5,-.25,0,.25,.5,.75,.999].some(fraction=>open(edge*fraction));
 });
}

export function pointsRemaining(world,phase){
 const reds=world.balls.filter(ball=>!ball.potted&&ball.value===1).length;
 return reds*8+(phase==='color'?7:0)+world.balls.filter(ball=>!ball.potted&&ball.value>1).reduce((total,ball)=>total+ball.value,0);
}
// Event-based referee for practice and single-rack/frame matches.
export class Referee {
 constructor(mode,difficulty=null){
  this.mode=mode;this.shots=0;this.score=0;this.fouls=0;this.penaltyPoints=0;this.phase=mode==='snooker'?'red':'open';this.group=null;this.done=false;this.outcome=null;this.targetBefore=[];
  if(difficulty){this.difficulty=difficulty;this.turn=0;this.scores=[0,0];this.computerGrip=1;this.foulStreak=[0,0];}
 }
 target(world){
  const live=world.balls.filter(b=>b.id&&!b.potted);
  if(this.mode==='nine')return live.length?[Math.min(...live.map(b=>b.id))]:[];
  if(this.mode==='eight'){
   const group=live.filter(b=>this.group==='solid'?b.id<8:this.group==='stripe'?b.id>8:b.id!==8);
   return group.length?group.map(b=>b.id):[8];
  }
  const reds=live.filter(b=>b.value===1);
  let ids;
  if(this.phase==='red'&&reds.length)ids=reds.map(b=>b.id);
  else if(this.phase==='color')ids=live.filter(b=>b.value>1).map(b=>b.id);
  else{
   const colors=live.filter(b=>b.value>1);
   ids=colors.length?[colors.sort((a,b)=>a.value-b.value)[0].id]:[];
  }
  return this.freeBall&&live.some(ball=>ball.id===this.freeBall)?[...ids,this.freeBall]:ids;
 }
 label(world){const target=this.target(world);if(this.done)return '本局完成';if(this.mode==='nine')return `${this.shots===0?'开球 · ':''}先击 ${target[0]??'—'} 号球`;
  if(this.mode==='eight')return target.length===1&&target[0]===8?'最后击打 8 号球':this.group==='solid'?'全色球 · 1—7':this.group==='stripe'?'花色球 · 9—15':'开放球台 · 选择球组';
  if(this.phase==='red')return '红球 · 1 分';if(this.phase==='color')return '任选彩球 · 2—7 分';return `清彩 · ${['','','黄','绿','棕','蓝','粉','黑'][world.balls.find(b=>b.id===target[0])?.value]??'完成'}`;
 }
 begin(world){
  this.targetBefore=this.target(world);this.prePhase=this.phase;
  const live=world.balls.filter(b=>b.id&&!b.potted);
  this.finalBlackBefore=this.mode==='snooker'&&live.length===1&&live[0].value===7;
  if(this.difficulty&&this.mode==='nine')this.warnedBefore=(this.foulStreak?.[this.turn]??0)===2;
  if(this.difficulty&&this.mode==='snooker'){
   this.positionBefore=world.balls.map(({id,x,y,potted})=>({id,x,y,potted}));
   this.zoneBefore=world.cuePlacementZone;
   this.remainingBefore=pointsRemaining(world,this.phase);
   this.freeBefore=this.freeBall??null;
  }
  this.headBefore=world.cuePlacementZone==='head';
 }
 finish(world){
  if(this.done)return {message:this.resultMessage,ballInHand:false,placementZone:null};
  this.shots++;const pots=world.events.filter(e=>e.type==='pot'),object=pots.filter(e=>e.id),scratch=pots.some(e=>e.id===0);
  const previousScore=this.score,previousPenalty=this.penaltyPoints;
  const match=!!this.difficulty,opening=this.shots===1;
  const escaped=world.events.filter(e=>e.type==='offtable');
  const pushOut=match&&this.mode==='nine'&&this.shots===2&&this.pushOut===true;
  this.pushOut=false;this.pushOutAvailable=false;
  const freeBall=match&&this.mode==='snooker'?this.freeBefore:null;
  this.freeBall=null;this.freeBallAvailable=false;
  const trueTargets=this.targetBefore.filter(id=>id!==freeBall);
  const contacts=world.firstContacts?.includes(world.firstHit)?world.firstContacts:[world.firstHit].filter(id=>id!==null);
  const legalContacts=contacts.filter(id=>this.targetBefore.includes(id));
  const firstLegal=legalContacts[0];
  const firstIndex=world.events.findIndex(e=>e.type==='hit'&&(e.a===0||e.b===0));
  let reason=escaped.some(e=>e.id===0)?'母球离开球台':scratch?'母球落袋':escaped.some(e=>!match||this.mode!=='eight'||e.id===8)?'球离开球台':null;
  if(!reason&&!pushOut){
   if(world.firstHit===null)reason='未击中目标球';
   else if(!legalContacts.length&&!(match&&opening&&this.mode==='eight')){
    reason=this.mode==='nine'?`${opening?'开球':'本杆'}须先碰 ${this.targetBefore[0]} 号球，实际先碰 ${world.firstHit} 号球`:'先击球不符合顺序';
   }
   else if(this.mode!=='snooker'&&!object.some(e=>e.pocket!==false)){
    const rails=world.events.slice(firstIndex+1).filter(e=>e.type==='rail');
    if(match&&opening&&this.mode==='nine'&&new Set(rails.filter(e=>e.id).map(e=>e.id)).size<4)reason='开球不足四颗目标球触库';
    else if(!rails.length&&!(match&&opening&&this.mode==='eight'))reason='碰球后无球触库或入袋';
   }
  }
  const heyballShortBreak=match&&opening&&this.mode==='eight'&&!reason&&
   !object.some(e=>e.pocket!==false)&&new Set(world.events.filter(e=>e.type==='rail'&&e.id).map(e=>e.id)).size<4;
  const nineShortBreak=match&&opening&&this.mode==='nine'&&!reason&&Array.isArray(world.headStringCrossings)&&
   new Set([...world.headStringCrossings.filter(Boolean),...object.map(e=>e.id)]).size<3;
  if(!reason&&match&&this.mode!=='snooker'&&this.headBefore&&!pushOut&&world.hitBeforeHeadString)reason='母球越过开球线前先碰到线后球';
  if(this.mode==='snooker'&&!reason){
   const simultaneousAllowed=contacts.length<=1||
    (this.prePhase==='red'&&contacts.every(id=>trueTargets.includes(id)))||
    (contacts.length===2&&contacts.includes(freeBall)&&contacts.some(id=>trueTargets.includes(id)));
   if(!simultaneousAllowed)reason='母球同时先碰到不允许同时击打的球';
   else if(freeBall&&!contacts.includes(freeBall))reason='未先碰指定自由球';
   else if(object.some(e=>!this.targetBefore.includes(e.id))||
      (this.prePhase==='color'&&object.some(e=>e.id!==firstLegal&&!freeBall))||
      (this.prePhase!=='red'&&object.filter(e=>e.id!==freeBall).length>1))reason='落袋球不符合当前目标';
  }
  let message='未进球，继续练习';
  if(reason){this.fouls++;message=`犯规：${reason}`;}
  if(this.mode==='nine'){
   if(object.some(e=>e.id===9)){if(reason||pushOut||nineShortBreak)world.respot(9,{spot:match});else{this.done=true;this.outcome='win';message='九球合法落袋 · 获胜';}}
   if(!reason&&!pushOut&&!nineShortBreak)this.score+=object.length;
  }else if(this.mode==='eight'){
   const matchBreak=this.difficulty&&this.shots===1;
   if(object.some(e=>e.id===8)){
    if(matchBreak&&!escaped.some(e=>e.id===8))world.respot(8,{spot:true});
    else{this.done=true;const legal=!reason&&this.targetBefore.length===1&&this.targetBefore[0]===8;this.outcome=legal?'win':'loss';message=legal?'本组已清完，黑八合法落袋 · 获胜':!(this.targetBefore.length===1&&this.targetBefore[0]===8)?'黑八提前落袋 · 本局失败':`黑八落袋时犯规：${reason} · 失败`;}
   }
   if(!reason&&!matchBreak&&!this.group){
    const matching=object.find(e=>e.id!==8&&e.pocket!==false&&(!match||(e.id<8)===(firstLegal<8)));
    if(matching)this.group=matching.id<8?'solid':'stripe';
   }
   if(!reason)this.score+=object.filter(e=>e.pocket!==false&&(this.group==='solid'?e.id<8:this.group==='stripe'?e.id>8:matchBreak||!match)).length;
  }else{
   const redsRemain=world.balls.some(b=>b.value===1&&!b.potted);
   const onValue=this.prePhase==='red'?1:this.prePhase==='clear'?world.balls.find(b=>b.id===trueTargets[0])?.value||2:world.balls.find(b=>b.id===world.firstHit)?.value||2;
   if(reason){const penalty=Math.max(4,onValue,...contacts.map(id=>world.balls.find(b=>b.id===id)?.value||0),...object.map(e=>e.value));this.penaltyPoints+=penalty;message+=match?`（对手加 ${penalty} 分）`:`（罚 ${penalty} 分，单独记录）`;}
   if(!reason){
    const actual=object.filter(e=>e.id!==freeBall);
    this.score+=actual.reduce((s,e)=>s+e.value,0);
    if(object.some(e=>e.id===freeBall)&&(this.prePhase==='red'||!actual.length))this.score+=onValue;
   }
   // During red/color phase all colors are re-spotted; during clearance only foul colors.
   for(const e of [...object].sort((a,b)=>b.value-a.value)){
    if(e.id===freeBall||(e.value>1&&(this.prePhase!=='clear'||reason)&&!this.finalBlackBefore))world.respot(e.id,{snooker:match});
   }
   if(reason){this.phase=redsRemain?'red':'clear';}
   else if(this.prePhase==='red'&&this.score>previousScore)this.phase='color';
   else if(this.prePhase==='color')this.phase=redsRemain?'red':'clear';
   else if(!redsRemain)this.phase='clear';
   if(this.finalBlackBefore&&reason){this.done=true;this.outcome='loss';message='最后黑球阶段犯规 · 本局失败';}
   else if(!world.balls.some(b=>b.id&&!b.potted)){this.done=true;this.outcome='win';message='全部目标球清完 · 获胜';}
  }
  if(!reason&&object.length&&!this.done)message=`好球 · ${this.mode==='snooker'?(this.score-previousScore)+' 分':object.length+' 球落袋'}`;
  let tiebreak=false,decision=null,awardedOnMiss=false;
  const gained=this.score-previousScore,legalPot=!reason&&gained>0;
  if(this.mode==='snooker'&&!match)this.breakPoints=legalPot?(this.breakPoints??0)+gained:0;
  if(this.difficulty){
   const shooter=this.turn,opponent=1-shooter;
   this.scores[shooter]+=gained;
   this.scores[opponent]+=this.penaltyPoints-previousPenalty;
   if(this.mode==='snooker'){
    if(legalPot)this.breakPoints=(this.breakPoints??0)+gained;
    if(legalPot&&this.breakPoints>=147&&this.done)this.maximum={player:shooter,points:this.breakPoints};
    if(!legalPot||this.done)this.closeBreak(shooter);
   }
   if(this.mode==='nine'){
    this.foulStreak=[...(this.foulStreak??[0,0])];
    this.foulStreak[shooter]=reason?Math.min(2,this.foulStreak[shooter]+1):0;
    if(reason&&this.warnedBefore){this.done=true;this.outcome='loss';message='连续三次犯规 · 负局';}
    else if(reason&&this.foulStreak[shooter]===2)message+=' · 已连续两次犯规，下次犯规负局';
    if(!reason&&opening&&!this.done&&!nineShortBreak)this.pushOutAvailable=true;
    if(nineShortBreak)decision={kind:'nine-short-break',shooter,chooser:opponent};
    if(pushOut&&!reason)decision={kind:'push-out',shooter,chooser:opponent};
   }
   if(this.mode==='eight'&&opening&&!this.done){
    if(reason)decision={kind:world.firstHit===null&&!scratch&&!escaped.length?'missed-break':'break-foul',shooter,chooser:opponent};
    else if(object.some(e=>e.id===8))decision={kind:'black-break',shooter,chooser:shooter};
    else if(heyballShortBreak)decision={kind:'short-break',shooter,chooser:opponent};
   }
   if(this.mode==='snooker'&&!this.done){
    const differenceBefore=Math.abs(this.scores[shooter]-this.scores[opponent]+this.penaltyPoints-previousPenalty-gained);
    const missed=reason&&(freeBall?world.firstHit!==freeBall:!this.targetBefore.includes(world.firstHit));
    const before=this.positionBefore;
    let canReplay=false,full=false;
    if(missed&&before){
     const original={...world,balls:before};
     const targets=before.filter(b=>trueTargets.includes(b.id)&&!b.potted);
     const difference=Math.abs(this.scores[0]-this.scores[1]);
     full=straightContact(original,before[0],targets,true);
     canReplay=this.missStreak>0||difference<=pointsRemaining(world,this.phase)&&
      differenceBefore<=this.remainingBefore&&
      straightContact(original,before[0],targets,false);
    }
    if(canReplay&&full&&(this.missStreak??0)>=2){
     awardedOnMiss=true;
     this.done=true;this.outcome=shooter===0?'loss':'win';
     message='警告后从原位第三次未先碰到目标球 · 判负';
    }else if(reason){
     decision={kind:canReplay?'snooker-miss':'snooker-foul',shooter,chooser:opponent,full,zone:scratch?'d':null};
     if(canReplay)message=message.replace('犯规：','犯规且未尽力击中：');
    }else this.missStreak=0;
   }
   if(this.done&&this.mode==='snooker'&&!awardedOnMiss){
    tiebreak=this.scores[0]===this.scores[1];
    if(tiebreak){
     world.respot(21,{snooker:true});
     this.done=false;this.outcome=null;this.phase='clear';this.breakPoints=0;
     decision={kind:'black-tiebreak',shooter,chooser:Math.random()<.5?0:1};
     message='比分相同 · 黑球复位，抽签决定选择权';
    }else{
     this.outcome=this.scores[0]>this.scores[1]?'win':'loss';
     message='斯诺克结束 · 按比分决胜';
    }
   }else if(this.done&&this.mode!=='snooker'&&shooter===1){
    this.outcome=this.outcome==='win'?'loss':'win';
    message=`电脑：${message.replace(/ · (?:本局)?(?:获胜|失败)$/,'')}`;
   }
   if(!this.done&&(tiebreak||!legalPot)){
    this.turn=opponent;
    if(this.group)this.group=OPPOSITE_GROUP[this.group];
   }
   if(decision)this.decision=decision;
   if(pushOut&&!reason)message='推杆完成 · 由对手选择下一杆';
   if(nineShortBreak)message='未达到三球开球要求 · 由对手选择';
   if(heyballShortBreak)message='开球不足四颗目标球触库 · 由对手选择';
   if(!this.done&&!decision&&!reason&&!legalPot)message=object.length?'未打进本组球 · 换手':'未进球 · 换手';
  }
  const placementZone=tiebreak?'d':foulZone(this.mode,{foul:!!reason,scratch,breakShot:opening,done:this.done});
  world.cuePlacementZone=placementZone;
  if(this.done)this.resultMessage=message;
  // A scratch remains off the table until the player chooses a legal in-hand position.
  return {message,ballInHand:!!placementZone,placementZone,foul:!!reason,legalPot};
 }

 choose(world,action){
  const decision=this.decision;
  if(!decision)return false;
  const {kind,shooter,chooser}=decision;
  const allowed={
   'push-out':['self','other'],
   'nine-short-break':['self','other'],
   'black-tiebreak':['self','other'],
   'break-foul':['accept','break-self','break-other'],
   'missed-break':['break-self','break-other'],
   'short-break':['accept','break-self','break-other'],
   'black-break':['accept','break-self'],
   'snooker-foul':['accept','replay'],
   'snooker-miss':['accept','replay','replace']
  }[kind];
  if(!allowed?.includes(action))return false;
  this.decision=null;
  if(action.startsWith('break-')){
   const breaker=action==='break-self'?chooser:1-chooser;
   const grip=world.tipCondition,computerGrip=this.computerGrip;
   Object.assign(world,new world.constructor(this.mode),{tipCondition:grip});
   Object.assign(this,new Referee(this.mode,this.difficulty),{turn:breaker,computerGrip});
   return 'rerack';
  }
  const turn=action==='other'||action==='replay'||action==='replace'?shooter:chooser;
  if(this.group&&this.turn!==turn)this.group=OPPOSITE_GROUP[this.group];
  this.turn=turn;
  if(kind==='nine-short-break')this.pushOutAvailable=turn===shooter;
  world.cuePlacementZone=kind==='black-tiebreak'?'d':kind==='break-foul'?'head':decision.zone??null;
  if(kind.startsWith('snooker-')){
   if(action==='replace'){
    for(const saved of this.positionBefore){
     const ball=world.balls.find(ball=>ball.id===saved.id);
     Object.assign(ball,saved,{vx:0,vy:0,wx:0,wy:0,wz:0});
    }
    this.phase=this.prePhase;world.cuePlacementZone=this.zoneBefore;
    this.missStreak=decision.full?(this.missStreak??0)+1:0;
   }else{
    this.missStreak=0;
    if(action==='accept'&&!world.balls[0].potted){
     const targets=world.balls.filter(ball=>this.target(world).includes(ball.id));
     const cue=world.balls[0];
     this.freeBallAvailable=targets.length>0&&!targets.some(target=>{
      const dx=target.x-cue.x,dy=target.y-cue.y,angle=Math.atan2(dy,dx),range=Math.hypot(dx,dy);
      const onIds=new Set(targets.map(ball=>ball.id)),diameter=2*world.c.radius;
      const edge=Math.asin(Math.min(1,diameter/range))*.999;
      return [-edge,edge].every(offset=>{
       const vx=Math.cos(angle+offset),vy=Math.sin(angle+offset);
       return world.balls.every(ball=>{
        if(!ball.id||ball.potted||onIds.has(ball.id))return true;
        const x=ball.x-cue.x,y=ball.y-cue.y,along=x*vx+y*vy;
        return along<=0||along>=range||Math.abs(x*vy-y*vx)>=diameter;
       });
      });
     });
    }
   }
  }
  return 'continue';
 }

 canConcede(world,player=this.turn){
  return this.difficulty&&this.mode==='snooker'&&!this.done&&!world.running&&!this.decision&&
   this.scores[1-player]-this.scores[player]>pointsRemaining(world,this.phase);
 }
 canMake147(world){
  return this.mode==='snooker'&&!this.done&&!this.freeBall&&
   (this.breakPoints??0)+pointsRemaining(world,this.phase)===147;
 }
 closeBreak(player){
  const points=this.breakPoints??0;
  if(!points)return;
  const best=[...(this.bestBreaks??[null,null])];
  const previous=best[player];
  if(!previous||points>=previous.points)best[player]={points,count:previous?.points===points?previous.count+1:1};
  this.bestBreaks=best;
  this.breakPoints=0;
 }
 concede(world,player){
  if(!this.canConcede(world,player))return null;
  this.closeBreak(this.turn);
  this.done=true;this.outcome=player===0?'loss':'win';
  this.resultMessage=player===0?'你认输 · 电脑赢得本局':'电脑认输 · 你赢得本局';
  return this.resultMessage;
 }
 awardFinalBlackFrame(world){
  if(!this.difficulty||this.mode!=='snooker'||this.done||world.running||this.decision||this.phase==='color'||
   !world.balls.some(b=>b.value===7&&!b.potted)||world.balls.some(b=>b.id&&!b.potted&&b.value!==7))return null;
  if(this.scores[1-this.turn]-this.scores[this.turn]<=7)return null;
  this.done=true;this.outcome=this.turn===0?'loss':'win';
  this.resultMessage='只剩黑球，领先方赢得本局';
  return this.resultMessage;
 }
}
