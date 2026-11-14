import {yuanFenToPence} from './currency.js';
const DAY=86400000;
export const BANK={annual:.045,penalty:1.5,days:360,term:30,freeze:30};
export const dayNumber=(now=Date.now())=>Math.floor((now+8*3600000)/DAY);
export const dateLabel=day=>new Date(day*DAY).toISOString().slice(0,10);
export const newAccount=()=>({currency:'GBP',balance:25000,loans:[],freezeUntil:0,lastDay:0,wins:{},ledger:[]});
export function migrateAccount(account){
 if(account.currency==='GBP')return account;
 const loans=account.loans.map(loan=>{
  const interest=yuanFenToPence(loan.interest+loan.remainder);
  return {...loan,original:yuanFenToPence(loan.original),principal:yuanFenToPence(loan.principal),interest,remainder:0};
 }).filter(loan=>loan.principal||loan.interest);
 return {...account,currency:'GBP',balance:yuanFenToPence(account.balance),loans,
  ledger:account.ledger.map(entry=>({...entry,change:yuanFenToPence(entry.change)}))};
}
const amount=value=>Number.isSafeInteger(value)&&value>=0;
export function validAccount(a){
 return !!a&&(a.currency===undefined||a.currency==='GBP')&&amount(a.balance)&&amount(a.freezeUntil)&&amount(a.lastDay)&&a.wins&&
  ['nine','eight','snooker'].every(mode=>a.wins[mode]===undefined||amount(a.wins[mode]))&&
  Array.isArray(a.ledger)&&a.ledger.every(entry=>entry&&amount(entry.day)&&typeof entry.label==='string'&&Number.isSafeInteger(entry.change))&&
  Array.isArray(a.loans)&&a.loans.every(loan=>
   ['original','principal','interest','accruedDay','due','opened'].every(key=>amount(loan[key]))&&
   loan.original>=loan.principal&&loan.due===loan.opened+BANK.term&&
   loan.accruedDay>=loan.opened&&typeof loan.overdue==='boolean'&&
   Number.isFinite(loan.remainder)&&loan.remainder>=0&&loan.remainder<1);
}
export function record(a,label,change){
 a.ledger.unshift({day:a.lastDay,label,change});
 a.ledger.length=Math.min(a.ledger.length,30);
}
export function accrue(a,day=dayNumber()){
 day=Math.max(a.lastDay,day);
 a.lastDay=day;
 for(const loan of a.loans){
  const regular=Math.max(0,Math.min(day,loan.due)-loan.accruedDay);
  const late=Math.max(0,day-Math.max(loan.due,loan.accruedDay));
  const charge=loan.remainder+loan.principal*(regular+late*BANK.penalty)*BANK.annual/BANK.days;
  const whole=Math.floor(charge+1e-10);
  loan.interest+=whole;
  loan.remainder=Math.max(0,charge-whole);
  loan.accruedDay=day;
  if(day>loan.due&&!loan.overdue){
   loan.overdue=true;
   a.freezeUntil=Math.max(a.freezeUntil,loan.due+1+BANK.freeze);
   record(a,'贷款逾期，暂停新增贷款',0);
  }
 }
 return a;
}
export const debt=a=>a.loans.reduce((sum,l)=>sum+l.principal+l.interest,0);
export function loanRestriction(a){
 if(a.lastDay<a.freezeUntil)return `暂停借款至 ${dateLabel(a.freezeUntil)}`;
 if(a.loans.some(l=>l.overdue))return '请先结清逾期贷款';
 return '';
}
export function borrow(a,value){
 const blocked=loanRestriction(a);
 if(blocked)throw Error(blocked);
 if(!amount(value)||!value||!amount(a.balance+value)||!amount(debt(a)+value))throw Error('请输入有效的正数金额，最多两位小数。');
 a.balance+=value;
 a.loans.push({original:value,principal:value,interest:0,remainder:0,opened:a.lastDay,accruedDay:a.lastDay,due:a.lastDay+BANK.term,overdue:false});
 record(a,'贷款到账',value);
}
function pay(a,value){
 let left=value;
 for(const loan of a.loans){
  for(const key of ['interest','principal']){
   const payment=Math.min(left,loan[key]);
   loan[key]-=payment;
   left-=payment;
  }
  if(!left)break;
 }
 a.loans=a.loans.filter(loan=>loan.principal||loan.interest);
 return value-left;
}
export function repay(a,value){
 if(!amount(value)||!value||value>a.balance||value>debt(a))throw Error('还款金额须大于零，且不能超过余额或欠款。');
 const paid=pay(a,value);
 a.balance-=paid;
 record(a,'主动还款',-paid);
}
export function settlePrize(a,label,value){
 const paid=pay(a,value),credit=value-paid;
 if(!amount(a.balance+credit))throw Error('账户金额超出可记录范围。');
 a.balance+=credit;
 record(a,label,credit);
 return {value,paid,credit};
}
