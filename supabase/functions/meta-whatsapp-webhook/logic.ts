
export const expenseCats=['Supermercado','Alimentação','Moradia','Contas da casa','Transporte','Veículo','Saúde','Educação','Lazer','Assinaturas','Compras','Outros'];
export const incomeCats=['Salário','Serviços','Reembolso','Investimentos','Receitas diversas','Outros'];
const methods=[['pix','Pix'],['card','Cartão de crédito'],['debito','Cartão de débito'],['dinheiro','Dinheiro'],['transferencia','Transferência'],['boleto','Boleto'],['outros','Outros']];
const norm=(x:any)=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const money=(n:any)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const shift=(s:string,n:number)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dateBR=(s:string)=>s.split('-').reverse().join('/');
const removePrefix=(s:string)=>s.replace(/^[\s:,-]+/,'').replace(/^(no|na|nos|nas|em|de|do|da|para|por)\s+/i,'');
function parseMoney(x:string):number|null{
 let m=x.match(/(?:r\$\s*)(\d[\d.]*(?:,\d{1,2})?)/i)||x.match(/\b(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais|real)\b/i)||x.match(/\b\d{1,3}\s*x\s*de\s*(\d[\d.,]*)\b/i);
 if(!m)m=x.match(/\b(\d{1,7}(?:[.,]\d{1,2})?)\b/);
 if(!m)return null;
 let raw=m[1].replace(/\s+/g,'');
 if(raw.includes(','))raw=raw.replace(/\./g,'').replace(',','.');
 else if((raw.match(/\./g)||[]).length>1)raw=raw.replace(/\./g,'');
 const n=Number(raw);
 return Number.isFinite(n)&&n>0&&n<=99999999&&Math.round(n*100)/100===n?n:null;
}
function parseDate(x:string):string|null{
 const n=norm(x);const base=today();
 if(/\banteontem\b/.test(n))return shift(base,-2);
 if(/\bontem\b/.test(n))return shift(base,-1);
 if(/\bhoje\b/.test(n))return base;
 if(/\bamanha\b/.test(n))return shift(base,1);
 const m=x.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
 if(m){const year=m[3].length===2?'20'+m[3]:m[3];const iso=year+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso?iso:null}
 const iso=x.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];return iso&&new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso?iso:null;
}
function instalments(x:string):number|null{
 const n=norm(x);if(/^(nao|n|avista|a vista|uma|unica|1|sem parcelas|sem parcelar)$/.test(n))return 1;
 let m=n.match(/\b(\d{1,3})\s*x\b/)||n.match(/\b(\d{1,3})\s*parcelas?\b/)||n.match(/^\s*(\d{1,3})\s*$/);
 const count=m?Number(m[1]):null;return count&&count>=1&&count<=120?count:null;
}
function initial(x:string):any{
 const n=norm(x);const kind=/\b(recebi|receita|ganhei|entrou|salario|pagamento recebido|vendi|faturei)\b/.test(n)?'income':/\b(gastei|gasto|paguei|compra|comprei|despesa|abasteci|pagar)\b/.test(n)?'expense':null;
 const amount=parseMoney(x);
 let description=x.replace(/\b(gastei|gasto|paguei|compra|comprei|despesa|abasteci|recebi|receita|ganhei|entrou|salario|vendi|faturei)\b/gi,' ')
  .replace(/r\$\s*\d[\d.,]*/gi,' ').replace(/\b\d[\d.,]*\s*(?:reais|real)\b/gi,' ')
  .replace(/\b(?:hoje|ontem|anteontem|amanhã|amanha)\b/gi,' ')
  .replace(/\b(?:em\s*)?\d+\s*x(?:\s*de)?\b/gi,' ')
  .replace(/\b(?:no|na)\s+cart[aã]o\s+(?:nubank|santander)\b/gi,' ')
  .replace(/\b(?:via|no|na|pelo|por)\s+(?:pix|d[eé]bito|transfer[eê]ncia|dinheiro|boleto)\b/gi,' ')
  .trim();
 description=removePrefix(description).trim().replace(/\s+/g,' ');
 if(description.length<2||description.length>250||/^\d/.test(description))description='';
 const state:any={kind,amount,description:description||null,category:null,method:null,card:null,account_id:null,person_id:null,date:parseDate(x),installments:instalments(x),installment_start:null,amount_basis:null,paid_status:null,waiting_for:null};
 if(/\b(pix)\b/.test(n))state.method='pix';
 if(/\bcartao (?:de )?credito\b/.test(n)||/\bcartao (nubank|santander)\b/.test(n))state.method='card';
 if(/\bcartao nubank\b/.test(n))state.card='nubank';
 if(/\bcartao santander\b/.test(n))state.card='santander';
 if(/\bdebito\b/.test(n))state.method='debito';
 if(/\bdinheiro\b/.test(n))state.method='dinheiro';
 if(/\btransferencia\b/.test(n))state.method='transferencia';
 if(/\bboleto\b/.test(n))state.method='boleto';
 if(/\b(?:ja foi pago|ja paguei|quitado)\b/.test(n))state.paid_status='paid';
 if(/\b(?:a pagar|pendente|vai vencer|a receber)\b/.test(n))state.paid_status='planned';
 if(state.installments===1){state.installment_start=1;state.amount_basis='each'}
 if(state.installments&&state.installments>1){
  const xmatch=n.match(/\b\d+\s*x\s*de\s*(?:r\$\s*)?\d/);
  if(xmatch){state.amount_basis='each';const part=n.match(/\b\d+\s*x\s*de\s*(?:r\$\s*)?(\d[\d.,]*)/);if(part)state.amount=parseMoney(part[1])}
  else if(/\btotal\b/.test(n))state.amount_basis='total';
 }
 return state;
}
function choices(items:string[]){return items.map((x,i)=>(i+1)+'. '+x).join('\n')}
function findOption(text:string,items:string[]):string|null{
 const n=norm(text).replace(/^[^:]+:\s*/,'');
 if(/^\d{1,2}$/.test(n)){const i=Number(n)-1;if(i>=0&&i<items.length)return items[i]}
 return items.find(v=>norm(v)===n)||null;
}
function methodLabel(method:string,card:string|null){return method==='card'?'Cartão '+(card==='nubank'?'Nubank':card==='santander'?'Santander':''):methods.find(m=>m[0]===method)?.[1]||method}
function question(s:any,accounts:any[],people:any[],cats:string[]):{key:string,text:string}|null{
 if(!s.kind)return {key:'kind',text:'É uma DESPESA ou RECEITA?'};
 if(!s.amount)return {key:'amount',text:'Qual foi o valor em reais? Ex.: 85,90.'};
 if(!s.description)return {key:'description',text:'Qual é a descrição do lançamento? Ex.: Mercado BH.'};
 if(!s.category)return {key:'category',text:'Em qual categoria/segmento entra?\n'+choices(cats)};
 if(!s.person_id)return {key:'person_id',text:'Quem realizou a despesa ou recebeu o valor?\n'+choices(people.map(p=>p.display_name))};
 if(!s.method)return {key:'method',text:'Qual a forma de pagamento/recebimento?\n'+choices(methods.filter(m=>s.kind==='expense'||m[0]!=='card').map(m=>m[1]))};
 if(s.method==='card'&&!s.card)return {key:'card',text:'Qual cartão de crédito?\n1. Nubank\n2. Santander'};
 if(s.method!=='card'&&!s.account_id)return {key:'account_id',text:'Em qual conta financeira? Escolha uma das contas cadastradas no GL Family:\n'+choices(accounts.map(a=>a.name))};
 if(!s.date)return {key:'date',text:'Qual a data da compra, do pagamento ou do vencimento? Responda HOJE, ONTEM ou DD/MM/AAAA.'};
 if(!s.installments)return {key:'installments',text:'É uma parcela única ou parcelado? Responda 1 ou a quantidade, por exemplo 3x.'};
 if(s.installments>1&&!s.installment_start)return {key:'installment_start',text:'Qual parcela está sendo lançada agora? Informe um número de 1 a '+s.installments+'.'};
 if(s.installments>1&&!s.amount_basis)return {key:'amount_basis',text:'O valor '+money(s.amount)+' é o TOTAL da compra ou o valor de CADA PARCELA? Responda TOTAL ou PARCELA.'};
 if(s.method!=='card'&&!s.paid_status)return {key:'paid_status',text:s.kind==='income'?'Este valor já foi RECEBIDO ou está A RECEBER?':'Essa despesa já foi PAGA ou está A PAGAR?'};
 return null;
}
function answer(s:any,key:string,raw:string,accounts:any[],people:any[],cats:string[]):string|null{
 const text=raw.replace(/^[^:]{2,30}:\s*/,'').trim();const n=norm(text);
 if(key==='kind'){if(/\b(receita|recebi|entrada)\b/.test(n)){s.kind='income';return null}if(/\b(despesa|gasto|saida)\b/.test(n)){s.kind='expense';return null}return 'Responda DESPESA ou RECEITA.'}
 if(key==='amount'){const v=parseMoney(text);if(!v)return 'Informe um valor válido, por exemplo 50,00.';s.amount=v;return null}
 if(key==='description'){if(text.length<2||text.length>250)return 'A descrição deve ter entre 2 e 250 caracteres.';s.description=text;return null}
 if(key==='category'){
  let result=findOption(text,cats);
  if(!result&&/^(mercado|supermercado)$/.test(n))result='Supermercado';
  if(!result)return 'Categoria não encontrada. Responda com o número da opção ou o nome exato.';
  s.category=result;return null;
 }
 if(key==='person_id'){const chosen=findOption(text,people.map(p=>p.display_name));const person=people.find(p=>p.display_name===chosen);if(!person)return 'Escolha o número ou o nome da pessoa da família.';s.person_id=person.id;return null}
 if(key==='method'){
  const opts=methods.filter(m=>s.kind==='expense'||m[0]!=='card');
  const name=findOption(text,opts.map(m=>m[1]));
  let m=opts.find(v=>v[1]===name);
  if(!m){if(/\bpix\b/.test(n))m=opts.find(m=>m[0]==='pix');else if(/\b(?:credito|cartao|nubank|santander)\b/.test(n))m=opts.find(m=>m[0]==='card');else if(/\bdebito\b/.test(n))m=opts.find(m=>m[0]==='debito');else if(/\bdinheiro\b/.test(n))m=opts.find(m=>m[0]==='dinheiro');else if(/\btransferencia\b/.test(n))m=opts.find(m=>m[0]==='transferencia');else if(/\bboleto\b/.test(n))m=opts.find(m=>m[0]==='boleto')}
  if(!m)return 'Forma de pagamento inválida. Escolha uma opção da lista.';
  s.method=m[0];s.account_id=null;s.card=null;s.paid_status=null;return null;
 }
 if(key==='card'){if(n==='1'||n.includes('nubank')){s.card='nubank';return null}if(n==='2'||n.includes('santander')){s.card='santander';return null}return 'Os cartões disponíveis são 1. Nubank ou 2. Santander.'}
 if(key==='account_id'){const name=findOption(text,accounts.map(a=>a.name));const a=accounts.find(x=>x.name===name);if(!a)return 'Escolha uma conta cadastrada pelo número ou nome exato.';s.account_id=a.id;return null}
 if(key==='date'){const v=parseDate(text);if(!v)return 'Data inválida. Use HOJE, ONTEM ou DD/MM/AAAA.';const time=Date.parse(v+'T12:00:00Z');if(time<Date.parse('2000-01-01T12:00:00Z')||time>Date.parse(shift(today(),365)+'T12:00:00Z'))return 'A data está fora do período permitido.';s.date=v;return null}
 if(key==='installments'){const v=instalments(text);if(!v)return 'Informe 1 para parcela única ou 2x, 3x, etc. (até 120).';s.installments=v;s.installment_start=v===1?1:null;s.amount_basis=v===1?'each':null;return null}
 if(key==='installment_start'){const v=Number(n);if(!Number.isInteger(v)||v<1||v>s.installments)return 'Informe a parcela atual de 1 a '+s.installments+'.';s.installment_start=v;return null}
 if(key==='amount_basis'){if(n.includes('total')){s.amount_basis='total';return null}if(n.includes('parcela')||n.includes('cada')){s.amount_basis='each';return null}return 'Responda TOTAL ou PARCELA.'}
 if(key==='paid_status'){if(/^(pago|paga|paguei|quitado|recebido|recebi|sim)$/.test(n)){s.paid_status='paid';return null}if(/^(a pagar|a receber|pendente|nao|nao pago|planejado|previsto)$/.test(n)){s.paid_status='planned';return null}return 'Responda PAGO ou A PAGAR (para receita: RECEBIDO ou A RECEBER).'}
 return 'Não entendi sua resposta.';
}
function summary(s:any,accounts:any[],people:any[]){
 const person=people.find(x=>x.id===s.person_id)?.display_name||'Não identificado';
 const account=accounts.find(x=>x.id===s.account_id)?.name||'Não definida';
 const parts=s.installments||1;
 const total=parts>1&&s.amount_basis==='each'?s.amount*parts:s.amount;
 const detail=parts===1?'Parcela única':parts+' parcelas (a partir da '+s.installment_start+'/'+parts+')';
 return 'Confira os dados antes de salvar:\n\n'+
 'Tipo: '+(s.kind==='expense'?'Despesa':'Receita')+
 '\nDescrição: '+s.description+
 '\nValor informado: '+money(s.amount)+(parts>1?(s.amount_basis==='each'?' por parcela':' no total'):'')+
 (parts>1?'\nValor da compra: '+money(total):'')+
 '\nCategoria: '+s.category+
 '\nPessoa: '+person+
 '\nPagamento: '+methodLabel(s.method,s.card)+
 (s.method==='card'?' (na fatura)':('\nConta: '+account))+
 '\nData: '+dateBR(s.date)+
 '\nParcelamento: '+detail+
 (s.method==='card'?'':'\nSituação: '+(s.paid_status==='paid'?'Pago/recebido':'Pendente'))+
 '\n\nResponda *CONFIRMAR* para registrar, *CORRIGIR* para ajustar ou *CANCELAR*.';
}
export async function processFamilyText(db:any,wa:string,text:string):Promise<string>{
 const raw=String(text||'').trim().slice(0,800);const n=norm(raw);
 if(!raw)return 'Envie uma mensagem de texto descrevendo uma despesa ou receita.';
 if(/^vincular\s+gl-[a-z2-7]{4}-[a-z2-7]{4}$/i.test(raw)){
  const code=raw.replace(/^vincular\s+/i,'').toUpperCase();
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));const hash=Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {data:c,error:e}=await db.from('family_wa_link_codes').select('user_id,expires_at,used_at').eq('code_hash',hash).maybeSingle();
  if(e)throw e;
  if(!c||c.used_at||Date.parse(c.expires_at)<=Date.now())return 'Código inválido ou vencido. Gere outro em GL Family → ⚙ Conta → Agente WhatsApp.';
  const {error:linkErr}=await db.from('family_wa_links').upsert({user_id:c.user_id,wa_id:wa,verified_at:new Date().toISOString()},{onConflict:'user_id'});
  if(linkErr)return linkErr.code==='23505'?'Este WhatsApp já está vinculado a outro usuário. Desvincule no GL Family antes de tentar novamente.':'Não foi possível vincular sua conta.';
  await db.from('family_wa_link_codes').update({used_at:new Date().toISOString()}).eq('user_id',c.user_id);
  return 'Seu WhatsApp foi vinculado com segurança ao GL Family! Agora envie uma despesa, por exemplo: Gastei 50 reais no mercado. Vou perguntar todos os dados antes de salvar.';
 }
 const {data:link,error:linkError}=await db.from('family_wa_links').select('user_id').eq('wa_id',wa).maybeSingle();
 if(linkError)throw linkError;
 if(!link)return 'Para proteger seus dados, primeiro vincule seu número ao GL Family: abra ⚙ Conta → Agente WhatsApp, gere o código e envie aqui: VINCULAR GL-XXXX-XXXX.';
 const user=link.user_id;
 if(n==='ajuda'||n==='menu')return 'GL Family: envie Gastei 50 reais no mercado ou Recebi 500 de serviço. Vou perguntar categoria, responsável, forma de pagamento, cartão ou conta, data, parcelas e situação. Comandos: CONFIRMAR, CORRIGIR, CANCELAR.';
 const expired=new Date().toISOString();
 await db.from('family_wa_drafts').update({status:'cancelled',updated_at:expired}).eq('user_id',user).in('status',['collecting','confirming']).lt('expires_at',expired);
 const {data:drafts,error:draftError}=await db.from('family_wa_drafts').select('id,status,state,expires_at').eq('user_id',user).in('status',['collecting','confirming']).order('updated_at',{ascending:false}).limit(1);
 if(draftError)throw draftError;
 let draft=drafts?.[0]||null;
 if(n==='cancelar'){if(draft)await db.from('family_wa_drafts').update({status:'cancelled'}).eq('id',draft.id);return 'Rascunho cancelado. Nenhum lançamento foi gravado.'}
 const [accountsRes,peopleRes,categoriesRes]=await Promise.all([db.from('financial_accounts').select('id,name').order('name'),db.from('family_user_profiles').select('id,display_name').order('display_name'),db.from('family_expense_categories').select('name').order('name')]);
 if(accountsRes.error||peopleRes.error||categoriesRes.error)throw Error('Falha ao carregar contas e categorias');
 const accounts=accountsRes.data||[];const people=peopleRes.data||[];const custom=(categoriesRes.data||[]).map((x:any)=>x.name);
 if(!draft){
  if(n==='confirmar'||n==='corrigir')return 'Não há lançamento pendente. Envie uma nova despesa ou receita.';
  const state=initial(raw);
  const {data:newDraft,error:createError}=await db.from('family_wa_drafts').insert({user_id:user,wa_id:wa,state,status:'collecting'}).select('id,status,state').single();
  if(createError)throw createError;
  draft=newDraft;
 }
 const state=draft.state||{};const cats=[...new Set([...(state.kind==='income'?incomeCats:expenseCats),...custom])];
 if(draft.status==='confirming'){
  if(n==='confirmar'){
   const {data,error}=await db.rpc('family_wa_commit',{p_user:user,p_wa:wa,p_draft:draft.id});
   if(error)throw error;
   return '✅ Lançamento confirmado e salvo no GL Family! '+(data?.kind==='card'?'Compra registrada na fatura do cartão.':'Movimentação financeira registrada.')+' Você já pode consultar no aplicativo.';
  }
  if(n==='corrigir'){
   state.waiting_for='correction';
   const {error}=await db.from('family_wa_drafts').update({status:'collecting',state,updated_at:new Date().toISOString()}).eq('id',draft.id);
   if(error)throw error;
   return 'Qual campo deseja alterar? Envie por exemplo: VALOR: 70, CATEGORIA: Alimentação, CARTAO: Nubank, FORMA: Pix, CONTA: Rico, DATA: HOJE, PARCELAS: 3, PESSOA: Gabi ou SITUACAO: PAGO.';
  }
  return 'Ainda não salvei. Responda CONFIRMAR, CORRIGIR ou CANCELAR.';
 }
 if(state.waiting_for){
  let field=state.waiting_for;
  if(field==='correction'){
   const m=raw.match(/^\s*(tipo|valor|descri[cç][aã]o|categoria|segmento|pessoa|respons[aá]vel|forma|pagamento|cart[aã]o|conta|data|parcelas|parcela atual|base|situa[cç][aã]o)\s*:\s*(.+)$/i);
   if(!m)return 'Use CAMPO: VALOR. Ex.: CATEGORIA: Saúde ou CARTAO: Santander.';
   const map:any={tipo:'kind',valor:'amount',descricao:'description',categoria:'category',segmento:'category',pessoa:'person_id',responsavel:'person_id',forma:'method',pagamento:'method',cartao:'card',conta:'account_id',data:'date',parcelas:'installments','parcela atual':'installment_start',base:'amount_basis',situacao:'paid_status'};
   field=map[norm(m[1])];if(!field)return 'Campo inválido para correção.';
   const error=answer(state,field,m[2],accounts,people,cats);
   if(error)return error;
   if(field==='kind'){state.category=null;state.method=null;state.card=null;state.account_id=null;state.paid_status=null}
   if(field==='amount'&&state.installments>1)state.amount_basis=null;
   if(field==='installments'&&state.installments>1){state.installment_start=null;state.amount_basis=null}
  }else{
   const error=answer(state,field,raw,accounts,people,cats);
   if(error)return error;
  }
  state.waiting_for=null;
 }
 const next=question(state,accounts,people,[...new Set([...(state.kind==='income'?incomeCats:expenseCats),...custom])]);
 if(next){
  state.waiting_for=next.key;
  const {error}=await db.from('family_wa_drafts').update({state,status:'collecting',updated_at:new Date().toISOString()}).eq('id',draft.id);
  if(error)throw error;
  return next.text;
 }
 state.waiting_for=null;
 const {error}=await db.from('family_wa_drafts').update({state,status:'confirming',updated_at:new Date().toISOString()}).eq('id',draft.id);
 if(error)throw error;
 return summary(state,accounts,people);
}
