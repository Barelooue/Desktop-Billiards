import {ACTIONS,keyLabel,keyFromEvent} from './keybindings.js';
export class SettingsUI{
 constructor(dialog,bindings,{close,changed}){this.dialog=dialog;this.bindings=bindings;this.close=close;this.changed=changed;this.status=dialog.querySelector('#binding-status');
  const list=dialog.querySelector('#binding-list');let group='';
  for(const category of ['通用','球局','视角','击球与摆位','击打点'])for(const action of ACTIONS.filter(a=>a.group===category)){
   if(group!==category){const h=document.createElement('h3');h.textContent=category;list.append(h);group=category;}
   const row=document.createElement('label');row.className='binding-row';const text=document.createElement('span'),title=document.createElement('b'),description=document.createElement('small'),input=document.createElement('input');
   title.textContent=action.label;description.textContent=action.description;text.append(title,description);input.type='text';input.readOnly=true;input.dataset.binding=action.id;input.setAttribute('aria-label',action.label+'快捷键');input.disabled=action.id==='quit';input.addEventListener('focus',()=>{input.select();this.message('按下新的按键。Tab 切换条目；Esc 返回上一级。');});row.append(text,input);list.append(row);
  }
  dialog.addEventListener('keydown',e=>{
   if(!dialog.open)return;
   if(e.ctrlKey&&e.code==='Backspace'){e.preventDefault();e.stopPropagation();const saved=bindings.reset();this.refresh();changed();this.message(saved?'已恢复默认按键并保存。':'已恢复默认按键，本次无法保存到本机。');return;}
   const id=e.target.dataset?.binding;
   if(id){
    if(e.code==='Tab')return;
    e.preventDefault();e.stopPropagation();if(e.repeat)return;
    const code=keyFromEvent(e),result=code?bindings.assign(id,code):{ok:false,error:'请使用单个按键，不支持 Ctrl / Alt / Win 组合键。'};
    if(!result.ok){e.target.setAttribute('aria-invalid','true');this.message(result.error,true);return;}
    e.target.removeAttribute('aria-invalid');this.refresh();changed();this.dialog.focus({preventScroll:true});this.message(`「${ACTIONS.find(a=>a.id===id).label}」已改为 ${keyLabel(code)}${result.saved?'，已保存。':'；本次生效，但无法保存到本机。'}`);return;
   }
   if(bindings.action(keyFromEvent(e))==='settings'){e.preventDefault();e.stopPropagation();if(!e.repeat)close();}
  });
  dialog.addEventListener('cancel',e=>e.preventDefault());this.refresh();if(bindings.warning)this.message(bindings.warning,true);
 }
 message(text,error=false){this.status.textContent=text;this.status.classList.toggle('error',error);}
 refresh(){for(const input of this.dialog.querySelectorAll('[data-binding]')){input.value=keyLabel(this.bindings.bindings[input.dataset.binding]);input.removeAttribute('aria-invalid');}const key=this.bindings.bindings.settings;this.dialog.querySelector('#settings-close-hint').textContent=`Esc 返回上一级 · ${keyLabel(key)} 也可关闭设置`;}
 open(){this.refresh();this.dialog.showModal();this.dialog.focus();this.dialog.scrollTop=0;this.message(this.bindings.warning||'除 Esc 返回外，按键可自定义；冲突时会保留原设置。',!!this.bindings.warning);}
}
