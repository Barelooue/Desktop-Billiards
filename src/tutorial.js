const STORAGE_KEY='desktop-billiards.tutorial.v1';
const pages=[
 {image:'start',title:'选一种球，开始练习',description:'主页可选九球、中式八球、斯诺克。第一次玩，先选「单人练习」，再点「开始游戏」。'},
 {image:'placement',title:'摆好母球，绕台找角度',description:'点击高亮台面或摆位图，选好位置后点「确认摆位」。按 A / D 或右键拖动绕台，滚轮调整视角高度。'},
 {image:'shot',title:'俯身瞄准，蓄力出杆',description:'按空格俯身，移动鼠标或按 ← / → 瞄准。按住左键向下拉杆，或者按住 F，松手击球。左下角可选择击球点和加塞。'},
 {image:'coach',title:'用指导看懂球路',description:'单人练习中点击「指导」，从正上方看进攻、走位或碰库解球路线。可以应用建议击球点，也可以点「按指导出杆」看一遍。'},
 {image:'events',title:'挑战电脑，报名比赛',description:'选择「人机对战」后，可从四档难度中挑选对手。赛事可用游戏资金报名，按赛制打完本轮再晋级，奖金在比赛结束后结算。'},
 {image:'showcase',title:'高手如云，看到机会就接管',description:'观看两名高档电脑按赛事规则对打。点「接管比赛」选择甲方或乙方，也可以把这一方交还电脑，继续观赛。'},
 {image:'history',title:'保存进度，下次继续',description:'单人练习和普通人机对战按 Esc 返回主页时会保存，可在「历史球局」续玩。按 F1 进入设置，可调整按键、开启悬浮窗或重看引导。'}
];

export class Tutorial {
 constructor(dialog,storage){
  this.dialog=dialog;
  this.storage=storage;
  this.image=dialog.querySelector('img');
  this.title=dialog.querySelector('h3');
  this.description=dialog.querySelector('#tutorial-description');
  this.counter=dialog.querySelector('#tutorial-counter');
  this.previous=dialog.querySelector('#tutorial-prev');
  this.next=dialog.querySelector('#tutorial-next');
  this.finish=dialog.querySelector('#tutorial-finish');
  this.closeButton=dialog.querySelector('#tutorial-close');
  this.previous.addEventListener('click',()=>this.step(-1));
  this.next.addEventListener('click',()=>this.step(1));
  this.finish.addEventListener('click',()=>this.close());
  this.closeButton.addEventListener('click',()=>this.close());
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
  dialog.addEventListener('keydown',event=>{
   if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
   event.preventDefault();
   event.stopPropagation();
   this.step(event.key==='ArrowLeft'?-1:1);
  });
 }
 openOnFirstRun(reset=false){
  try{
   if(reset)this.storage?.removeItem(STORAGE_KEY);
   else if(this.storage?.getItem(STORAGE_KEY)==='seen')return;
  }catch{}
  this.open();
 }
 open(){
  if(this.dialog.open)return;
  this.index=0;
  this.render();
  this.dialog.showModal();
  this.next.focus();
 }
 close(){
  try{this.storage?.setItem(STORAGE_KEY,'seen');}catch{}
  this.dialog.close();
 }
 step(amount){
  const index=this.index+amount;
  if(index<0||index>=pages.length)return;
  this.index=index;
  this.render();
  if(document.activeElement===this.next&&this.next.disabled)this.finish.focus();
  if(document.activeElement===this.previous&&this.previous.disabled)this.next.focus();
 }
 render(){
  const {image,title,description}=pages[this.index];
  this.image.src=`tutorial/${image}.jpg`;
  this.image.alt=title+'的游戏截图';
  this.title.textContent=title;
  this.description.textContent=description;
  this.counter.textContent=`${this.index+1} / ${pages.length}`;
  this.previous.disabled=this.index===0;
  const last=this.index===pages.length-1;
  this.next.disabled=last;
  this.finish.textContent=last?'进入游戏':'跳过引导';
 }
}
