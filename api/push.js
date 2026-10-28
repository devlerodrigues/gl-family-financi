const webpush=require('web-push');
const base=process.env.FAMILY_SUPABASE_URL+'/rest/v1/rpc/';
const token=process.env.FAMILY_PUSH_DB_SECRET;
const auth={apikey:process.env.FAMILY_SUPABASE_PUBLISHABLE,'Content-Type':'application/json'};
async function rpc(name,body){const r=await fetch(base+name,{method:'POST',headers:auth,body:JSON.stringify({p_secret:token,...body})});if(!r.ok)throw Error('RPC '+name+' HTTP '+r.status);return r.json()}
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const diff=(due,today)=>Math.round((Date.parse(due+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).json({error:'method'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).json({error:'unauthorized'});
 try{
  const now=new Date(),today=day(now),month=today.slice(0,7),hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour<7||hour>21)return res.json({status:'outside_delivery_window'});
  const data=await rpc('family_push_snapshot',{});
  const subs=data.subs||[],settings=new Map((data.settings||[]).map(x=>[x.user_id,x])),notices=[];
  const addDue=(kind,id,name,amount,due)=>{
   if(!due)return;const n=diff(due,today);
   if(n<0)notices.push({key:kind+':'+id+':late:'+today,title:'Despesa em atraso',body:name+' • '+money(amount)+' • venceu em '+due,days:n});
   else if(n===0)notices.push({key:kind+':'+id+':today',title:'Vence hoje',body:name+' • '+money(amount),days:n});
   else if(n<=30)notices.push({key:kind+':'+id+':soon:'+n+':'+due,title:'Vencimento próximo',body:name+' • '+money(amount)+' • '+due,days:n});
  };
  for(const x of data.bills||[])addDue('bill',x.id,x.description,Number(x.amount),x.due_date);
  for(const x of data.tx||[])addDue('tx',x.id,x.description,Number(x.amount),x.due_date);
  const cards=new Map();
  for(const x of data.cards||[]){const k=x.card+'|'+x.statement_due;cards.set(k,(cards.get(k)||0)+Number(x.amount))}
  for(const x of data.payments||[]){const k=x.card+'|'+x.statement_due;cards.set(k,(cards.get(k)||0)-Number(x.amount))}
  for(const [k,amount] of cards){const [card,due]=k.split('|');if(amount>0.01)addDue('card',k,'Fatura '+card,amount,due)}
  const spent=new Map();
  for(const x of [...(data.bills||[]),...(data.tx||[])])if(x.due_date?.startsWith(month)){const c=x.category_label||'Outros';spent.set(c,(spent.get(c)||0)+Number(x.amount))}
  for(const x of data.cards||[])if(x.statement_due?.startsWith(month)){const c=x.category_label||'Outros';spent.set(c,(spent.get(c)||0)+Number(x.amount))}
  for(const b of data.budgets||[]){const pct=100*(spent.get(b.category)||0)/Number(b.amount);if(!Number.isFinite(pct))continue;for(const threshold of [80,100])if(pct>=threshold)notices.push({key:'budget:'+month+':'+b.category+':'+threshold,title:threshold===100?'Orçamento ultrapassado':'Alerta de orçamento',body:b.category+' atingiu '+Math.round(pct)+'% do orçamento',threshold})}
  webpush.setVapidDetails('mailto:leandro160490@gmail.com',process.env.FAMILY_VAPID_PUBLIC,process.env.FAMILY_VAPID_PRIVATE);
  let sent=0,failed=0,skipped=0;
  for(const sub of subs){const cfg=settings.get(sub.user_id)||{enabled:true,due_days:5,budget_threshold:80};if(!cfg.enabled)continue;
   for(const n of notices){if(n.days>Number(cfg.due_days||5))continue;if(n.threshold&&n.threshold<Number(cfg.budget_threshold||80))continue;
    if(!await rpc('family_push_claim',{p_sub:sub.id,p_event:n.key})){skipped++;continue}
    try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:n.title,body:n.body,url:'/?notification=1',tag:n.key}),{TTL:86400});sent++}
    catch(e){failed++;await rpc('family_push_cleanup',{p_sub:sub.id,p_event:n.key,p_remove:[404,410].includes(e.statusCode)}).catch(()=>{});if([404,410].includes(e.statusCode))break}
   }
  }
  return res.json({status:'processed',devices:subs.length,events:notices.length,sent,skipped,failed});
 }catch(e){console.error('family push dispatch error',e.message);return res.status(500).json({error:'push dispatch failed'})}
};