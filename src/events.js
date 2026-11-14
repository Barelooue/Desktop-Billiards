import {toPence} from './currency.js';
// Published edition amounts, in the organizer's original currency.
const event=(name,edition,currency,fee,prizes,source,options={})=>({
 name,edition,currency,fee,prizes,source,...options
});
const wnt=(name,year,fee,prizes,path,options={})=>
 event('九球'+name,year,'USD',fee,prizes,'https://worldnineballtour.com/'+path,options);
const heyball=(name,year,fee,prizes,path,options={})=>
 event('中式八球'+name,year,'USD',fee,prizes,'https://wpapool.com/'+path,options);
const wst=(name,year,prizes,path,minWins=1)=>
 event('斯诺克'+name,year,'GBP',0,prizes,'https://www.wst.tv/'+path,{minWins,feeSimulated:true});
const US_MAJOR=[100000,50000,25000,15000,8000,5000,3000];
const OPEN_2025=[40000,16000,10000,7000,4000,2000,1000];
const OPEN_2026=[40000,18000,10000,7150,4000,2000,1000,350];
const HEYBALL_OPEN=[10000,6000,4000,2000,1250];
const HEYBALL_WORLD=[30000,20000,10000,6000,3250];
const HOME_NATIONS=[100000,45000,21000,13200,9000,5400,3600];
export const EVENTS={
 nine:{
  club:event('球房周赛','游戏赛事','CNY',0,[180,0],null),
  uk:event('九球英国公开赛','2022','USD',250,[30000,15000,7500,5500,3750], 'https://matchroompool.com/wp-content/uploads/UK-Open-2022-Player-Agreement.pdf'),
  us:event('九球美国公开赛','2021','USD',750,[50000,25000,12000,6750,3750], 'https://matchroompool.com/wp-content/uploads/US-Open-2021-Player-Agreement-FINAL.pdf'),
  us2026:wnt('美国公开赛','2026',750,US_MAJOR,'major/event-guide-2026-us-open-pool-championship/',{feeSource:'https://worldnineballtour.com/shop/',feeNote:'按组委会协会报名档'}),
  uk2026:wnt('英国公开赛','2026',250,OPEN_2026,'events/uk-open-pool-championship/',{feeSimulated:true}),
  europe2026:wnt('欧洲公开赛','2026',250,[40000,16000,10000,7000,3125,2000,1000,500],'wnt-2026/event-guide-2026-roobet-european-open-pool-championship/',{feeSimulated:true}),
  florida2026:wnt('佛罗里达公开赛','2026',250,OPEN_2026,'florida-open-pool-championship/event-guide-2026-florida-open-pool-championship/',{feeSimulated:true}),
  world2025:wnt('世界锦标赛','2025',0,[250000,100000,50000,25000,15000,7000,3500],'news/world-pool-championship-news/event-guide-2025-world-pool-championship/',{minWins:2,feeSimulated:true}),
  us2025:wnt('美国公开赛','2025',750,US_MAJOR,'news/event-guide-2025-livesb-io-us-open-pool-championship/',{feeSimulated:true}),
  hanoi2025:wnt('河内公开赛','2025',200,OPEN_2025,'hanoi-open-pool-championship/event-guide-2025-hanoi-open-pool-championship/',{feeSimulated:true}),
  europe2025:wnt('欧洲公开赛','2025',250,OPEN_2025,'european-open-pool-championship/event-guide-2025-european-open-pool-championship/',{feeSimulated:true}),
  florida2025:wnt('佛罗里达公开赛','2025',250,OPEN_2025,'wnt-2025/event-guide-2025-florida-open-pool-championship/',{feeSimulated:true}),
  world2024:wnt('世界锦标赛','2024',0,[250000,100000,50000,27000,15000,7000,3500],'world-pool-championship/the-world-pool-championship-event-guide/',{minWins:2,feeSimulated:true}),
  us2024:wnt('美国公开赛','2024',750,[50000,25000,13000,6750,4500,3000,1750],'us-open-pool-championship/2024-us-open-championship-event-guide/',{feeSimulated:true}),
  europe2024:wnt('欧洲公开赛','2024',250,[30000,15000,9500,6000,4000,2000,1000],'news/2024-european-open-championship-event-guide/',{feeSimulated:true}),
  hanoi2023:wnt('河内公开赛','2023',200,[30000,15000,9500,6000,4000,2000,1000],'events/hanoi-open-pool-championship/hanoi-open-pool-championship-2023/',{feeSimulated:true}),
  spain2023:wnt('西班牙公开赛','2023',250,OPEN_2025,'events/spanish-open-pool-championship/spanish-open-pool-championship-2023/',{feeSimulated:true}),
  masters2023:wnt('世界大师赛','2023',0,[40000,20000,10500,6000,2500],'events/world-pool-masters/world-pool-masters-2023/',{minWins:2,feeSimulated:true}),
  world2022:wnt('世界锦标赛','2022',0,[60000,30000],'news/shane-van-boening-is-new-nineball-world-no-1/',{minWins:1,feeSimulated:true}),
  europe2022:event('九球欧洲公开赛','2022','USD',250,[30000,15000,7500,5500,3750],
   'https://matchroompool.com/wp-content/uploads/European-Open-2022-Player-Agreement.pdf',{feeSimulated:true})
 },
 eight:{
  club:event('球房周赛','游戏赛事','CNY',0,[180,0],null),
  africa:event('中式八球非洲公开赛','2025','USD',100,[10000,6000,4000,2000,1250,0], 'https://wpapool.com/wp-content/uploads/2025/10/2025-African-Heyball-Open-Athletes-Guide.pdf'),
  world:event('中式八球世界锦标赛','2026','USD',0,[30000,20000,10000,6000,3250,0], 'https://wpapool.com/wp-content/uploads/2026/06/2026-HEYBALL-WC-ATHLETE-GUIDE.pdf',{minWins:1}),
  champions2026:heyball('冠中冠','2026',0,[...HEYBALL_WORLD,2200,1400],'2026-wpa-heyball-champion-of-champions/',{minWins:2,feeSimulated:true}),
  asia2026:heyball('亚洲公开赛','2026',100,HEYBALL_OPEN,'asian-heyball-open-2026-confirmed-for-malaysia/'),
  africa2026:heyball('非洲公开赛','2026',100,HEYBALL_OPEN,'wp-content/uploads/2026/04/2026-African-Heyball-Open.pdf'),
  champions2025:heyball('冠中冠','2025',0,[...HEYBALL_WORLD,2200,1400],'wp-content/uploads/2025/08/2025-Heyball-CoC-Athletes-Guide.pdf',{minWins:2}),
  panamerica2025:heyball('泛美公开赛','2025',100,HEYBALL_OPEN,'wp-content/uploads/2025/09/A-PAN-AMERICAN-HEYBALL-OPEN-2025.pdf'),
  world2024:heyball('世界锦标赛','2024',0,[...HEYBALL_WORLD,2200,1400],'wp-content/uploads/2024/08/2024-Heyball-World-Championships-Invitation.pdf',{minWins:1,feeSimulated:true}),
  champions2024:heyball('冠中冠','2024',0,[...HEYBALL_WORLD,2200,1400],'wp-content/uploads/2024/08/2024-Heyball-Champion-of-Champions_Athletes-guide.pdf',{minWins:2,feeSimulated:true}),
  asia2024:heyball('亚洲公开赛','2024',100,[...HEYBALL_OPEN,500,250],'asian-heyball-open/'),
  africa2024:heyball('非洲公开赛','2024',100,[...HEYBALL_OPEN,500,250],'african-heyball-open/'),
  europe2024:heyball('欧洲公开赛','2024',100,HEYBALL_OPEN,'wp-content/uploads/2024/08/2024-European-Heyball-Open-Invitation.pdf'),
  oceania2024:heyball('大洋洲公开赛','2024',100,[...HEYBALL_OPEN,500,250],'wp-content/uploads/2024/08/2024-Oceania-Heyball-Open-Athletes-Guide.pdf')
 },
 snooker:{
  club:event('球房周赛','游戏赛事','CNY',0,[200,0],null),
  qtour:event('Q Tour 斯德哥尔摩站','2025/26','GBP',100,[6000,3000,2000,1250,750,350,0], 'https://wpbsa.com/wp-content/uploads/Q-Tour-25-26-Event-1-Stockholm-merged.pdf'),
  scottish:event('苏格兰公开赛','2026','GBP',0,[100000,45000,21000,13200,9000,5400,3600], 'https://www.wst.tv/scottishopen/',{minWins:1,feeSimulated:true}),
  uk:event('斯诺克英国锦标赛','2026','GBP',0,[312500,125000,62500,31250,18750,12500], 'https://www.wst.tv/ukchampionship/',{minWins:2,feeSimulated:true}),
  masters:event('斯诺克大师赛','2026','GBP',0,[350000,140000,75000,40000,25000], 'https://www.wst.tv/themasters/',{minWins:3,feeSimulated:true}),
  world:event('斯诺克世界锦标赛','2027','GBP',0,[625000,250000,125000,62500,37500,25000], 'https://www.wst.tv/worldchampionship/',{minWins:4,feeSimulated:true}),
  china2026:wst('中国公开赛','2026',[250000,100000,50000,25000,15000,10000],'china-open/',2),
  shanghai2026:wst('上海大师赛','2026',[210000,105000,70000,35000,17500],'shanghaimasters/',3),
  wuhan2026:wst('武汉公开赛','2026',[175000,75000,33000,22000,12000,8000,4500],'wuhanopen/'),
  international2026:wst('国际锦标赛','2026',[175000,75000,33000,22000,14000,9000,5000],'internationalchampionship/',2),
  worldopen2026:wst('世界公开赛','2026',[175000,75000,33000,22000,14000,9000,5000],
   'news/2026/march/09/race-to-the-sportsbet-io-tour-championship--manchester-line-up-taking-shape/'),
  english2026:wst('英格兰公开赛','2026',HOME_NATIONS,'englishopen/'),
  northern2026:wst('北爱尔兰公开赛','2026',HOME_NATIONS,'northernirelandopen/'),
  british2026:wst('英国公开赛','2026',[100000,45000,20000,12000,9000,6000,3000],'britishopen/'),
  saudi2025:wst('沙特阿拉伯大师赛','2025',[500000,200000,100000,50000,30000,20000],
   'news/2025/july/20/Snooker-s-Greatest-Stars-Set-For-Battle-On-The-Baize-In-Jeddah/',3),
  uk2024:wst('英国锦标赛','2024',[250000,100000,50000,25000,15000,10000],
   'news/2024/november/11/wakelin-and-xiao-join-top-16-for-uk-championship/',2),
  world2024:wst('世界锦标赛','2024',[500000,200000],
   'news/2024/may/05/wilson-v-jones--tale-of-the-tape/',4),
  shanghai2023:wst('上海大师赛','2023',[210000,105000,70000,35000,17500],
   'news/2023/august/11/ding-to-meet-si-in-shanghai/',3),
  uk2022:wst('英国锦标赛','2022',[250000,100000,50000,25000,15000,10000],
   'news/2022/october/02/cazoo-uk-championship-format-and-prize-money/',2),
  masters2022:wst('大师赛','2022',[250000,100000,60000,30000,15000],'news/2022/january/07/cazoo-masters-prize-money/',3),
  world2022:wst('世界锦标赛','2022',[500000,200000,100000,50000,30000,20000],
   'news/2022/april/04/betfred-world-championship-prize-money-2/',4),
  british2021:wst('英国公开赛','2021',[100000,45000,20000,12000,7000,5000,3000],'news/2021/july/08/random-draw-for-british-open/')
 }
};
export const stageName=remaining=>['','决赛','半决赛','四分之一决赛'][remaining]??`${2**remaining} 强`;
export function eventPrize(details,stage,won,quote){
 return toPence(won?details.prizes[0]:(details.prizes[details.prizes.length-1-stage]??0),details.currency,quote);
}

// GBP prize pools for the edition shown in the game. High-break pools are separate.
export const SNOOKER_BREAK_PRIZES={
 qtour:{high:400},scottish:{high:5000},uk:{high:15000},masters:{high:15000},world:{high:15000},
 china2026:{high:15000},shanghai2026:{high:10000},wuhan2026:{high:5000},international2026:{high:5000},
 worldopen2026:{high:5000},english2026:{high:5000},northern2026:{high:5000},british2026:{high:5000},
 saudi2025:{maximum:50000,source:'https://www.wst.tv/news/2025/august/10/saudi-arabia-snooker-masters-day-three--/'},
 uk2024:{high:15000},world2024:{high:15000,maximum:40000,
  source:'https://www.wst.tv/news/2024/april/06/maximum-break-bonuses-for-cazoo-world-championship-/'},
 shanghai2023:{high:10000},uk2022:{high:15000},masters2022:{high:15000},
 world2022:{high:15000,maximum:40000,qualifying:10000,qualifyingFrom:6,
  source:'https://web.archive.org/web/20220404082951/https://wst.tv/betfred-world-championship-147-bonuses/'},
 british2021:{high:5000}
};

export function snookerBreakPrize(key,breaks,bestBreaks=[null,null]){
 const config=SNOOKER_BREAK_PRIZES[key];
 if(!config)return {maximum:0,high:0};
 const share=(pool,results)=>results.length?Math.floor(pool*100*results.filter(b=>b.player===0).length/results.length):0;
 const exact=breaks.filter(b=>b.points===147);
 const qualifying=b=>EVENTS.snooker[key].prizes.length-1-b.stage>=config.qualifyingFrom;
 const [player,computer]=bestBreaks;
 const high=!player||player.points<(computer?.points??0)?0:player.points===computer?.points?
  Math.floor((config.high??0)*100*player.count/(player.count+computer.count)):(config.high??0)*100;
 return {maximum:share(config.maximum??0,exact.filter(b=>!qualifying(b)))+share(config.qualifying??0,exact.filter(qualifying)),
  high};
}
