// Cue-ball in-hand areas. Coordinates refer to the ball's centre / cloth contact point.
export function openingZone(mode){return mode==='snooker'?'d':'head';}
export function zoneLabel(zone){return {head:'开球线后',d:'D 区内',table:'全台合法位置'}[zone]||'当前没有摆球权';}
export function inZone(c,zone,x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 if(zone==='head')return x<-c.length/4-1e-6;
 if(zone==='d'){const bx=-c.length/2+.737;return x<=bx+1e-8&&Math.hypot(x-bx,y)<=.292+1e-8;}
 return zone==='table';
}
export function foulZone(mode,{foul,scratch,breakShot,done}){
 if(done||!foul)return null;
 if(mode==='snooker')return scratch?'d':null;
 if(mode==='eight'&&breakShot)return 'head';
 return 'table';
}

// A potted cue may be outside the table or outside the newly granted zone.
// Give keyboard placement a legal starting point without confirming it.
export function keyboardPlacementStart(world){
 const b=world.balls[0],c=world.c;
 if(world.canPlaceCue(b.x,b.y))return {x:b.x,y:b.y};
 const x=world.cuePlacementZone==='d'?-c.length/2+.6:-c.length*.35;
 if(world.canPlaceCue(x,0))return {x,y:0};
 for(let x=-c.length/2+2*c.radius;x<c.length/2-c.radius;x+=c.radius)
  for(let y=-c.width/2+2*c.radius;y<c.width/2-c.radius;y+=c.radius)
   if(world.canPlaceCue(x,y))return {x,y};
 return null;
}
