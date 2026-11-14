import {World,ball,clamp} from './physics.js';

const SKILL={low:[2.98,.44,.055],medium:[3.025,.28,.032],high:[3.055,.15,.016],star:[3.07,.065,.007]};
export const lagSpeed=power=>.4+4*clamp(power,0,1);

export function makeLagWorld(mode){
 const world=new World(mode),{length,width,radius}=world.c;
 world.balls=[ball(0,-length/4-.02,width/4,radius,0),ball(1,-length/4-.02,-width/4,radius,0)];
 world.cuePlacementZone=null;
 return world;
}

export function strikeLag(world,power,angle,difficulty,rng=Math.random){
 const [base,speedError,aimError]=SKILL[difficulty];
 const pace=base+(rng()-.5)*speedError;
 const aim=(rng()-.5)*aimError;
 if(!world.strike(angle,lagSpeed(power)))return false;
 // Start the opponent's centre-ball stroke on the same physics step.
 Object.assign(world.balls[1],{vx:pace*Math.cos(aim),vy:pace*Math.sin(aim)});
 return true;
}

export function lagResult(world,crossed){
 const {length,width,radius}=world.c;
 const [player,computer]=world.balls.map((ball,id)=>{
  const rails=world.events.filter(e=>e.type==='rail'&&e.id===id);
  const far=rails.filter(e=>e.x>=length/2-radius-.006&&Math.abs(e.y)<width/2-radius-.006);
  const side=rails.some(e=>Math.abs(e.y)>=width/2-radius-.006);
  const collision=world.events.some(e=>e.type==='hit'&&(e.a===id||e.b===id));
  if(ball.potted||crossed[id]||collision||side||far.length!==1)return null;
  return Math.max(0,ball.x+length/2-radius);
 });
 const chooser=player===null&&computer===null?null:player===null?1:computer===null?0:
  Math.abs(player-computer)<.001?null:player<computer?0:1;
 return {player,computer,chooser};
}
