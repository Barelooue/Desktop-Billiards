import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BilliardScene} from '../src/scene.js';
import {Group,Vector3} from 'three';
import {PLAYER_SPIN_LIMIT} from '../src/shot-controls.js';
import {World} from '../src/physics.js';

test('Aiming spans a semicircle, reverses at either stop and crosses angle wrapping boundaries',()=>{
 for(const base of [0,Math.PI-.05,-Math.PI+.05]){
  const view=Object.assign(Object.create(BilliardScene.prototype),{
   stance:true,world:{running:false},aimDistance:()=>.9,aim:base,aimBase:base,aimSeat:new Vector3(-2,.32,0),orbit:Math.PI
  });
  const seat=view.desiredCamera().toArray();
  view.adjustAim(Math.PI/3);assert.ok(Math.abs(view.aim-base-Math.PI/3)<1e-12);
  view.adjustAim(20);assert.equal(view.aim,base+Math.PI/2);
  view.adjustAim(-.01);assert.equal(view.aim,base+Math.PI/2-.01);
  view.adjustAim(-20);assert.equal(view.aim,base-Math.PI/2);
  view.adjustAim(.01);assert.equal(view.aim,base-Math.PI/2+.01);
  const angledSeat=view.desiredCamera().toArray();
  assert.equal(angledSeat[0],seat[0]);assert.equal(angledSeat[2],seat[2]);
  assert.equal(angledSeat[1],view.aimSeat.y);
  assert.ok(seat[1]>angledSeat[1]&&seat[1]-angledSeat[1]<.05);
  assert.equal(view.orbit,Math.PI);
  const angle=view.aim;
  view.adjustAim(NaN);assert.equal(view.aim,angle);
  view.world.running=true;view.adjustAim(.3);assert.equal(view.aim,angle);
  view.world.running=false;view.stance=false;view.adjustAim(.3);assert.equal(view.aim,angle);
 }
});

test('Long straight shots raise the eye without moving the aim seat or short-shot view',()=>{
 for(const mode of ['nine','eight','snooker']){
  const world=new World(mode);
  const [cue,target]=world.balls;
  world.balls=[cue,target];
  Object.assign(cue,{x:-world.c.length/2+.18,y:0});
  Object.assign(target,{x:cue.x+.45,y:0});
  const view=Object.assign(Object.create(BilliardScene.prototype),{
   world,c:world.c,stance:true,aim:0,aimBase:0,aimSeat:new Vector3(cue.x-.7,.32,0)
  });
  const near=view.desiredCamera();
  assert.ok(Math.abs(near.y-.365)<1e-8);
  target.x=world.c.length/2-.18;
  const far=view.desiredCamera();
  assert.ok(far.y-near.y>.10,mode);
  assert.ok(far.y<=.505+1e-8);
  assert.deepEqual([far.x,far.z],[near.x,near.z]);
 }
});

test('The cue keeps aiming through the ball contact throughout the semicircle',()=>{
 const ball={id:0,x:-.7,y:.2,r:.028575,wx:0,wy:0,wz:0,potted:false};
 const view=Object.assign(Object.create(BilliardScene.prototype),{
  world:{balls:[ball],running:false},meshes:new Map([[0,{mesh:new Group(),shadow:new Group()}]]),phase:'play',stance:true,
  cue:new Group(),guides:new Group(),updateCamera(){},updateGuide(){}
 });
 for(const angle of [-Math.PI/2,-Math.PI/3,0,Math.PI/3,Math.PI/2])for(const sideSpin of [-.7,0,.7]){
  view.aim=angle;view.update(0,{power:.4,spin:{x:sideSpin,y:0}});
  const direction=new Vector3(1,0,0).applyEuler(view.cue.rotation);
  const length=Math.hypot(direction.x,direction.z);
  assert.ok(Math.abs(direction.x/length-Math.cos(angle))<1e-12);
  assert.ok(Math.abs(direction.z/length-Math.sin(angle))<1e-12);
  const lateral=-(view.cue.position.x-ball.x)*Math.sin(angle)+(view.cue.position.z-ball.y)*Math.cos(angle);
  assert.ok(Math.abs(lateral-sideSpin*ball.r*PLAYER_SPIN_LIMIT)<1e-12);
 }
});
