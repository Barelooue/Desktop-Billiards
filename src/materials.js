import * as T from 'three';

// Deterministic procedural assets: no downloads, and no texture shimmer between racks.
function noise(seed=21837){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function surface(w,h,paint){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;paint(canvas.getContext('2d'),w,h);return canvas;}
function texture(canvas,renderer,color=true){const t=new T.CanvasTexture(canvas);if(color)t.colorSpace=T.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;}
export function makeSurfaceLibrary(renderer){
 const wood=texture(surface(2048,512,(ctx,w,h)=>{
  const rng=noise(),pixels=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const grain=Math.sin(y*.34+Math.sin(x*.004)*1.4)+.48*Math.sin(y*1.12+x*.0013)+.18*Math.sin(y*3.7),n=grain*4.5+(rng()-.5)*5,i=(y*w+x)*4;
   pixels.data[i]=78+n;pixels.data[i+1]=48+n*.7;pixels.data[i+2]=29+n*.45;pixels.data[i+3]=255;
  }ctx.putImageData(pixels,0,0);
 }),renderer);wood.wrapS=wood.wrapT=T.RepeatWrapping;
 const maple=texture(surface(1024,512,(ctx,w,h)=>{const pixels=ctx.createImageData(w,h),rng=noise(19);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,n=Math.sin(x*.29+Math.sin(y*.009)*.7)*4+(rng()-.5)*5;pixels.data[i]=201+n;pixels.data[i+1]=170+n;pixels.data[i+2]=115+n;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);}),renderer);
 const fiber=texture(surface(512,512,(ctx,w,h)=>{
  const rng=noise(71),pixels=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=126+(rng()-.5)*34+Math.sin(x*1.8+y*.27)*7;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
 }),renderer,false);fiber.wrapS=fiber.wrapT=T.RepeatWrapping;
 const contact=texture(surface(128,128,(ctx,w)=>{const gradient=ctx.createRadialGradient(w/2,w/2,2,w/2,w/2,w/2);gradient.addColorStop(0,'rgba(0,0,0,.52)');gradient.addColorStop(.38,'rgba(0,0,0,.23)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,w);}),renderer);
 return {wood,maple,fiber,contact};
}
export function makeCloth(c,mode,renderer,fiber){
 const canvas=surface(2048,1024,(ctx,w,h)=>{
  ctx.fillStyle=c.cloth;ctx.fillRect(0,0,w,h);
  // Low-amplitude mottling, without the old coarse checkerboard grid.
  const pixels=ctx.getImageData(0,0,w,h),rng=noise(911);
  for(let i=0;i<pixels.data.length;i+=4){const n=(rng()-.5)*4;pixels.data[i]=pixels.data[i]*.86+n;pixels.data[i+1]=pixels.data[i+1]*.86+n;pixels.data[i+2]=pixels.data[i+2]*.86+n;}ctx.putImageData(pixels,0,0);
  ctx.strokeStyle='#dbe9d24a';ctx.fillStyle='#e9f3db90';ctx.lineWidth=1.6;
  if(mode==='snooker'){const bx=.737/c.length*w;ctx.beginPath();ctx.moveTo(bx,0);ctx.lineTo(bx,h);ctx.stroke();ctx.beginPath();ctx.ellipse(bx,h/2,.292/c.length*w,.292/c.width*h,0,Math.PI/2,Math.PI*1.5);ctx.stroke();}
  // Pool tables have spots, not a permanent dashed line across the cloth.
  for(const x of [.25,.5,.75]){ctx.beginPath();ctx.arc(w*x,h/2,2.5,0,Math.PI*2);ctx.fill();}
 });
 const map=texture(canvas,renderer),bump=fiber.clone();bump.repeat.set(c.length*10,c.width*10);bump.needsUpdate=true;
 return new T.MeshPhysicalMaterial({map,bumpMap:bump,bumpScale:.00018,roughness:.94,sheen:.4,sheenRoughness:.95,sheenColor:0x719b84,side:T.DoubleSide,envMapIntensity:.3});
}
export function studioEnvironment(renderer){
 const studio=new T.Scene();studio.background=new T.Color(.055,.068,.061);
 const panel=(x,y,z,w,h,brightness)=>{const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(brightness,brightness*.97,brightness*.91),side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.lookAt(0,0,0);studio.add(mesh);};
 // Three overhead strip lights plus large, softer wall reflections.
 for(const x of [-1.1,0,1.1])panel(x,2.3,.10,.62,1.15,9);
 panel(-3,1.3,1,1.0,2.4,2.1);panel(2.8,1.5,-1,1.1,2.0,1.4);
 const floor=new T.Mesh(new T.PlaneGeometry(12,12),new T.MeshBasicMaterial({color:0x11271e,side:T.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-1;studio.add(floor);
 const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromScene(studio,.015,.05,30,{size:512});
 studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();return target;
}
