const TAU=Math.PI*2;

// An equal-distance loop around the fixed table, with straight sides and round corners.
export function walkPosition(c,phase,padding){
 const L=c.length/2+.18,W=c.width/2+.18,r=padding;
 const perimeter=4*(L+W)+TAU*r;
 let distance=((phase%TAU)+TAU)%TAU/TAU*perimeter;
 const straight=(length,x,z,dx,dz)=>{if(distance<=length)return {x:x+distance*dx,z:z+distance*dz};distance-=length;return null;};
 const corner=(x,z,angle)=>{const length=Math.PI*r/2;if(distance<=length){const a=angle+distance/r;return {x:x+Math.cos(a)*r,z:z+Math.sin(a)*r};}distance-=length;return null;};
 return straight(W,L+r,0,0,1)||corner(L,W,0)||straight(2*L,L,W+r,-1,0)||corner(-L,W,Math.PI/2)||straight(2*W,-L-r,W,0,-1)||corner(-L,-W,Math.PI)||straight(2*L,-L,-W-r,1,0)||corner(L,-W,Math.PI*1.5)||straight(W,L+r,-W,0,1)||{x:L+r,z:0};
}

// Coordinates are relative to the cloth: .95 m above a .775 m table puts
// the eyes 1.725 m above the implied floor. No floor or avatar is required.
export const OBSERVATION_HEIGHT={min:.85,max:1.1,default:.95};
const OBSERVATION_PADDING=.82;
export function observationFraming(aspect){
 // Keep enough vertical coverage for the near rail on ultrawide windows.
 const vertical=54*Math.PI/180,horizontal=86*Math.PI/180;
 return {padding:OBSERVATION_PADDING,fov:Math.max(48,Math.min(vertical,2*Math.atan(Math.tan(horizontal/2)/aspect))*180/Math.PI)};
}

export function observationPose(c,phase,height,aspect,framing=observationFraming(aspect)){
 const {x,z}=walkPosition(c,phase,framing.padding),distance=Math.hypot(x,z);
 const dx=x/distance,dz=z/distance,tan=Math.tan(framing.fov*Math.PI/360);
 const L=c.length/2+.18,W=c.width/2+.18;
 const corners=[[-L,-W],[-L,W],[L,-W],[L,W]];
 const fits=range=>{
  const pitch=Math.hypot(range,height);
  return corners.every(([px,pz])=>{
   const along=px*dx+pz*dz,across=px*dz-pz*dx;
   for(const y of [0,.065]){
    const depth=pitch-(along*range+y*height)/pitch;
    const vertical=(y*range-along*height)/pitch;
    if(depth<=0||Math.abs(across)>depth*tan*aspect*.87||Math.abs(vertical)>depth*tan*.69)return false;
   }
   return true;
  });
 };
 let near=distance,far=distance;
 while(!fits(far))far*=1.4;
 if(far>near)for(let i=0;i<16;i++){
  const mid=(near+far)/2;
  if(fits(mid))far=mid;else near=mid;
 }
 return {x:dx*far,z:dz*far};
}
