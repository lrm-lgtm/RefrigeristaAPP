const demoOrders=[
{id:123,customer:"Maria Aparecida",equipment:"LG Dual Inverter 12.000 BTU",status:"Em atendimento",tag:"service",complaint:"Não está gelando corretamente.",when:"Hoje 18:30",value:"R$ 250,00"},
{id:122,customer:"Mercado Avenida",equipment:"Câmara fria principal",status:"Aguardando retorno",tag:"wait",complaint:"Temperatura oscilando durante a madrugada.",when:"Hoje 16:10",value:"R$ 680,00"},
{id:121,customer:"Paulo Roberto",equipment:"Freezer horizontal",status:"Aberta",tag:"wait",complaint:"Liga, mas não atinge a temperatura.",when:"Ontem 14:20",value:"A orçar"}
];

const views=[...document.querySelectorAll(".view")];
const nav=[...document.querySelectorAll(".bottom-nav [data-go]")];
const toast=document.getElementById("toast");
const dialog=document.getElementById("newOsDialog");
const form=document.getElementById("osForm");
const steps=[...document.querySelectorAll(".step")];
const stepDots=[...document.querySelectorAll(".steps i")];
let currentView="home";
let orderFilter="all";
let visitFilter="all";
let pendingVisitConversionId="";

const MEDIA_DB_NAME="refrigerista-media-v1";
const MEDIA_STORE="media";
let mediaDbPromise=null;
function mediaDb(){
  if(mediaDbPromise)return mediaDbPromise;
  mediaDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(MEDIA_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(MEDIA_STORE)){
        const store=db.createObjectStore(MEDIA_STORE,{keyPath:"id"});
        store.createIndex("orderId","orderId",{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return mediaDbPromise;
}
async function putMedia(record){
  const db=await mediaDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,"readwrite");
    tx.objectStore(MEDIA_STORE).put(record);
    tx.oncomplete=()=>resolve(true); tx.onerror=()=>reject(tx.error);
  });
}
async function getOrderMedia(orderId){
  const db=await mediaDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,"readonly");
    const req=tx.objectStore(MEDIA_STORE).index("orderId").getAll(String(orderId));
    req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error);
  });
}
async function saveOrderFiles(orderId,files,phase){
  const list=[...(files||[])];
  for(const file of list){
    await putMedia({
      id:crypto.randomUUID(),orderId:String(orderId),kind:"photo",phase,
      name:file.name||"foto.jpg",mime:file.type||"image/jpeg",blob:file,createdAt:new Date().toISOString()
    });
  }
  return list.length;
}
async function saveSignatureMedia(orderId){
  if(!signatureCanvas||!hasSignature)return false;
  const blob=await new Promise(resolve=>signatureCanvas.toBlob(resolve,"image/png"));
  if(!blob)return false;
  await putMedia({id:crypto.randomUUID(),orderId:String(orderId),kind:"signature",phase:"finish",name:"assinatura.png",mime:"image/png",blob,createdAt:new Date().toISOString()});
  return true;
}


function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function notify(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>toast.classList.remove("show"),2200)}
function go(name){
  currentView=name;
  views.forEach(v=>v.classList.toggle("active",v.dataset.view===name));
  nav.forEach(b=>b.classList.toggle("active",b.dataset.go===name));
  if(name==="clients")renderClients(document.getElementById("clientSearch")?.value||"");
  if(name==="equipment")renderEquipment(document.getElementById("equipmentSearch")?.value||"");
  if(name==="visits")renderVisits();
  scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));

function visitRows(){try{return JSON.parse(localStorage.getItem("refrig-visits")||"[]")}catch{return []}}
function saveVisits(rows){localStorage.setItem("refrig-visits",JSON.stringify(rows))}
function orderDetails(){try{return JSON.parse(localStorage.getItem("refrig-order-details")||"{}")}catch{return {}}}
function saveOrderDetail(id,patch){const all=orderDetails();all[String(id)]={...(all[String(id)]||{}),...patch};localStorage.setItem("refrig-order-details",JSON.stringify(all))}
function orders(){
  try{
    const local=JSON.parse(localStorage.getItem("refrig-orders")||"[]");
    const initialized=localStorage.getItem("refrig-initialized")==="1";
    const base=local.length||initialized?local:demoOrders;
    const detail=orderDetails();
    return base.map(o=>({...o,...(detail[String(o.id)]||{})}));
  }catch{return localStorage.getItem("refrig-initialized")==="1"?[]:demoOrders}
}

function normalizeKey(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function stableId(prefix,value){
  const text=prefix+"|"+normalizeKey(value);
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
  return prefix+"_"+(h>>>0).toString(36);
}
function customerIdOf(o){
  return o.customerId||stableId("cus",[o.customer||"Cliente",String(o.phone||"").replace(/\D/g,"")].join("|"));
}
function equipmentKeyOf(o){
  return o.equipmentKey||[o.customer||"",o.serial||"",o.equipment||"",o.room||""].join("|").toLowerCase();
}
function equipmentIdOf(o){
  return o.equipmentId||stableId("eqp",[customerIdOf(o),o.serial||"",o.equipment||"",o.room||""].join("|"));
}
function orderTotalValue(o){
  const detailed=Number(o.laborValue||0)+Number(o.materialValue||0);
  return detailed||parseMoney(o.value);
}
function customerRows(){
  const map=new Map();
  for(const o of orders()){
    const id=customerIdOf(o);
    if(!map.has(id)) map.set(id,{id,name:(o.customer||"Cliente").trim(),phone:o.phone||"",address:o.address||"",notes:o.customerNotes||"",orders:[],equipmentIds:new Set(),total:0});
    const row=map.get(id);
    row.phone=row.phone||o.phone||""; row.address=row.address||o.address||""; row.notes=row.notes||o.customerNotes||"";
    row.orders.push({...o,customerId:id,equipmentId:equipmentIdOf(o)});
    row.equipmentIds.add(equipmentIdOf(o));
    row.total+=orderTotalValue(o);
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
function equipmentRows(){
  const map=new Map();
  for(const o of orders()){
    const id=equipmentIdOf(o), customerId=customerIdOf(o);
    const key=equipmentKeyOf(o);
    if(!map.has(id)) map.set(id,{
      id,key,customerId,customer:o.customer||"Cliente",name:o.equipment||"Equipamento",
      type:o.equipmentType||"",brand:o.brand||"",model:o.model||"",capacity:o.capacity||"",
      voltage:o.voltage||"",gas:o.gas||"",room:o.room||"",serial:o.serial||"",notes:o.equipmentNotes||"",
      orders:[],total:0,nextPreventive:""
    });
    const row=map.get(id);
    for(const f of ["type","brand","model","capacity","voltage","gas","room","serial","notes"]){ if(!row[f]&&o[f]) row[f]=o[f]; }
    row.orders.push({...o,customerId,equipmentId:id});
    row.total+=orderTotalValue(o);
    if(o.nextPreventive) row.nextPreventive=o.nextPreventive;
  }
  return [...map.values()].sort((a,b)=>a.customer.localeCompare(b.customer,"pt-BR")||a.name.localeCompare(b.name,"pt-BR"));
}
function initials(name){return String(name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()}
function whatsappHref(phone){
  let d=String(phone||"").replace(/\D/g,"");
  if((d.length===10||d.length===11)&&!d.startsWith("55"))d="55"+d;
  return d?"https://wa.me/"+d:"";
}
function renderClients(filter=""){
  const target=document.getElementById("clientList"); if(!target)return;
  const q=String(filter||"").toLowerCase().trim();
  const rows=customerRows().filter(c=>!q||[c.name,c.phone,...c.orders.map(o=>o.equipment)].join(" ").toLowerCase().includes(q));
  target.innerHTML=rows.length?rows.map(c=>
    '<article class="client-card clickable-card" data-client="'+esc(c.id)+'">'+
      '<div class="avatar">'+esc(initials(c.name))+'</div><div><b>'+esc(c.name)+'</b>'+
      '<small>'+c.equipmentIds.size+' equipamento(s) · '+c.orders.length+' atendimento(s)</small>'+
      (c.phone?'<em>'+esc(c.phone)+'</em>':'')+'</div><span>›</span></article>'
  ).join(""):'<div class="empty-state">Nenhum cliente encontrado.</div>';
}
function renderEquipment(filter=""){
  const target=document.getElementById("equipmentList"); if(!target)return;
  const q=String(filter||"").toLowerCase().trim();
  const rows=equipmentRows().filter(e=>!q||[e.customer,e.name,e.brand,e.model,e.serial,e.room].join(" ").toLowerCase().includes(q));
  target.innerHTML=rows.length?rows.map(e=>
    '<article class="equipment-card clickable-card" data-equipment="'+esc(e.id)+'">'+
      '<div class="equip-icon">'+(String(e.type||e.name).toLowerCase().includes("câmara")?"▣":"❄")+'</div>'+
      '<div><b>'+esc(e.name)+'</b><small>'+esc(e.customer)+(e.room?' · '+esc(e.room):'')+'</small>'+
      '<em>'+esc([e.gas,e.voltage,e.serial&&("S/N "+e.serial)].filter(Boolean).join(" · ")||e.orders.length+" atendimento(s)")+'</em></div><span>›</span></article>'
  ).join(""):'<div class="empty-state">Nenhum equipamento encontrado.</div>';
}

function visitWhenLabel(v){
  const d=new Date(v.scheduledAt);if(Number.isNaN(d.getTime()))return v.scheduledAt||"";
  return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function visitCard(v){
  const tag=v.status==="done"?"done":v.status==="cancelled"?"cancelled":"scheduled";
  const label=({scheduled:"Agendado",done:"Concluído",cancelled:"Cancelado"})[v.status]||"Agendado";
  const actions=v.status==="scheduled"
    ?'<div class="visit-actions"><button type="button" data-visit-order="'+esc(v.id)+'">Virar atendimento</button><button type="button" data-visit-done="'+esc(v.id)+'">Concluir</button><button type="button" data-visit-cancel="'+esc(v.id)+'">Cancelar</button></div>'
    :'';
  return '<article class="visit-card '+tag+'" data-visit="'+esc(v.id)+'"><div class="visit-date"><b>'+esc(visitWhenLabel(v))+'</b><small>'+esc(v.durationMinutes||60)+' min</small></div><div class="visit-main"><div><small>'+esc(v.title||"Visita")+'</small><b>'+esc(v.customerName||"Contato")+'</b></div><span class="visit-status '+tag+'">'+label+'</span><p>'+esc([v.address,v.notes].filter(Boolean).join(" · ")||"Sem observações")+'</p>'+actions+'</div></article>';
}
function renderVisits(){
  const rows=visitRows().slice().sort((a,b)=>String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  const now=Date.now();
  const upcoming=rows.filter(v=>v.status==="scheduled"&&new Date(v.scheduledAt).getTime()>=now-6*60*60*1000).slice(0,4);
  const home=document.getElementById("homeVisits");
  if(home)home.innerHTML=upcoming.length?upcoming.map(visitCard).join(""):'<div class="preventive-empty">Nenhuma visita agendada.</div>';
  const q=String(document.getElementById("visitSearch")?.value||"").toLowerCase().trim();
  const filtered=rows.filter(v=>visitFilter==="all"||v.status===visitFilter).filter(v=>!q||[v.customerName,v.phone,v.address,v.title,v.notes].join(" ").toLowerCase().includes(q));
  const list=document.getElementById("visitList");
  if(list)list.innerHTML=filtered.length?filtered.map(visitCard).join(""):'<div class="empty-state">Nenhuma visita neste filtro.</div>';
  document.querySelectorAll("[data-visit-filter]").forEach(b=>b.classList.toggle("active",b.dataset.visitFilter===visitFilter));
}
function card(o){
  const pay=o.tag==="done"?'<span class="pay-mini '+esc(o.paymentStatus||"pending")+'">'+esc(paymentStatusLabel(o.paymentStatus))+'</span>':"";
  return '<article class="order-card" data-order="'+esc(o.id)+'"><div class="order-top"><div><small>Atendimento #'+esc(o.id)+(o.attendanceType?' · '+esc(o.attendanceType):'')+'</small><b>'+esc(o.customer)+'</b></div><span class="tag '+(o.tag==="wait"?"wait":o.tag==="done"?"done":"")+'">'+esc(o.status)+'</span></div><p><b>'+esc(o.equipment)+'</b><br>'+esc(o.complaint)+'</p><div class="order-footer"><span>'+esc(orderWhenLabel(o))+'</span><div class="order-money">'+pay+'<b>'+esc(o.value)+'</b></div></div></article>'
}
function refreshCustomerOptions(){const d=document.getElementById("customerOptions");if(d)d.innerHTML=customerRows().map(c=>'<option value="'+esc(c.name)+'"></option>').join("")}
function orderMatchesFilter(o,filter){
  if(filter==="open")return o.tag!=="done";
  if(filter==="receivable")return o.tag==="done"&&(o.paymentStatus||"pending")!=="paid";
  if(filter==="done")return o.tag==="done";
  return true;
}
function renderOrderList(){
  const q=String(document.getElementById("orderSearch")?.value||"").toLowerCase().trim();
  const list=orders().filter(o=>orderMatchesFilter(o,orderFilter)).filter(o=>!q||(o.customer+" "+o.equipment+" "+o.id+" "+(o.complaint||"")+" "+(o.attendanceType||"")+" "+(o.serial||"")).toLowerCase().includes(q));
  const target=document.getElementById("orderList"); if(target)target.innerHTML=list.length?list.map(card).join(""):'<div class="empty-state">Nenhum atendimento neste filtro.</div>';
  document.querySelectorAll("[data-order-filter]").forEach(b=>b.classList.toggle("active",b.dataset.orderFilter===orderFilter));
}
function renderPreventives(list){
  const target=document.getElementById("preventiveList"); if(!target)return;
  const rows=list.filter(o=>o.nextPreventive).sort((a,b)=>String(a.nextPreventive).localeCompare(String(b.nextPreventive))).slice(0,5);
  target.innerHTML=rows.length?rows.map(o=>{
    const [y,m,d]=String(o.nextPreventive).slice(0,10).split("-");
    const month=({01:"JAN",02:"FEV",03:"MAR",04:"ABR",05:"MAI",06:"JUN",07:"JUL",08:"AGO",09:"SET",10:"OUT",11:"NOV",12:"DEZ"})[m]||m;
    const overdue=String(o.nextPreventive)<new Date().toISOString().slice(0,10);
    return '<div data-order="'+esc(o.id)+'" class="'+(overdue?'overdue':'')+'"><span class="date">'+esc(d+" "+month)+'</span><p><b>'+esc(o.customer)+'</b><small>'+esc(o.equipment)+' · '+(overdue?'retorno vencido':'retorno recomendado')+'</small></p><span class="preventive-arrow">›</span></div>';
  }).join(""):'<div class="preventive-empty">Nenhuma preventiva agendada ainda.</div>';
}
function render(){
 const list=orders();
 document.getElementById("homeOrders").innerHTML=list.slice(0,4).map(card).join("");
 renderOrderList();
 document.getElementById("openCount").textContent=list.filter(o=>o.tag!=="done").length;
 document.getElementById("pendingPaymentCount").textContent=list.filter(o=>o.tag==="done"&&(o.paymentStatus||"pending")!=="paid").length;
 document.getElementById("preventiveCount").textContent=list.filter(o=>o.nextPreventive).length;
 renderPreventives(list);
 renderClients(document.getElementById("clientSearch")?.value||"");
 renderEquipment(document.getElementById("equipmentSearch")?.value||"");
 refreshCustomerOptions();
 renderVisits();
}
render();

function setStep(n){
  steps.forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===n));
  stepDots.forEach((d,i)=>d.classList.toggle("on",i<n));
  document.getElementById("wizardTitle").textContent=({1:"Cliente",2:"Equipamento",3:"Atendimento"})[n];
}
function populateExistingEquipment(preselect=""){
  const wrap=document.getElementById("existingEquipmentWrap"),select=document.getElementById("existingEquipmentSelect");
  if(!wrap||!select)return;
  const customer=String(form.elements.customer?.value||"").trim();
  const c=customerRows().find(x=>x.name===customer);
  const rows=equipmentRows().filter(e=>c?e.customerId===c.id:e.customer===customer);
  wrap.hidden=!rows.length;
  select.innerHTML='<option value="">Cadastrar novo equipamento</option>'+rows.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name+(e.room?" · "+e.room:""))+'</option>').join("");
  if(preselect){select.value=preselect;select.dispatchEvent(new Event("change"))}
}
function openNewOrder(customerId="",equipmentId=""){
  pendingVisitConversionId="";
  form.reset();
  const c=customerRows().find(x=>x.id===customerId);
  if(c){
    form.elements.customer.value=c.name;
    if(c.phone)form.elements.phone.value=c.phone;
    if(form.elements.address&&c.address)form.elements.address.value=c.address;
    if(form.elements.customerNotes&&c.notes)form.elements.customerNotes.value=c.notes;
  }
  setStep(c?2:1);
  dialog.showModal();
  if(c)requestAnimationFrame(()=>populateExistingEquipment(equipmentId));
}
document.querySelectorAll("[data-action='new-os']").forEach(b=>b.addEventListener("click",()=>openNewOrder()));
document.querySelectorAll("[data-next]").forEach(b=>b.addEventListener("click",()=>{
  if(b.dataset.next==="2"&&!form.customer.value.trim()){notify("Informe o cliente.");return}
  const next=Number(b.dataset.next);setStep(next);
  if(next===2)populateExistingEquipment();
}));
document.querySelectorAll("[data-prev]").forEach(b=>b.addEventListener("click",()=>setStep(Number(b.dataset.prev))));
form.elements.customer?.addEventListener("change",()=>{
  const c=customerRows().find(x=>x.name===String(form.elements.customer.value||"").trim());
  if(c?.phone&&!form.elements.phone.value)form.elements.phone.value=c.phone;
  if(c?.address&&form.elements.address&&!form.elements.address.value)form.elements.address.value=c.address;
  if(c?.notes&&form.elements.customerNotes&&!form.elements.customerNotes.value)form.elements.customerNotes.value=c.notes;
});
document.getElementById("existingEquipmentSelect")?.addEventListener("change",e=>{
  if(!e.target.value)return;
  const row=equipmentRows().find(x=>x.id===e.target.value); if(!row)return;
  const values={type:row.type,brand:row.brand,model:row.model,capacity:row.capacity,voltage:row.voltage,gas:row.gas,room:row.room,serial:row.serial,equipmentNotes:row.notes};
  for(const [name,value] of Object.entries(values)){if(form.elements[name])form.elements[name].value=value||""}
});
form.addEventListener("submit",async e=>{
  e.preventDefault();
  const fd=new FormData(form);
  const equipmentText=[fd.get("brand"),fd.get("model"),fd.get("capacity")].filter(Boolean).join(" ")||fd.get("type")||"Equipamento";
  const existingEquipment=fd.get("existingEquipment")?equipmentRows().find(x=>x.id===String(fd.get("existingEquipment"))):null;
  const customerName=String(fd.get("customer")||"Cliente").trim();
  const phone=String(fd.get("phone")||"").trim();
  const phoneDigits=phone.replace(/\D/g,"");
  const matchedCustomer=customerRows().find(c=>{
    const samePhone=phoneDigits&&String(c.phone||"").replace(/\D/g,"")===phoneDigits;
    const sameName=normalizeKey(c.name)===normalizeKey(customerName);
    return samePhone||sameName;
  });
  const customerId=existingEquipment?.customerId||matchedCustomer?.id||stableId("cus",[customerName,phoneDigits].join("|"));
  const equipmentKey=existingEquipment?.key||[customerName,fd.get("serial")||"",equipmentText,fd.get("room")||""].join("|").toLowerCase();
  const equipmentId=existingEquipment?.id||stableId("eqp",[customerId,fd.get("serial")||"",equipmentText,fd.get("room")||""].join("|"));
  const item={
    id:String(Date.now()).slice(-6),
    customer:customerName,
    customerId,
    phone,
    address:String(fd.get("address")||"").trim(),
    customerNotes:String(fd.get("customerNotes")||"").trim(),
    equipment:equipmentText,
    equipmentKey,
    equipmentId,
    equipmentType:String(fd.get("type")||"").trim(),
    brand:String(fd.get("brand")||"").trim(),
    model:String(fd.get("model")||"").trim(),
    capacity:String(fd.get("capacity")||"").trim(),
    voltage:String(fd.get("voltage")||"").trim(),
    gas:String(fd.get("gas")||"").trim(),
    room:String(fd.get("room")||"").trim(),
    serial:String(fd.get("serial")||"").trim(),
    equipmentNotes:String(fd.get("equipmentNotes")||"").trim(),
    status:"Aberta",tag:"wait",
    attendanceType:String(fd.get("attendanceType")||"Manutenção corretiva"),
    scheduledAt:String(fd.get("scheduledAt")||""),
    appointmentDurationMinutes:Number(fd.get("appointmentDurationMinutes")||60),
    complaint:fd.get("complaint")||"Sem relato inicial",
    when:"Agora",value:"A orçar",
    initialPhotos:(form.elements.photos?.files||[]).length,
    createdAt:new Date().toISOString(),
    history:[{when:new Date().toISOString(),label:"Atendimento aberto",detail:String(fd.get("complaint")||"Sem relato inicial")}]
  };
  const initialFiles=[...(form.elements.photos?.files||[])];
  const saved=JSON.parse(localStorage.getItem("refrig-orders")||"[]");saved.unshift(item);localStorage.setItem("refrig-orders",JSON.stringify(saved));localStorage.setItem("refrig-initialized","1");
  try{await saveOrderFiles(item.id,initialFiles,"initial")}catch{}
  if(pendingVisitConversionId){
    updateVisit(pendingVisitConversionId,{status:"done",convertedOrderId:item.id});
    pendingVisitConversionId="";
  }
  render();dialog.close();go("orders");notify("Atendimento criado e registrado no histórico.");
});
const q=document.getElementById("orderSearch");q?.addEventListener("input",renderOrderList);
document.getElementById("orderFilters")?.addEventListener("click",e=>{
  const b=e.target.closest("[data-order-filter]");if(!b)return;
  orderFilter=b.dataset.orderFilter;renderOrderList();
});
document.querySelectorAll("[data-jump-filter]").forEach(el=>el.addEventListener("click",()=>{
  orderFilter=el.dataset.jumpFilter;go("orders");renderOrderList();
}));
document.querySelector(".search-btn")?.addEventListener("click",()=>{
  const d=document.getElementById("globalSearchDialog"),input=document.getElementById("globalSearchInput");
  d?.showModal();if(input){input.value="";renderGlobalSearch("");setTimeout(()=>input.focus(),80)}
});
let deferredPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;document.getElementById("installBtn").hidden=false});document.getElementById("installBtn")?.addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null});
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});


// --- Histórico / fechamento da OS ---
const detailView=document.querySelector('[data-view="detail"]');
const detailContent=document.getElementById("detailContent");
const finishDialog=document.getElementById("finishDialog");
const finishForm=document.getElementById("finishForm");
const signatureCanvas=document.getElementById("signatureCanvas");
const signatureCtx=signatureCanvas?.getContext("2d");
let signatureDrawing=false,hasSignature=false,lastNonDetailView="orders";

function moneyValue(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0))}
function parseMoney(v){return Number(String(v||"").replace(/\./g,"").replace(",",".").replace(/[^0-9.-]/g,""))||0}
function paymentStatusLabel(v){return ({paid:"Pago",partial:"Parcial",pending:"Pendente"})[v]||"Pendente"}
function friendlyDateTime(value){
  if(!value)return "";
  const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);
  const now=new Date(),sameDay=d.toDateString()===now.toDateString();
  return (sameDay?"Hoje":d.toLocaleDateString("pt-BR"))+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function historyStamp(){return new Date().toISOString()}
function orderWhenLabel(o){
  if(o.scheduledAt)return "Agendado: "+friendlyDateTime(o.scheduledAt);
  if(o.createdAt)return friendlyDateTime(o.createdAt);
  return o.when||"";
}
function formatDateBR(v){
  if(!v)return "";
  const [y,m,d]=String(v).slice(0,10).split("-");
  return y&&m&&d?d+"/"+m+"/"+y:String(v);
}
function calcWarrantyUntil(days){
  const n=Number(days||0); if(!n)return "";
  const d=new Date(); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function findOrder(id){return orders().find(o=>String(o.id)===String(id))}
function setViewDirect(name){
  views.forEach(v=>v.classList.toggle("active",v.dataset.view===name));
  nav.forEach(b=>b.classList.toggle("active",b.dataset.go===name));
  currentView=name;
  window.scrollTo({top:0,behavior:"smooth"});
}
function detailHistory(o){
  const rows=o.history||[{label:"Atendimento aberto",detail:o.complaint||"Atendimento registrado.",when:o.when||"—"}];
  return rows.slice().sort((a,b)=>String(b.when||"").localeCompare(String(a.when||""))).map(h=>'<div class="history-row"><i></i><div><small>'+esc(/^\d{4}-\d{2}-\d{2}T/.test(h.when||"")?friendlyDateTime(h.when):h.when||"")+'</small><b>'+esc(h.label||"Atualização")+'</b><span>'+esc(h.detail||"")+'</span></div></div>').join("");
}
function openOrderDetail(id){
  const o=findOrder(id); if(!o)return;
  lastNonDetailView=currentView==="detail"?"orders":currentView;
  const total=Number(o.laborValue||0)+Number(o.materialValue||0);
  const photos=Number(o.initialPhotos||0)+Number(o.finishPhotos||0);
  detailContent.innerHTML=
    '<article class="detail-hero"><button class="detail-back" type="button">‹</button><div><small>Atendimento #'+esc(o.id)+(o.attendanceType?' · '+esc(o.attendanceType):'')+'</small><h1>'+esc(o.customer)+'</h1><span>'+esc(o.equipment)+(o.scheduledAt?' · '+esc(orderWhenLabel(o)):'')+'</span></div><span class="tag '+(o.tag==="done"?"done":o.tag==="wait"?"wait":"")+'">'+esc(o.status)+'</span></article>'+
    '<div class="detail-grid">'+
      '<section class="info-card"><span>Problema relatado</span><b>'+esc(o.complaint||"Sem relato")+'</b>'+(o.scheduledAt?'<p>Agendado: '+esc(orderWhenLabel(o))+' · '+esc(String(o.appointmentDurationMinutes||60))+' min</p>':'')+'</section>'+
      '<section class="info-card"><span>Diagnóstico</span><b>'+esc(o.diagnosis||"Ainda não informado")+'</b></section>'+
      '<section class="info-card wide"><span>Serviço executado</span><b>'+esc(o.service||"Ainda não informado")+'</b>'+(o.materials?'<p>Materiais: '+esc(o.materials)+'</p>':'')+'</section>'+
      '<section class="info-card wide"><span>Registro do atendimento</span><div class="value-grid"><div><small>Serviço</small><b>'+moneyValue(o.laborValue)+'</b></div><div><small>Materiais</small><b>'+moneyValue(o.materialValue)+'</b></div><div><small>Total</small><b>'+moneyValue(total)+'</b></div></div><div class="detail-pills"><span>📷 '+photos+' foto(s)</span><span>'+(o.signed?"✍ Assinado":"Assinatura pendente")+'</span><span>💳 '+esc(o.payment||"Não informado")+'</span><span class="payment-pill '+esc(o.paymentStatus||"pending")+'">'+esc(paymentStatusLabel(o.paymentStatus))+'</span>'+(o.warrantyUntil?'<span>🛡 Garantia até '+esc(formatDateBR(o.warrantyUntil))+'</span>':'')+(o.nextPreventive?'<span>↻ Retorno '+esc(formatDateBR(o.nextPreventive))+'</span>':'')+'</div>'+(o.closingNotes?'<p>Observação: '+esc(o.closingNotes)+'</p>':'')+'</section>'+
      '<section class="info-card wide"><span>Fotos e assinatura</span><div class="media-gallery" id="orderMediaGallery"><div class="media-loading">Carregando evidências…</div></div></section>'+
      '<section class="info-card wide"><span>Histórico</span><div class="history-list">'+detailHistory(o)+'</div></section>'+
    '</div>'+
    (o.tag==="done"
      ?'<div class="detail-actions">'+((o.paymentStatus||"pending")!=="paid"?'<button class="primary" data-mark-paid>Marcar como pago</button>':'')+'<button class="secondary" data-share>Enviar ao cliente</button><button class="secondary" data-print>Comprovante</button><button class="secondary" data-reopen>Reabrir</button></div>'
      :'<button class="primary full detail-main-action" data-finish>Finalizar atendimento</button>');
  setViewDirect("detail");
  detailContent.querySelector(".detail-back").onclick=()=>setViewDirect(lastNonDetailView||"orders");
  detailContent.querySelector("[data-finish]")?.addEventListener("click",()=>openFinish(o));
  detailContent.querySelector("[data-reopen]")?.addEventListener("click",()=>{saveOrderDetail(o.id,{status:"Em atendimento",tag:"service"});render();openOrderDetail(o.id);notify("Atendimento reaberto.")});
  detailContent.querySelector("[data-mark-paid]")?.addEventListener("click",()=>markOrderPaid(o));
  detailContent.querySelector("[data-share]")?.addEventListener("click",()=>shareOrder(o));
  detailContent.querySelector("[data-print]")?.addEventListener("click",()=>printReceipt(o));
  renderOrderMedia(o.id);
}
function markOrderPaid(o){
  const total=orderTotalValue(o);
  const history=[...(o.history||[]),{when:historyStamp(),label:"Pagamento recebido",detail:(o.payment||"Pagamento")+" · "+moneyValue(total)}];
  saveOrderDetail(o.id,{paymentStatus:"paid",amountPaid:total,history});
  render();openOrderDetail(o.id);notify("Pagamento marcado como recebido.");
}
function orderSummaryText(o){
  const total=orderTotalValue(o);
  const payment=[o.payment,paymentStatusLabel(o.paymentStatus)].filter(Boolean).join(" · ");
  return [
    "*LUIZ MIGUEL — AR CONDICIONADO E REFRIGERAÇÃO*",
    "",
    "*Atendimento #"+o.id+"*",
    "Cliente: "+(o.customer||""),
    o.equipment?"Equipamento: "+o.equipment:"",
    o.service?"Serviço: "+o.service:"",
    o.materials?"Materiais/peças: "+o.materials:"",
    o.diagnosis?"Diagnóstico: "+o.diagnosis:"",
    "",
    "*Valor total: "+moneyValue(total)+"*",
    payment?"Pagamento: "+payment:"",
    o.warrantyUntil?"Garantia até: "+formatDateBR(o.warrantyUntil):"",
    o.nextPreventive?"Próxima preventiva: "+formatDateBR(o.nextPreventive):"",
    o.closingNotes?"Observação: "+o.closingNotes:"",
    "",
    "Luiz Miguel Ar Condicionado e Refrigeração",
    "19 99232-3703"
  ].filter(v=>v!==""||true).join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
function summaryHtml(text){
  return esc(text)
    .replace(/\*([^*]+)\*/g,"<strong>$1</strong>")
    .replace(/\n/g,"<br>");
}
function whatsappShareHref(o,text){
  let phone=String(o.phone||"").replace(/\D/g,"");
  if((phone.length===10||phone.length===11)&&!phone.startsWith("55"))phone="55"+phone;
  const base=phone?"https://wa.me/"+phone:"https://wa.me/";
  return base+"?text="+encodeURIComponent(text);
}
let shareOrderId="";
function openShareDialog(o){
  shareOrderId=String(o.id);
  const text=orderSummaryText(o);
  const preview=document.getElementById("sharePreview");
  if(preview)preview.innerHTML=summaryHtml(text);
  document.getElementById("shareDialog")?.showModal();
}
async function shareOrder(o){openShareDialog(o)}
async function copyOrderSummary(o){
  const text=orderSummaryText(o);
  try{
    await navigator.clipboard.writeText(text);
    notify("Resumo copiado.");
  }catch{
    const area=document.createElement("textarea");
    area.value=text;document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();
    notify("Resumo copiado.");
  }
}
async function nativeShareOrder(o){
  const text=orderSummaryText(o);
  try{
    if(navigator.share)await navigator.share({title:"Atendimento #"+o.id,text});
    else await copyOrderSummary(o);
  }catch{}
}
async function getSignatureDataUrl(orderId){
  try{
    const rows=await getOrderMedia(orderId);
    const sig=rows.filter(r=>r.kind==="signature").sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if(!sig?.blob)return "";
    return await blobToDataUrl(sig.blob);
  }catch{return ""}
}
function receiptDate(o){
  const value=o.closedAt||o.createdAt;
  if(!value)return new Date().toLocaleString("pt-BR");
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleString("pt-BR");
}
async function printReceipt(o){
  const w=window.open("","_blank","width=820,height=980");
  if(!w){notify("Libere pop-ups para gerar o comprovante.");return}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprovante '+esc(o.id)+'</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#073d59">Preparando comprovante…</body></html>');
  w.document.close();

  const total=orderTotalValue(o);
  const sig=await getSignatureDataUrl(o.id);
  const logo=new URL("./icon.svg",location.href).href;
  const payment=[o.payment,paymentStatusLabel(o.paymentStatus)].filter(Boolean).join(" · ");
  const warranty=o.warrantyUntil?'<div class="meta-item"><span>Garantia</span><b>Até '+esc(formatDateBR(o.warrantyUntil))+'</b></div>':"";
  const preventive=o.nextPreventive?'<div class="meta-item"><span>Próxima preventiva</span><b>'+esc(formatDateBR(o.nextPreventive))+'</b></div>':"";
  const observation=o.closingNotes?'<section><h3>Observação</h3><p>'+esc(o.closingNotes)+'</p></section>':"";
  const signature=sig
    ?'<div class="signature-proof"><img src="'+sig+'" alt="Assinatura do cliente"><span>Assinatura / confirmação do cliente</span></div>'
    :'<div class="signature-proof empty"><div></div><span>Assinatura / confirmação do cliente</span></div>';

  const doc='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprovante '+esc(o.id)+'</title><style>'+
  ':root{--blue:#073d59;--muted:#667780;--line:#dbe5ea;--soft:#f4f8fa}*{box-sizing:border-box}body{margin:0;background:#eef3f5;color:#172832;font:14px/1.45 Arial,sans-serif}.toolbar{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;justify-content:flex-end}.toolbar button{border:0;border-radius:10px;background:var(--blue);color:#fff;padding:11px 16px;font-weight:700}.sheet{width:min(794px,calc(100% - 24px));margin:18px auto;background:#fff;min-height:1080px;padding:36px 42px;box-shadow:0 8px 30px rgba(7,61,89,.08)}.brand{display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:2px solid var(--blue)}.brand img{width:58px;height:58px}.brand h1{margin:0;color:var(--blue);font-size:26px;letter-spacing:.02em}.brand p{margin:2px 0 0;color:#334751;font-size:11px;font-weight:700;letter-spacing:.12em}.company{margin-left:auto;text-align:right;color:var(--muted);font-size:10px}.title{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin:26px 0 18px}.title h2{margin:0;color:#172832;font-size:22px}.title small{color:var(--muted)}section{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0}section h3{margin:0 0 6px;color:var(--blue);font-size:11px;text-transform:uppercase;letter-spacing:.08em}section p{margin:0;white-space:pre-wrap}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.totals div,.meta-item{background:var(--soft);border-radius:10px;padding:12px}.totals span,.meta-item span{display:block;color:var(--muted);font-size:10px}.totals b,.meta-item b{display:block;margin-top:3px;color:var(--blue);font-size:15px}.totals .grand{background:var(--blue)}.totals .grand span,.totals .grand b{color:#fff}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.signature-proof{margin-top:34px;width:310px}.signature-proof img{display:block;width:100%;height:100px;object-fit:contain;object-position:center bottom;border-bottom:1px solid #70818a}.signature-proof.empty div{height:100px;border-bottom:1px solid #70818a}.signature-proof span{display:block;margin-top:6px;color:var(--muted);font-size:10px;text-align:center}.footer{margin-top:34px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:9px;text-align:center}@media(max-width:620px){.sheet{width:100%;margin:0;min-height:100vh;padding:24px 20px;box-shadow:none}.brand h1{font-size:20px}.brand img{width:48px;height:48px}.company{display:none}.title{align-items:flex-start;flex-direction:column}.grid,.meta{grid-template-columns:1fr}.totals{grid-template-columns:1fr 1fr}.totals .grand{grid-column:1/-1}.signature-proof{width:100%;max-width:310px}}@media print{@page{size:A4;margin:12mm}body{background:#fff}.toolbar{display:none}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.brand{break-inside:avoid}section,.totals,.meta,.signature-proof{break-inside:avoid}}'+
  '</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / Salvar PDF</button></div><main class="sheet">'+
  '<header class="brand"><img src="'+logo+'" alt=""><div><h1>LUIZ MIGUEL</h1><p>AR CONDICIONADO E REFRIGERAÇÃO</p></div><div class="company">CNPJ 22.222.022/0001-39<br>19 99232-3703<br>luizmiguel229@yahoo.com.br<br>São João da Boa Vista - SP</div></header>'+
  '<div class="title"><div><small>COMPROVANTE DE ATENDIMENTO</small><h2>#'+esc(o.id)+'</h2></div><small>'+esc(receiptDate(o))+'</small></div>'+
  '<div class="grid"><section><h3>Cliente</h3><p><b>'+esc(o.customer||"")+'</b>'+(o.phone?'<br>'+esc(o.phone):'')+(o.address?'<br>'+esc(o.address):'')+'</p></section><section><h3>Equipamento</h3><p><b>'+esc(o.equipment||"Não informado")+'</b>'+(o.room?'<br>Ambiente: '+esc(o.room):'')+(o.serial?'<br>S/N: '+esc(o.serial):'')+'</p></section></div>'+
  '<section><h3>Problema relatado</h3><p>'+esc(o.complaint||"Não informado")+'</p></section>'+
  '<section><h3>Diagnóstico</h3><p>'+esc(o.diagnosis||"Não informado")+'</p></section>'+
  '<section><h3>Serviço executado</h3><p>'+esc(o.service||"Não informado")+(o.materials?'\n\nMateriais / peças: '+esc(o.materials):'')+'</p></section>'+
  '<div class="totals"><div><span>Serviço / mão de obra</span><b>'+moneyValue(o.laborValue)+'</b></div><div><span>Materiais</span><b>'+moneyValue(o.materialValue)+'</b></div><div class="grand"><span>Total</span><b>'+moneyValue(total)+'</b></div></div>'+
  '<div class="meta"><div class="meta-item"><span>Pagamento</span><b>'+esc(payment||"Não informado")+'</b></div>'+warranty+preventive+'</div>'+
  observation+signature+
  '<div class="footer">Luiz Miguel Ar Condicionado e Refrigeração · CNPJ 22.222.022/0001-39 · 19 99232-3703</div>'+
  '</main></body></html>';
  w.document.open();w.document.write(doc);w.document.close();
}
function orderHistoryCard(o){
  const total=orderTotalValue(o);
  return '<article class="mini-os" data-order="'+esc(o.id)+'"><div><small>Atendimento #'+esc(o.id)+' · '+esc(o.when||"")+'</small><b>'+esc(o.service||o.complaint||"Atendimento")+'</b><span>'+esc(o.equipment||"Equipamento")+'</span></div><div><span class="tag '+(o.tag==="done"?"done":o.tag==="wait"?"wait":"")+'">'+esc(o.status||"Aberta")+'</span><strong>'+(total?moneyValue(total):esc(o.value||"A orçar"))+'</strong></div></article>';
}
function openClientDetail(customerId){
  const c=customerRows().find(x=>x.id===customerId); if(!c)return;
  const eq=equipmentRows().filter(e=>e.customerId===c.id);
  const linkedVisits=visitRows().filter(v=>v.customerId===c.id||normalizeKey(v.customerName)===normalizeKey(c.name))
    .sort((a,b)=>String(b.scheduledAt||"").localeCompare(String(a.scheduledAt||"")));
  const target=document.getElementById("clientDetailContent");
  target.innerHTML=
    '<article class="registry-hero"><button class="registry-back" type="button">‹</button><div><small>Cliente</small><h1>'+esc(c.name)+'</h1><span>'+esc([c.phone,c.address].filter(Boolean).join(" · ")||"Sem telefone/endereço cadastrado")+'</span>'+(c.notes?'<p class="hero-note">'+esc(c.notes)+'</p>':'')+'</div></article>'+
    '<div class="registry-kpis"><div><small>Equipamentos</small><b>'+eq.length+'</b></div><div><small>Atendimentos</small><b>'+c.orders.length+'</b></div><div><small>Visitas</small><b>'+linkedVisits.length+'</b></div><div><small>Histórico</small><b>'+moneyValue(c.total)+'</b></div></div>'+
    '<div class="client-actions"><button class="primary registry-new-os" type="button" data-new-client-os>＋ Novo atendimento</button><button class="secondary" type="button" data-new-client-visit>◷ Visita</button>'+(c.phone?'<a class="secondary whatsapp-action" href="'+esc(whatsappHref(c.phone))+'" target="_blank" rel="noopener">WhatsApp</a>':'')+'<button class="secondary" type="button" data-edit-client>Editar</button></div>'+
    '<section class="registry-section"><div class="section-title"><div><b>Equipamentos</b><small>Prontuários deste cliente</small></div></div>'+
      (eq.length?eq.map(e=>'<article class="equipment-card clickable-card" data-equipment="'+esc(e.id)+'"><div class="equip-icon">❄</div><div><b>'+esc(e.name)+'</b><small>'+esc(e.room||"Local não informado")+'</small><em>'+esc([e.gas,e.voltage].filter(Boolean).join(" · ")||e.orders.length+" atendimento(s)")+'</em></div><span>›</span></article>').join(""):'<div class="empty-state">Nenhum equipamento cadastrado.</div>')+
    '</section>'+
    (linkedVisits.length?'<section class="registry-section"><div class="section-title"><div><b>Visitas / compromissos</b><small>Agenda relacionada a este cliente</small></div></div><div class="visit-list">'+linkedVisits.map(visitCard).join("")+'</div></section>':'')+
    '<section class="registry-section"><div class="section-title"><div><b>Histórico de atendimentos</b><small>Valores, serviços e status</small></div></div><div class="mini-os-list">'+c.orders.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).map(orderHistoryCard).join("")+'</div></section>';
  setViewDirect("client-detail");
  target.querySelector(".registry-back").onclick=()=>go("clients");
  target.querySelector("[data-new-client-os]")?.addEventListener("click",()=>openNewOrder(c.id));
  target.querySelector("[data-new-client-visit]")?.addEventListener("click",()=>openVisit(c.id));
  target.querySelector("[data-edit-client]")?.addEventListener("click",()=>openEditClient(c));
}
function openEquipmentDetail(equipmentId){
  const e=equipmentRows().find(x=>x.id===equipmentId); if(!e)return;
  const target=document.getElementById("equipmentDetailContent");
  const details=[
    e.room&&["Ambiente",e.room],e.type&&["Tipo",e.type],e.brand&&["Marca",e.brand],e.model&&["Modelo",e.model],
    e.capacity&&["Capacidade",e.capacity],e.gas&&["Refrigerante",e.gas],e.voltage&&["Tensão",e.voltage],e.serial&&["Nº de série",e.serial]
  ].filter(Boolean);
  const latest=e.orders.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0];
  const warranty=latest?.warrantyUntil&&String(latest.warrantyUntil)>=new Date().toISOString().slice(0,10)?latest.warrantyUntil:"";
  target.innerHTML=
    '<article class="registry-hero equipment-hero"><button class="registry-back" type="button">‹</button><div><small>Equipamento · '+esc(e.customer)+'</small><h1>'+esc(e.name)+'</h1><span>'+(e.nextPreventive?'Próxima preventiva: '+esc(e.nextPreventive):e.orders.length+' atendimento(s) no histórico')+'</span></div></article>'+
    '<section class="equipment-specs">'+details.map(d=>'<div><small>'+esc(d[0])+'</small><b>'+esc(d[1])+'</b></div>').join("")+(latest?'<div><small>Último atendimento</small><b>'+esc(orderWhenLabel(latest))+'</b></div>':'')+(warranty?'<div class="spec-warranty"><small>Garantia ativa</small><b>Até '+esc(formatDateBR(warranty))+'</b></div>':'')+'</section>'+(e.notes?'<section class="equipment-note"><small>Observação técnica</small><b>'+esc(e.notes)+'</b></section>':'')+
    '<div class="equipment-actions"><button class="primary registry-new-os" type="button" data-new-equipment-os>＋ Novo atendimento</button><button class="secondary" type="button" data-edit-equipment>Editar equipamento</button></div>'+
    '<section class="registry-section"><div class="section-title"><div><b>Prontuário técnico</b><small>Todo o histórico deste equipamento</small></div><strong>'+moneyValue(e.total)+'</strong></div><div class="mini-os-list">'+e.orders.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).map(orderHistoryCard).join("")+'</div></section>';
  setViewDirect("equipment-detail");
  target.querySelector(".registry-back").onclick=()=>go("equipment");
  target.querySelector("[data-new-equipment-os]")?.addEventListener("click",()=>openNewOrder(e.customerId,e.id));
  target.querySelector("[data-edit-equipment]")?.addEventListener("click",()=>openEditEquipment(e));
}
document.addEventListener("click",e=>{
  const o=e.target.closest(".order-card[data-order],.mini-os[data-order],.preventive [data-order]"); if(o){openOrderDetail(o.dataset.order);return}
  const c=e.target.closest(".client-card[data-client]"); if(c){openClientDetail(c.dataset.client);return}
  const eq=e.target.closest(".equipment-card[data-equipment]"); if(eq){openEquipmentDetail(eq.dataset.equipment);return}
});
document.getElementById("clientSearch")?.addEventListener("input",e=>renderClients(e.target.value));
document.getElementById("equipmentSearch")?.addEventListener("input",e=>renderEquipment(e.target.value));


async function renderOrderMedia(orderId){
  const target=document.getElementById("orderMediaGallery"); if(!target)return;
  try{
    const rows=await getOrderMedia(orderId);
    if(!rows.length){target.innerHTML='<div class="media-empty">Nenhuma foto ou assinatura salva neste aparelho.</div>';return}
    target.innerHTML=rows.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).map(r=>{
      const url=URL.createObjectURL(r.blob);
      if(r.kind==="signature")return '<figure class="media-item signature-media"><img src="'+url+'" alt="Assinatura do cliente"><figcaption>✍ Assinatura do cliente</figcaption></figure>';
      return '<figure class="media-item"><img src="'+url+'" alt="Foto do atendimento"><figcaption>📷 '+esc(r.phase==="initial"?"Abertura":"Serviço")+'</figcaption></figure>';
    }).join("");
  }catch{target.innerHTML='<div class="media-empty">Não foi possível carregar as evidências locais.</div>'}
}

function resizeSignature(){
  if(!signatureCanvas)return;
  const r=signatureCanvas.getBoundingClientRect(),ratio=Math.max(1,window.devicePixelRatio||1);
  signatureCanvas.width=Math.floor(r.width*ratio);signatureCanvas.height=Math.floor(r.height*ratio);
  signatureCtx.setTransform(ratio,0,0,ratio,0,0);signatureCtx.lineWidth=2.5;signatureCtx.lineCap="round";signatureCtx.lineJoin="round";signatureCtx.strokeStyle="#0b3346";
}
function sigPoint(e){const r=signatureCanvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function updateSignatureUi(){
  const wrap=document.getElementById("signatureWrap"),status=document.getElementById("signatureStatus"),hint=document.getElementById("signatureHint");
  wrap?.classList.toggle("signed",hasSignature);
  if(status)status.textContent=hasSignature?"Assinatura registrada":"Aguardando assinatura";
  if(hint)hint.hidden=hasSignature;
}
signatureCanvas?.addEventListener("pointerdown",e=>{
  e.preventDefault();signatureCanvas.setPointerCapture?.(e.pointerId);
  signatureDrawing=true;hasSignature=true;updateSignatureUi();
  const p=sigPoint(e);signatureCtx.beginPath();signatureCtx.moveTo(p.x,p.y);
});
signatureCanvas?.addEventListener("pointermove",e=>{
  if(!signatureDrawing)return;e.preventDefault();
  const p=sigPoint(e);signatureCtx.lineTo(p.x,p.y);signatureCtx.stroke();
});
signatureCanvas?.addEventListener("pointerup",e=>{signatureDrawing=false;signatureCanvas.releasePointerCapture?.(e.pointerId)});
signatureCanvas?.addEventListener("pointercancel",()=>signatureDrawing=false);
document.getElementById("clearSignature")?.addEventListener("click",()=>{
  signatureCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);hasSignature=false;updateSignatureUi();
});
document.getElementById("cancelFinish")?.addEventListener("click",()=>finishDialog.close());
function openFinish(o){
  finishForm.reset();document.getElementById("finishOrderId").value=o.id;
  finishForm.elements.diagnosis.value=o.diagnosis||"";finishForm.elements.service.value=o.service||"";finishForm.elements.materials.value=o.materials||"";
  finishForm.elements.laborValue.value=o.laborValue||"";finishForm.elements.materialValue.value=o.materialValue||"";finishForm.elements.payment.value=o.payment||"Pix";
  finishForm.elements.paymentStatus.value=o.paymentStatus||"paid";
  finishForm.elements.amountPaid.value=o.amountPaid||"";
  finishForm.elements.nextPreventive.value=o.nextPreventive||"";
  finishForm.elements.warrantyDays.value=o.warrantyDays||"0";
  finishForm.elements.closingNotes.value=o.closingNotes||"";
  hasSignature=false;updateSignatureUi();finishDialog.showModal();requestAnimationFrame(resizeSignature);
}
finishForm?.addEventListener("submit",async e=>{
  e.preventDefault();const fd=new FormData(finishForm),id=document.getElementById("finishOrderId").value,o=findOrder(id);if(!o)return;
  const labor=parseMoney(fd.get("laborValue")),materialsValue=parseMoney(fd.get("materialValue")),total=labor+materialsValue;
  const paymentStatus=String(fd.get("paymentStatus")||"paid"),warrantyDays=Number(fd.get("warrantyDays")||0);
  const consentChecked=Boolean(document.getElementById("signedConsent").checked);
  if(hasSignature!==consentChecked){
    notify(hasSignature?"Marque a confirmação do cliente para registrar a assinatura.":"Assine no campo ou desmarque a confirmação.");
    return;
  }
  const patch={diagnosis:String(fd.get("diagnosis")||""),service:String(fd.get("service")||""),materials:String(fd.get("materials")||""),laborValue:labor,materialValue:materialsValue,payment:String(fd.get("payment")||"Pix"),paymentStatus,amountPaid:parseMoney(fd.get("amountPaid")),nextPreventive:String(fd.get("nextPreventive")||""),warrantyDays,warrantyUntil:calcWarrantyUntil(warrantyDays),closingNotes:String(fd.get("closingNotes")||""),finishPhotos:(document.getElementById("finishPhotos").files||[]).length,signed:Boolean(consentChecked&&hasSignature),signedAt:(consentChecked&&hasSignature)?new Date().toISOString():"",status:"Finalizado",tag:"done",closedAt:new Date().toISOString(),value:moneyValue(total)};
  if(paymentStatus==="paid"&&!patch.amountPaid)patch.amountPaid=total;
  patch.history=[...(o.history||[]),{when:historyStamp(),label:"Atendimento finalizado",detail:(patch.service||"Serviço concluído")+" · "+patch.value+" · "+paymentStatusLabel(patch.paymentStatus)+(patch.signed?" · assinado":"")}];
  const finishFiles=[...(document.getElementById("finishPhotos").files||[])];
  try{
    await saveOrderFiles(id,finishFiles,"finish");
    if(patch.signed)await saveSignatureMedia(id);
  }catch{}
  saveOrderDetail(id,patch);finishDialog.close();render();openOrderDetail(id);notify("Atendimento salvo no histórico.");
});

document.getElementById("quickServices")?.addEventListener("click",e=>{
  const b=e.target.closest("[data-service-template]"); if(!b)return;
  const field=finishForm.elements.service;
  const text=b.dataset.serviceTemplate;
  field.value=field.value?field.value+"; "+text:text;
  field.focus();
});

async function getAllMedia(){
  const db=await mediaDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,"readonly");
    const req=tx.objectStore(MEDIA_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
  });
}
function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)});
}
function dataUrlToBlob(dataUrl){
  const [head,data]=dataUrl.split(","),mime=(head.match(/data:(.*?);/)||[])[1]||"application/octet-stream";
  const bin=atob(data),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
document.getElementById("settingsBtn")?.addEventListener("click",()=>document.getElementById("settingsDialog")?.showModal());
document.getElementById("exportBackup")?.addEventListener("click",async()=>{
  try{
    const media=await getAllMedia();
    const packed=[];
    for(const m of media){packed.push({...m,blobData:m.blob?await blobToDataUrl(m.blob):null,blob:undefined})}
    const backup={version:2,exportedAt:new Date().toISOString(),orders:JSON.parse(localStorage.getItem("refrig-orders")||"[]"),visits:visitRows(),details:orderDetails(),media:packed};
    const blob=new Blob([JSON.stringify(backup)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="refrigerista-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href);notify("Backup exportado.");
  }catch{notify("Não foi possível exportar o backup.")}
});
document.getElementById("importBackup")?.addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!confirm("Restaurar este backup e substituir os dados locais atuais?")){e.target.value="";return}
  try{
    const data=JSON.parse(await file.text());
    localStorage.setItem("refrig-orders",JSON.stringify(data.orders||[]));
    localStorage.setItem("refrig-order-details",JSON.stringify(data.details||{}));
    localStorage.setItem("refrig-visits",JSON.stringify(data.visits||[]));
    localStorage.setItem("refrig-initialized","1");
    const db=await mediaDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(MEDIA_STORE,"readwrite");tx.objectStore(MEDIA_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    for(const m of data.media||[]){await putMedia({...m,blob:m.blobData?dataUrlToBlob(m.blobData):null,blobData:undefined})}
    render();document.getElementById("settingsDialog").close();notify("Backup restaurado.");
  }catch{notify("Backup inválido ou corrompido.")}
  e.target.value="";
});


function baseOrdersForEdit(){
  let local=JSON.parse(localStorage.getItem("refrig-orders")||"[]");
  if(!local.length)local=demoOrders.map(o=>({...o}));
  return local;
}
function updateBaseOrders(predicate,mutator){
  const local=baseOrdersForEdit();
  for(let i=0;i<local.length;i++){if(predicate(local[i]))local[i]=mutator({...local[i]})}
  localStorage.setItem("refrig-orders",JSON.stringify(local));
}
const editClientDialog=document.getElementById("editClientDialog"),editClientForm=document.getElementById("editClientForm");
function openEditClient(c){
  editClientForm.reset();editClientForm.elements.customerId.value=c.id;editClientForm.elements.name.value=c.name||"";editClientForm.elements.phone.value=c.phone||"";editClientForm.elements.address.value=c.address||"";editClientForm.elements.notes.value=c.notes||"";editClientDialog.showModal();
}
editClientForm?.addEventListener("submit",e=>{
  e.preventDefault();const fd=new FormData(editClientForm),id=String(fd.get("customerId"));
  updateBaseOrders(o=>customerIdOf(o)===id,o=>({...o,customer:String(fd.get("name")||"").trim()||o.customer,phone:String(fd.get("phone")||"").trim(),address:String(fd.get("address")||"").trim(),customerNotes:String(fd.get("notes")||"").trim(),customerId:id}));
  editClientDialog.close();render();openClientDetail(id);notify("Cliente atualizado.");
});
const editEquipmentDialog=document.getElementById("editEquipmentDialog"),editEquipmentForm=document.getElementById("editEquipmentForm");
function openEditEquipment(e){
  editEquipmentForm.reset();editEquipmentForm.elements.equipmentId.value=e.id;
  const vals={type:e.type,brand:e.brand,model:e.model,capacity:e.capacity,voltage:e.voltage,gas:e.gas,room:e.room,serial:e.serial,notes:e.notes};
  for(const [k,v] of Object.entries(vals))if(editEquipmentForm.elements[k])editEquipmentForm.elements[k].value=v||"";
  editEquipmentDialog.showModal();
}
editEquipmentForm?.addEventListener("submit",ev=>{
  ev.preventDefault();const fd=new FormData(editEquipmentForm),id=String(fd.get("equipmentId"));
  updateBaseOrders(o=>equipmentIdOf(o)===id,o=>{
    const brand=String(fd.get("brand")||"").trim(),model=String(fd.get("model")||"").trim(),capacity=String(fd.get("capacity")||"").trim();
    return {...o,equipmentId:id,equipmentType:String(fd.get("type")||"").trim(),brand,model,capacity,voltage:String(fd.get("voltage")||"").trim(),gas:String(fd.get("gas")||"").trim(),room:String(fd.get("room")||"").trim(),serial:String(fd.get("serial")||"").trim(),equipmentNotes:String(fd.get("notes")||"").trim(),equipment:[brand,model,capacity].filter(Boolean).join(" ")||String(fd.get("type")||"Equipamento")};
  });
  editEquipmentDialog.close();render();openEquipmentDetail(id);notify("Equipamento atualizado.");
});
document.querySelectorAll("[data-edit-cancel]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog")?.close()));


function renderGlobalSearch(term){
  const target=document.getElementById("globalSearchResults");if(!target)return;
  const q=normalizeKey(term);
  if(!q){target.innerHTML='<div class="empty-state">Digite algo para pesquisar.</div>';return}
  const clients=customerRows().filter(c=>normalizeKey([c.name,c.phone,c.address,c.notes].join(" ")).includes(q)).slice(0,5);
  const eqs=equipmentRows().filter(e=>normalizeKey([e.customer,e.name,e.brand,e.model,e.serial,e.room,e.notes].join(" ")).includes(q)).slice(0,6);
  const ats=orders().filter(o=>normalizeKey([o.customer,o.phone,o.equipment,o.serial,o.complaint,o.diagnosis,o.service,o.materials,o.attendanceType].join(" ")).includes(q)).slice(0,8);
  const vs=visitRows().filter(v=>normalizeKey([v.customerName,v.phone,v.address,v.title,v.notes].join(" ")).includes(q)).slice(0,6);
  let out="";
  if(clients.length)out+='<h3>Clientes</h3>'+clients.map(c=>'<button type="button" class="search-result" data-search-client="'+esc(c.id)+'"><span>'+esc(c.name)+'</span><small>'+esc([c.phone,c.address].filter(Boolean).join(" · "))+'</small></button>').join("");
  if(eqs.length)out+='<h3>Equipamentos</h3>'+eqs.map(e=>'<button type="button" class="search-result" data-search-equipment="'+esc(e.id)+'"><span>'+esc(e.name)+'</span><small>'+esc(e.customer+(e.serial?" · S/N "+e.serial:""))+'</small></button>').join("");
  if(vs.length)out+='<h3>Visitas</h3>'+vs.map(v=>'<button type="button" class="search-result" data-search-visit="'+esc(v.id)+'"><span>'+esc(v.customerName+" · "+v.title)+'</span><small>'+esc(visitWhenLabel(v)+(v.address?" · "+v.address:""))+'</small></button>').join("");
  if(ats.length)out+='<h3>Atendimentos</h3>'+ats.map(o=>'<button type="button" class="search-result" data-search-order="'+esc(o.id)+'"><span>'+esc(o.customer+" · "+o.equipment)+'</span><small>'+esc(o.complaint||o.service||"")+'</small></button>').join("");
  target.innerHTML=out||'<div class="empty-state">Nada encontrado.</div>';
}
document.getElementById("globalSearchInput")?.addEventListener("input",e=>renderGlobalSearch(e.target.value));
document.getElementById("globalSearchResults")?.addEventListener("click",e=>{
  const c=e.target.closest("[data-search-client]"),eq=e.target.closest("[data-search-equipment]"),o=e.target.closest("[data-search-order]"),v=e.target.closest("[data-search-visit]");
  if(!c&&!eq&&!o&&!v)return;
  document.getElementById("globalSearchDialog")?.close();
  if(c)openClientDetail(c.dataset.searchClient);else if(eq)openEquipmentDetail(eq.dataset.searchEquipment);else if(v){go("visits");document.getElementById("visitSearch").value="";renderVisits();}else openOrderDetail(o.dataset.searchOrder);
});

document.getElementById("clearLocalData")?.addEventListener("click",async()=>{
  if(!confirm("Apagar atendimentos, visitas, fotos e assinaturas salvos neste aparelho? A nuvem não será apagada."))return;
  localStorage.setItem("refrig-orders","[]");
  localStorage.setItem("refrig-order-details","{}");
  localStorage.setItem("refrig-visits","[]");
  localStorage.setItem("refrig-initialized","1");
  try{
    const db=await mediaDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(MEDIA_STORE,"readwrite");tx.objectStore(MEDIA_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  }catch{}
  render();
  document.getElementById("settingsDialog")?.close();
  notify("Dados locais apagados.");
});


const visitDialog=document.getElementById("visitDialog");
const visitForm=document.getElementById("visitForm");
function openVisit(customerId=""){
  visitForm.reset();
  if(customerId){
    const c=customerRows().find(x=>x.id===customerId);
    if(c){
      visitForm.elements.customerName.value=c.name||"";
      visitForm.elements.phone.value=c.phone||"";
      visitForm.elements.address.value=c.address||"";
    }
  }
  const d=new Date(Date.now()+60*60*1000);d.setMinutes(0,0,0);
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  visitForm.elements.scheduledAt.value=local;
  visitDialog.showModal();
}
document.querySelectorAll('[data-action="new-visit"]').forEach(b=>b.addEventListener("click",()=>openVisit()));
document.getElementById("cancelVisit")?.addEventListener("click",()=>visitDialog.close());
visitForm?.elements.customerName?.addEventListener("change",()=>{
  const name=String(visitForm.elements.customerName.value||"").trim();
  const c=customerRows().find(x=>normalizeKey(x.name)===normalizeKey(name));
  if(c){
    if(!visitForm.elements.phone.value)visitForm.elements.phone.value=c.phone||"";
    if(!visitForm.elements.address.value)visitForm.elements.address.value=c.address||"";
  }
});
visitForm?.addEventListener("submit",e=>{
  e.preventDefault();const fd=new FormData(visitForm);
  const name=String(fd.get("customerName")||"").trim();
  const customer=customerRows().find(x=>normalizeKey(x.name)===normalizeKey(name)||(
    String(fd.get("phone")||"").replace(/\D/g,"")&&String(x.phone||"").replace(/\D/g,"")===String(fd.get("phone")||"").replace(/\D/g,"")
  ));
  const row={
    id:crypto.randomUUID(),syncKey:crypto.randomUUID(),customerId:customer?.id||"",
    customerName:name,phone:String(fd.get("phone")||"").trim(),address:String(fd.get("address")||"").trim(),
    title:String(fd.get("title")||"Visita técnica"),notes:String(fd.get("notes")||"").trim(),
    scheduledAt:String(fd.get("scheduledAt")||""),durationMinutes:Number(fd.get("durationMinutes")||60),
    status:"scheduled",createdAt:new Date().toISOString()
  };
  const rows=visitRows();rows.push(row);saveVisits(rows);localStorage.setItem("refrig-initialized","1");
  visitDialog.close();render();notify("Visita agendada.");
});
function updateVisit(id,patch){
  const rows=visitRows().map(v=>String(v.id)===String(id)?{...v,...patch,updatedAt:new Date().toISOString()}:v);
  saveVisits(rows);render();
}
document.addEventListener("click",e=>{
  const done=e.target.closest("[data-visit-done]");if(done){updateVisit(done.dataset.visitDone,{status:"done"});notify("Visita concluída.");return}
  const cancel=e.target.closest("[data-visit-cancel]");if(cancel){if(confirm("Cancelar esta visita?")){updateVisit(cancel.dataset.visitCancel,{status:"cancelled"});notify("Visita cancelada.");}return}
  const order=e.target.closest("[data-visit-order]");if(order){
    const v=visitRows().find(x=>String(x.id)===String(order.dataset.visitOrder));if(!v)return;
    const c=customerRows().find(x=>x.id===v.customerId);
    openNewOrder(c?.id||"");
    pendingVisitConversionId=String(v.id);
    if(!c){
      form.elements.customer.value=v.customerName||"";
      form.elements.phone.value=v.phone||"";
      if(form.elements.address)form.elements.address.value=v.address||"";
    }
    if(form.elements.scheduledAt)form.elements.scheduledAt.value=v.scheduledAt?new Date(new Date(v.scheduledAt).getTime()-new Date(v.scheduledAt).getTimezoneOffset()*60000).toISOString().slice(0,16):"";
    notify("Dados da visita carregados no atendimento.");
  }
});
document.getElementById("visitSearch")?.addEventListener("input",renderVisits);
document.getElementById("visitFilters")?.addEventListener("click",e=>{
  const b=e.target.closest("[data-visit-filter]");if(!b)return;visitFilter=b.dataset.visitFilter;renderVisits();
});


const shareDialog=document.getElementById("shareDialog");
function currentShareOrder(){return findOrder(shareOrderId)}
document.getElementById("shareWhatsapp")?.addEventListener("click",()=>{
  const o=currentShareOrder();if(!o)return;
  window.open(whatsappShareHref(o,orderSummaryText(o)),"_blank","noopener");
});
document.getElementById("shareCopy")?.addEventListener("click",async()=>{
  const o=currentShareOrder();if(o)await copyOrderSummary(o);
});
document.getElementById("shareNative")?.addEventListener("click",async()=>{
  const o=currentShareOrder();if(o)await nativeShareOrder(o);
});
document.getElementById("shareReceipt")?.addEventListener("click",async()=>{
  const o=currentShareOrder();if(o)await printReceipt(o);
});
