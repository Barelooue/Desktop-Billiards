export const STORAGE_KEY='desktop-billiards.keybindings.v1';
export const ACTIONS=[
 ['settings','设置 / 暂停','F1','通用','打开设置时暂停球台；也可点击右上角设置按钮。'],
 ['start','开始球局','Enter','球局','在开局界面开始当前玩法。'],
 ['modeNine','选择中式九球','Digit1','球局','仅在开局界面切换玩法。'],
 ['modeEight','选择中式八球','Digit2','球局','仅在开局界面切换玩法。'],
 ['modeSnooker','选择斯诺克','Digit3','球局','仅在开局界面切换玩法。'],
 ['newRack','返回开局界面','KeyN','球局','保存当前未完成球局，返回主页重新选择玩法。'],
 ['quit','返回上一级 / 退出','Escape','通用','Esc 在设置中返回球台，在历史球局或结算弹窗中返回主页，在对局中保存并返回主页，在主页关闭程序；未完成球局自动保存。此按键固定。'],
 ['observe','起身观察','KeyO','视角','起身后近距离观察球台，通过绕台查看不同区域；成功出杆立即自动起身，起身也会取消未完成的拉杆。'],
 ['aim','俯身击球','Space','视角','确认母球摆位后俯身，球杆可绕母球向左右各转 90°，合计半圈。'],
 ['walkLeft','向左绕台','KeyA','视角','按住沿固定球台向左行走，可连续绕完整一圈；球运动时也可走。'],
 ['walkRight','向右绕台','KeyD','视角','按住沿固定球台向右行走，可连续绕完整一圈；俯身时不能绕台。'],
 ['heightUp','提高观察高度','PageUp','视角','按住调整站姿高度；俯身时禁用。'],
 ['heightDown','降低观察高度','PageDown','视角','按住调整站姿高度；俯身时禁用。'],
 ['adjustLeft','向左调杆 / 母球左移','ArrowLeft','击球与摆位','俯身时向左转杆，配合精细调节键微调；摆位时按球台示意图向左移动母球。'],
 ['adjustRight','向右调杆 / 母球右移','ArrowRight','击球与摆位','俯身时向右转杆，配合精细调节键微调；摆位时按球台示意图向右移动母球。'],
 ['placeUp','母球上移','ArrowUp','击球与摆位','只在母球摆位状态生效，方向对应摆位图。'],
 ['placeDown','母球下移','ArrowDown','击球与摆位','只在母球摆位状态生效；不能越界或压住其他球。'],
 ['place','进入母球摆位','KeyB','击球与摆位','仅有摆球权且球已停稳时可进入。'],
 ['confirm','确认母球摆位','KeyV','击球与摆位','确认当前位置；出杆前仍可重新进入摆位。'],
 ['precision','精细调节','Shift','击球与摆位','按住时减慢调杆、摆位、加塞和观察高度的调整。'],
 ['shoot','蓄力 / 出杆','KeyF','击球与摆位','俯身后按住蓄力、松开出杆；也可保留鼠标下拉出杆。'],
 ['cancelShot','取消蓄力','KeyC','击球与摆位','取消当前拉杆；松开出杆键不会击球。'],
 ['spinUp','击打点上移 · 高杆','KeyW','击打点','观察或俯身时按住调整；每杆结束自动归中。'],
 ['spinDown','击打点下移 · 低杆','KeyS','击打点','观察或俯身时按住调整；每杆结束自动归中。'],
 ['spinLeft','击打点左移 · 左塞','KeyZ','击打点','观察或俯身时按住调整，击打点限制在安全区内。'],
 ['spinRight','击打点右移 · 右塞','KeyX','击打点','观察或俯身时按住调整；不改变站位。'],
 ['spinReset','击打点归中','KeyR','击打点','清除高低杆和左右加塞。'],
 ['guide','切换引导线','KeyG','通用','开关首次接触引导线。'],
 ['sound','切换音效','KeyM','通用','开启或关闭击球音效。']
].map(([id,label,key,group,description])=>({id,label,key,group,description}));
export const DEFAULT_BINDINGS=Object.freeze(Object.fromEntries(ACTIONS.map(a=>[a.id,a.key])));
const CONFIG_VERSION=3;
const RETIRED_BINDINGS=['cross','spider','returnRest'];
const labels={Escape:'Esc',Enter:'Enter',Space:'空格',Shift:'Shift',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',PageUp:'Page Up',PageDown:'Page Down',Backspace:'Backspace',Delete:'Delete',Insert:'Insert',Home:'Home',End:'End',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
export function canonicalKey(code){if(code==='ShiftLeft'||code==='ShiftRight')return 'Shift';if(code==='NumpadEnter')return 'Enter';if(/^Numpad[0-9]$/.test(code))return 'Digit'+code.slice(-1);return code;}
export function keyLabel(code){return labels[code]||code.replace(/^Key|^Digit/,'');}
export function keyFromEvent(e){if(e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return null;return canonicalKey(e.code);}
export function keyError(code,action){
 if(action==='quit'&&code!=='Escape')return '返回上一级固定使用 Esc，不能修改。';
 if(code==='Escape'&&action!=='quit')return 'Esc 固定用于返回上一级，不能分配给其他操作。';
 if(['Tab','F4','F5','F11','F12'].includes(code))return `${keyLabel(code)} 是界面或系统保留键。`;
 if(!Object.hasOwn(labels,code)&&!/^Key[A-Z]$|^Digit[0-9]$|^F([1-9]|10)$/.test(code))return '请使用单个字母、数字、方向键或功能键；不支持 Ctrl / Alt / Win 组合键。';
 return null;
}
export function validateBindings(bindings){
 if(!bindings||typeof bindings!=='object'||Object.keys(bindings).length!==ACTIONS.length)return '按键配置不完整。';
 const used=new Map();
 for(const a of ACTIONS){const code=bindings[a.id];if(typeof code!=='string'||code!==canonicalKey(code))return '按键配置格式无效。';const error=keyError(code,a.id);if(error)return error;if(used.has(code))return `${keyLabel(code)} 已用于「${used.get(code)}」，不能重复。`;used.set(code,a.label);}
 return null;
}
export class KeyBindings{
 constructor(storage){this.storage=storage;this.bindings={...DEFAULT_BINDINGS};this.warning='';
  try{const raw=storage?.getItem(STORAGE_KEY);if(raw){
   const data=JSON.parse(raw);
   let migrated=false;
   if([1,2].includes(data.version)&&data.bindings&&typeof data.bindings==='object'){
    for(const id of RETIRED_BINDINGS){
     if(Object.hasOwn(data.bindings,id)){delete data.bindings[id];migrated=true;}
    }
   }
   // Upgrade the former Esc=settings / configurable quit layout, preserving other remaps.
   if(data.version===1&&data.bindings&&Object.keys(data.bindings).length===ACTIONS.length){
    const previous=data.bindings.quit;data.bindings.quit='Escape';
    if(data.bindings.settings==='Escape'){
     const used=new Set(Object.entries(data.bindings).filter(([id])=>id!=='settings').map(([,code])=>code));
     data.bindings.settings=['F1',previous,'F2','F3','F6','F7','F8','F9','F10',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c=>'Key'+c)].find(code=>typeof code==='string'&&!keyError(code,'settings')&&!used.has(code));
    }
   }
   const error=[1,2,CONFIG_VERSION].includes(data.version)?validateBindings(data.bindings):'配置版本无效。';
   if(error)this.warning='保存的按键配置无效，已恢复默认：'+error;
   else{
    this.bindings={...data.bindings};
    if(data.version<CONFIG_VERSION){
     const previous=this.bindings.settings;
     const owner=this.action(DEFAULT_BINDINGS.settings);
     if(owner&&owner!=='settings')this.bindings[owner]=previous;
     this.bindings.settings=DEFAULT_BINDINGS.settings;
    }
    if(data.version<CONFIG_VERSION||migrated)this.save();
   }
  }}catch{this.warning='无法读取按键配置，本次使用默认按键。';}
 }
 action(code){code=canonicalKey(code);return ACTIONS.find(a=>this.bindings[a.id]===code)?.id||null;}
 save(){try{this.storage?.setItem(STORAGE_KEY,JSON.stringify({version:CONFIG_VERSION,bindings:this.bindings}));return !!this.storage;}catch{return false;}}
 assign(id,code){const action=ACTIONS.find(a=>a.id===id);if(!action)return {ok:false,error:'未知操作。'};if(id==='quit')return {ok:false,error:'返回上一级固定使用 Esc，不能修改。'};code=canonicalKey(code);const occupied=ACTIONS.find(a=>a.id!==id&&this.bindings[a.id]===code);if(occupied)return {ok:false,error:`${keyLabel(code)} 已用于「${occupied.label}」，不能重复。`};const proposed={...this.bindings,[id]:code},error=validateBindings(proposed);if(error)return {ok:false,error};this.bindings=proposed;return {ok:true,saved:this.save()};}
 reset(){this.bindings={...DEFAULT_BINDINGS};return this.save();}
}
