import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {clamp,cushions,pockets} from './physics.js';
import {makeSurfaceLibrary,makeCloth,studioEnvironment} from './materials.js';
import {walkPosition,observationFraming,observationPose,OBSERVATION_HEIGHT} from './observation.js';
import {CHALK_SECONDS,CHALK_CONTACT_START,CHALK_CONTACT_END} from './chalk.js';
import {PLAYER_SPIN_LIMIT} from './shot-controls.js';
const COLORS=['#f4f0df','#e6b52c','#2374b7','#c63e37','#73499c','#e57b32','#3b795b','#8f303b','#181c20'];
const SNOOKER={1:'#ae272f',2:'#d6b833',3:'#368356',4:'#795541',5:'#327bb7',6:'#d58c9c',7:'#151b20'};
const V=(x,y,z)=>new T.Vector3(x,y,z);
function line(points,color=0xb9d8c0,opacity=.5){return new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:true,opacity}));}
export class BilliardScene{
 constructor(canvas){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.environment=studioEnvironment(this.renderer);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;
  this.surfaces=makeSurfaceLibrary(this.renderer);this.sharedTextures=new Set(Object.values(this.surfaces));
  this.camera=new T.PerspectiveCamera(44,1,.01,30);this.ray=new T.Raycaster();this.plane=new T.Plane(V(0,1,0),0);
  this.scene.add(new T.HemisphereLight(0xe5f1e1,0x39433c,.4));const light=new T.DirectionalLight(0xfff2da,2.4);light.position.set(-.6,3.7,.8);light.castShadow=true;light.shadow.mapSize.set(4096,4096);Object.assign(light.shadow.camera,{left:-2.5,right:2.5,top:2,bottom:-2,near:.1,far:8});light.shadow.camera.updateProjectionMatrix();light.shadow.bias=-.00006;light.shadow.normalBias=.0005;light.shadow.radius=2;this.scene.add(light);const fill=new T.DirectionalLight(0xc2e7ff,.45);fill.position.set(2,1,-3);this.scene.add(fill);
  this.table=new T.Group();this.scene.add(this.table);this.ballGroup=new T.Group();this.scene.add(this.ballGroup);this.cue=new T.Group();this.scene.add(this.cue);this.guides=new T.Group();this.scene.add(this.guides);this.placementOverlay=new T.Group();this.scene.add(this.placementOverlay);
  this.coachLines=new T.Group();this.scene.add(this.coachLines);this.coachOverhead=false;
  this.chalk=new T.Group();this.scene.add(this.chalk);this.chalkMotion=null;this.chalkCompleted=false;
  this.geometries={sphere:new T.SphereGeometry(1,96,64),shadow:new T.PlaneGeometry(2,2)};this.meshes=new Map();this.orbit=Math.PI;this.stance=false;this.eyeHeight=OBSERVATION_HEIGHT.default;this.aim=0;this.transition=0;this.phase='intro';this.tempQ=new T.Quaternion();this.tempAxis=V(0,0,0);this.look=V(0,0,0);this.started=0;
  this.resize();window.addEventListener('resize',()=>this.resize());
 }
 resize(){const w=innerWidth,h=innerHeight;this.renderer.setPixelRatio(devicePixelRatio);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.invalidated=true;}
 disposeGroup(g){const textures=new Set();for(const child of [...g.children]){g.remove(child);child.traverse(o=>{if(o.geometry&&!Object.values(this.geometries).includes(o.geometry))o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value?.isTexture&&!this.sharedTextures.has(value))textures.add(value);m.dispose();}}});}for(const t of textures)t.dispose();}
 box(group,x,y,z,w,h,d,color,roughness=.65){
  const wood=color===0x403d32,material=wood?new T.MeshPhysicalMaterial({map:this.surfaces.wood,roughness:.34,clearcoat:.55,clearcoatRoughness:.23,envMapIntensity:.5}):new T.MeshStandardMaterial({color,roughness});
  const geometry=Math.min(w,h,d)>.024?new RoundedBoxGeometry(w,h,d,3,Math.min(.007,Math.min(w,h,d)*.18)):new T.BoxGeometry(w,h,d);
  const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  if(group===this.table&&y>-.2){const holes=pockets(this.c);material.onBeforeCompile=shader=>{shader.uniforms.holes={value:holes.map(p=>new T.Vector3(p.x,p.y,p.r))};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 railPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nrailPosition=(modelMatrix*vec4(position,1.0)).xz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 railPosition;\nuniform vec3 holes[6];').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfor(int i=0;i<6;i++){if(distance(railPosition,holes[i].xy)<holes[i].z)discard;}');};}
  return mesh;}
 cylinder(group,a,b,r1,r2,color){const delta=b.clone().sub(a),metal=color===0xb5b9a1||color===0xb9a16c,wood=color===0xc6aa70||color===0xb89e70;const m=new T.Mesh(new T.CylinderGeometry(r2,r1,delta.length(),32),new T.MeshPhysicalMaterial({color:wood?0xffffff:color,map:wood?this.surfaces.maple:null,roughness:metal?.22:.32,metalness:metal?.85:0,clearcoat:metal?0:.55,clearcoatRoughness:.2}));m.castShadow=m.receiveShadow=true;m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());group.add(m);return m;}
 setup(world){
  this.coachOverhead=false;this.setCoachLines(null);
  this.world=world;this.c=world.c;this.meshes.clear();[this.table,this.ballGroup,this.cue,this.guides,this.placementOverlay,this.chalk].forEach(g=>this.disposeGroup(g));this.placementOverlay.visible=false;
  this.chalkMotion=null;this.chalkCompleted=false;
  const c=this.c,L=c.length/2,W=c.width/2;
  const clothMat=makeCloth(c,world.mode,this.renderer,this.surfaces.fiber);
  const ps=pockets(c);clothMat.onBeforeCompile=shader=>{
   shader.uniforms.holes={value:ps.map(p=>new T.Vector3(p.x,p.y,p.r*.93))};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 bedPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nbedPosition=position.xy;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 bedPosition;\nuniform vec3 holes[6];').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfor(int i=0;i<6;i++){if(distance(bedPosition,holes[i].xy)<holes[i].z)discard;}');
  };
  const bed=new T.Mesh(new T.PlaneGeometry(c.length,c.width),clothMat);bed.rotation.x=-Math.PI/2;bed.receiveShadow=true;this.table.add(bed);
  // Underframe and wood rails remain fixed in world coordinates.
  this.box(this.table,0,-.13,0,c.length+.24,.20,c.width+.24,0x202923);
  for(const y of [-1,1]){
   this.box(this.table,0,-.007,y*(W+.095),c.length+.27,.10,.14,0x403d32);
   this.box(this.table,0,-.065,y*(W+.17),c.length+.30,.075,.025,0x141b18);
  }
  for(const x of [-1,1]){this.box(this.table,x*(L+.095),-.007,0,.14,.10,c.width+.25,0x403d32);this.box(this.table,x*(L+.17),-.065,0,.025,.075,c.width+.3,0x141b18);}
  for(const s of cushions(c)){
   const dx=s.bx-s.ax,dy=s.by-s.ay,len=Math.hypot(dx,dy),mx=(s.ax+s.bx)/2,my=(s.ay+s.by)/2;
   let nx=-dy/len,ny=dx/len;if(nx*mx+ny*my<0){nx=-nx;ny=-ny;}
   const m=this.box(this.table,mx+nx*.018,.015,my+ny*.018,len,.035,.036,c.cloth);m.rotation.y=-Math.atan2(dy,dx);
  }
  for(const p of ps){
   const cup=new T.Mesh(new T.CylinderGeometry(p.r,p.r*.8,.12,64,1,true),new T.MeshStandardMaterial({color:0x090f0b,side:T.DoubleSide,roughness:1}));cup.position.set(p.x,-.043,p.y);this.table.add(cup);
   const dark=new T.Mesh(new T.CircleGeometry(p.r,64),new T.MeshBasicMaterial({color:0x050907}));dark.rotation.x=-Math.PI/2;dark.position.set(p.x,-.101,p.y);this.table.add(dark);
   const rim=new T.Mesh(new T.TorusGeometry(p.r*.99,.006,16,64),new T.MeshStandardMaterial({color:0x29291f,roughness:.66}));rim.rotation.x=Math.PI/2;rim.position.set(p.x,.005,p.y);this.table.add(rim);
  }
  for(let i=1;i<8;i++)if(i!==4)for(const sign of [-1,1]){const dot=this.box(this.table,-L+c.length*i/8,.046,sign*(W+.091),.008,.001,.008,0xc3c4a1);dot.rotation.y=Math.PI/4;}
  for(let i=1;i<4;i++)for(const sign of [-1,1]){const dot=this.box(this.table,sign*(L+.091),.046,-W+c.width*i/4,.008,.001,.008,0xc3c4a1);dot.rotation.y=Math.PI/4;}
  for(const x of [-1,1])for(const y of [-1,1]){this.box(this.table,x*L*.77,-.44,y*W*.75,.12,.60,.12,0x222b24);this.box(this.table,x*L*.77,-.75,y*W*.75,.16,.04,.16,0x686b56);}
  // Broad floor occlusion complements the directional contact shadows.
  const sc=document.createElement('canvas');sc.width=sc.height=128;const scx=sc.getContext('2d'),gr=scx.createRadialGradient(64,64,5,64,64,64);gr.addColorStop(0,'#00000088');gr.addColorStop(1,'#00000000');scx.fillStyle=gr;scx.fillRect(0,0,128,128);
  const floor=new T.Mesh(new T.PlaneGeometry(c.length*1.6,c.width*2),new T.MeshBasicMaterial({map:new T.CanvasTexture(sc),transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.775;this.table.add(floor);
  for(const b of world.balls)this.makeBall(b);
  this.makeCue();this.makeChalk();this.phase='intro';this.orbit=Math.PI;this.aim=0;this.stance=false;this.eyeHeight=OBSERVATION_HEIGHT.default;this.transition=0;this.playerAnchor={x:world.balls[0].x,y:world.balls[0].y};this.updateCamera(1);
 }
 makeBall(b){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');ctx.scale(4,4);
  const color=b.id===0?'#f4f1df':this.world.mode==='snooker'?SNOOKER[b.value]:COLORS[(b.id-1)%8+1];
  ctx.fillStyle=b.id>8&&this.world.mode!=='snooker'?'#eeeedd':color;ctx.fillRect(0,0,256,128);
  if(b.id>8&&this.world.mode!=='snooker'){ctx.fillStyle=color;ctx.fillRect(0,32,256,64);}
  // Pool balls have high-contrast numbers; snooker balls use plain regulation colors.
  const label=()=>{if(!b.id||this.world.mode==='snooker')return;for(const x of [64,192]){ctx.fillStyle='#fffff0';ctx.beginPath();ctx.arc(x,64,22,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101715';ctx.font='bold 27px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(b.id),x,65);}};label();
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
  const mesh=new T.Mesh(this.geometries.sphere,new T.MeshPhysicalMaterial({map:tex,roughness:.09,metalness:0,ior:1.55,clearcoat:1,clearcoatRoughness:.045,envMapIntensity:1.25}));mesh.castShadow=mesh.receiveShadow=true;mesh.scale.setScalar(b.r);mesh.position.set(b.x,b.r,b.y);
  // Tilt decals toward the opening camera; then integrate real rolling orientation.
  mesh.rotation.set(Math.PI/2,0,0);mesh.userData.label=String(b.id);this.ballGroup.add(mesh);
  const shadow=new T.Mesh(this.geometries.shadow,new T.MeshBasicMaterial({map:this.surfaces.contact,opacity:.44,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.setScalar(b.r*1.6);shadow.position.set(b.x,.0004,b.y);this.ballGroup.add(shadow);
  this.meshes.set(b.id,{mesh,shadow});
 }
 makeCue(){
  // Local +x is the shot direction; tip sits immediately behind cue ball.
  this.cylinder(this.cue,V(-.045,0,0),V(-.052,0,0),.0058,.0058,0x6499a8);
  this.cylinder(this.cue,V(-.052,0,0),V(-.085,0,0),.0058,.0062,0xece4ca);
  this.cylinder(this.cue,V(-.085,0,0),V(-.85,0,0),.0062,.012,0xc6aa70);
  this.cylinder(this.cue,V(-.85,0,0),V(-1.42,0,0),.012,.015,0x342c24);
  for(let i=0;i<3;i++)this.cylinder(this.cue,V(-.88-i*.15,0,0),V(-.89-i*.15,0,0),.0125,.0125,0xb9ad82);
 }
 makeChalk(){
  this.chalkHome=V(-this.c.length*.10,.065,-this.c.width/2-.095);
  this.chalk.position.copy(this.chalkHome);this.chalk.quaternion.identity();
  this.box(this.chalk,0,0,0,.042,.040,.042,0xe0bf75,.85);
  this.box(this.chalk,0,.019,0,.037,.006,.037,0x3997ba,.95);
  const dent=new T.Mesh(new T.CircleGeometry(.009,32),new T.MeshStandardMaterial({color:0x246781,roughness:1}));dent.rotation.x=-Math.PI/2;dent.position.y=.0221;this.chalk.add(dent);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#dfc17f';ctx.fillRect(0,0,256,128);ctx.fillStyle='#23433f';ctx.font='bold 65px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText('巧粉',128,89);
  const label=new T.CanvasTexture(canvas);label.colorSpace=T.SRGBColorSpace;
  const face=new T.Mesh(new T.PlaneGeometry(.036,.022),new T.MeshStandardMaterial({map:label,roughness:.9}));face.position.set(0,-.003,.0211);this.chalk.add(face);
  const hitbox=new T.Mesh(new T.BoxGeometry(.10,.10,.10),new T.MeshBasicMaterial({visible:false}));this.chalk.add(hitbox);
 }
 pickChalk(clientX,clientY){
  this.scene.updateMatrixWorld(true);this.ray.setFromCamera({x:clientX/innerWidth*2-1,y:1-clientY/innerHeight*2},this.camera);
  const hit=this.ray.intersectObjects(this.chalk.children,true)[0];if(!hit)return false;
  const blocker=this.ray.intersectObjects(this.table.children,true)[0];return !blocker||blocker.distance>=hit.distance-.02;
 }
 beginChalk(owner='player'){
  if(this.chalkMotion||this.world.running||this.phase!=='play')return false;
  if(owner==='player')this.snapObservation();
  const forward=this.camera.getWorldDirection(V(0,0,0)),right=V(1,0,0).applyQuaternion(this.camera.quaternion);
  const tip=this.camera.position.clone().addScaledVector(forward,.40).addScaledVector(right,.18);tip.y-=.20;
  this.chalkMotion={owner,elapsed:0,tip,to:tip.clone().add(V(0,.023,0))};this.chalkCompleted=false;this.invalidated=true;return true;
 }
 updateChalk(dt){
  if(!this.chalkMotion)return;
  const a=this.chalkMotion;a.elapsed+=dt;const t=clamp(a.elapsed/CHALK_SECONDS,0,1);
  const working=a.elapsed>=CHALK_CONTACT_START&&a.elapsed<CHALK_CONTACT_END;
  const travel=t<.25?t/.25:t>.75?(1-t)/.25:1,ease=travel*travel*(3-2*travel);
  this.chalk.position.lerpVectors(this.chalkHome,a.to,ease);this.chalk.position.y+=Math.sin(Math.PI*travel)*.17;
  this.chalk.rotation.set(0,0,Math.PI*ease);
  if(working){const rub=(t-.25)*Math.PI*24;this.chalk.position.x+=Math.sin(rub)*.004;this.chalk.position.z+=Math.cos(rub)*.004;this.chalk.rotation.z+=Math.sin(rub)*.12;}
  // Hold the cue upright in front of the observer; no hand or tip model needed.
  this.cue.visible=true;this.cue.position.copy(a.tip).add(V(0,.045,0));this.cue.quaternion.setFromUnitVectors(V(1,0,0),V(0,1,0));this.guides.visible=false;
  if(t===1){this.chalk.position.copy(this.chalkHome);this.chalk.quaternion.identity();this.chalkMotion=null;this.chalkCompleted=a.owner;this.cue.visible=false;}
 }
 snapObservation(){
   this.setStance(false);this.camera.position.copy(this.desiredCamera());
   this.camera.fov=this.observationView().fov;this.camera.updateProjectionMatrix();
   this.camera.up.set(0,1,0);this.look.set(0,0,0);this.camera.lookAt(this.look);this.camera.updateMatrixWorld(true);
   this.transition=1;this.cue.visible=false;this.guides.visible=false;this.invalidated=true;
 }
 showPlacement(zone){
  if(zone&&this.phase==='play')this.snapObservation();
  this.disposeGroup(this.placementOverlay);this.placementOverlay.visible=!!zone;if(!zone){this.invalidated=true;return;}
  const L=this.c.length/2-this.c.radius,W=this.c.width/2-this.c.radius,shape=new T.Shape();
  if(zone==='d'){const bx=-this.c.length/2+.737;shape.absarc(bx,0,.292,Math.PI/2,Math.PI*1.5,false);shape.closePath();}
  else{const right=zone==='head'?-this.c.length/4:L;shape.moveTo(-L,-W);shape.lineTo(right,-W);shape.lineTo(right,W);shape.lineTo(-L,W);shape.closePath();}
  const fill=new T.Mesh(new T.ShapeGeometry(shape,64),new T.MeshBasicMaterial({color:0xbbeaa1,transparent:true,opacity:.12,depthWrite:false,side:T.DoubleSide}));fill.rotation.x=-Math.PI/2;fill.position.y=.0015;
  const outline=line(shape.getPoints(96).map(p=>V(p.x,.002,-p.y)),0xc4e6bb,.8);this.placementOverlay.add(fill,outline);this.invalidated=true;
 }
 start(){this.phase='play';this.transition=0;this.started=performance.now();}
 walk(delta){if(this.stance)return;this.orbit+=delta;this.invalidated=true;}
 setStance(aiming,target=null){
  if(aiming===this.stance)return;
  if(aiming){
   const b=this.world.balls[0],standing=walkPosition(this.c,this.orbit,.60),dx=standing.x-b.x,dz=standing.z-b.y,L=this.c.length/2+.48,W=this.c.width/2+.48;
   const tx=dx>0?(L-b.x)/dx:dx<0?(-L-b.x)/dx:Infinity,tz=dz>0?(W-b.y)/dz:dz<0?(-W-b.y)/dz:Infinity;
   const distance=Math.min(tx,tz);this.aimSeat=V(b.x+dx*distance,.32,b.y+dz*distance);
   this.aim=Math.atan2(b.y-this.aimSeat.z,b.x-this.aimSeat.x);this.aimBase=this.aim;this.aimAnchor={x:b.x,y:b.y};
   if(target){
    const offset=Math.atan2(target.y-b.y,target.x-b.x)-this.aimBase;
    const delta=Math.atan2(Math.sin(offset),Math.cos(offset));
    if(Math.abs(delta)<=Math.PI/2)this.aim+=delta;
   }
  }
  this.stance=aiming;this.invalidated=true;
 }
 adjustAim(delta){
  if(!this.stance||this.world.running||!Number.isFinite(delta))return;
  // Sweep a semicircle about the cue-ball contact, relative to the entry heading.
  // Keep the angle unwrapped so crossing +/- PI never flips or traps the cue.
  this.aim=clamp(this.aim+delta,this.aimBase-Math.PI/2,this.aimBase+Math.PI/2);this.invalidated=true;
 }
 get postureSettled(){return this.camera.position.distanceTo(this.desiredCamera())<.012&&Math.abs(this.camera.fov-(this.stance?44:this.observationView().fov))<.1;}
 observationView(){
  const key=this.camera.aspect;
  if(this.observationKey!==key){this.observationFrame=observationFraming(key);this.observationKey=key;}
  return this.observationFrame;
 }
 desiredCamera(){
  if(this.stance&&this.aimSeat){
   const seat=this.aimSeat.clone();
   const angle=Math.abs(this.aim-this.aimBase);
   const aligned=1-T.MathUtils.smoothstep(angle,T.MathUtils.degToRad(3),T.MathUtils.degToRad(14));
   const distance=this.aimDistance();
   const longShot=T.MathUtils.smoothstep(distance,1.05,2.35);
   // A longer sight line passes closer to the cue near the player's eye.
   seat.y+=.045*aligned+.14*longShot*(.4+.6*aligned);
   return seat;
  }
  const p=observationPose(this.c,this.orbit,this.eyeHeight,this.camera.aspect,this.observationView());return V(p.x,this.eyeHeight,p.z);
 }
 aimDistance(){
  const b=this.world.balls[0],dx=Math.cos(this.aim),dy=Math.sin(this.aim),diameter=2*b.r;
  const L=this.c.length/2-b.r,W=this.c.width/2-b.r;
  let distance=Infinity;
  for(const d of [dx>0?(L-b.x)/dx:dx<0?(-L-b.x)/dx:Infinity,dy>0?(W-b.y)/dy:dy<0?(-W-b.y)/dy:Infinity]){
   if(d>0)distance=Math.min(distance,d);
  }
  for(const ball of this.world.balls){
   if(!ball.id||ball.potted)continue;
   const ox=ball.x-b.x,oy=ball.y-b.y,forward=ox*dx+oy*dy,lateral=ox*dy-oy*dx;
   if(forward<=0||Math.abs(lateral)>=diameter)continue;
   const contact=forward-Math.sqrt(diameter*diameter-lateral*lateral);
   distance=Math.min(distance,Math.max(0,contact));
  }
  return distance;
 }
 updateCamera(dt){
  if(!this.world)return;
  const c=this.c,b=this.world.balls[0];
  if(this.coachOverhead){
   const height=Math.max((c.length+.36)/this.camera.aspect,c.width+.36)/(2*Math.tan(T.MathUtils.degToRad(22)))*1.42;
   const centerZ=c.width*.12;
   this.camera.fov=44;this.camera.updateProjectionMatrix();
   this.camera.position.set(0,height,centerZ);this.camera.up.set(0,0,-1);this.camera.lookAt(0,0,centerZ);
   this.needsFrame=false;return;
  }
  if(this.phase==='intro'){
   if(this.camera.fov!==44){this.camera.fov=44;this.camera.updateProjectionMatrix();}
   const height=Math.max(c.length/this.camera.aspect,c.width)*2.3;
   const offset=-c.length*.20;this.camera.position.set(offset,height,.10);this.camera.up.set(0,0,-1);this.camera.lookAt(offset,0,0);this.look.set(offset,0,0);this.needsFrame=false;return;
  }
  this.camera.up.set(0,1,0);const target=this.desiredCamera();
  const anchor=this.aimAnchor;
  // At wide angles, look closer to the contact so the ball stays in frame
  // while the player's eye position remains fixed.
  const lookAhead=this.stance?.70*Math.max(0,Math.cos(this.aim-this.aimBase)):0;
  const look=this.stance?V(anchor.x+Math.cos(this.aim)*lookAhead,b.r,anchor.y+Math.sin(this.aim)*lookAhead):V(0,0,0);
  const k=1-Math.exp(-dt*(this.transition<1?3:8)),fov=this.stance?44:this.observationView().fov;
  this.camera.fov+=(fov-this.camera.fov)*k;this.camera.updateProjectionMatrix();
  if(this.stance||this.look.lengthSq()>.000001||Math.abs(this.camera.fov-fov)>.01)this.camera.position.lerp(target,k);
  else this.camera.position.copy(target);
  this.look.lerp(look,k);this.camera.lookAt(this.look);this.transition=Math.min(1,this.transition+dt*.6);this.needsFrame=this.camera.position.distanceTo(target)>.0001||this.look.distanceTo(look)>.0001||Math.abs(this.camera.fov-fov)>.0001;
 }
 pick(clientX,clientY){this.ray.setFromCamera({x:clientX/innerWidth*2-1,y:1-clientY/innerHeight*2},this.camera);const p=this.ray.ray.intersectPlane(this.plane,V(0,0,0));return p?{x:p.x,y:p.z}:null;}
 setCoachLines(advice){
  this.disposeGroup(this.coachLines);
  if(advice){
   const material=()=>new T.LineDashedMaterial({color:0xffffff,dashSize:.039,gapSize:.023,depthWrite:false,toneMapped:false});
   for(const [index,path] of advice.paths.entries()){
    const style=material();
    if(index>0){style.transparent=true;style.opacity=.55;style.dashSize=.022;style.gapSize=.022;}
    const route=new T.Line(new T.BufferGeometry().setFromPoints(path.map(p=>V(p.x,.009,p.y))),style);
    route.computeLineDistances();this.coachLines.add(route);
   }
   const mark=(point,radius)=>{
    const points=Array.from({length:49},(_,i)=>{
     const angle=i/48*Math.PI*2;
     return V(point.x+Math.cos(angle)*radius,.01,point.y+Math.sin(angle)*radius);
    });
    const circle=new T.Line(new T.BufferGeometry().setFromPoints(points),material());
    circle.computeLineDistances();this.coachLines.add(circle);
   };
   mark(advice.contact,this.c.radius);
   mark(advice.target,this.c.radius*1.28);
   for(const point of advice.cushions)mark(point,this.c.radius*.68);
   if(advice.nextTarget)mark(advice.leave,this.c.radius*.75);
  }
  this.invalidated=true;
 }
 update(dt,{power=0,guide=true,spin={x:0,y:0},ballInHand=false,computerShot=null}={}){
  if(!this.world)return;const b=this.world.balls[0];
  for(const ball of this.world.balls){const item=this.meshes.get(ball.id);item.mesh.visible=item.shadow.visible=!ball.potted;if(ball.potted)continue;item.mesh.position.set(ball.x,ball.r,ball.y);item.shadow.position.set(ball.x,.0004,ball.y);const w=Math.hypot(ball.wx,ball.wy,ball.wz);if(w>.001){this.tempAxis.set(-ball.wx,-ball.wz,-ball.wy).normalize();this.tempQ.setFromAxisAngle(this.tempAxis,w*dt);item.mesh.quaternion.premultiply(this.tempQ);}}
  this.updateCamera(dt);const ready=this.phase==='play'&&this.stance&&!this.world.running&&!ballInHand;
  this.cue.visible=ready||!!computerShot;this.guides.visible=ready&&guide&&!this.coachOverhead;
  if(computerShot){
   const {angle,pull,top=0,side=0,placement}=computerShot;
   const {x,y}=placement??b;
   if(placement){
    const {mesh,shadow}=this.meshes.get(0);
    mesh.visible=shadow.visible=true;
    mesh.position.set(x,b.r,y);shadow.position.set(x,.0004,y);
   }
   const dx=Math.cos(angle),dy=Math.sin(angle),tilt=top<-.25?-.12:-.025;
   this.cue.position.set(x-dx*pull-dy*side*b.r,b.r+top*b.r+.045*Math.sin(tilt),y-dy*pull+dx*side*b.r);
   this.cue.rotation.set(0,-angle,tilt);
  }else if(ready){
   const dx=Math.cos(this.aim),dy=Math.sin(this.aim),pull=power*.27;
   const tipHeight=b.r+spin.y*b.r*PLAYER_SPIN_LIMIT,tilt=spin.y<-.25?-.12:-.025;
   this.cue.position.set(b.x-dx*pull,tipHeight+.045*Math.sin(tilt),b.y-dy*pull);this.cue.rotation.set(0,-this.aim,tilt);
   // Lateral contact offset moves the cue tip to the chosen point.
   this.cue.position.x-=dy*spin.x*b.r*PLAYER_SPIN_LIMIT;this.cue.position.z+=dx*spin.x*b.r*PLAYER_SPIN_LIMIT;
   this.updateGuide();
  }
  this.updateChalk(dt);
 }
 updateGuide(){
  // Reuse dynamic buffers; no per-frame geometry allocation.
  if(!this.guideLine){this.guideLine=line([V(0,.005,0),V(0,.005,0)],0xdce9c5,.55);this.ghost=new T.Mesh(new T.RingGeometry(this.c.radius*.9,this.c.radius,32),new T.MeshBasicMaterial({color:0xc9e1b8,transparent:true,opacity:.65,side:T.DoubleSide}));this.ghost.rotation.x=-Math.PI/2;this.guides.add(this.guideLine,this.ghost);}
  // setup() disposes old guide objects: rebuild on the next call.
  if(this.guideLine.parent!==this.guides){this.guideLine=null;this.updateGuide();return;}
  const b=this.world.balls[0],dx=Math.cos(this.aim),dy=Math.sin(this.aim),distance=this.aimDistance();
  const a=this.guideLine.geometry.attributes.position;a.setXYZ(0,b.x,.003,b.y);a.setXYZ(1,b.x+dx*distance,.003,b.y+dy*distance);a.needsUpdate=true;this.guideLine.geometry.computeBoundingSphere();this.ghost.position.set(b.x+dx*distance,.003,b.y+dy*distance);
 }
 render(){this.renderer.render(this.scene,this.camera);}
}
