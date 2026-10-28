
import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {processFamilyText} from './logic.ts';

const encoder=new TextEncoder();
const plain=(body:string,status=200)=>new Response(body,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
async function validSignature(secret:string,body:string,header:string){
 if(!header.startsWith('sha256='))return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body)));
 const expected='sha256='+Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(expected.length!==header.length)return false;
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^header.charCodeAt(i);
 return diff===0;
}
const token=()=>Deno.env.get('META_ACCESS_TOKEN')||Deno.env.get('META_WHATSAPP_ACCESS_TOKEN')||Deno.env.get('WHATSAPP_ACCESS_TOKEN');
type SendResult={success:boolean,errorCode:number|null,messageId:string|null,recipientFormat:'webhook_wa_id'|'br_ninth_digit'};
async function sendWhatsApp(phoneId:string,to:string,body:string):Promise<SendResult>{
 const failure:SendResult={success:false,errorCode:null,messageId:null,recipientFormat:'webhook_wa_id'};
 const access=token();
 if(!access){console.warn('family_wa: outgoing WhatsApp token is not configured');return failure}
 if(!/^[0-9]{5,32}$/.test(phoneId)||!/^[0-9]{8,18}$/.test(to))return failure;
 const version=Deno.env.get('META_GRAPH_VERSION')||'v26.0';
 const url='https://graph.facebook.com/'+version+'/'+phoneId+'/messages';
 const attempt=async(recipient:string,recipientFormat:SendResult['recipientFormat']):Promise<SendResult>=>{
  try{
   const response=await fetch(url,{
    method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:body.slice(0,3900)}})
   });
   const json=await response.json().catch(()=>({}));
   if(response.ok){
    const id=String(json?.messages?.[0]?.id||'');
    if(!id){console.warn('family_wa: Meta accepted a message without an outbound ID');return {success:true,errorCode:null,messageId:null,recipientFormat}}
    return {success:true,errorCode:null,messageId:id,recipientFormat};
   }
   const errorCode=typeof json?.error?.code==='number'?json.error.code:null;
   console.warn('family_wa: send rejected',JSON.stringify({status:response.status,code:errorCode,subcode:json?.error?.error_subcode??null,format:recipientFormat}));
   return {success:false,errorCode,messageId:null,recipientFormat};
  }catch(error){
   console.error('family_wa: outgoing request failed',String(error).slice(0,160));
   return {success:false,errorCode:null,messageId:null,recipientFormat};
  }
 };
 const first=await attempt(to,'webhook_wa_id');
 if(first.success)return first;
 // Some Brazilian inbound WA IDs omit the mobile ninth digit. Retry only when
 // Meta says the address is not on the test-recipient allowlist (131030).
 if(first.errorCode===131030&&/^55\d{10}$/.test(to)){
  const recipient=to.slice(0,4)+'9'+to.slice(4);
  const retry=await attempt(recipient,'br_ninth_digit');
  if(retry.success)console.info('family_wa: br_ninth_digit_fallback_succeeded');
  return retry;
 }
 return first;
}
function adminClient(){
 const url=Deno.env.get('SUPABASE_URL');
 let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!key){try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default}catch{}}
 if(!url||!key)throw Error('Supabase service credentials are unavailable');
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

const diagnosticsCors={'access-control-allow-origin':'https://gl-family-financi.vercel.app','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'authorization, apikey, content-type, x-client-info','vary':'Origin'};
const diagJson=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...diagnosticsCors,'content-type':'application/json','cache-control':'no-store'}});
async function metaDiagnostic(req:Request,subscribe=false):Promise<Response>{
 try{
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt||jwt.length<40)return diagJson({error:'Faça login no GL Family antes de verificar.'},401);
  const db=adminClient();
  const {data:identity,error:authError}=await db.auth.getUser(jwt);
  if(authError||!identity.user)return diagJson({error:'Sessão inválida. Entre novamente no aplicativo.'},401);
  const {data:member,error:memberError}=await db.from('family_user_profiles').select('id,role').eq('id',identity.user.id).maybeSingle();
  if(memberError||!member)return diagJson({error:'Acesso não autorizado.'},403);
  if(subscribe&&member.role!=='admin')return diagJson({error:'Apenas um administrador pode atualizar a assinatura da Meta.'},403);
  const {data:linkCode}=await db.from('family_wa_link_codes').select('expires_at,used_at').eq('user_id',member.id).maybeSingle();
  const {data:link}=await db.from('family_wa_links').select('wa_id').eq('user_id',member.id).maybeSingle();
  const access=token();
  const appSecret=!!Deno.env.get('META_APP_SECRET');
  const version=Deno.env.get('META_GRAPH_VERSION')||'v26.0';
  const waba=Deno.env.get('META_WABA_ID')||'2551347102028900';
  const metaAppId=Deno.env.get('META_APP_ID')||'1134075289093083';
  const graph='https://graph.facebook.com/'+version+'/'+waba+'/subscribed_apps';
  let tokenValid=false,subscribed:null|boolean=null,graphStatus:null|number=null,graphCode:null|number=null;
  let subscriptionCount:null|number=null,hasAlternateCallback=false,requestedSubscriptionSuccess=false;
  if(access){
   try{
    if(subscribe){
     const postResponse=await fetch(graph,{method:'POST',headers:{authorization:'Bearer '+access}});
     graphStatus=postResponse.status;
     const postJson=await postResponse.json().catch(()=>({}));
     graphCode=typeof postJson?.error?.code==='number'?postJson.error.code:null;
     requestedSubscriptionSuccess=postResponse.ok&&(postJson?.success===true||postJson?.success==='true');
     if(!postResponse.ok)console.warn('family_wa: subscription rejected',JSON.stringify({http_status:graphStatus,meta_error_code:graphCode}));
    }
    if(!subscribe||requestedSubscriptionSuccess){
     const getResponse=await fetch(graph,{method:'GET',headers:{authorization:'Bearer '+access}});
     graphStatus=getResponse.status;
     const getJson=await getResponse.json().catch(()=>({}));
     graphCode=typeof getJson?.error?.code==='number'?getJson.error.code:null;
     if(getResponse.ok){
      tokenValid=true;
      const apps=Array.isArray(getJson?.data)?getJson.data:[];
      subscriptionCount=apps.length;
      const ownApp=apps.find((a:any)=>String(a?.whatsapp_business_api_data?.id ?? a?.id ?? '')===metaAppId);
      subscribed=!!ownApp;
      hasAlternateCallback=!!ownApp?.override_callback_uri;
     }
    }
   }catch(error){console.warn('family_wa: connectivity diagnostic unavailable')}
  }
  const status={
   webhook_validated:appSecret,
   outgoing_token_configured:!!access,
   meta_api_accepted:tokenValid,
   subscription_confirmed:subscribed,
   subscription_count:subscriptionCount,
   callback_override_configured:hasAlternateCallback,
   subscription_request_accepted:subscribe?requestedSubscriptionSuccess:null,
   meta_api_http_status:graphStatus,
   meta_error_code:graphCode,
   link_code_active:!!linkCode&&!linkCode.used_at&&Date.parse(linkCode.expires_at)>Date.now(),
   whatsapp_linked:!!link,
  };
  console.info('family_wa: authorized_health_check',JSON.stringify({meta_api_http_status:graphStatus,meta_error_code:graphCode,subscribed,link_active:status.link_code_active,requested_subscription:subscribe}));
  return diagJson(status);
 }catch(error){console.error('family_wa: diagnostic failure',String(error).slice(0,120));return diagJson({error:'Não foi possível consultar a integração agora.'},500)}
}

async function handleOne(db:any,message:any,phoneId:string){
 const msgId=String(message?.id||'').slice(0,160),wa=String(message?.from||'');
 if(!msgId||!/^[0-9]{8,18}$/.test(wa))return true;
 const {data:previous,error:queryErr}=await db.from('family_wa_events').select('message_id,received_at,reply_text,reply_delivered_at').eq('message_id',msgId).maybeSingle();
 if(queryErr)throw queryErr;
 if(previous?.reply_delivered_at)return true;
 if(previous&&!previous.reply_text){
  if(Date.now()-Date.parse(previous.received_at)<90000)return false;
  const {error:deleteError}=await db.from('family_wa_events').delete().eq('message_id',msgId).is('processed_at',null);
  if(deleteError)throw deleteError;
 }
 let reply=previous?.reply_text||null;
 if(!reply){
  const {error:createErr}=await db.from('family_wa_events').insert({message_id:msgId,wa_id:wa});
  if(createErr){if(createErr.code==='23505')return false;throw createErr}
  try{
   reply=message.type==='text'
    ?await processFamilyText(db,wa,String(message.text?.body||''))
    :'Por enquanto, envie o lançamento por texto. O suporte a áudio e imagens será adicionado depois.';
   const {error:updateErr}=await db.from('family_wa_events').update({processed_at:new Date().toISOString(),reply_text:reply}).eq('message_id',msgId);
   if(updateErr)throw updateErr;
  }catch(error){
   const messageText=error instanceof Error?error.message:String(error);
   console.error('family_wa: processing failed',messageText.slice(0,180));
   await db.from('family_wa_events').update({last_error:'Processing failed'}).eq('message_id',msgId);
   return false;
  }
 }
 const sent=await sendWhatsApp(phoneId,wa,reply);
 if(sent){
  await db.from('family_wa_events').update({reply_delivered_at:new Date().toISOString(),last_error:null}).eq('message_id',msgId);
  console.info('family_wa: processed_and_replied',JSON.stringify({type:message.type}));
 }else{
  await db.from('family_wa_events').update({last_error:'WhatsApp send unavailable'}).eq('message_id',msgId);
 }
 return sent;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:diagnosticsCors});
 const secret=Deno.env.get('META_APP_SECRET');
 const verify=Deno.env.get('META_VERIFY_TOKEN')||'glfamily-meta-verify-2026-b83f5c9a2e71';
 const u=new URL(req.url);
 if(req.method==='GET'){
  if(u.searchParams.get('hub.mode')==='subscribe'&&u.searchParams.get('hub.verify_token')===verify)return plain(u.searchParams.get('hub.challenge')||'');
  if(u.searchParams.get('diagnostic')==='status')return metaDiagnostic(req,false);
  return plain('Forbidden',403);
 }
 if(req.method==='POST'&&u.searchParams.get('diagnostic')==='subscribe')return metaDiagnostic(req,true);
 if(req.method!=='POST')return plain('Method not allowed',405);
 if(!secret)return plain('Webhook not configured',503);
 const raw=await req.text();
 if(raw.length>1_000_000)return plain('Payload too large',413);
 if(!await validSignature(secret,raw,req.headers.get('x-hub-signature-256')||''))return plain('Forbidden',403);
 let data:any;try{data=JSON.parse(raw)}catch{return plain('Invalid JSON',400)}
 if(data?.object!=='whatsapp_business_account')return plain('Ignored');
 const changes=(data.entry||[]).flatMap((e:any)=>e.changes||[]);
 const incoming=changes.flatMap((c:any)=>(c.value?.messages||[]).map((m:any)=>({message:m,phoneId:String(c.value?.metadata?.phone_number_id||'')})));
 console.info('family_wa: verified_event',JSON.stringify({message_count:incoming.length,outgoing_configured:!!token(),types:incoming.map((e:any)=>e.message.type)}));
 if(!incoming.length)return plain('EVENT_RECEIVED');
 let db:any;try{db=adminClient()}catch(error){console.error('family_wa: database unavailable');return plain('Internal error',503)}
 let allOk=true;
 for(const item of incoming){try{if(!await handleOne(db,item.message,item.phoneId))allOk=false}catch(error){console.error('family_wa: handler error',String(error).slice(0,180));allOk=false}}
 return plain(allOk?'EVENT_RECEIVED':'Retry later',allOk?200:503);
});
