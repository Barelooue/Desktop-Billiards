import {openingZone,inZone} from './placement.js';
import {tipWear,cueResponse} from './chalk.js';
import {BREAK_MAX_SPEED} from './shot-controls.js';
// SI units. Right-handed physics space: x,y on cloth; z points up.
export const MODES = {
  nine: { name:'中式九球', en:'CHINESE 9-BALL', length:2.54, width:1.27, radius:.028575, mouth:.092, side:.104, count:9, cloth:'#236d65', slide:.20, roll:.012, spin:8, cushion:.82 },
  eight: { name:'中式八球', en:'CHINESE 8-BALL', length:2.54, width:1.27, radius:.028575, mouth:.085, side:.098, count:15, cloth:'#286958', slide:.20, roll:.012, spin:8, cushion:.82 },
  snooker: { name:'斯诺克', en:'SNOOKER', length:3.569, width:1.778, radius:.02625, mouth:.082, side:.090, count:21, cloth:'#356e51', slide:.18, roll:.009, spin:6, cushion:.79 }
};
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const G=9.81;
export function ball(id,x,y,r,value=id){return {id,x,y,r,value,vx:0,vy:0,wx:0,wy:0,wz:0,potted:false};}
export function sample(items,n,rng=Math.random){ const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n); }
export function rack(mode,rng=Math.random){
 const c=MODES[mode],r=c.radius,out=[ball(0,-c.length*.29,0,r,0)],gap=r*2+.0003;
 if(mode==='snooker'){
  const baulk=-c.length/2+.737;
  out[0].x=baulk-.15; out[0].y=.12;
  for(let row=0,id=1;row<5;row++)for(let j=0;j<=row;j++)out.push(ball(id++,c.length*.25+.075+row*gap*Math.sqrt(3)/2,(j-row/2)*gap,r,1));
  [[16,baulk,-.292,2],[17,baulk,.292,3],[18,baulk,0,4],[19,0,0,5],[20,c.length*.25,0,6],[21,c.length/2-.324,0,7]].forEach(([id,x,y,v])=>out.push(ball(id,x,y,r,v)));
 }else{
  const rows=mode==='nine'?[1,2,3,2,1]:[1,2,3,4,5],ids=sample(Array.from({length:c.count},(_,i)=>i+1),c.count,rng);
  const swap=(id,index)=>{let i=ids.indexOf(id);[ids[i],ids[index]]=[ids[index],ids[i]];};
  if(mode==='nine'){swap(1,0);swap(9,4);}else{swap(8,4);const solid=ids.find((id,i)=>i!==4&&id<8);swap(solid,10);const stripe=ids.find((id,i)=>i!==4&&id>8);swap(stripe,14);}
  const apex=c.length*.25-(mode==='nine'?gap*Math.sqrt(3):0);
  let i=0; rows.forEach((count,row)=>{for(let j=0;j<count;j++)out.push(ball(ids[i++],apex+row*gap*Math.sqrt(3)/2,(j-(count-1)/2)*gap,r));});
 }
 return out;
}
export function pockets(c){const L=c.length/2,W=c.width/2;return [{x:-L,y:-W,r:c.mouth*.56},{x:L,y:-W,r:c.mouth*.56},{x:-L,y:W,r:c.mouth*.56},{x:L,y:W,r:c.mouth*.56},{x:0,y:-W-.012,r:c.side*.53},{x:0,y:W+.012,r:c.side*.53}];}
// Cushion polygons include angled pocket jaws. Rendering consumes the same segments.
export function cushions(c){
 const L=c.length/2,W=c.width/2,k=c.mouth/Math.sqrt(2),s=c.side/2,d=.045,out=[];
 const seg=(ax,ay,bx,by)=>out.push({ax,ay,bx,by});
 for(const sign of [-1,1]){
  seg(-L+k,sign*W,-s,sign*W);seg(s,sign*W,L-k,sign*W);
  seg(-s,sign*W,-s*.78,sign*(W+d));seg(s,sign*W,s*.78,sign*(W+d));
  seg(-L+k,sign*W,-L+k*.48,sign*(W+d));seg(L-k,sign*W,L-k*.48,sign*(W+d));
  seg(sign*L,-W+k,sign*L,W-k);
  seg(sign*L,-W+k,sign*(L+d),-W+k*.48);seg(sign*L,W-k,sign*(L+d),W-k*.48);
 }
 return out;
}
export class World{
 constructor(mode='nine'){this.mode=mode;this.c=MODES[mode];this.balls=rack(mode);this.pockets=pockets(this.c);this.segments=cushions(this.c);this.events=[];this.firstHit=null;this.running=false;this.elapsed=0;this.cuePlacementZone=openingZone(mode);this.tipCondition=1;}
 strike(angle,speed,side=0,top=0,{breakBoost=false}={}){
  const b=this.balls[0];if(this.running||b.potted)return false;
  this.events=[];this.firstHit=null;this.elapsed=0;
  this.headStringCrossings=[];
  this.hitBeforeHeadString=false;
  this.firstContacts=[];
  // Cue-contact offset torque: I=2/5 mR². Avoid miscue region >0.8R.
  const offset=Math.hypot(side,top),scale=offset>.8?.8/offset:1;side*=scale;top*=scale;
  const spinAmount=Math.min(offset/.8,1),response=cueResponse(this.tipCondition,spinAmount);
  side*=response.spin;top*=response.spin;
  const maxSpeed=breakBoost&&this.mode!=='snooker'&&this.cuePlacementZone==='head'?BREAK_MAX_SPEED:7;
  const v=clamp(speed,.12,maxSpeed)*response.speed,dx=Math.cos(angle),dy=Math.sin(angle);
  b.vx=dx*v;b.vy=dy*v;b.wx=-dy*2.5*v*top/b.r;b.wy=dx*2.5*v*top/b.r;b.wz=-2.5*v*side/b.r;
  this.tipCondition=Math.max(0,this.tipCondition-tipWear((speed-.15)/6.85,spinAmount));
  this.running=true;this.cuePlacementZone=null;return true;
 }
 step(dt){
  if(!this.running)return;
  // Adaptive substeps constrain travel to <0.22 radius even on a break.
  let vmax=0;for(const b of this.balls)if(!b.potted)vmax=Math.max(vmax,Math.hypot(b.vx,b.vy));
  const n=Math.max(1,Math.ceil(vmax*dt/(this.c.radius*.22))),h=dt/n;
  for(let s=0;s<n;s++)this.integrate(h);
  this.elapsed+=dt;
  this.running=this.balls.some(b=>!b.potted&&(Math.hypot(b.vx,b.vy)>.001||Math.hypot(b.wx,b.wy,b.wz)>.02));
  if(!this.running)for(const b of this.balls)b.vx=b.vy=b.wx=b.wy=b.wz=0;
 }
 integrate(dt){
  const c=this.c;
  const cue=this.balls[0];
  const before=this.firstHit===null&&!cue.potted?this.balls.map(({x,y})=>({x,y})):null;
  for(const b of this.balls){
   if(b.potted)continue;
   const previousX=b.x;
   b.x+=b.vx*dt;b.y+=b.vy*dt;
   const head=-c.length/4;
   const crossed=b.id===0?previousX<head&&b.x>=head:previousX>=head&&b.x<head;
   if(crossed&&this.headStringCrossings&&!this.headStringCrossings.includes(b.id))this.headStringCrossings.push(b.id);
   const ux=b.vx-b.r*b.wy,uy=b.vy+b.r*b.wx,u=Math.hypot(ux,uy);
   if(u>1e-5){
    // Slip at cloth contact, analytic cap at rolling transition (du/dt = 7μg/2).
    const dv=Math.min(c.slide*G*dt,u/3.5),fx=-dv*ux/u,fy=-dv*uy/u;
    b.vx+=fx;b.vy+=fy;b.wx+=2.5*fy/b.r;b.wy-=2.5*fx/b.r;
   }else{
    const v=Math.hypot(b.vx,b.vy),v2=Math.max(0,v-c.roll*G*dt),q=v>0?v2/v:0;
    b.vx*=q;b.vy*=q;b.wx=-b.vy/b.r;b.wy=b.vx/b.r;
   }
   b.wz=Math.sign(b.wz)*Math.max(0,Math.abs(b.wz)-c.spin*dt);
   if(this.pockets.some(p=>Math.hypot(b.x-p.x,b.y-p.y)<p.r*.76)) {this.pot(b);continue;}
   for(const seg of this.segments)this.cushion(b,seg);
   // Safety boundary is outside the pocket shelf; escaped balls are off-table fouls.
   if(Math.abs(b.x)>c.length/2+.15||Math.abs(b.y)>c.width/2+.15){this.pot(b,false);this.events.push({type:'offtable',id:b.id});}
  }
  if(before&&!cue.potted)this.resolveFirstContact(cue,before);
  for(let i=0;i<this.balls.length;i++){const a=this.balls[i];if(a.potted)continue;for(let j=i+1;j<this.balls.length;j++){const b=this.balls[j];if(!b.potted)this.collide(a,b);}}
 }
 resolveFirstContact(cue,before){
  const contacts=[];
  for(let i=1;i<this.balls.length;i++){
   const ball=this.balls[i],radius=cue.r+ball.r;
   if(ball.potted||Math.hypot(ball.x-cue.x,ball.y-cue.y)>=radius)continue;
   const dx=before[i].x-before[0].x,dy=before[i].y-before[0].y;
   const vx=ball.x-cue.x-dx,vy=ball.y-cue.y-dy;
   const speed=vx*vx+vy*vy,approach=dx*vx+dy*vy;
   const gap=dx*dx+dy*dy-radius*radius;
   if(gap>0&&(!speed||approach>=0))continue;
   const fraction=gap<=0?0:(-approach-Math.sqrt(Math.max(0,approach*approach-speed*gap)))/speed;
   contacts.push({ball,fraction});
  }
  contacts.sort((a,b)=>a.fraction-b.fraction);
  for(const {ball,fraction} of contacts){
   this.collide(cue,ball);
   if(this.firstHit!==ball.id)continue;
   this.firstContacts=contacts.filter(contact=>Math.abs(contact.fraction-fraction)<=1e-5).map(contact=>contact.ball.id);
   break;
  }
 }
 pot(b,pocket=true){if(b.potted)return;const speed=Math.hypot(b.vx,b.vy);b.potted=true;b.vx=b.vy=b.wx=b.wy=b.wz=0;this.events.push({type:'pot',id:b.id,value:b.value,speed,x:b.x,y:b.y,time:this.elapsed,pocket});}
 cushion(b,s){
  const sx=s.bx-s.ax,sy=s.by-s.ay,t=clamp(((b.x-s.ax)*sx+(b.y-s.ay)*sy)/(sx*sx+sy*sy),0,1),px=s.ax+t*sx,py=s.ay+t*sy;
  let nx=b.x-px,ny=b.y-py,d=Math.hypot(nx,ny);if(d>=b.r||d<1e-8)return;
  nx/=d;ny/=d;b.x+=nx*(b.r-d+.000001);b.y+=ny*(b.r-d+.000001);
  const vn=b.vx*nx+b.vy*ny;if(vn>=0)return;
  const jn=-(1+this.c.cushion)*vn,tx=-ny,ty=nx,slip=b.vx*tx+b.vy*ty-b.r*b.wz;
  const jt=clamp(-slip/3.5,-.14*jn,.14*jn);
  b.vx+=jn*nx+jt*tx;b.vy+=jn*ny+jt*ty;b.wz-=2.5*jt/b.r;
  this.events.push({type:'rail',id:b.id,speed:Math.abs(vn),x:b.x,y:b.y,time:this.elapsed});
 }
 collide(a,b){
  let nx=b.x-a.x,ny=b.y-a.y,d=Math.hypot(nx,ny),r=a.r+b.r;if(d>=r)return;
  if(d<1e-9){nx=1;ny=0;d=1e-9;}else{nx/=d;ny/=d;}
  const overlap=(r-d+.000001)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
  const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn>=0)return;
  const jn=-(1+.96)*vn/2,tx=-ny,ty=nx;
  const slip=(b.vx-a.vx)*tx+(b.vy-a.vy)*ty-a.r*a.wz-b.r*b.wz;
  const jt=clamp(-slip/7,-.045*jn,.045*jn),jx=jn*nx+jt*tx,jy=jn*ny+jt*ty;
  a.vx-=jx;a.vy-=jy;b.vx+=jx;b.vy+=jy;a.wz-=2.5*jt/a.r;b.wz-=2.5*jt/b.r;
  if(this.firstHit===null&&(a.id===0||b.id===0)){
   const target=a.id===0?b:a;
   this.firstHit=target.id;
   this.hitBeforeHeadString=target.x<-this.c.length/4&&!this.headStringCrossings?.includes(0);
  }
  const cue=a.id===0?a:b.id===0?b:null;
  this.events.push({type:'hit',a:a.id,b:b.id,speed:-vn,x:(a.x+b.x)/2,y:(a.y+b.y)/2,time:this.elapsed,
   ...(cue?{cueX:cue.x,cueY:cue.y}:{})});
 }
 canPlace(x,y,id=0){const r=this.c.radius;return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<this.c.length/2-r&&Math.abs(y)<this.c.width/2-r&&!this.balls.some(b=>b.id!==id&&!b.potted&&Math.hypot(x-b.x,y-b.y)<r*2+.001)&&!this.pockets.some(p=>Math.hypot(x-p.x,y-p.y)<p.r+r)&&!this.segments.some(s=>{const dx=s.bx-s.ax,dy=s.by-s.ay,t=clamp(((x-s.ax)*dx+(y-s.ay)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(x-s.ax-t*dx,y-s.ay-t*dy)<r+.0001;});}
 canPlaceCue(x,y){return !this.running&&inZone(this.c,this.cuePlacementZone,x,y)&&this.canPlace(x,y);}
 placeCue(x,y){if(!this.canPlaceCue(x,y))return false;const b=this.balls[0];Object.assign(b,{x,y,potted:false,vx:0,vy:0,wx:0,wy:0,wz:0});return true;}
 respot(id,{spot=false,snooker=false}={}){
  const b=this.balls.find(b=>b.id===id);if(!b)return;
  const positions=rack(this.mode),initial=positions.find(b=>b.id===id);
  let x=spot?this.c.length/4:initial.x,y=spot?0:initial.y;
  if(snooker&&!this.canPlace(x,y,id)){
   const vacant=positions.filter(ball=>ball.value>1).sort((a,b)=>b.value-a.value).find(ball=>this.canPlace(ball.x,ball.y,id));
   if(vacant){x=vacant.x;y=vacant.y;}
  }
  if((spot||snooker)&&!this.canPlace(x,y,id)){
   const origin=x,limit=this.c.length/2-b.r;
   for(const direction of [1,-1]){
    for(let step=.001;step<2*limit;step+=.001){
     const candidate=origin+direction*step;
     if(Math.abs(candidate)>=limit)break;
     if(this.canPlace(candidate,y,id)){x=candidate;break;}
    }
    if(this.canPlace(x,y,id))break;
   }
  }
  if(!this.canPlace(x,y,id)){let found=false;for(let ix=0;ix<100&&!found;ix++)for(let iy=0;iy<55;iy++){x=-this.c.length/2+b.r*1.1+ix*b.r*2.05;y=-this.c.width/2+b.r*1.1+iy*b.r*2.05;if(this.canPlace(x,y,id)){found=true;break;}}if(!found)return;}
  Object.assign(b,{x,y,potted:false,vx:0,vy:0,wx:0,wy:0,wz:0});
 }
}
