const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('desktopBilliards',{
 resetTutorial:process.argv.includes('--reset-tutorial'),
 postMessage(message){
  if(message?.type==='exit'||message?.type==='toggleFloating')ipcRenderer.send('billiards:window',message.type);
 },
 onMessage(listener){
  ipcRenderer.on('billiards:state',(_,data)=>listener({data}));
 },
 readCalendar(source){return ipcRenderer.invoke('billiards:calendar',source);}
});
