const {app,BrowserWindow,dialog,ipcMain,nativeImage,net,protocol,screen,session,shell}=require('electron');
const {join,resolve,sep}=require('node:path');
const {existsSync}=require('node:fs');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

const entry='billiards://game/index.html';
const bundledWeb=join(__dirname,'web');
const web=existsSync(join(bundledWeb,'index.html'))?bundledWeb:resolve(__dirname,'../release/web');
const externalHosts=new Set(['matchroompool.com','wpapool.com','www.wpapool.com','wpbsa.com','www.wpbsa.com',
 'wst.tv','www.wst.tv','worldnineballtour.com','web.archive.org']);
const calendars=new Map([
 ['wnt','https://worldnineballtour.com/schedule/'],
 ['wpa','https://wpapool.com/?mec-ical-feed=1'],
 ['wpaevents','https://wpapool.com/events/'],
 ['heyball','https://wpapool.com/wp-json/wp/v2/posts?categories=77&per_page=30&_fields=date,link,title,excerpt'],
 ['wpbsa','https://www.wpbsa.com/events-list/']
]);
let win,floating=false,changing=false,closing=false,closeReady=false,floatingBounds;

app.setName('Desktop Billiards');
app.setPath('userData',join(app.getPath('appData'),'Desktop Billiards'));
protocol.registerSchemesAsPrivileged([{scheme:'billiards',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);

function trusted(event){
 return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame?.url===entry;
}
function send(data){if(win&&!win.isDestroyed())win.webContents.send('billiards:state',data);}
function externalSource(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&externalHosts.has(url.hostname);
 }catch{return false;}
}
async function readCalendar(source){
 if(!calendars.has(source))return null;
 try{
  const response=await net.fetch(calendars.get(source),{redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!response.ok||!response.body)return null;
  let bytes=0;
  const chunks=[];
  for await(const chunk of response.body){
   bytes+=chunk.byteLength;
   if(bytes>1500000)return null;
   chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
 }catch{return null;}
}
async function wallpaper(){
 if(process.platform!=='darwin')return null;
 try{
  const {stdout}=await promisify(execFile)('/usr/bin/osascript',
   ['-l','JavaScript','-e','ObjC.import("AppKit"); var url=$.NSWorkspace.sharedWorkspace.desktopImageURLForScreen($.NSScreen.mainScreen); ObjC.unwrap(url.path);'],
   {timeout:2500});
  const image=nativeImage.createFromPath(stdout.trim());
  if(!image.isEmpty())return 'data:image/jpeg;base64,'+image.resize({width:Math.min(960,image.getSize().width)}).toJPEG(80).toString('base64');
 }catch{}
 return null;
}
function toggleFloating(){
 if(changing||closing)return;
 changing=true;
 if(floating){
  floatingBounds=win.getBounds();
  floating=false;
  win.setAlwaysOnTop(false);
  win.setAspectRatio(0);
  win.setMinimumSize(0,0);
  win.setMaximizable(true);
  win.setMinimizable(true);
  win.once('enter-full-screen',()=>{changing=false;send({type:'windowMode',floating});});
  win.setFullScreen(true);
  return;
 }
 const enterFloating=()=>{
  floating=true;
  const area=screen.getDisplayMatching(win.getBounds()).workArea;
  win.setMaximizable(false);
  win.setMinimizable(false);
  const extra=frameInsets;
  const max=Math.max(1,Math.min(area.width-extra.width,Math.floor((area.height-extra.height)*16/9)));
  const min=Math.min(800,max);
  const width=Math.max(min,Math.min(max,(floatingBounds?.width??Math.round(max*.78)+extra.width)-extra.width));
  const height=Math.round(width*9/16);
  win.setMinimumSize(min+extra.width,Math.round(min*9/16)+extra.height);
  const x=floatingBounds?.x??area.x+area.width-width-extra.width-20;
  const y=floatingBounds?.y??area.y+area.height-height-extra.height-20;
  win.setPosition(Math.max(area.x,Math.min(x,area.x+area.width-width-extra.width)),
   Math.max(area.y,Math.min(y,area.y+area.height-height-extra.height)));
  win.setContentSize(width,height);
  win.setAspectRatio(16/9,extra);
  win.setAlwaysOnTop(true,'floating');
  changing=false;
  send({type:'windowMode',floating});
 };
 if(win.isFullScreen()){win.once('leave-full-screen',enterFloating);win.setFullScreen(false);}
 else enterFloating();
}
let frameInsets;
function createWindow(){
 floating=false;changing=false;closing=false;closeReady=false;
 win=new BrowserWindow({show:false,backgroundColor:'#10201a',title:'一个人的台球 · Desktop Billiards',
  webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,
   backgroundThrottling:false,additionalArguments:process.argv.includes('--reset-tutorial')?['--reset-tutorial']:[]}});
 win.setMenuBarVisibility(false);
 const [width,height]=win.getSize(),[contentWidth,contentHeight]=win.getContentSize();
 frameInsets={width:width-contentWidth,height:height-contentHeight};
 win.webContents.setWindowOpenHandler(({url})=>{
  if(externalSource(url))void shell.openExternal(url).catch(()=>{});
  return {action:'deny'};
 });
 win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.on('will-attach-webview',event=>event.preventDefault());
 win.webContents.on('before-input-event',(event,input)=>{
  if(input.type==='keyDown'&&input.meta&&input.key?.toLowerCase()==='q'){
   event.preventDefault();win.close();
  }
 });
 win.on('blur',()=>{if(!floating&&!changing&&!closing)send({type:'pause'});});
 win.on('close',event=>{
  if(closeReady)return;
  event.preventDefault();
  if(closing)return;
  closing=true;
  const current=win;
  let timer;
  Promise.race([
   current.webContents.executeJavaScript('window.prepareBilliardsClose ? window.prepareBilliardsClose() : true'),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('存档响应超时')),5000);})
  ]).then(saved=>{
   if(saved!==true)return;
   closeReady=true;current.close();
  }).catch(()=>dialog.showMessageBox(current,{type:'warning',message:'存档尚未确认，请稍后重新关闭。'}))
   .finally(()=>{clearTimeout(timer);closing=false;});
 });
 win.on('closed',()=>{win=null;});
 const current=win;
 win.once('ready-to-show',()=>{current.setFullScreen(true);current.show();});
 win.webContents.once('did-finish-load',async()=>{
  const background=await wallpaper();
  if(background&&win===current)send({type:'desktop',payload:{wallpaper:background}});
 });
 win.loadURL(entry).catch(()=>{dialog.showErrorBox('无法启动球台','请确认应用已完整解压。');win?.destroy();});
}

if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(()=>{
  protocol.handle('billiards',request=>{
   const url=new URL(request.url);
   let path;
   try{path=resolve(web,'.'+decodeURIComponent(url.pathname));}catch{return new Response(null,{status:404});}
   if(url.hostname!=='game'||!path.startsWith(web+sep))return new Response(null,{status:404});
   return net.fetch(pathToFileURL(path).href);
  });
  session.defaultSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  ipcMain.on('billiards:window',(event,command)=>{
   if(!trusted(event))return;
   if(command==='exit')win.close();
   if(command==='toggleFloating')toggleFloating();
  });
  ipcMain.handle('billiards:calendar',(event,source)=>trusted(event)?readCalendar(source):null);
  createWindow();
 });
 app.on('activate',()=>{if(!win)createWindow();});
 app.on('window-all-closed',()=>app.quit());
}
