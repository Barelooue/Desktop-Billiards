import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,DEFAULT_BINDINGS,KeyBindings,STORAGE_KEY,validateBindings,keyFromEvent} from '../src/keybindings.js';
import {World} from '../src/physics.js';
import {keyboardPlacementStart} from '../src/placement.js';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};
test('Every action has a unique valid default',()=>{
 assert.equal(validateBindings(DEFAULT_BINDINGS),null);
 assert.equal(new Set(Object.values(DEFAULT_BINDINGS)).size,ACTIONS.length);
});
test('Duplicate assignment identifies the occupied action and preserves saved config',()=>{
 const storage=memory(),keys=new KeyBindings(storage);keys.save();const saved=storage.getItem(STORAGE_KEY);
 const result=keys.assign('walkLeft','KeyD');assert.equal(result.ok,false);assert.match(result.error,/向右绕台/);
 assert.equal(keys.bindings.walkLeft,'KeyA');assert.equal(storage.getItem(STORAGE_KEY),saved);
 assert.equal(keys.assign('walkLeft','Numpad1').ok,false);
 assert.equal(keys.assign('walkLeft','ShiftRight').ok,false);
});
test('Remaps survive reload, old keys release, and reset persists',()=>{
 const storage=memory(),keys=new KeyBindings(storage);
 assert.deepEqual(keys.assign('walkLeft','KeyQ'),{ok:true,saved:true});
 const reloaded=new KeyBindings(storage);assert.equal(reloaded.action('KeyQ'),'walkLeft');assert.equal(reloaded.action('KeyA'),null);
 assert.equal(reloaded.assign('settings','KeyH').ok,true);assert.equal(reloaded.assign('walkRight','Escape').ok,false);
 assert.equal(new KeyBindings(storage).bindings.settings,'KeyH');
 reloaded.reset();assert.deepEqual(new KeyBindings(storage).bindings,DEFAULT_BINDINGS);
});
test('Removing equipment shortcuts preserves custom bindings from previous releases',()=>{
 const storage=memory();
 storage.setItem(STORAGE_KEY,JSON.stringify({version:2,bindings:{
  ...DEFAULT_BINDINGS,walkLeft:'KeyQ',cross:'KeyJ',spider:'KeyK',returnRest:'KeyL'
 }}));
 const keys=new KeyBindings(storage);
 assert.equal(keys.warning,'');
 assert.equal(keys.action('KeyQ'),'walkLeft');
 assert.equal(keys.action('KeyJ'),null);
 assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).bindings,{...DEFAULT_BINDINGS,walkLeft:'KeyQ'});
});
test('Corrupt, incomplete or duplicate stored settings fall back safely',()=>{
 for(const value of ['{','null',JSON.stringify({version:4,bindings:DEFAULT_BINDINGS}),JSON.stringify({version:1,bindings:{}}),JSON.stringify({version:1,bindings:{...DEFAULT_BINDINGS,walkLeft:'KeyD'}})]){
  const storage=memory();storage.setItem(STORAGE_KEY,value);const keys=new KeyBindings(storage);
  assert.deepEqual(keys.bindings,DEFAULT_BINDINGS);assert.ok(keys.warning);
 }
});
test('Storage failure keeps session remap and reports unsaved state',()=>{
 const keys=new KeyBindings({getItem(){throw Error();},setItem(){throw Error();}});
 assert.ok(keys.warning);assert.deepEqual(keys.assign('walkLeft','KeyQ'),{ok:true,saved:false});assert.equal(keys.action('KeyQ'),'walkLeft');
});
test('Modifiers, IME and reserved keys cannot accidentally become bindings',()=>{
 const keys=new KeyBindings(memory());
 for(const code of ['Tab','F4','F5','F11','F12','ControlLeft','AltLeft','MetaLeft','Unidentified',undefined])assert.equal(keys.assign('walkLeft',code).ok,false);
 for(const modifier of ['ctrlKey','altKey','metaKey','isComposing'])assert.equal(keyFromEvent({code:'KeyA',[modifier]:true}),null);
 assert.equal(keyFromEvent({code:'ShiftRight'}),'Shift');
});
test('Keyboard can recover a scratched cue into every permitted zone',()=>{
 for(const mode of ['nine','eight','snooker'])for(const zone of ['head','d','table']){
  const w=new World(mode);w.cuePlacementZone=zone;Object.assign(w.balls[0],{x:99,y:99,potted:true});
  const p=keyboardPlacementStart(w);assert.ok(p);assert.equal(w.canPlaceCue(p.x,p.y),true);
  assert.equal(w.balls[0].potted,true,'Finding a point must not confirm or mutate placement');
  assert.equal(w.placeCue(p.x,p.y),true);
 }
});

test('Back is fixed to Esc, including loaded configuration and legacy migration',()=>{
 const storage=memory(),keys=new KeyBindings(storage);
 assert.equal(keys.assign('quit','KeyQ').ok,false);assert.equal(keys.assign('settings','Escape').ok,false);
 assert.equal(validateBindings({...DEFAULT_BINDINGS,quit:'F10'}),'返回上一级固定使用 Esc，不能修改。');
 storage.setItem(STORAGE_KEY,JSON.stringify({version:1,bindings:{...DEFAULT_BINDINGS,settings:'Escape',quit:'F10',walkLeft:'F1',shoot:'KeyT'}}));
 const migrated=new KeyBindings(storage);
 assert.equal(migrated.warning,'');assert.equal(migrated.action('Escape'),'quit');assert.equal(migrated.action('F1'),'settings');
 assert.equal(migrated.bindings.shoot,'KeyT');assert.equal(migrated.bindings.walkLeft,'F10');
 assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version,3);assert.deepEqual(new KeyBindings(storage).bindings,migrated.bindings);
});

test('Saved settings return to F1 and swap with the action already assigned to it',()=>{
 for(const walkLeft of ['KeyA','F1']){
  const storage=memory();
  storage.setItem(STORAGE_KEY,JSON.stringify({version:2,bindings:{...DEFAULT_BINDINGS,settings:'KeyH',walkLeft,shoot:'KeyT'}}));
  const keys=new KeyBindings(storage);
  assert.equal(keys.action('F1'),'settings');
  assert.equal(keys.bindings.walkLeft,walkLeft==='F1'?'KeyH':'KeyA');
  assert.equal(keys.bindings.shoot,'KeyT');
  assert.deepEqual(new KeyBindings(storage).bindings,keys.bindings);
 }
});
