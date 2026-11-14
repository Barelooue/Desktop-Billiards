import {World,clamp} from './physics.js';
import {Referee,pointsRemaining} from './rules.js';
import {keyboardPlacementStart} from './placement.js';
import {PLAYER_MAX_SPEED,PLAYER_SPIN_LIMIT,BREAK_MAX_SPEED,isPoolBreak} from './shot-controls.js';

export const DIFFICULTIES=Object.freeze({low:'低档 · 普通玩家',medium:'中档 · 职业球员',high:'高档 · 顶尖球员',star:'巅峰球星'});
export const eliteComputer=difficulty=>difficulty==='high'||difficulty==='star';

// The shot planner evaluates positions from side 1's perspective.
export function computerPerspective(ref,side){
 if(side===1)return ref;
 const reverse=values=>values&&[values[1],values[0]];
 return Object.assign(new Referee(ref.mode),ref,{turn:1-ref.turn,scores:reverse(ref.scores),
  foulStreak:reverse(ref.foulStreak),bestBreaks:reverse(ref.bestBreaks),
  computerGrip:ref.leftComputerGrip??1,computerFatigue:ref.leftComputerFatigue});
}
const LEVELS={
 low:{error:.010,powerError:.075},
 medium:{error:.0028,powerError:.026,spinError:.06},
 high:{error:0,powerError:0},
 star:{error:0,powerError:0}
};

export function computerNeedsChalk(ref,shot=null){
 const threshold={low:.43,medium:.69,high:.82,star:.87}[ref.difficulty];
 if(ref.computerGrip<threshold)return true;
 if(!shot||ref.difficulty==='low')return false;
 const demanding=shot.speed>4.8||Math.hypot(shot.side??0,shot.top??0)>.44;
 return demanding&&ref.computerGrip<({star:.97,high:.94,medium:.78}[ref.difficulty]);
}

function clearPath(balls,from,to,radius,ignore){
 const dx=to.x-from.x,dy=to.y-from.y,lengthSquared=dx*dx+dy*dy;
 return !balls.some(ball=>{
  if(ball.potted||ignore.includes(ball.id))return false;
  const t=lengthSquared?clamp(((ball.x-from.x)*dx+(ball.y-from.y)*dy)/lengthSquared,0,1):0;
  return Math.hypot(ball.x-from.x-t*dx,ball.y-from.y-t*dy)<2*radius;
 });
}

function potOptions(world,targets,cue,alternatePocketLines=false){
 const options=[],r=world.c.radius;
 for(const target of targets)for(const pocket of world.pockets){
  const centerX=pocket.x-target.x,centerY=pocket.y-target.y,centerDistance=Math.hypot(centerX,centerY);
  if(!centerDistance)continue;
  const offsets=alternatePocketLines?[0,-pocket.r*.34,pocket.r*.34]:[0];
  for(const offset of offsets){
   const entry={x:pocket.x-centerY/centerDistance*offset,y:pocket.y+centerX/centerDistance*offset};
   const dx=entry.x-target.x,dy=entry.y-target.y,distance=Math.hypot(dx,dy);
   if(!distance||!clearPath(world.balls,target,entry,r,[0,target.id]))continue;
   const ghost={x:target.x-2*r*dx/distance,y:target.y-2*r*dy/distance};
   if(Math.abs(ghost.x)>world.c.length/2-r||Math.abs(ghost.y)>world.c.width/2-r)continue;
   const gx=ghost.x-cue.x,gy=ghost.y-cue.y,reach=Math.hypot(gx,gy);
   const cut=(gx*dx+gy*dy)/(reach*distance);
   if(!(cut>.12)||!clearPath(world.balls,cue,ghost,r,[0,target.id]))continue;
   options.push({
    angle:Math.atan2(gy,gx),
    speed:clamp(.38+.23*reach+.52*Math.sqrt(distance)/cut,.50,5.5),
    quality:2.2*cut-.44*distance-.35*reach-(offset ? .18 : 0),
    cue,target
   });
  }
 }
 return options;
}

function contactOptions(world,targets,cue){
 const r=world.c.radius,options=[];
 for(const ball of targets){
  const dx=ball.x-cue.x,dy=ball.y-cue.y,distance=Math.hypot(dx,dy);
  const angle=Math.atan2(dy,dx);
  const contact={x:ball.x-2*r*Math.cos(angle),y:ball.y-2*r*Math.sin(angle)};
  if(clearPath(world.balls,cue,contact,r,[0,ball.id])){
   options.push({angle,speed:clamp(1.15+.4*distance,1.25,2.5),quality:-4-distance,cue,contactWidth:Math.asin(Math.min(1,2*r/distance))});
  }
  for(const [axis,limit] of [['x',world.c.length/2-r],['y',world.c.width/2-r]]){
   for(const side of [-1,1]){
    const reflected={x:ball.x,y:ball.y};
    const rail=side*limit;
    reflected[axis]=rail+(rail-ball[axis])/world.c.cushion;
    options.push({angle:Math.atan2(reflected.y-cue.y,reflected.x-cue.x),speed:2.2,quality:-9-distance,cue});
   }
  }
 }
 return options;
}

// Rays span every cue-ball contact angle, including both thin edges.
export function escapeWindow(world,targets){
 const cue=world.balls[0],diameter=2*world.c.radius,targetIds=new Set(targets.map(ball=>ball.id));
 const live=world.balls.filter(ball=>ball.id&&!ball.potted);
 let widest=0,cover=Infinity,nearest=Infinity;
 for(const target of targets){
  const dx=target.x-cue.x,dy=target.y-cue.y,distance=Math.hypot(dx,dy);
  const angle=Math.atan2(dy,dx),half=Math.asin(Math.min(1,diameter/distance));
  const gaps=[[-half,half]];
  nearest=Math.min(nearest,distance);
  for(const blocker of live){
   if(targetIds.has(blocker.id))continue;
   const x=blocker.x-cue.x,y=blocker.y-cue.y,range=Math.hypot(x,y);
   if(range>=distance)continue;
   const delta=Math.atan2(y,x)-angle;
   const center=Math.atan2(Math.sin(delta),Math.cos(delta));
   const width=Math.asin(Math.min(1,diameter/range));
   for(let i=gaps.length-1;i>=0;i--){
    const [left,right]=gaps[i],low=center-width,high=center+width;
    if(low>=right||high<=left)continue;
    cover=Math.min(cover,range);
    gaps.splice(i,1,...(low>left?[[left,low]]:[]),...(high<right?[[high,right]]:[]));
   }
   if(!gaps.length)break;
  }
  widest=Math.max(widest,...gaps.map(([left,right])=>(right-left)/(2*half)));
 }
 return {visible:widest,cover,nearest};
}

export function computerShouldConcede(world,ref){
 if(!ref.canConcede(world,1)||(ref.turn===0&&ref.breakPoints>0&&ref.canMake147(world)))return false;
 const live=world.balls.filter(ball=>ball.id&&!ball.potted);
 if(live.length===1&&live[0].value===7)return ref.turn===1;
 const excess=ref.scores[0]-ref.scores[1]-pointsRemaining(world,ref.phase);
 const threshold={low:4,medium:8,high:14,star:17}[ref.difficulty];
 if(excess<threshold)return false;
 const targets=live.filter(ball=>ref.target(world).includes(ball.id));
 const cue=world.balls[0],{visible}=escapeWindow(world,targets);
 const pots=potOptions(world,targets,cue);
 const canBuildSnooker=live.some(ball=>!targets.includes(ball));
 const existingSnooker=ref.turn===0&&visible===0&&!world.cuePlacementZone;
 let foulBudget=0;
 if(canBuildSnooker&&(ref.turn===1||existingSnooker||!pots.length)){
  foulBudget={low:1,medium:2,high:3,star:4}[ref.difficulty]+Number(existingSnooker)+(eliteComputer(ref.difficulty)&&live.length>6?1:0);
  if(ref.turn===1&&!world.cuePlacementZone){
   const contacts=contactOptions(world,targets,cue).filter(shot=>shot.contactWidth).slice(0,4);
   const snooker=contacts.some(shot=>[-.84,.84].some(edge=>{
    const outcome=simulate(world,ref,{...shot,angle:shot.angle+shot.contactWidth*edge,speed:1.3});
    return outcome&&!outcome.result.foul&&!outcome.result.legalPot&&positionPressure(outcome)>2.8;
   }));
   foulBudget+=Number(snooker);
  }
 }
 const neededPenalty=excess+1;
 const likelyPenalty=targets.some(ball=>ball.value>=5)?5:4;
 return neededPenalty>foulBudget*likelyPenalty;
}

function twoRailOptions(world,targets,cue){
 const r=world.c.radius,rails=[['x',world.c.length/2-r],['y',world.c.width/2-r]]
  .flatMap(([axis,limit])=>[[-1,axis,-limit],[1,axis,limit]]);
 const shots=[];
 for(const target of targets)for(const [,first,a] of rails)for(const [,second,b] of rails){
  if(first===second&&a===b)continue;
  const reflected={x:target.x,y:target.y};
  reflected[second]=2*b-reflected[second];
  reflected[first]=2*a-reflected[first];
  const dx=reflected.x-cue.x,dy=reflected.y-cue.y;
  const t=(a-cue[first])/(reflected[first]-cue[first]);
  if(!(t>0&&t<1))continue;
  const bounce={x:cue.x+t*dx,y:cue.y+t*dy};
  if(Math.abs(bounce.x)>world.c.length/2||Math.abs(bounce.y)>world.c.width/2)continue;
  if(!clearPath(world.balls,cue,bounce,r,[0]))continue;
  const travel=Math.hypot(dx,dy);
  shots.push({angle:Math.atan2(dy,dx),speed:clamp(1.1+travel*.35,1.9,4.4),quality:-11-travel,cue});
 }
 return shots.sort((a,b)=>b.quality-a.quality).slice(0,14);
}

function bankOptions(world,targets,cue){
 const r=world.c.radius,options=[];
 for(const target of targets)for(const pocket of world.pockets){
  for(const [axis,limit] of [['x',world.c.length/2-r],['y',world.c.width/2-r]]){
   for(const side of [-1,1]){
    const rail=side*limit,reflected={...pocket,[axis]:2*rail-pocket[axis]};
    const t=(rail-target[axis])/(reflected[axis]-target[axis]);
    if(!(t>0&&t<1))continue;
    const bounce={x:target.x+t*(reflected.x-target.x),y:target.y+t*(reflected.y-target.y)};
    if(world.pockets.some(p=>Math.hypot(p.x-bounce.x,p.y-bounce.y)<p.r+2*r))continue;
    if(!clearPath(world.balls,target,bounce,r,[0,target.id])||!clearPath(world.balls,bounce,pocket,r,[0,target.id]))continue;
    const dx=bounce.x-target.x,dy=bounce.y-target.y,distance=Math.hypot(dx,dy);
    if(!distance)continue;
    const ghost={x:target.x-2*r*dx/distance,y:target.y-2*r*dy/distance};
    if(Math.abs(ghost.x)>world.c.length/2-r||Math.abs(ghost.y)>world.c.width/2-r)continue;
    const gx=ghost.x-cue.x,gy=ghost.y-cue.y,reach=Math.hypot(gx,gy),cut=(gx*dx+gy*dy)/(reach*distance);
    if(!(cut>.35)||!clearPath(world.balls,cue,ghost,r,[0,target.id]))continue;
    const travel=distance+Math.hypot(pocket.x-bounce.x,pocket.y-bounce.y);
    options.push({angle:Math.atan2(gy,gx),speed:clamp(.65+.3*reach+.68*Math.sqrt(travel)/cut,1,4.8),quality:2*cut-.48*travel-.35*reach,cue});
   }
  }
 }
 return options.sort((a,b)=>b.quality-a.quality);
}

function placementOptions(world,targets,difficulty){
 if(!world.cuePlacementZone)return [world.balls[0]];
 const first=keyboardPlacementStart(world),positions=first?[first]:[];
 const low=difficulty==='low',high=eliteComputer(difficulty),star=difficulty==='star';
 const gaps=(star?[4,6,9,13,18,24,30]:low?[7,14]:high?[5,8,12,17,23]:[6,11,17]).map(n=>n*world.c.radius);
 const angles=star?[0,-.16,.16,-.32,.32,-.50,.50]:low?[0]:high?[0,-.20,.20,-.40,.40]:[0,-.21,.21];
 const add=(x,y)=>{
  if(world.canPlaceCue(x,y)&&!positions.some(p=>Math.hypot(p.x-x,p.y-y)<.018))positions.push({x,y});
 };
 for(const target of targets)for(const pocket of world.pockets){
  const dx=target.x-pocket.x,dy=target.y-pocket.y,distance=Math.hypot(dx,dy);
  if(!distance)continue;
  const back=Math.atan2(dy,dx);
  for(const gap of gaps)for(const offset of angles){
   add(target.x+gap*Math.cos(back+offset),target.y+gap*Math.sin(back+offset));
  }
 }
 // Restricted hand-in zones may contain no point on the ideal pot line.
 if(first&&world.cuePlacementZone!=='table'){
  for(const offset of (low?[.12]:[.10,.21,.32])){
   add(first.x,first.y-offset);add(first.x,first.y+offset);
   if(!low)add(first.x-offset,first.y);
  }
 }
 return positions;
}

function placementPots(world,targets,positions,difficulty){
 const ranked=positions.flatMap(cue=>potOptions(world,targets,cue)).sort((a,b)=>b.quality-a.quality);
 if(!world.cuePlacementZone){
  if(!eliteComputer(difficulty))return ranked;
  const alternate=potOptions(world,targets,positions[0],true).filter(shot=>!ranked.some(other=>Math.abs(other.angle-shot.angle)<1e-6))
   .sort((a,b)=>b.quality-a.quality);
  return [...ranked.slice(0,11),...alternate.slice(0,8),...ranked.slice(11)];
 }
 const distinct=[],repeat=[],seen=new Set();
 const spacing=difficulty==='star'?.075:eliteComputer(difficulty)?.10:.17;
 for(const pot of ranked){
  const key=`${Math.round(pot.cue.x/spacing)}:${Math.round(pot.cue.y/spacing)}`;
  if(seen.has(key))repeat.push(pot);
  else{seen.add(key);distinct.push(pot);}
 }
 return [...distinct,...repeat];
}

function practiceControls(shot){
 const side=shot.side??0,top=shot.top??0;
 const scale=Math.min(1,PLAYER_SPIN_LIMIT/(Math.hypot(side,top)||1));
 return {...shot,speed:Math.min(shot.speed,shot.breakBoost?BREAK_MAX_SPEED:PLAYER_MAX_SPEED),side:side*scale,top:top*scale};
}

function simulate(world,ref,shot){
 const trial=Object.assign(Object.create(World.prototype),world,{
  balls:world.balls.map(ball=>({...ball})),
  tipCondition:ref.computerGrip
 });
 const judge=Object.assign(new Referee(world.mode),ref,{scores:[...ref.scores]});
 if(trial.cuePlacementZone&&!trial.placeCue(shot.cue.x,shot.cue.y))return null;
 // Use the same shot ranking in practice, but resolve the stroke with practice rules.
 if(ref.coaching){shot=practiceControls(shot);judge.difficulty=null;}
 judge.begin(trial);
 if(!trial.strike(shot.angle,shot.speed,shot.side??0,shot.top??0,{breakBoost:shot.breakBoost}))return null;
 judge.computerGrip=trial.tipCondition;
 const cue=trial.balls[0];
 let travel=0,x=cue.x,y=cue.y;
 for(let i=0;trial.running&&i<2400;i++){
  trial.step(1/240);
  if(i%8===0){travel+=Math.hypot(cue.x-x,cue.y-y);x=cue.x;y=cue.y;}
 }
 travel+=Math.hypot(cue.x-x,cue.y-y);
 if(trial.running)return null;
 const result=judge.finish(trial);
 if(ref.coaching){
  judge.difficulty=ref.difficulty;
  judge.turn=result.legalPot?1:0;
  judge.scores[1]+=judge.score-ref.score;
  if(judge.done)judge.outcome=judge.outcome==='win'?'loss':'win';
 }
 return {trial,judge,result,travel};
}

function simulationScore(world,ref,shot,outcome=simulate(world,ref,shot),fatigue=0){
 if(!outcome)return -1100;
 const {trial,judge,result}=outcome;
 if(judge.done)return judge.outcome==='loss'?(judge.maximum?.player===1&&eliteComputer(ref.difficulty)?112:100):-1200;
 if(result.foul)return -1050+(trial.firstHit===null?0:judge.targetBefore.includes(trial.firstHit)?18:4)
  -(trial.balls[0].potted?12:0)-(judge.penaltyPoints-ref.penaltyPoints);
 if(judge.decision?.kind==='nine-short-break'||judge.decision?.kind==='short-break')return -16;
 const nextTargets=judge.target(trial);
 const targets=trial.balls.filter(ball=>nextTargets.includes(ball.id)),cue=trial.balls[0];
 const options=potOptions(trial,targets,cue);
 const bestPosition=Math.max(-2,...options.map(option=>option.quality));
 if(!result.legalPot){
  const {visible,cover,nearest}=escapeWindow(trial,targets);
  const safety=visible===0?6+1.1/(.2+cover):2*(1-visible);
  return Math.min(11,-bestPosition+safety+.35*Math.min(3,nearest));
 }
 const points=judge.scores[1]-ref.scores[1];
 const pursuingMaximum=eliteComputer(ref.difficulty)&&judge.canMake147(trial);
 const black=pursuingMaximum&&judge.phase==='color'?targets.find(ball=>ball.value===7):null;
 const nextMaximumPots=black?potOptions(trial,[black],cue):options;
 const maximumPosition=pursuingMaximum&&nextMaximumPots.length?
  2.2+.8*Math.max(0,...nextMaximumPots.map(option=>option.quality))+.12*Math.min(6,nextMaximumPots.length):0;
 return 16+Math.min(points,8)*.4+bestPosition*(1-.10*fatigue)+maximumPosition;
}

function shotEffort(shot,outcome){
 if(!outcome)return 0;
 const {trial,result,travel}=outcome;
 const events=trial.events,first=events.findIndex(e=>e.type==='hit'&&(e.a===0||e.b===0));
 const kick=events.slice(0,Math.max(0,first)).filter(e=>e.type==='rail'&&e.id===0).length;
 const pot=events.find(e=>e.type==='pot'&&e.id&&e.pocket!==false);
 const bank=pot&&events.slice(0,events.indexOf(pot)).some(e=>e.type==='rail'&&e.id===pot.id);
 const cue=trial.balls[0];
 const nearPocket=Math.min(...trial.pockets.map(p=>Math.hypot(p.x-cue.x,p.y-cue.y)-p.r));
 const spin=Math.abs(shot.side??0),vertical=Math.abs(shot.top??0);
 return 3.2*spin+3.3*Math.max(0,vertical-.32)+1.6*Math.max(0,shot.speed-2.15)
  +1.8*Math.max(0,travel-1.05)+1.6*kick+(bank&&result.legalPot?2.6:0)
  +Math.max(0,.13-nearPocket)*11;
}

function shotStyle(shot,outcome){
 if(!outcome||outcome.result.foul||outcome.judge.decision||outcome.judge.outcome==='win')return 0;
 const {trial,result,travel}=outcome,events=trial.events,cue=trial.balls[0];
 const hit=events.findIndex(e=>e.type==='hit'&&(e.a===0||e.b===0));
 if(hit<0)return 0;
 const before=events.slice(0,hit),after=events.slice(hit+1);
 const kicks=before.filter(e=>e.type==='rail'&&e.id===0).length;
 const rails=after.filter(e=>e.type==='rail'&&e.id===0).length;
 const pot=after.findIndex(e=>e.type==='pot'&&e.id&&e.pocket!==false);
 const bank=pot>=0&&after.slice(0,pot).some(e=>e.type==='rail'&&e.id===after[pot].id);
 const nearRail=Math.min(trial.c.length/2-Math.abs(cue.x),trial.c.width/2-Math.abs(cue.y))<3.5*cue.r;
 const follow=shot.top>.4&&rails>0&&(nearRail||rails>=2);
 const draw=shot.top<-.44&&travel>trial.c.width*.7;
 const attacking=result.legalPot||outcome.judge.done&&outcome.judge.outcome==='loss';
 if(!attacking)return trial.mode==='snooker'&&positionPressure(outcome)>2.8?1.3+.55*Math.min(3,kicks+rails):0;
 return Math.min(5.8,1.7*Number(follow)+2.1*Number(draw)+1.7*Number(bank)+
  .65*Math.min(3,kicks+rails)+.75*clamp((shot.speed-1.7)/1.8,0,1)+.35*Math.abs(shot.side??0));
}

function* starOptions(world,targets,pots,contacts,cue){
 for(const pot of pots.slice(0,8)){
  for(const [top,side,speed] of [[.66,0,2.05],[.68,.28,2.65],[.68,-.28,2.65],[.54,.50,3.35],[.54,-.50,3.35],
   [-.67,0,1.9],[-.70,0,2.8],[-.64,.30,3.6],[-.64,-.30,3.6],[.20,0,3.75]]){
   const pace=clamp(Math.max(pot.speed*.88,speed),.12,PLAYER_MAX_SPEED);
   for(const offset of [0,-.005,.005])yield {...pot,angle:pot.angle+offset,speed:pace,top,side};
  }
 }
 for(const bank of bankOptions(world,targets,cue).slice(0,8)){
  for(const angle of [0,-.008,.008,-.016,.016])for(const scale of [.86,1.15]){
   yield {...bank,angle:bank.angle+angle,speed:bank.speed*scale};
  }
 }
 const direct=contacts.filter(shot=>shot.contactWidth).slice(0,6);
 for(const shot of direct)for(const edge of [-.93,.93]){
  for(const [speed,top,side] of [[.9,.3,0],[1.45,.45,.31],[1.85,-.44,.32],[2.35,.43,-.36]]){
   yield {...shot,angle:shot.angle+edge*shot.contactWidth,speed,top,side:Math.sign(edge)*side};
  }
 }
 if(world.mode==='snooker'||!pots.length){
  for(const shot of twoRailOptions(world,targets,cue).slice(0,7)){
   for(const offset of [0,-.026,.026])for(const side of [-.34,0,.34]){
    yield {...shot,angle:shot.angle+offset,side,top:.23};
   }
  }
 }
}

function positionPressure(outcome){
 const {trial,judge}=outcome;
 const targets=trial.balls.filter(ball=>judge.target(trial).includes(ball.id));
 const {visible,cover,nearest}=escapeWindow(trial,targets);
 const options=potOptions(trial,targets,trial.balls[0]);
 const threat=Math.max(-1,...options.map(option=>option.quality));
 return visible===0?2.8+Math.min(1.5,.22/cover):1.6*(1-visible)+.35*Math.min(2,nearest)-Math.max(0,threat);
}

function* shotMargin(world,ref,shot,original){
 let legal=0,kept=0;
 for(const [angle,speed] of [[-.0018,.986],[.0018,1.014],[-.00065,1.024],[.00065,.976]]){
  const perturbed={...shot,angle:shot.angle+angle,speed:shot.speed*speed};
  const outcome=simulate(world,ref,perturbed);
  yield;
  if(!outcome||outcome.result.foul||outcome.judge.outcome==='win')continue;
  legal++;
  if(original.judge.done?outcome.judge.outcome==='loss':outcome.result.legalPot)kept++;
 }
 return {legal:legal/4,kept:kept/4};
}

function* chooseCasual(world,ref,pots,contacts,fallback,fatigue){
 const candidates=pots.slice(0,5).flatMap((shot,index)=>index<3?[
  shot,{...shot,speed:shot.speed*.80},{...shot,speed:shot.speed*1.14,top:-.24},
  {...shot,angle:shot.angle-.004},{...shot,angle:shot.angle+.004}
 ]:[shot]);
 for(const shot of contacts.slice(0,4)){
  candidates.push(shot);
  if(shot.contactWidth)for(const side of [-1,1]){
   candidates.push({...shot,angle:shot.angle+side*.62*shot.contactWidth,speed:shot.speed*.87});
  }
 }
 const ranked=[];
 for(const shot of candidates){
  const outcome=simulate(world,ref,shot);
  const score=simulationScore(world,ref,shot,outcome,fatigue);
  ranked.push({shot,outcome,score,rank:score-shotEffort(shot,outcome)*.55});
  yield;
 }
 ranked.sort((a,b)=>b.rank-a.rank);
 let choice=ranked[0]?.shot??fallback,best=-Infinity;
 for(const candidate of ranked.slice(0,5)){
  if(!candidate.outcome||candidate.outcome.result.foul||candidate.score<=-1000)continue;
  let score=candidate.rank;
  for(const direction of [-1,1]){
   const {shot}=candidate;
   const trial=simulate(world,ref,{...shot,angle:shot.angle+direction*.004,speed:shot.speed*(1+direction*.035)});
   yield;
   if(!trial||trial.result.foul||trial.judge.outcome==='win')score-=5;
   else if(candidate.outcome.result.legalPot&&!trial.result.legalPot)score-=2.5;
  }
  if(score>best){choice=candidate.shot;best=score;}
 }
 return choice;
}

function* continuation(world,ref,depth){
 if(!ref.coaching&&computerNeedsChalk(ref))ref=Object.assign(new Referee(world.mode),ref,{computerGrip:1});
 const ids=ref.target(world),targets=world.balls.filter(ball=>ids.includes(ball.id));
 const maximum=eliteComputer(ref.difficulty)&&ref.canMake147(world);
 const black=maximum&&ref.phase==='color'?targets.find(ball=>ball.value===7):null;
 const cue=world.balls[0];
 const pots=potOptions(world,targets,cue).sort((a,b)=>b.quality-a.quality).slice(0,depth>1?3:2);
 if(black){
  const blackPots=potOptions(world,[black],cue).sort((a,b)=>b.quality-a.quality).slice(0,2);
  pots.unshift(...blackPots.filter(shot=>!pots.some(pot=>pot.angle===shot.angle)));
 }
 const lines=[];
 scan: for(const pot of pots)for(const offset of depth>1?[0,-.004,.004,-.009,.009]:[0,-.005,.005]){
  for(const [scale,top] of (depth>2?[[.78,0],[1,0],[1.15,-.32],[.9,.30],[1.27,.50]]:[[.78,0],[1,0],[1.15,-.32],[.9,.30]])){
   const shot={...pot,angle:pot.angle+offset,speed:pot.speed*scale,top};
   const next=simulate(world,ref,shot);
   yield;
   if(next?.judge.done&&next.judge.outcome==='loss'&&!next.result.foul)return 30;
   if(next?.result.legalPot&&!next.result.foul&&next.judge.turn===1&&!next.judge.done&&!next.judge.decision){
    const ids=next.judge.target(next.trial);
    const stillMaximum=maximum&&next.judge.canMake147(next.trial);
    const nextTargets=next.trial.balls.filter(ball=>ids.includes(ball.id));
    const cue=next.trial.balls[0];
    const options=potOptions(next.trial,nextTargets,cue);
    const blackAfterRed=stillMaximum&&next.judge.phase==='color'?nextTargets.find(ball=>ball.value===7):null;
    const blackOptions=blackAfterRed?potOptions(next.trial,[blackAfterRed],cue):options;
    lines.push({...next,quality:Math.max(-2,...options.map(option=>option.quality))+(stillMaximum&&blackOptions.length?2:0)});
    if(depth===1&&lines.length>=2)return 8+Math.max(...lines.map(line=>line.quality));
    if(depth>1&&lines.length>=5)break scan;
   }
  }
 }
 if(!lines.length)return 0;
 lines.sort((a,b)=>b.quality-a.quality);
 if(depth===1)return 8+lines[0].quality;
 let best=0;
 for(const line of lines.slice(0,depth>2?1:2))best=Math.max(best,yield* continuation(line.trial,line.judge,depth-1));
 return 8+lines[0].quality+.55*best;
}

function professionalOptions(pots,contacts,high){
 const options=[];
 for(const [index,shot] of pots.slice(0,high?20:10).entries()){
  for(const offset of high?[0,-.003,.003,-.007,.007,-.014,.014]:[0,-.005,.005,-.010,.010]){
   for(const scale of index<(high?8:5)?[.72,1,1.28]:[1]){
    options.push({...shot,angle:shot.angle+offset,speed:shot.speed*scale});
   }
  }
  if(index<(high?9:5))for(const top of high?[-.63,-.36,.32,.61]:[-.42,.38])for(const scale of [.74,1,1.25]){
   for(const offset of high?[0,-.004,.004]:[0]){
    options.push({...shot,angle:shot.angle+offset,top,speed:shot.speed*scale});
   }
  }
  if(index<(high?6:3))for(const side of [-.38,.38])for(const top of [-.34,.32]){
   for(const scale of [.83,1.14])options.push({...shot,top,side,speed:shot.speed*scale});
  }
 }
 const direct=contacts.filter(shot=>shot.contactWidth).slice(0,high?7:4);
 for(const shot of direct)for(const fraction of high?[0,-.97,.97,-.85,.85,-.56,.56]:[0,-.88,.88,-.57,.57]){
  for(const speed of high?[.55,.9,1.4,2.05,2.8]:[.72,1.25,2.45]){
   options.push({...shot,angle:shot.angle+fraction*shot.contactWidth,speed});
  }
  if(high)for(const top of [-.55,.42])for(const speed of [1.05,1.8]){
   options.push({...shot,angle:shot.angle+fraction*shot.contactWidth,speed,top});
  }
 }
 for(const shot of contacts.filter(shot=>!shot.contactWidth).slice(0,8)){
  for(const offset of [0,-.018,.018])for(const speed of [1.55,2.6]){
   options.push({...shot,angle:shot.angle+offset,speed});
  }
 }
 return options;
}

function* chooseProfessional(world,ref,targets,pots,contacts,fallback,fatigue){
 const high=eliteComputer(ref.difficulty),star=ref.difficulty==='star';
 const scored=[];
 const evaluate=shot=>{
  const outcome=simulate(world,ref,shot);
  const score=simulationScore(world,ref,shot,outcome,fatigue);
  const style=star?shotStyle(shot,outcome):0;
  const effort=shotEffort(shot,outcome);
  const rank=score-effort+.05*shot.quality;
  scored.push({shot,score,style,rank,shortlist:star?rank+style+Math.min(effort,5)*.55:rank});
 };
 for(const shot of professionalOptions(pots,contacts,high)){evaluate(shot);yield;}
 if(star)for(const shot of starOptions(world,targets,pots,contacts,fallback.cue)){evaluate(shot);yield;}
 if(high&&ref.canMake147(world)){
  const black=targets.find(ball=>ball.value===7);
  const onBlack=ref.phase==='color'&&black;
  const routes=onBlack?potOptions(world,[black],world.balls[0],true):pots;
  for(const route of routes.sort((a,b)=>b.quality-a.quality).slice(0,5)){
   for(const scale of [1.45,1.75])for(const top of [-.4,0,.35]){
    evaluate({...route,speed:Math.min(PLAYER_MAX_SPEED,route.speed*scale),top});yield;
   }
   if(onBlack&&world.balls.some(ball=>ball.value===1&&!ball.potted)){
    for(const speed of [2.7,3.5])for(const [top,side] of [[.38,0],[-.45,0],[.25,-.35],[.25,.35]]){
     evaluate({...route,speed,top,side});yield;
    }
   }
  }
 }
 scored.sort((a,b)=>b.score-a.score);
 if((scored[0]?.score??-Infinity)<12){
  for(const option of bankOptions(world,targets,fallback.cue).slice(0,high?10:5)){
   for(const offset of [-.018,-.008,0,.008,.018])for(const scale of [.8,1.15]){
    evaluate({...option,angle:option.angle+offset,speed:option.speed*scale});
    yield;
   }
  }
  scored.sort((a,b)=>b.score-a.score);
 }
 if(high&&(scored[0]?.score??-Infinity)<6){
  const routes=[...contacts.filter(shot=>!shot.contactWidth).slice(0,16),...twoRailOptions(world,targets,fallback.cue)];
  for(const route of routes)for(const offset of [-.042,-.021,0,.021,.042]){
   for(const scale of [.86,1.19]){evaluate({...route,angle:route.angle+offset,speed:route.speed*scale});yield;}
  }
  scored.sort((a,b)=>b.score-a.score);
 }
 if(high&&scored[0]?.score<16){
  const anchors=scored.slice(0,5);
  for(const {shot} of anchors)for(const offset of [-.009,-.003,.003,.009]){
   for(const scale of [.86,.96,1.06,1.16]){
    evaluate({...shot,angle:shot.angle+offset,speed:shot.speed*scale});
    yield;
   }
   for(const side of [-.35,.35]){evaluate({...shot,angle:shot.angle+offset,side});yield;}
  }
  scored.sort((a,b)=>b.score-a.score);
 }
 if(!scored.length)return fallback;
 if(scored[0].score<=-1000)return scored[0].shot;
 const attacks=scored.filter(candidate=>candidate.score>=14).sort((a,b)=>b.shortlist-a.shortlist);
 const defenses=scored.filter(candidate=>candidate.score<14&&candidate.score>-1000).sort((a,b)=>b.shortlist-a.shortlist);
 let choice=scored[0].shot,best=-Infinity;
 const leaves=new Set();
 const shortlist=star?[...new Set([...[...attacks].sort((a,b)=>b.rank-a.rank).slice(0,4),...attacks.slice(0,75)])]:attacks.slice(0,high?65:26);
 for(const candidate of [...shortlist,...defenses.slice(0,star?14:high?8:3)]){
  const attacking=candidate.score>=14;
  if(attacking&&leaves.size>=(star?9:high?5:3))continue;
  const outcome=simulate(world,ref,candidate.shot);
  yield;
  if(!outcome||outcome.result.foul)continue;
  let score=candidate.rank;
  if(!attacking){
   const margin=yield* shotMargin(world,ref,candidate.shot,outcome);
   score-=4*(1-margin.legal);
   if(high&&candidate.score>=0&&!outcome.judge.decision)score+=positionPressure(outcome)*margin.legal*(star?1.32:1);
   if(star&&margin.legal===1&&candidate.style>0)score+=candidate.style+Math.min(shotEffort(candidate.shot,outcome),4)*.45;
   if(score>best){choice=candidate.shot;best=score;}
   continue;
  }
  const cue=outcome.trial.balls[0];
  const key=`${Math.round(cue.x*7)}:${Math.round(cue.y*7)}:${outcome.judge.score}:${outcome.trial.balls.filter(b=>b.potted).map(b=>b.id).join(',')}:${star&&candidate.style>=1.5}`;
  if(leaves.has(key))continue;
  leaves.add(key);
  const margin=yield* shotMargin(world,ref,candidate.shot,outcome);
  score-=(star?10:high?6:9)*(1-margin.kept)+(star?12:8)*(1-margin.legal);
  let follow=0;
  if(!outcome.judge.done&&!outcome.judge.decision&&margin.kept>0){
   follow=yield* continuation(outcome.trial,outcome.judge,star?3:high?2:1);
   score+=Math.min(star?21:high?17:6,follow*(star?.89:high?.85:.46))*margin.kept*(1-.10*fatigue);
  }
  if(star&&margin.kept===1&&(outcome.judge.done||follow>=6))score+=1.55*candidate.style+Math.min(shotEffort(candidate.shot,outcome),5)*.66;
  if(score>best){choice=candidate.shot;best=score;}
 }
 return choice;
}

function* recoverLegalShot(world,ref,targets,positions,bestShot){
 let best=bestShot,score=simulationScore(world,ref,bestShot);
 if(score>-1000)return best;
 const high=eliteComputer(ref.difficulty);
 for(const cue of positions.slice(0,3)){
  const routes=[...contactOptions(world,targets,cue),...twoRailOptions(world,targets,cue)];
  for(const route of routes.slice(0,high?38:24)){
   for(const offset of [0,-.012,.012,-.027,.027,-.05,.05]){
    for(const speed of [.92,1.55,2.45,3.45]){
     const shot={...route,angle:route.angle+offset,speed};
     const candidate=simulationScore(world,ref,shot);
     yield;
     if(candidate>score){best=shot;score=candidate;}
     if(candidate>-1000)return best;
    }
   }
  }
 }
 // Try additional angles around blocked targets and vary side spin on cushions.
 const cue=positions[0];
 const hidden=contactOptions(world,targets,cue).filter(shot=>!shot.contactWidth);
 for(const route of hidden.slice(0,high?16:8)){
  for(const offset of [-.085,-.061,-.036,0,.036,.061,.085]){
   for(const side of [-.44,.44]){
    const shot={...route,angle:route.angle+offset,speed:2.6,side};
    const candidate=simulationScore(world,ref,shot);
    yield;
    if(candidate>score){best=shot;score=candidate;}
    if(candidate>-1000)return best;
   }
  }
 }
 for(const target of targets.slice(0,6)){
  const angle=Math.atan2(target.y-cue.y,target.x-cue.x);
  const width=Math.asin(Math.min(1,2*world.c.radius/Math.hypot(target.x-cue.x,target.y-cue.y)));
  for(const fraction of [0,-.95,.95,-.78,.78,-.43,.43]){
   for(const speed of [.55,1.15,2.7,4.1]){
    const shot={angle:angle+fraction*width,speed,cue};
    const candidate=simulationScore(world,ref,shot);
    yield;
    if(candidate>score){best=shot;score=candidate;}
    if(candidate>-1000)return best;
   }
  }
 }
 return best;
}

function finalizeShot(world,ref,choice,rng,fatigue){
 const {error,powerError,spinError=0}=LEVELS[ref.difficulty];
 const low=ref.difficulty==='low';
 const variation={...choice,angle:choice.angle+(2*rng()-1)*(error+.001*fatigue),
  speed:clamp(choice.speed*(1+(2*rng()-1)*(powerError+.008*fatigue)),.12,choice.breakBoost?BREAK_MAX_SPEED:7)};
 if(spinError&&(choice.top||choice.side)){
  const spinScale=1+(2*rng()-1)*spinError;
  variation.top=(choice.top??0)*spinScale;
  variation.side=(choice.side??0)*spinScale;
 }
 const expected=simulationScore(world,ref,choice);
 const assemble=shot=>({top:0,side:0,...(ref.coaching?practiceControls(shot):shot),
  placement:world.cuePlacementZone&&!ref.coaching?shot.cue:null});
 const outcome=simulate(world,ref,variation);
 if(!outcome||outcome.result.foul)return assemble(choice);
 if(!eliteComputer(ref.difficulty)){
  // A legal execution error can cost a pot or position, but not a rack-winning line.
  if(expected>-1000&&expected<90&&ref.shots>0&&outcome.judge.outcome!=='win'){
   if(low||!outcome.judge.decision)return assemble(variation);
  }
 }
 // Recheck the exact speed and spin that will be used on the live table.
 const actual=simulationScore(world,ref,variation,outcome);
 const keepsResult=actual>-1000&&(expected<14||actual>=14)&&(expected<90||actual>=90);
 return assemble(keepsResult?variation:choice);
}

export function* computerShotSearch(world,ref,rng=Math.random,fatigue=0){
 const targetIds=ref.target(world),targets=world.balls.filter(ball=>targetIds.includes(ball.id));
 const positions=ref.coaching?[world.balls[0]]:placementOptions(world,targets,ref.difficulty);
 if(!positions.length)return null;
 if(isPoolBreak(world,ref)&&targets.length){
  const front=targets.reduce((a,b)=>a.x<b.x?a:b),cue=positions[0];
  const seats=(ref.coaching?[cue]:[cue,...[0,-.16,.16,-.30,.30].map(y=>({x:cue.x,y})),
   ...[-.22,.22].map(y=>({x:cue.x-.10,y}))]).filter((seat,index,all)=>
   world.canPlaceCue(seat.x,seat.y)&&all.findIndex(p=>p.x===seat.x&&p.y===seat.y)===index);
  const speeds=ref.coaching?[5.8,PLAYER_MAX_SPEED,BREAK_MAX_SPEED]:[BREAK_MAX_SPEED,7.1,6.95,6.5,5.8];
  let best=null,score=-Infinity;
  for(const speed of speeds){
   const legal=[];
   const offsets=!ref.coaching&&speed>7?[0,-.025,.025,-.04,.04]:[0];
   for(const seat of seats){
    let preferred=null;
    for(const offset of offsets){
     const shot={cue:seat,angle:Math.atan2(front.y+offset-seat.y,front.x-seat.x),speed,top:.12,breakBoost:speed>7};
     const outcome=simulate(world,ref,shot);
     const valid=outcome&&!outcome.result.foul&&!outcome.judge.decision&&outcome.judge.outcome!=='win';
     const value=simulationScore(world,ref,shot,outcome);
     if(value>score){best=shot;score=value;}
     if(valid&&(!preferred||value>preferred.value))preferred={shot,value};
     yield;
    }
    if(preferred)legal.push(preferred);
   }
   if(!ref.coaching&&legal.length){
    const bestValue=Math.max(...legal.map(candidate=>candidate.value));
    const comparable=legal.filter(candidate=>candidate.value>=bestValue-5);
    const {shot}=comparable[Math.min(comparable.length-1,Math.floor(rng()*comparable.length))];
    return {...shot,side:0,placement:shot.cue};
   }
  }
  if(best&&score>-1000)return ref.coaching?finalizeShot(world,ref,best,rng,fatigue):{...best,side:0,placement:best.cue};
 }
 const pots=placementPots(world,targets,positions,ref.difficulty);
 if(eliteComputer(ref.difficulty)&&ref.phase==='color'&&ref.canMake147(world)){
  const black=targets.find(ball=>ball.value===7);
  if(black){
   const blackPots=placementPots(world,[black],positions,ref.difficulty).slice(0,5);
   pots.unshift(...blackPots.filter(shot=>!pots.slice(0,8).some(pot=>pot.angle===shot.angle&&pot.cue===shot.cue)));
  }
 }
 const alternativeSeats=world.cuePlacementZone?positions.slice(0,ref.difficulty==='low'?2:5):positions;
 const contacts=alternativeSeats.flatMap(cue=>contactOptions(world,targets,cue)).sort((a,b)=>b.quality-a.quality);
 let choice=pots[0]??contacts[0]??{angle:0,speed:1,cue:positions[0]};
 if(ref.difficulty==='low')choice=yield* chooseCasual(world,ref,pots,contacts,choice,fatigue);
 else choice=yield* chooseProfessional(world,ref,targets,pots,contacts,choice,fatigue);
 choice=yield* recoverLegalShot(world,ref,targets,positions,choice);
 return finalizeShot(world,ref,choice,rng,fatigue);
}

export function planComputerShot(world,ref,rng=Math.random,fatigue=0){
 const search=computerShotSearch(world,ref,rng,fatigue);
 let step=search.next();
 while(!step.done)step=search.next();
 return step.value;
}

function* practiceEscape(world,coach,targets){
 const cue=world.balls[0],r=cue.r;
 const rails=[['x',world.c.length/2-r],['y',world.c.width/2-r]]
  .flatMap(([axis,limit])=>[[axis,-limit],[axis,limit]]);
 const routes=[];
 function addRoutes(point,sequence){
  if(sequence.length){
   const [axis,rail]=sequence[0];
   const dx=point.x-cue.x,dy=point.y-cue.y,t=(rail-cue[axis])/(point[axis]-cue[axis]);
   if(t>0&&t<1){
    const bounce={x:cue.x+t*dx,y:cue.y+t*dy};
    const inside=Math.abs(bounce.x)<=world.c.length/2-r+1e-6&&Math.abs(bounce.y)<=world.c.width/2-r+1e-6;
    if(inside&&clearPath(world.balls,cue,bounce,r,[0])){
     routes.push({angle:Math.atan2(dy,dx),length:Math.hypot(dx,dy),rails:sequence.length});
    }
   }
  }
  if(sequence.length===3)return;
  for(const [axis,rail] of rails){
   if(sequence[0]?.[0]===axis&&sequence[0]?.[1]===rail)continue;
   addRoutes({...point,[axis]:rail+(rail-point[axis])/world.c.cushion},[[axis,rail],...sequence]);
  }
 }
 const nearest=[...targets].sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y));
 for(const target of nearest.slice(0,5))addRoutes(target,[]);
 routes.sort((a,b)=>a.rails-b.rails||a.length-b.length);
 const selected=[...routes.filter(route=>route.rails===1).slice(0,12),...routes.filter(route=>route.rails===2).slice(0,14),
  ...routes.filter(route=>route.rails===3).slice(0,14)];
 let best=null,bestScore=-Infinity,legalRoutes=0;
 for(const route of selected){
  const speed=clamp(1.25+.52*route.length,1.5,5.3);
  for(const offset of [0,-.012,.012,-.029,.029,-.06,.06]){
   for(const [scale,side] of [[1,0],[.78,0],[1.22,0],[1,-.32],[1,.32]]){
    const shot=practiceControls({angle:route.angle+offset,speed:speed*scale,side,cue});
    const outcome=simulate(world,coach,shot);
    yield;
    if(!outcome||outcome.result.foul||outcome.judge.outcome==='win')continue;
    const first=outcome.trial.events.findIndex(e=>e.type==='hit'&&(e.a===0||e.b===0));
    if(first<0||!outcome.trial.events.slice(0,first).some(e=>e.type==='rail'&&e.id===0))continue;
    const margin=yield* shotMargin(world,coach,shot,outcome);
    const score=simulationScore(world,coach,shot,outcome)+8*margin.legal-.25*route.rails;
    if(score>bestScore){best=shot;bestScore=score;}
    if(margin.legal===1||++legalRoutes>=10)return best;
   }
  }
 }
 return best;
}

function traceShot(world,ref,shot){
 const trial=Object.assign(Object.create(World.prototype),world,{balls:world.balls.map(ball=>({...ball}))});
 const judge=Object.assign(new Referee(world.mode),ref);
 judge.begin(trial);
 trial.strike(shot.angle,shot.speed,shot.side,shot.top,{breakBoost:shot.breakBoost});
 const paths=new Map(),finishedPaths=new Set();
 function sample(){
  for(const ball of trial.balls){
   if(finishedPaths.has(ball.id))continue;
   const points=paths.get(ball.id)??[];
   const last=points.at(-1);
   if(!last||Math.hypot(ball.x-last.x,ball.y-last.y)>.006){
    points.push({x:ball.x,y:ball.y});
    paths.set(ball.id,points);
   }
   if(ball.potted)finishedPaths.add(ball.id);
  }
 }
 sample();
 let contact=null,contactIndex=0;
 const cushions=[];
 let eventIndex=0;
 for(let i=0;trial.running&&i<2880;i++){
  trial.step(1/240);
  while(eventIndex<trial.events.length&&!contact){
   const event=trial.events[eventIndex++];
   if(event.type==='hit'&&(event.a===0||event.b===0)){
    contact={x:event.cueX,y:event.cueY};
    paths.get(0).push(contact);
    contactIndex=paths.get(0).length;
    break;
   }
   if(event.type==='rail'&&event.id===0){
    const point={x:event.x,y:event.y};
    cushions.push(point);
    paths.get(0).push(point);
   }
  }
  if(i%4===0)sample();
 }
 if(trial.running)return null;
 sample();
 const pot=trial.events.find(event=>event.type==='pot'&&event.id!==0);
 const result=judge.finish(trial);
 return {trial,judge,result,contact,contactIndex,pot,paths,cushions};
}

export function* practiceShotSearch(world,ref){
 const targetIds=ref.target(world);
 if(world.balls[0].potted||!targetIds.length)return null;
 const targets=world.balls.filter(ball=>targetIds.includes(ball.id));
 const coach=Object.assign(new Referee(world.mode,'high'),ref,{
  coaching:true,turn:1,scores:[0,ref.score],computerGrip:world.tipCondition
 });
 let best=yield* computerShotSearch(world,coach,()=>.5);
 let traced=best&&traceShot(world,ref,best);
 const blocked=escapeWindow(world,targets).visible===0;
 if(!traced?.contact||traced.result.foul||traced.judge.outcome==='loss'||blocked&&!traced.cushions.length){
  const escape=yield* practiceEscape(world,coach,targets);
  if(escape){best=escape;traced=traceShot(world,ref,best);}
 }
 if(!traced?.contact||traced.result.foul||traced.judge.outcome==='loss')return null;
 const {trial,judge,result,contact,contactIndex,pot,paths,cushions}=traced;
 const targetId=targetIds.includes(trial.firstHit)?trial.firstHit:
  trial.firstContacts?.find(id=>targetIds.includes(id))??trial.firstHit;
 const target=world.balls.find(ball=>ball.id===targetId);
 const cuePath=paths.get(0);
 // Keep the cue route through contact and draw the predicted object-ball route.
 const approach=cushions.length?cuePath.slice(0,contactIndex):[cuePath[0],contact];
 const objectPath=paths.get(pot?.id??target.id);
 const targetPath=paths.get(target.id);
 const cueAfterContact=[contact,...cuePath.slice(contactIndex)];
 const nextIds=judge.target(trial);
 const nextPots=!judge.done&&result.legalPot?potOptions(trial,trial.balls.filter(ball=>nextIds.includes(ball.id)),trial.balls[0]):[];
 const black=judge.phase==='color'&&judge.canMake147(trial)?nextPots.filter(shot=>shot.target.value===7):[];
 const nextTarget=(black.length?black:nextPots).sort((a,b)=>b.quality-a.quality)[0]?.target;
 return {target,contact,angle:best.angle,legalPot:result.legalPot||judge.outcome==='win',speed:best.speed,top:best.top,side:best.side,
  breakBoost:best.breakBoost,nextTarget,leave:trial.balls[0],cushions,
  paths:[approach,cueAfterContact,targetPath,...(objectPath!==targetPath?[objectPath]:[])].filter(path=>path?.length>1)};
}
