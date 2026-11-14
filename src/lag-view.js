import {makeLagWorld,strikeLag,lagResult} from './lag.js';
import {clamp} from './physics.js';

export class LagView{
 constructor(canvas,power,onResult){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.power=power;this.onResult=onResult;
  const cancel=()=>{this.drag=null;this.charge=0;this.render();};
  canvas.addEventListener('pointerdown',event=>{
   if(event.button!==0||!this.ready||this.drag||this.keyHeld)return;
   this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle:this.angle};
   canvas.focus();canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
   if(!this.ready||this.keyHeld)return;
   const width=canvas.clientWidth||1;
   if(this.drag){
    this.angle=clamp(this.drag.angle+(event.clientY-this.drag.y)/width*1.4,-.30,.30);
    this.charge=clamp((this.drag.x-event.clientX)/(width*.38),0,1);
   }else if(event.pointerType==='mouse'){
    const rect=canvas.getBoundingClientRect(),p=this.points(this.world.balls[0]);
    const dx=(event.clientX-rect.left)/rect.width*canvas.width-p.x;
    const dy=(event.clientY-rect.top)/rect.height*canvas.height-p.y;
    if(dx>12)this.angle=clamp(Math.atan2(dy,dx),-.30,.30);
   }
   this.render();
  });
  canvas.addEventListener('pointerup',event=>{
   if(this.drag?.id!==event.pointerId)return;
   this.drag=null;
   this.shoot();
  });
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('lostpointercapture',()=>{if(this.drag)cancel();});
  canvas.addEventListener('keydown',event=>{
   if(!this.ready||this.drag||event.ctrlKey||event.altKey||event.metaKey)return;
   if(event.code==='Space'){event.preventDefault();this.keyHeld=true;}
   if(event.code==='ArrowUp'||event.code==='ArrowDown'){
    event.preventDefault();this.angle=clamp(this.angle+(event.code==='ArrowUp'?-.008:.008),-.30,.30);this.render();
   }
  });
  canvas.addEventListener('keyup',event=>{
   if(event.code!=='Space'||!this.keyHeld)return;
   event.preventDefault();this.keyHeld=false;this.shoot();
  });
  canvas.addEventListener('blur',()=>{if(this.keyHeld){this.keyHeld=false;cancel();}});
 }

 reset(mode,difficulty){
  this.world=makeLagWorld(mode);this.difficulty=difficulty;this.ready=true;
  this.drag=null;this.keyHeld=false;this.charge=0;this.angle=0;this.accumulator=0;this.crossed=[false,false];
  this.render();
 }

 shoot(){
  if(!this.ready||this.charge<.025){this.charge=0;this.render();return;}
  if(strikeLag(this.world,this.charge,this.angle,this.difficulty))this.ready=false;
  this.render();
 }

 update(seconds){
  if(this.keyHeld&&this.ready){this.charge=clamp(this.charge+seconds*.58,0,1);this.render();}
  if(!this.world?.running)return;
  this.accumulator+=seconds;
  while(this.accumulator>=1/240&&this.world.running){
   this.world.step(1/240);this.accumulator-=1/240;
   this.world.balls.forEach((ball,i)=>{this.crossed[i]||=i===0?ball.y<=0:ball.y>=0;});
  }
  this.render();
  if(!this.world.running)this.onResult(lagResult(this.world,this.crossed));
 }

 points(ball){
  const scale=(this.canvas.width-52)/this.world.c.length;
  return {x:this.canvas.width/2+ball.x*scale,y:this.canvas.height/2+ball.y*scale,scale};
 }

 render(){
  if(!this.world)return;
  const ctx=this.ctx,{width,height}=this.canvas,{length,width:cloth}=this.world.c;
  const {scale}=this.points({x:0,y:0}),left=(width-length*scale)/2,top=(height-cloth*scale)/2;
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#4e3929';ctx.fillRect(left-13,top-13,width-2*left+26,height-2*top+26);
  ctx.fillStyle='#286c57';ctx.fillRect(left,top,width-2*left,height-2*top);
  ctx.fillStyle='#112420';
  for(const pocket of this.world.pockets){
   const p=this.points(pocket);ctx.beginPath();ctx.arc(p.x,p.y,pocket.r*scale*.48,0,2*Math.PI);ctx.fill();
  }
  ctx.strokeStyle='#d8ead15c';ctx.setLineDash([7,7]);ctx.beginPath();ctx.moveTo(left,height/2);ctx.lineTo(width-left,height/2);ctx.stroke();
  const head=this.points({x:-length/4,y:0}).x;
  ctx.beginPath();ctx.moveTo(head,top);ctx.lineTo(head,height-top);ctx.stroke();ctx.setLineDash([]);
  if(this.ready){
   const p=this.points(this.world.balls[0]),dx=Math.cos(this.angle),dy=Math.sin(this.angle);
   ctx.lineWidth=2;ctx.strokeStyle='#f3f6d9';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+100*dx,p.y+100*dy);ctx.stroke();
   const pull=14+this.charge*50;
   ctx.lineWidth=5;ctx.strokeStyle='#e0b16e';ctx.beginPath();ctx.moveTo(p.x-pull*dx,p.y-pull*dy);ctx.lineTo(p.x-(pull+56)*dx,p.y-(pull+56)*dy);ctx.stroke();
   const opponent=this.points(this.world.balls[1]);
   ctx.strokeStyle='#b98854';ctx.beginPath();ctx.moveTo(opponent.x-pull,opponent.y);ctx.lineTo(opponent.x-pull-56,opponent.y);ctx.stroke();
  }
  for(const ball of this.world.balls){
   if(ball.potted)continue;
   const p=this.points(ball),radius=ball.r*scale;
   ctx.beginPath();ctx.arc(p.x,p.y,radius,0,2*Math.PI);ctx.fillStyle=ball.id?'#ffcb72':'#fffdf1';ctx.fill();
   ctx.strokeStyle='#10201a';ctx.lineWidth=1.5;ctx.stroke();
  }
  this.power.value=this.charge;
 }
}
