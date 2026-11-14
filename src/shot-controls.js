// Map the player's controls to the inputs used by the physics simulation.
export const PLAYER_SPEED_SCALE=.95;
export const PLAYER_SPIN_LIMIT=.8*.94;
export const PLAYER_MAX_SPEED=7*PLAYER_SPEED_SCALE;
export const BREAK_MAX_POWER=1.12;
export const BREAK_MAX_SPEED=playerShotSpeed(BREAK_MAX_POWER,true);
export const isPoolBreak=(world,ref)=>world.mode!=='snooker'&&ref.shots===0&&world.cuePlacementZone==='head';

export function playerShotSpeed(power,breakBoost=false){
 return (.15+6.85*Math.min(power,breakBoost?BREAK_MAX_POWER:1))*PLAYER_SPEED_SCALE;
}

export function playerShotPower(speed,breakBoost=false){
 return Math.max(0,Math.min(breakBoost?BREAK_MAX_POWER:1,(speed/PLAYER_SPEED_SCALE-.15)/6.85));
}
