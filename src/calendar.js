const CACHE='desktop-billiards.calendar.v1';
const SOURCES={
 wnt:'https://worldnineballtour.com/schedule/',
 wpa:'https://wpapool.com/?mec-ical-feed=1',
 heyball:'https://wpapool.com/wp-json/wp/v2/posts?categories=77&per_page=30&_fields=date,link,title,excerpt',
 wpaevents:'https://wpapool.com/events/',
 wpbsa:'https://www.wpbsa.com/events-list/',
 seasons:'https://seasons.snooker.web.gc.wstservices.co.uk/v2'
};
const TOUR='https://tournaments.snooker.web.gc.wstservices.co.uk/v2/?season=';
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const LABELS={wnt:'WNT',wpa:'WPA',wpaevents:'WPA 赛事',heyball:'WPA 公告',wst:'WST',wpbsa:'WPBSA'};
const LINKS=new Set(['worldnineballtour.com','wpapool.com','www.wst.tv','www.wpbsa.com','wpbsa.com']);
const normalize=value=>value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');
export const calendarToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);

function officialLink(value,fallback){
 try{
  const url=new URL(value||fallback,fallback??undefined);
  if(url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&LINKS.has(url.hostname))return url.href;
 }catch{}
 return fallback;
}
function plain(value){
 const doc=new DOMParser().parseFromString(String(value??''),'text/html');
 return doc.body.textContent.trim().replace(/\s+/g,' ');
}
function date(year,month,day){
 if(month<0||day<1||day>31)return null;
 const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 const time=new Date(iso+'T00:00:00Z');
 return Number.isFinite(+time)&&time.toISOString().startsWith(iso)?iso:null;
}
const month=value=>MONTHS.findIndex(name=>name.startsWith(value.toLowerCase()));
function dateRange(start,end){return start&&end&&end>=start?{start,end}:null;}

export function parseWnt(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const cards=[...doc.querySelectorAll('.card-event[data-type]')];
 if(!cards.length)throw Error('WNT schedule is missing');
 return cards.flatMap(card=>{
  if(!['major','blue-ribbon','ranking','invitational','non-ranking'].includes(card.dataset.type)||
   /cancelled|canceled/i.test(card.dataset.status??''))return [];
  const name=card.querySelector('.title')?.textContent.trim();
  const label=card.querySelector('.support-content strong')?.textContent.trim();
  const m=/^([A-Za-z]+)\s+(\d{1,2})(?:\s*[-–—]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}))?\s+(\d{4})$/.exec(label??'');
  if(!name||!m)return [];
  const first=month(m[1]),last=m[3]?month(m[3]):first;
  const dates=dateRange(date(+m[5]-(last<first?1:0),first,+m[2]),date(+m[5],last,+(m[4]??m[2])));
  if(!dates)return [];
  const fund=/\$([\d,]+)/.exec(card.querySelector('.prize-fund')?.textContent??'');
  return [{...dates,name,mode:'nine',source:'wnt',kind:card.dataset.type,
   location:card.querySelector('.venue')?.textContent.trim()??'',
   url:officialLink(card.querySelector('a')?.getAttribute('href'),SOURCES.wnt),
   prizeFund:fund?Number(fund[1].replaceAll(',','')):null}];
 });
}

export function parseWpa(ics){
 if(!ics.includes('BEGIN:VCALENDAR'))throw Error('WPA calendar is missing');
 return [...ics.replace(/\r?\n[ \t]/g,'').matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)].flatMap(([,block])=>{
  const fields={};
  for(const line of block.split(/\r?\n/)){
   const m=/^([A-Z-]+)(?:;[^:]*)?:(.*)$/.exec(line);
   if(m)fields[m[1]]=m[2];
  }
  const name=plain((fields.SUMMARY??'').replace(/\\([,;\\])/g,'$1'));
  if(!name||fields.STATUS==='CANCELLED')return [];
  const mode=/hey\s*ball/i.test(name+' '+fields.CATEGORIES)?'eight':/\b(?:9[- ]?ball|nine[- ]?ball)\b/i.test(name)?'nine':null;
  if(!mode)return [];
  const start=fields.DTSTART?.slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  let end=fields.DTEND?.slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')??start;
  if(!ISO.test(start??'')||!ISO.test(end??''))return [];
  // DATE ends and midnight ends are exclusive in the calendar feed.
  if(end>start&&/^\d{8}(?:T000000Z?)?$/.test(fields.DTEND??'')){
   end=new Date(Date.parse(end+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  }
  const dates=dateRange(start,end);
  return dates?[{...dates,name,mode,source:'wpa',location:plain(fields.LOCATION),
   url:officialLink(fields.URL,'https://wpapool.com/calendar/')}]:[];
 });
}

export function parseWpaEvents(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const events=[];
 for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){
  try{
   const data=JSON.parse(script.textContent);
   const entries=Array.isArray(data)?data:data['@graph']??[data];
   for(const item of entries){
    if(item['@type']!=='Event'||typeof item.name!=='string'||String(item.eventStatus).endsWith('EventCancelled'))continue;
    const name=plain(item.name);
    const mode=/hey\s*ball/i.test(name)?'eight':/\b(?:9[- ]?ball|nine[- ]?ball)\b/i.test(name)?'nine':null;
    const start=item.startDate?.slice(0,10),end=item.endDate?.slice(0,10)??start;
    if(mode&&ISO.test(start??'')&&ISO.test(end??'')&&end>=start)events.push({name,start,end,mode,source:'wpaevents',
     location:plain(item.location?.name),url:officialLink(item.url,SOURCES.wpaevents)});
   }
  }catch{}
 }
 if(!doc.querySelector('.mec-event-title')&&!events.length)throw Error('WPA events are missing');
 return events;
}

export function parseWst(payload){
 if(!Array.isArray(payload?.data))throw Error('WST tournaments are missing');
 return payload.data.flatMap(({attributes:a})=>{
  if(!a?.name||/\bqualifiers?\b/i.test(a.name))return [];
  const start=a.customStartDate||a.startDate,end=a.customEndDate||a.endDate||start;
  if(!ISO.test(start??'')||!ISO.test(end??'')||end<start)return [];
  return [{name:a.name,start,end,mode:'snooker',source:'wst',
   location:[a.venue,a.city,a.country].filter(Boolean).join(' · '),
   url:officialLink(a.informationPage,'https://www.wst.tv/tournaments/')}];
 });
}

export function parseWpbsa(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const nodes=[...doc.querySelectorAll('.shortcodefield h3,.row.upcoming-events')];
 if(!nodes.some(node=>node.matches('.upcoming-events')))throw Error('WPBSA calendar is missing');
 let year;
 const events=[];
 for(const node of nodes){
  if(node.tagName==='H3'){
   const value=node.textContent.trim();
   if(/^20\d\d$/.test(value))year=+value;
   continue;
  }
  if(!year||node.matches('.billiards'))continue;
  const name=node.querySelector('.the-tou')?.textContent.trim();
  if(!name||/\bqualifiers?\b/i.test(name))continue;
  const m=/^(\d{1,2})\s*([A-Za-z]+)?(?:\s*[-–—]\s*(\d{1,2})\s*)?([A-Za-z]+)$/.exec(node.querySelector('.the-mon')?.textContent.trim()??'');
  if(!m)continue;
  const first=month(m[2]??m[4]),last=month(m[4]);
  const dates=dateRange(date(year,first,+m[1]),date(year+(last<first?1:0),last,+(m[3]??m[1])));
  if(dates)events.push({...dates,name,mode:'snooker',source:'wpbsa',
   location:node.querySelector('.the-ven')?.textContent.trim()??'',
   url:officialLink(node.querySelector('.the-tou a')?.getAttribute('href'),SOURCES.wpbsa)});
 }
 return events;
}

export function parseHeyballNews(posts){
 if(!Array.isArray(posts))throw Error('WPA news is missing');
 return posts.flatMap(post=>{
  const name=plain(post.title?.rendered);
  const published=post.date?.slice(0,10);
  if(!name||!ISO.test(published??'')||!/heyball|huacai world open/i.test(name)||!/open|champion|masters|cup|tour/i.test(name))return [];
  return [{name,published,mode:'eight',source:'heyball',url:officialLink(post.link,'https://wpapool.com/events/')}];
 });
}

function validEvent(event){
 return event&&typeof event.name==='string'&&typeof event.url==='string'&&
  Object.hasOwn(LABELS,event.source)&&['nine','eight','snooker'].includes(event.mode)&&
  (event.start?ISO.test(event.start)&&ISO.test(event.end):ISO.test(event.published))&&
  officialLink(event.url,null)===event.url;
}

function eventIdentity(event){
 const path=new URL(event.url).pathname;
 const key=path==='/'||path==='/calendar/'||path==='/events-list/'||path==='/tournaments/'?normalize(event.name):path.replace(/\/$/,'');
 return [event.mode,event.start?.slice(0,4)??event.published,key].join(':');
}
export function calendarStatus(event,today=calendarToday()){
 if(!event.start)return '赛事公告';
 const next=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 if(event.start===next)return '明天开赛';
 if(event.start>today)return '即将开赛';
 if(event.end>=today)return '进行中';
 return '已结束';
}
export const calendarSource=event=>LABELS[event.source];

export function nativeCalendarFetch(source){
 const host=globalThis.chrome?.webview;
 if(!host)return fetch(SOURCES[source],{signal:AbortSignal.timeout(7000)}).then(response=>{
  if(!response.ok)throw Error('Calendar request failed');
  return response.text();
 });
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID();
  const finish=(value)=>{
   clearTimeout(timer);
   host.removeEventListener('message',onMessage);
   if(typeof value==='string')resolve(value);else reject(Error('Calendar source unavailable'));
  };
  const onMessage=({data})=>{if(data.type==='calendar'&&data.id===id)finish(data.content);};
  const timer=setTimeout(()=>finish(null),8500);
  host.addEventListener('message',onMessage);
  try{host.postMessage({type:'calendar',source,id});}catch{finish(null);}
 });
}

export class OfficialCalendar{
 constructor(storage,{read=nativeCalendarFetch,request=(url,options)=>fetch(url,options)}={}){
  this.storage=storage;this.read=read;this.request=request;this.cache={};this.pending=null;this.failures=[];
  try{
   const cached=JSON.parse(storage?.getItem(CACHE)??'null');
   for(const source of Object.keys(LABELS)){
    const item=cached?.[source];
    if(Number.isFinite(item?.updated)&&Array.isArray(item.events)&&item.events.every(validEvent))this.cache[source]=item;
   }
  }catch{}
 }
 async wst(){
  const get=async url=>{
   const response=await this.request(url,{signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw Error('WST request failed');
   return response.json();
  };
  const seasons=await get(SOURCES.seasons);
  const today=calendarToday();
  const ids=seasons.data.filter(season=>/^20\d\d$/.test(season.id)&&
   (season.attributes?.current||season.attributes?.tournaments?.last>=today)).map(season=>season.id);
  if(!ids.length)throw Error('WST season is missing');
  const results=await Promise.allSettled(ids.map(async id=>parseWst(await get(TOUR+id))));
  const events=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  if(!events.length)throw Error('WST tournaments are missing');
  if(results.some(result=>result.status==='rejected')){
   this.failures.push('wst');
   for(const old of this.cache.wst?.events??[]){
    if(!events.some(event=>eventIdentity(event)===eventIdentity(old)))events.push(old);
   }
  }
  return events;
 }
 refresh(force=false){
  if(this.pending)return this.pending;
  const jobs={
   wnt:async()=>parseWnt(await this.read('wnt')),
   wpa:async()=>parseWpa(await this.read('wpa')),
   wpaevents:async()=>parseWpaEvents(await this.read('wpaevents')),
   heyball:async()=>parseHeyballNews(JSON.parse(await this.read('heyball'))),
   wpbsa:async()=>parseWpbsa(await this.read('wpbsa')),
   wst:()=>this.wst()
  };
  const due=Object.keys(jobs).filter(source=>force||this.failures.includes(source)||Date.now()-(this.cache[source]?.updated??0)>=15*60000);
  if(!due.length)return Promise.resolve();
  this.failures=[];
  this.pending=Promise.all(due.map(async source=>{
   try{
    const events=(await jobs[source]()).filter(validEvent);
    if(!events.length&&!['heyball','wpaevents'].includes(source))throw Error('No valid calendar entries');
    this.cache[source]={updated:Date.now(),events};
   }catch{this.failures.push(source);}
  })).then(()=>{
   try{this.storage?.setItem(CACHE,JSON.stringify(this.cache));}catch{}
  }).finally(()=>{this.pending=null;});
  return this.pending;
 }
 list(mode){
  const today=calendarToday();
  const recent=new Date(Date.parse(today+'T00:00:00Z')-45*86400000).toISOString().slice(0,10);
  const seen=new Set();
  return ['wnt','wpaevents','wpa','wst','wpbsa','heyball'].flatMap(source=>this.cache[source]?.events??[]).filter(event=>{
   if(event.mode!==mode||(event.end??event.published)<recent)return false;
   const id=eventIdentity(event),name=[event.mode,event.start??event.published,normalize(event.name)].join(':');
   if(seen.has(id)||seen.has(name))return false;
   seen.add(id);seen.add(name);return true;
  }).sort((a,b)=>{
   const group=event=>event.start&&event.end>=today?0:1;
   return group(a)-group(b)||(group(a)?(b.start??b.published).localeCompare(a.start??a.published):a.start.localeCompare(b.start));
  });
 }
 status(mode){
  const sources=mode==='nine'?['wnt','wpa','wpaevents']:mode==='eight'?['wpa','wpaevents','heyball']:['wst','wpbsa'];
  const cached=sources.filter(source=>this.cache[source]);
  if(this.pending)return '正在同步官方赛程…';
  const missing=sources.filter(source=>this.failures.includes(source)||!this.cache[source]);
  if(missing.length&&this.failures.length)return cached.length?`${missing.map(source=>LABELS[source]).join('、')}暂不可用，已保留可用赛程和缓存。`:'暂未获取到赛程，请稍后刷新。';
  if(!cached.length)return '尚未同步赛程。';
  const oldest=Math.min(...cached.map(source=>this.cache[source].updated));
  return '最近同步：'+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(oldest);
 }
}
