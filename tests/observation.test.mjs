import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {walkPosition,observationFraming,observationPose,OBSERVATION_HEIGHT} from '../src/observation.js';
import {MODES} from '../src/physics.js';

test('Walking covers all four sides, wraps in either direction and stays outside the rails',()=>{
 const c=MODES.nine,margin=2,p=walkPosition(c,.73,margin);
 for(const turns of [-3,-1,1,4]){const q=walkPosition(c,.73+turns*Math.PI*2,margin);assert.ok(Math.hypot(p.x-q.x,p.z-q.z)<1e-12);}
 const quarters=[0,1,2,3].map(i=>walkPosition(c,i*Math.PI/2,margin));
 assert.ok(quarters[0].x>0&&quarters[1].z>0&&quarters[2].x<0&&quarters[3].z<0);
 let previous=walkPosition(c,0,margin);const distances=[];
 for(let i=1;i<=720;i++){const p=walkPosition(c,i/720*Math.PI*2,margin);assert.ok(Math.abs(p.x)>c.length/2||Math.abs(p.z)>c.width/2);distances.push(Math.hypot(p.x-previous.x,p.z-previous.z));previous=p;}
 assert.ok(Math.max(...distances)/Math.min(...distances)<1.001,'Constant walking speed across corners');
});
test('Standing lens stays moderate and independent of the walking position',()=>{
 for(const aspect of [32/9,16/9,4/3,9/16]){
  const framing=observationFraming(aspect);
  const horizontal=2*Math.atan(Math.tan(framing.fov*Math.PI/360)*aspect)*180/Math.PI;
  assert.ok(framing.fov>=48&&framing.fov<=54&&horizontal<116);
  assert.equal(framing.padding,.82);
  for(const c of Object.values(MODES))for(let i=0;i<180;i++){
   const p=walkPosition(c,i/180*Math.PI*2,framing.padding);
   const dx=Math.max(0,Math.abs(p.x)-c.length/2-.18),dz=Math.max(0,Math.abs(p.z)-c.width/2-.18);
   assert.ok(Math.abs(Math.hypot(dx,dz)-framing.padding)<1e-12,'Same distance to the outer rail along sides and corners');
  }
 }
});

test('The complete table fits at every standing position, including the near rail',()=>{
 for(const c of Object.values(MODES))for(const aspect of [32/9,16/9,4/3,9/16])for(const height of Object.values(OBSERVATION_HEIGHT)){
  const framing=observationFraming(aspect),camera=new PerspectiveCamera(framing.fov,aspect,.01,30);
  const L=c.length/2+.18,W=c.width/2+.18;
  const corners=[[-L,-W],[-L,W],[L,-W],[L,W]];
  for(let i=0;i<360;i++){
   const phase=i/360*Math.PI*2;
   const p=observationPose(c,phase,height,aspect,framing);
   camera.position.set(p.x,height,p.z);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
   for(const [x,z] of corners)for(const y of [0,.065]){
    const point=new Vector3(x,y,z).project(camera);
    assert.ok(Math.abs(point.x)<.88&&Math.abs(point.y)<.70&&Math.abs(point.z)<1,`${c.en}, ${aspect}, ${phase}`);
   }
  }
 }
});
