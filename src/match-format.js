// Entries are wins required, ordered from the final back toward the opening round.
const NINE_OPEN=[13,11,10];
const WORLD_SNOOKER=[18,17,13,13,10];
const UK_SNOOKER=[10,6];
const HOME_NATIONS=[9,6,5,4];
const NINE_WINNER_BREAKS=new Set([
 'uk','us','us2026','uk2026','europe2026','florida2026','world2025','us2025',
 'hanoi2025','europe2025','florida2025','world2024','us2024','europe2024',
 'hanoi2023','spain2023','masters2023','world2022','europe2022'
]);
const FORMATS={
 nine:{
  uk:[13,11,11,11,9],us:[13,11,11,11,9],us2026:NINE_OPEN,uk2026:NINE_OPEN,
  europe2026:NINE_OPEN,florida2026:NINE_OPEN,world2025:[15,11],us2025:NINE_OPEN,
  hanoi2025:NINE_OPEN,europe2025:NINE_OPEN,florida2025:NINE_OPEN,world2024:[15,11],
  us2024:NINE_OPEN,europe2024:NINE_OPEN,hanoi2023:NINE_OPEN,spain2023:NINE_OPEN,
  masters2023:[13,11,11,9],world2022:[13,11],europe2022:[13,11,11,11,9]
 },
 snooker:{
  qtour:[4],scottish:HOME_NATIONS,uk:UK_SNOOKER,masters:UK_SNOOKER,world:WORLD_SNOOKER,
  china2026:[10,6,5],shanghai2026:[11,10,6],wuhan2026:[10,6,5],
  international2026:[10,9,6],worldopen2026:[10,6,5],english2026:HOME_NATIONS,
  northern2026:HOME_NATIONS,british2026:[10,6,5,4],saudi2025:[10,6,6,6,5],
  uk2024:UK_SNOOKER,world2024:WORLD_SNOOKER,shanghai2023:[11,10,6],
  uk2022:UK_SNOOKER,masters2022:UK_SNOOKER,world2022:WORLD_SNOOKER,british2021:[6,4,4,3]
 }
};

export function openingStage(key,details){
 if(key==='club')return 0;
 let stage=details.prizes.length-2;
 while(stage>=0&&details.prizes[details.prizes.length-1-stage]>0)stage--;
 return stage;
}
export function raceTo(mode,key,details,stage){
 if(key==='club')return 1;
 const wins=FORMATS[mode]?.[key]??[7];
 return wins[Math.min(details.prizes.length-2-stage,wins.length-1)];
}
export function raceLabel(mode,target){
 if(target===1)return '单局决胜';
 return mode==='snooker'?`${2*target-1} 局 ${target} 胜`:`抢 ${target}`;
}
export function matchLabelText(mode,target,score,names=['你','电脑']){
 return `大比分 ${names[0]} ${score[0]} : ${score[1]} ${names[1]} · ${raceLabel(mode,target)}`;
}
export function breakOrder(mode,key){
 // These Matchroom opens, Masters and World Championship editions use winner breaks.
 // Use WPA's alternating default for events without a confirmed override.
 return mode==='nine'&&NINE_WINNER_BREAKS.has(key)?'winner':'alternate';
}

export function openingBreak(mode,rng=Math.random){
 return mode==='snooker'?{kind:'draw',chooser:rng()<.5?0:1}:{kind:'lag'};
}

export function recordFrame(mode,details,tournament,playerWon){
 const {key,stage}=tournament;
 const score=[...(tournament.matchScore??[0,0])];
 const winner=playerWon?0:1;
 const breaker=tournament.breaker??Math.abs(stage%2);
 score[winner]++;
 if(score[winner]<raceTo(mode,key,details,stage)){
  return {kind:'frame',score,next:{...tournament,matchScore:score,breaker:breakOrder(mode,key)==='winner'?winner:1-breaker}};
 }
 const completed=[...(tournament.completed??[]),{stage,score}];
 if((tournament.showcase&&tournament.controlledSide===null||winner===(tournament.controlledSide??0))&&stage<details.prizes.length-2){
  return {kind:'round',score,completed,next:{...tournament,stage:stage+1,matchScore:[0,0],breaker:0,opening:openingBreak(mode),completed}};
 }
 return {kind:'event',score,completed};
}
