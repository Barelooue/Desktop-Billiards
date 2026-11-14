import {zoneLabel} from './placement.js';

// Top-down placement aid: keeps the main camera first-person while exposing the whole legal area.
export class PlacementUI{
 constructor(canvas,getWorld,onPlace){
  this.canvas=canvas;this.getWorld=getWorld;this.onPlace=onPlace;this.candidate=null;this.dragging=false;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.dragging=true;canvas.setPointerCapture(e.pointerId);this.move(e,true);});
  canvas.addEventListener('pointermove',e=>this.move(e,this.dragging));
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>this.dragging=false);
  canvas.addEventListener('pointerleave',()=>{if(!this.dragging){this.candidate=null;this.draw();}});
 }
 move(e,commit){const rect=this.canvas.getBoundingClientRect(),w=this.getWorld(),pad=12,scale=(280-pad*2)/w.c.length;const sx=(e.clientX-rect.left)/rect.width*280,sy=(e.clientY-rect.top)/rect.height*152;this.candidate={x:(sx-140)/scale,y:(sy-76)/scale};if(commit)this.onPlace(this.candidate);this.draw();}
 draw(){
  const w=this.getWorld(),c=w.c,canvas=this.canvas,dpr=devicePixelRatio;canvas.width=Math.round(280*dpr);canvas.height=Math.round(152*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const scale=256/c.length,X=x=>140+x*scale,Y=y=>76+y*scale,L=c.length/2,W=c.width/2;
  ctx.fillStyle='#0d1a15';ctx.fillRect(0,0,280,152);ctx.fillStyle='#244c3d';ctx.fillRect(X(-L),Y(-W),c.length*scale,c.width*scale);
  ctx.fillStyle='#aad49b55';ctx.beginPath();
  if(w.cuePlacementZone==='head')ctx.rect(X(-L),Y(-W),c.length*.25*scale,c.width*scale);
  else if(w.cuePlacementZone==='d'){const bx=-L+.737;ctx.arc(X(bx),76,.292*scale,Math.PI/2,Math.PI*1.5);ctx.closePath();}
  else if(w.cuePlacementZone==='table')ctx.rect(X(-L),Y(-W),c.length*scale,c.width*scale);
  ctx.fill();ctx.strokeStyle='#c4e6bb90';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#030b07';for(const p of w.pockets){ctx.beginPath();ctx.arc(X(p.x),Y(p.y),p.r*scale,0,Math.PI*2);ctx.fill();}
  for(const b of w.balls){if(b.potted)continue;ctx.beginPath();ctx.arc(X(b.x),Y(b.y),Math.max(2,b.r*scale),0,Math.PI*2);ctx.fillStyle=b.id?'#c89a63':'#fff9dd';ctx.fill();}
  if(this.candidate){const p=this.candidate,valid=w.canPlaceCue(p.x,p.y);ctx.strokeStyle=valid?'#d6ffb6':'#ee8879';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(X(p.x),Y(p.y),c.radius*scale+2,0,Math.PI*2);ctx.stroke();}
  canvas.setAttribute('aria-label',`母球摆位图：${zoneLabel(w.cuePlacementZone)}。点击或拖动选择位置。`);
 }
}
