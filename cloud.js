const CLOUD_CONFIG_URL="https://kzkjnamwtqlgcqkeerwj.supabase.co/functions/v1/public-config";
let cloud=null;
let cloudSession=null;
let cloudAuthorized=false;
let googleCalendarState={configured:false,connected:false};

function cloudStatus(message,state=""){
  const text=document.getElementById("cloudStatus");
  const dot=document.getElementById("cloudDot");
  if(text)text.textContent=message;
  if(dot){dot.classList.toggle("ok",state==="ok");dot.classList.toggle("err",state==="err")}
}

function cloudPanels(){
  const out=document.getElementById("cloudLoggedOut");
  const inside=document.getElementById("cloudLoggedIn");
  const user=document.getElementById("cloudUser");
  const connected=Boolean(cloudSession&&cloudAuthorized);
  if(out)out.hidden=connected;
  if(inside)inside.hidden=!connected;
  if(user)user.textContent=connected?cloudSession.user.email:"";
  if(connected){refreshCloudSummary();refreshGoogleCalendarStatus()}
  else renderGoogleCalendarState();
}
function setLastSync(label){
  localStorage.setItem("refrig-last-sync",JSON.stringify({at:new Date().toISOString(),label}));
}
function lastSyncText(){
  try{
    const row=JSON.parse(localStorage.getItem("refrig-last-sync")||"null");
    if(!row?.at)return "Banco real começa limpo. Nada local é enviado automaticamente.";
    return "Última sincronização: "+new Date(row.at).toLocaleString("pt-BR")+" · "+row.label;
  }catch{return "Sincronização manual ativa."}
}
async function refreshCloudSummary(){
  const local=document.getElementById("cloudLocalCount"),remote=document.getElementById("cloudRemoteCount"),last=document.getElementById("cloudLastSync");
  if(local)local.textContent=rawLocalOrders().length+rawLocalVisits().length;
  if(last)last.textContent=lastSyncText();
  if(remote&&cloudAuthorized){
    const [wo,vs]=await Promise.all([
      cloud.from("work_orders").select("*",{count:"exact",head:true}),
      cloud.from("visits").select("*",{count:"exact",head:true})
    ]);
    remote.textContent=wo.error||vs.error?"—":String((wo.count??0)+(vs.count??0));
  }
}

async function initCloud(){
  try{
    cloudStatus("Conectando…");
    const res=await fetch(CLOUD_CONFIG_URL,{cache:"no-store"});
    if(!res.ok)throw new Error("configuração indisponível");
    const cfg=await res.json();
    if(!cfg.url||!cfg.anonKey||!window.supabase?.createClient)throw new Error("configuração incompleta");
    cloud=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await cloud.auth.getSession();
    cloudSession=data.session||null;
    await verifyCloudOwner();
    cloud.auth.onAuthStateChange((_event,session)=>{
      cloudSession=session;
      setTimeout(()=>verifyCloudOwner(),0);
    });
  }catch(err){
    console.error(err);
    cloudStatus("Nuvem indisponível. O modo local continua funcionando.","err");
    cloudPanels();
  }
}

async function verifyCloudOwner(){
  cloudAuthorized=false;
  if(!cloudSession){
    cloudStatus("Desconectado. Dados locais continuam disponíveis.");
    cloudPanels();
    return false;
  }
  const {data,error}=await cloud.from("app_owner").select("user_id").eq("user_id",cloudSession.user.id).maybeSingle();
  if(error||!data){
    cloudStatus("Conta sem autorização para este aplicativo.","err");
    cloudPanels();
    return false;
  }
  cloudAuthorized=true;
  cloudStatus("Conectado e autorizado.","ok");
  cloudPanels();
  return true;
}

function authValues(){
  return {
    email:String(document.getElementById("cloudEmail")?.value||"").trim(),
    password:String(document.getElementById("cloudPassword")?.value||"")
  };
}

document.getElementById("cloudLoginBtn")?.addEventListener("click",async()=>{
  if(!cloud){cloudStatus("A conexão ainda não está pronta.","err");return}
  const {email,password}=authValues();
  if(!email||!password){notify("Informe e-mail e senha.");return}
  cloudStatus("Entrando…");
  const {data,error}=await cloud.auth.signInWithPassword({email,password});
  if(error){
    const msg=/confirm/i.test(error.message)?"Confirme o e-mail antes do primeiro login.":error.message;
    cloudStatus(msg,"err");return;
  }
  cloudSession=data.session;
  document.getElementById("cloudPassword").value="";
  await verifyCloudOwner();
});

document.getElementById("cloudSignupBtn")?.addEventListener("click",async()=>{
  if(!cloud){cloudStatus("A conexão ainda não está pronta.","err");return}
  const {email,password}=authValues();
  if(!email||password.length<6){notify("Informe o e-mail e uma senha com pelo menos 6 caracteres.");return}
  cloudStatus("Criando acesso…");
  const {data,error}=await cloud.auth.signUp({
    email,password,
    options:{emailRedirectTo:location.origin+location.pathname}
  });
  if(error){cloudStatus("Não foi possível criar o acesso: "+error.message,"err");return}
  document.getElementById("cloudPassword").value="";
  if(data.session){
    cloudSession=data.session;
    await verifyCloudOwner();
  }else{
    cloudStatus("Acesso criado. Confira o e-mail para confirmar a conta.","ok");
  }
});

document.getElementById("cloudResetBtn")?.addEventListener("click",async()=>{
  if(!cloud)return;
  const email=String(document.getElementById("cloudEmail")?.value||"").trim();
  if(!email){notify("Informe o e-mail primeiro.");return}
  const {error}=await cloud.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error){cloudStatus("Não foi possível enviar a recuperação: "+error.message,"err");return}
  cloudStatus("E-mail de recuperação enviado.","ok");
});

document.getElementById("cloudLogoutBtn")?.addEventListener("click",async()=>{
  await cloud?.auth.signOut();
  cloudSession=null;cloudAuthorized=false;cloudStatus("Desconectado.");cloudPanels();
});

function rawLocalOrders(){
  try{return JSON.parse(localStorage.getItem("refrig-orders")||"[]")}catch{return []}
}
function rawLocalVisits(){
  try{return JSON.parse(localStorage.getItem("refrig-visits")||"[]")}catch{return []}
}
function localOrdersForSync(){
  const ids=new Set(rawLocalOrders().map(o=>String(o.id)));
  return orders().filter(o=>ids.has(String(o.id)));
}
function remoteStatus(o){
  if(o.tag==="done")return "done";
  const s=String(o.status||"").toLowerCase();
  if(s.includes("peça"))return "waiting_part";
  if(s.includes("aguard"))return "waiting_customer";
  if(s.includes("atendimento"))return "in_service";
  if(o.scheduledAt)return "scheduled";
  return "open";
}
function localStatus(s){
  return ({
    done:["Finalizado","done"],
    in_service:["Em atendimento","service"],
    waiting_customer:["Aguardando retorno","wait"],
    waiting_part:["Aguardando peça","wait"],
    scheduled:["Agendado","wait"],
    cancelled:["Cancelado","done"],
    open:["Aberta","wait"]
  })[s]||["Aberta","wait"];
}
function remotePayment(v){
  return ({Pix:"pix",Dinheiro:"cash",Cartão:"card",Faturado:"invoiced",Crediário:"credit"})[v]||"pending";
}
function localPayment(v){
  return ({pix:"Pix",cash:"Dinheiro",card:"Cartão",invoiced:"Faturado",credit:"Crediário",pending:"Pendente"})[v]||"Pendente";
}
function isoDateTime(v){
  if(!v)return null;
  const d=new Date(v);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}
function ensureSyncKeys(){
  const local=rawLocalOrders();
  let changed=false;
  for(const o of local){
    if(!o.syncKey){o.syncKey=crypto.randomUUID();changed=true}
  }
  if(changed)localStorage.setItem("refrig-orders",JSON.stringify(local));
}
async function upsertId(table,row,key="external_key"){
  const {data,error}=await cloud.from(table).upsert(row,{onConflict:key}).select("id").single();
  if(error)throw error;
  return data.id;
}
async function uploadMediaFor(o,workOrderId){
  const rows=await getOrderMedia(o.id);
  for(const m of rows){
    const ext=(m.mime||"").includes("png")?"png":"jpg";
    const mediaId=String(m.id||crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"");
    const path=cloudSession.user.id+"/"+workOrderId+"/"+m.kind+"-"+mediaId+"."+ext;
    const {error:storageError}=await cloud.storage.from("refrigerista-evidence").upload(path,m.blob,{upsert:true,contentType:m.mime||"image/jpeg"});
    if(storageError)throw storageError;
    if(m.kind==="signature"){
      const {error}=await cloud.from("work_order_closings").update({signature_path:path}).eq("work_order_id",workOrderId);
      if(error)throw error;
    }else{
      const phase=m.phase==="initial"?"before":m.phase==="finish"?"after":"other";
      const {error}=await cloud.from("service_media").upsert({
        work_order_id:workOrderId,phase,storage_path:path,caption:m.name||null,created_by:cloudSession.user.id
      },{onConflict:"storage_path"});
      if(error)throw error;
    }
  }
}

async function invokeGoogleCalendarSync(workOrderId=null,visitId=null){
  if(!googleCalendarState.connected||!cloud)return {skipped:true};
  const body=workOrderId?{work_order_id:workOrderId}:{visit_id:visitId};
  const {data,error}=await cloud.functions.invoke("google-calendar-sync",{body});
  if(error)throw error;
  return data||{};
}
async function uploadLocalData(){
  if(!cloudAuthorized){notify("Entre na nuvem primeiro.");return}
  ensureSyncKeys();
  const list=localOrdersForSync(),visitList=rawLocalVisits();
  if(!list.length&&!visitList.length){notify("Não há dados reais neste aparelho para enviar.");return}
  if(!confirm("Enviar "+list.length+" atendimento(s) e "+visitList.length+" visita(s) deste aparelho para a nuvem?"))return;
  cloudStatus("Enviando dados…","ok");
  try{
    for(const o of list){
      const customerKey=customerIdOf(o);
      const equipmentKey=equipmentIdOf(o);
      const customerId=await upsertId("customers",{
        external_key:customerKey,name:o.customer||"Cliente",phone:o.phone||null,notes:o.customerNotes||null
      });
      let siteId=null;
      if(o.address){
        siteId=await upsertId("customer_sites",{
          external_key:customerKey+"|principal",customer_id:customerId,name:"Principal",address:o.address,notes:null
        });
      }
      const equipmentId=await upsertId("equipments",{
        external_key:equipmentKey,customer_id:customerId,site_id:siteId,type:o.equipmentType||"Outro",
        environment:o.room||null,brand:o.brand||null,model:o.model||null,serial_number:o.serial||null,
        capacity:o.capacity||null,voltage:o.voltage||null,refrigerant:o.gas||null,
        next_preventive_at:o.nextPreventive||null,notes:o.equipmentNotes||null,active:true
      });
      const workOrderId=await upsertId("work_orders",{
        external_key:o.syncKey,customer_id:customerId,equipment_id:equipmentId,status:remoteStatus(o),
        attendance_type:o.attendanceType||"Manutenção corretiva",complaint:o.complaint||null,
        diagnosis:o.diagnosis||null,service_report:o.service||null,materials_text:o.materials||null,
        scheduled_at:isoDateTime(o.scheduledAt),appointment_duration_minutes:Number(o.appointmentDurationMinutes||60),opened_at:isoDateTime(o.createdAt)||new Date().toISOString(),
        closed_at:o.tag==="done"?(isoDateTime(o.closedAt)||new Date().toISOString()):null,
        created_by:cloudSession.user.id
      });
      if(o.tag==="done"){
        const total=orderTotalValue(o);
        const {error}=await cloud.from("work_order_closings").upsert({
          work_order_id:workOrderId,labor_total:Number(o.laborValue||0),material_total:Number(o.materialValue||0),
          grand_total:total,payment_mode:remotePayment(o.payment),payment_status:o.paymentStatus||"pending",
          amount_paid:Number(o.amountPaid||0),next_preventive_at:o.nextPreventive||null,
          warranty_until:o.warrantyUntil||null,notes:o.closingNotes||null,customer_name:o.customer||null,
          customer_confirmed:Boolean(o.signed),closed_by:cloudSession.user.id,closed_at:isoDateTime(o.closedAt)||new Date().toISOString()
        },{onConflict:"work_order_id"});
        if(error)throw error;
      }
      await uploadMediaFor(o,workOrderId);
      if(googleCalendarState.connected){
        try{await invokeGoogleCalendarSync(workOrderId)}
        catch(err){console.warn("Google Calendar não sincronizado",err)}
      }
    }
    for(const v of visitList){
      let customerId=null;
      if(v.customerId){
        customerId=await upsertId("customers",{
          external_key:v.customerId,name:v.customerName||"Cliente",phone:v.phone||null,notes:null
        });
      }
      const visitId=await upsertId("visits",{
        external_key:v.syncKey||v.id,customer_id:customerId,customer_name:v.customerName||"Contato",
        phone:v.phone||null,address:v.address||null,title:v.title||"Visita",notes:v.notes||null,
        scheduled_at:isoDateTime(v.scheduledAt)||new Date().toISOString(),
        duration_minutes:Number(v.durationMinutes||60),status:v.status||"scheduled",
        created_by:cloudSession.user.id
      });
      if(googleCalendarState.connected){
        try{await invokeGoogleCalendarSync(null,visitId)}catch(err){console.warn("Visita não sincronizada no Google",err)}
      }
    }
    setLastSync("envio para nuvem");
    await refreshCloudSummary();
    cloudStatus("Envio concluído. Nuvem atualizada.","ok");
    notify("Dados enviados para a nuvem.");
  }catch(err){
    console.error(err);cloudStatus("Falha no envio: "+(err.message||err),"err");notify("Falha ao sincronizar.");
  }
}

async function clearMediaStore(){
  const db=await mediaDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,"readwrite");
    tx.objectStore(MEDIA_STORE).clear();
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
async function downloadBlob(path){
  const {data,error}=await cloud.storage.from("refrigerista-evidence").download(path);
  if(error)throw error;
  return data;
}
async function downloadCloudData(){
  if(!cloudAuthorized){notify("Entre na nuvem primeiro.");return}
  if(!confirm("Substituir os dados locais deste aparelho pelo conteúdo atual da nuvem?"))return;
  cloudStatus("Baixando histórico…","ok");
  try{
    const results=await Promise.all([
      cloud.from("customers").select("*"),
      cloud.from("customer_sites").select("*"),
      cloud.from("equipments").select("*"),
      cloud.from("work_orders").select("*").order("opened_at",{ascending:false}),
      cloud.from("work_order_closings").select("*"),
      cloud.from("service_media").select("*"),
      cloud.from("visits").select("*").order("scheduled_at",{ascending:true})
    ]);
    for(const r of results)if(r.error)throw r.error;
    const [customersR,sitesR,equipR,ordersR,closingsR,mediaR,visitsR]=results;
    const customers=new Map(customersR.data.map(x=>[x.id,x]));
    const sites=new Map(sitesR.data.map(x=>[x.id,x]));
    const equipments=new Map(equipR.data.map(x=>[x.id,x]));
    const closings=new Map(closingsR.data.map(x=>[x.work_order_id,x]));
    const mediaByOrder=new Map();
    for(const m of mediaR.data){
      if(!mediaByOrder.has(m.work_order_id))mediaByOrder.set(m.work_order_id,[]);
      mediaByOrder.get(m.work_order_id).push(m);
    }
    const local=[];
    const localIdByRemote=new Map();
    for(const w of ordersR.data){
      const customer=customers.get(w.customer_id)||{};
      const equipment=equipments.get(w.equipment_id)||{};
      const site=sites.get(equipment.site_id)||{};
      const closing=closings.get(w.id)||{};
      const [status,tag]=localStatus(w.status);
      const localId=String(w.number||w.external_key||crypto.randomUUID());
      localIdByRemote.set(w.id,localId);
      const photos=mediaByOrder.get(w.id)||[];
      const total=Number(closing.grand_total||0);
      local.push({
        id:localId,syncKey:w.external_key||crypto.randomUUID(),customer:customer.name||"Cliente",
        customerId:customer.external_key||"",phone:customer.phone||"",address:site.address||"",
        customerNotes:customer.notes||"",equipment:[equipment.brand,equipment.model,equipment.capacity].filter(Boolean).join(" ")||equipment.type||"Equipamento",
        equipmentId:equipment.external_key||"",equipmentKey:equipment.external_key||"",equipmentType:equipment.type||"",
        brand:equipment.brand||"",model:equipment.model||"",capacity:equipment.capacity||"",voltage:equipment.voltage||"",
        gas:equipment.refrigerant||"",room:equipment.environment||"",serial:equipment.serial_number||"",equipmentNotes:equipment.notes||"",
        attendanceType:w.attendance_type||"Manutenção corretiva",scheduledAt:w.scheduled_at||"",appointmentDurationMinutes:Number(w.appointment_duration_minutes||60),
        complaint:w.complaint||"Sem relato inicial",diagnosis:w.diagnosis||"",service:w.service_report||"",materials:w.materials_text||"",
        status,tag,laborValue:Number(closing.labor_total||0),materialValue:Number(closing.material_total||0),
        payment:localPayment(closing.payment_mode),paymentStatus:closing.payment_status||"pending",
        amountPaid:Number(closing.amount_paid||0),nextPreventive:closing.next_preventive_at||"",
        warrantyUntil:closing.warranty_until||"",closingNotes:closing.notes||"",signed:Boolean(closing.customer_confirmed),
        initialPhotos:photos.filter(x=>x.phase==="before").length,finishPhotos:photos.filter(x=>x.phase!=="before").length,
        createdAt:w.opened_at||new Date().toISOString(),closedAt:w.closed_at||"",
        value:total?moneyValue(total):"A orçar",
        history:[
          {when:w.opened_at||"",label:"Atendimento aberto",detail:w.complaint||"Atendimento registrado."},
          ...(tag==="done"?[{when:w.closed_at||closing.closed_at||"",label:"Atendimento finalizado",detail:(w.service_report||"Serviço concluído")+" · "+moneyValue(total)}]:[])
        ]
      });
    }
    localStorage.setItem("refrig-orders",JSON.stringify(local));
    localStorage.setItem("refrig-order-details","{}");
    localStorage.setItem("refrig-visits",JSON.stringify((visitsR.data||[]).map(v=>({
      id:v.external_key||v.id,syncKey:v.external_key||v.id,customerId:customers.get(v.customer_id)?.external_key||"",
      customerName:v.customer_name||"Contato",phone:v.phone||"",address:v.address||"",title:v.title||"Visita",
      notes:v.notes||"",scheduledAt:v.scheduled_at||"",durationMinutes:Number(v.duration_minutes||60),
      status:v.status||"scheduled",createdAt:v.created_at||"",updatedAt:v.updated_at||""
    }))));
    localStorage.setItem("refrig-initialized","1");
    await clearMediaStore();
    for(const m of mediaR.data){
      const orderId=localIdByRemote.get(m.work_order_id);if(!orderId)continue;
      try{
        const blob=await downloadBlob(m.storage_path);
        await putMedia({id:m.id,orderId,kind:"photo",phase:m.phase==="before"?"initial":"finish",name:m.caption||"foto",mime:blob.type||"image/jpeg",blob,createdAt:m.created_at});
      }catch(err){console.warn("Foto não baixada",err)}
    }
    for(const closing of closingsR.data.filter(x=>x.signature_path)){
      const orderId=localIdByRemote.get(closing.work_order_id);if(!orderId)continue;
      try{
        const blob=await downloadBlob(closing.signature_path);
        await putMedia({id:"sig-"+closing.work_order_id,orderId,kind:"signature",phase:"finish",name:"assinatura.png",mime:blob.type||"image/png",blob,createdAt:closing.closed_at});
      }catch(err){console.warn("Assinatura não baixada",err)}
    }
    render();
    setLastSync("download da nuvem");
    await refreshCloudSummary();
    cloudStatus("Este aparelho está atualizado pela nuvem.","ok");
    notify("Histórico baixado da nuvem.");
  }catch(err){
    console.error(err);cloudStatus("Falha no download: "+(err.message||err),"err");notify("Falha ao atualizar este aparelho.");
  }
}

document.getElementById("cloudUploadBtn")?.addEventListener("click",uploadLocalData);
document.getElementById("cloudDownloadBtn")?.addEventListener("click",downloadCloudData);

initCloud();


// --- Google Calendar ---
function renderGoogleCalendarState(){
  const status=document.getElementById("googleCalendarStatus");
  const dot=document.getElementById("googleCalendarDot");
  const out=document.getElementById("googleCalendarDisconnected");
  const inside=document.getElementById("googleCalendarConnected");
  const account=document.getElementById("googleCalendarAccount");
  const name=document.getElementById("googleCalendarName");
  const connect=document.getElementById("googleCalendarConnectBtn");

  if(!cloudAuthorized){
    if(status)status.textContent="Entre na nuvem para configurar.";
    if(dot){dot.classList.remove("ok","err")}
    if(out)out.hidden=false;if(inside)inside.hidden=true;
    if(connect)connect.disabled=true;
    return;
  }

  if(!googleCalendarState.configured){
    if(status)status.textContent="Integração preparada; falta cadastrar o OAuth do Google.";
    if(dot){dot.classList.remove("ok");dot.classList.add("err")}
    if(out)out.hidden=false;if(inside)inside.hidden=true;
    if(connect)connect.disabled=true;
    return;
  }

  if(googleCalendarState.connected){
    if(status)status.textContent="Agenda conectada.";
    if(dot){dot.classList.add("ok");dot.classList.remove("err")}
    if(out)out.hidden=true;if(inside)inside.hidden=false;
    if(account)account.textContent=googleCalendarState.google_email||"Conta Google conectada";
    if(name)name.textContent="Agenda: "+(googleCalendarState.calendar_name||"Luiz Miguel — Atendimentos");
  }else{
    if(status)status.textContent="Pronto para conectar a conta Google do Luiz.";
    if(dot){dot.classList.remove("ok","err")}
    if(out)out.hidden=false;if(inside)inside.hidden=true;
    if(connect)connect.disabled=false;
  }
}

async function refreshGoogleCalendarStatus(){
  if(!cloudAuthorized||!cloud){renderGoogleCalendarState();return}
  try{
    const {data,error}=await cloud.functions.invoke("google-calendar-status",{body:{}});
    if(error)throw error;
    googleCalendarState={
      configured:Boolean(data?.configured),
      connected:Boolean(data?.connected),
      google_email:data?.google_email||null,
      calendar_name:data?.calendar_name||null,
      calendar_id:data?.calendar_id||null,
      redirect_uri:data?.redirect_uri||null
    };
  }catch(err){
    console.error(err);
    googleCalendarState={configured:false,connected:false,error:true};
  }
  renderGoogleCalendarState();
}

document.getElementById("googleCalendarConnectBtn")?.addEventListener("click",async()=>{
  if(!cloudAuthorized||!cloud){notify("Entre na nuvem primeiro.");return}
  const btn=document.getElementById("googleCalendarConnectBtn");
  if(btn)btn.disabled=true;
  try{
    const returnUrl=location.origin+location.pathname;
    const {data,error}=await cloud.functions.invoke("google-calendar-auth-start",{body:{return_url:returnUrl}});
    if(error)throw error;
    if(!data?.authorization_url){
      if(data?.error==="google_oauth_not_configured")throw new Error("OAuth do Google ainda não configurado.");
      throw new Error("URL de autorização não recebida.");
    }
    location.href=data.authorization_url;
  }catch(err){
    console.error(err);notify(err.message||"Não foi possível iniciar a conexão Google.");
    if(btn)btn.disabled=false;
    await refreshGoogleCalendarStatus();
  }
});

document.getElementById("googleCalendarDisconnectBtn")?.addEventListener("click",async()=>{
  if(!confirm("Desconectar o Google Agenda? Os eventos já criados continuarão na agenda."))return;
  try{
    const {error}=await cloud.functions.invoke("google-calendar-disconnect",{body:{}});
    if(error)throw error;
    googleCalendarState={configured:true,connected:false};
    renderGoogleCalendarState();
    notify("Google Agenda desconectado.");
  }catch(err){console.error(err);notify("Não foi possível desconectar a agenda.")}
});

document.getElementById("googleCalendarSyncBtn")?.addEventListener("click",async()=>{
  if(!googleCalendarState.connected)return;
  try{
    const [wo,vs]=await Promise.all([cloud.from("work_orders").select("id"),cloud.from("visits").select("id")]);
    if(wo.error||vs.error)throw wo.error||vs.error;
    let done=0;
    for(const row of wo.data||[]){try{await invokeGoogleCalendarSync(row.id,null);done++}catch(err){console.warn(err)}}
    for(const row of vs.data||[]){try{await invokeGoogleCalendarSync(null,row.id);done++}catch(err){console.warn(err)}}
    notify("Agenda sincronizada: "+done+" registro(s).");
  }catch(err){console.error(err);notify("Falha ao sincronizar a agenda.")}
});

function consumeGoogleCalendarCallback(){
  const url=new URL(location.href);
  const result=url.searchParams.get("google_calendar");
  if(!result)return;
  const reason=url.searchParams.get("reason");
  url.searchParams.delete("google_calendar");
  url.searchParams.delete("reason");
  history.replaceState({},document.title,url.toString());
  if(result==="connected")notify("Google Agenda conectado.");
  else notify("Falha ao conectar Google Agenda"+(reason?": "+reason:"")+".");
}

consumeGoogleCalendarCallback();
