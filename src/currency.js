const LEGACY_YUAN_PER_POUND=8.95;
export const LEGACY_QUOTE=Object.freeze({date:'2026-11-11',GBP:1,USD:LEGACY_YUAN_PER_POUND/6.7191,CNY:LEGACY_YUAN_PER_POUND});
export const ECB_URL='https://data-api.ecb.europa.eu/service/data/EXR/D.USD+GBP+CNY.EUR.SP00.A?lastNObservations=1&format=csvdata';
const CACHE_KEY='desktop-billiards.fx.ecb.v1';
export const DEFAULT_QUOTE=Object.freeze({date:'2026-11-12',GBP:.83595,USD:1.1081,CNY:7.3891});
const pounds=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'});

export function toPence(amount,currency='GBP',quote=DEFAULT_QUOTE){
 return Math.round(amount*(quote.GBP/quote[currency])*100);
}

export function yuanFenToPence(fen){
 return Math.sign(fen)*Math.round(Math.abs(fen)/LEGACY_YUAN_PER_POUND)||0;
}

export function money(pence){
 return pounds.format(pence/100);
}

export function validQuote(quote){
 return !!quote&&/^\d{4}-\d{2}-\d{2}$/.test(quote.date)&&
  ['GBP','USD','CNY'].every(key=>Number.isFinite(quote[key])&&quote[key]>0);
}

export function parseEcbQuote(csv){
 const [header,...rows]=csv.trim().split(/\r?\n/);
 const fields=header.replace(/^\uFEFF/,'').split(',');
 const indexes=['CURRENCY','TIME_PERIOD','OBS_VALUE'].map(field=>fields.indexOf(field));
 if(indexes.some(index=>index<0))throw Error('汇率数据格式异常。');
 const quote={};
 for(const row of rows){
  // The currency, date and value columns precede the optional quoted descriptions.
  const columns=row.split(',');
  const [currency,date,rate]=indexes.map(index=>columns[index]);
  if(!['GBP','USD','CNY'].includes(currency))continue;
  if(quote.date&&quote.date!==date)throw Error('报价日期不一致。');
  quote.date=date;
  quote[currency]=Number(rate);
 }
 if(!validQuote(quote))throw Error('汇率数据不完整。');
 return quote;
}

export class ExchangeRates{
 constructor(storage,fetchQuote=(...args)=>globalThis.fetch(...args)){
  this.storage=storage;
  this.fetchQuote=fetchQuote;
  this.quote=DEFAULT_QUOTE;
  this.status='内置报价';
  this.lastSuccess=0;
  try{
   const cached=JSON.parse(storage?.getItem(CACHE_KEY)??'null');
   if(validQuote(cached?.quote)&&cached.quote.date>=this.quote.date){
    this.quote=cached.quote;
    this.status='缓存报价';
   }
  }catch{}
 }
 refresh(){
  if(this.pending)return this.pending;
  if(Date.now()-this.lastSuccess<15*60000)return Promise.resolve();
  this.status='正在更新';
  this.pending=this.download().finally(()=>{this.pending=null;});
  return this.pending;
 }
 async download(){
  try{
   const response=await this.fetchQuote(ECB_URL,{signal:AbortSignal.timeout(4500)});
   if(!response.ok)throw Error('汇率暂不可用。');
   const quote=parseEcbQuote(await response.text());
   if(quote.date<this.quote.date)throw Error('报价早于当前记录。');
   this.quote=quote;
   this.status='已同步';
   this.lastSuccess=Date.now();
   try{this.storage?.setItem(CACHE_KEY,JSON.stringify({quote}));}catch{}
  }catch{
   this.status=this.quote===DEFAULT_QUOTE?'离线 · 内置报价':'离线 · 缓存报价';
  }
 }
}
