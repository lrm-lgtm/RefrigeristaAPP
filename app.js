const demoOrders=[
{id:123,customer:"Maria Aparecida",equipment:"LG Dual Inverter 12.000 BTU",status:"Em atendimento",tag:"service",complaint:"Não está gelando corretamente.",when:"Hoje 18:30",value:"R$ 250,00"},
{id:122,customer:"Mercado Avenida",equipment:"Câmara fria principal",status:"Aguardando aprovação",tag:"wait",complaint:"Temperatura oscilando durante a madrugada.",when:"Hoje 16:10",value:"R$ 680,00"},
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
  scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));

function orderDetails(){try{return JSON.parse(localStorage.getItem("refrig-order-details")||"{}")}catch{return {}}}
function saveOrderDetail(id,patch){const all=orderDetails();all[String(id)]={...(all[String(id)]||{}),...patch};localStorage.setItem("refrig-order-details",JSON.stringify(all))}
function orders(){
  try{const base=[...JSON.parse(localStorage.getItem("refrig-orders")||"[]"),...demoOrders],detail=orderDetails();return base.map(o=>({...o,...(detail[String(o.id)]||{})}))}catch{return demoOrders}
}

function equipmentKeyOf(o){
  return o.equipmentKey||[o.customer||"",o.serial||"",o.equipment||"",o.room||""].join("|").toLowerCase();
}
function customerRows(){
  const map=new Map();
  for(const o of orders()){
    const key=(o.customer||"Cliente").trim();
    if(!map.has(key)) map.set(key,{name:key,phone:o.phone||"",orders:[],equipmentKeys:new Set(),total:0});
    const row=map.get(key);
    row.phone=row.phone||o.phone||"";
    row.orders.push(o);
    row.equipmentKeys.add(equipmentKeyOf(o));
    row.total+=Number(o.laborValue||0)+Number(o.materialValue||0);
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
function equipmentRows(){
  const map=new Map();
  for(const o of orders()){
    const key=equipmentKeyOf(o);
    if(!map.has(key)) map.set(key,{
      key,customer:o.customer||"Cliente",name:o.equipment||"Equipamento",
      type:o.equipmentType||"",brand:o.brand||"",model:o.model||"",capacity:o.capacity||"",
      voltage:o.voltage||"",gas:o.gas||"",room:o.room||"",serial:o.serial||"",
      orders:[],total:0,nextPreventive:""
    });
    const row=map.get(key);
    for(const f of ["type","brand","model","capacity","voltage","gas","room","serial"]){ if(!row[f]&&o[f]) row[f]=o[f]; }
    row.orders.push(o);
    row.total+=Number(o.laborValue||0)+Number(o.materialValue||0);
    if(o.nextPreventive) row.nextPreventive=o.nextPreventive;
  }
  return [...map.values()].sort((a,b)=>a.customer.localeCompare(b.customer,"pt-BR")||a.name.localeCompare(b.name,"pt-BR"));
}
function initials(name){return String(name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()}
function renderClients(filter=""){
  const target=document.getElementById("clientList"); if(!target)return;
  const q=String(filter||"").toLowerCase().trim();
  const rows=customerRows().filter(c=>!q||[c.name,c.phone,...c.orders.map(o=>o.equipment)].join(" ").toLowerCase().includes(q));
  target.innerHTML=rows.length?rows.map(c=>
    '<article class="client-card clickable-card" data-client="'+esc(encodeURIComponent(c.name))+'">'+
      '<div class="avatar">'+esc(initials(c.name))+'</div><div><b>'+esc(c.name)+'</b>'+
      '<small>'+c.equipmentKeys.size+' equipamento(s) · '+c.orders.length+' atendimento(s)</small>'+
      (c.phone?'<em>'+esc(c.phone)+'</em>':'')+'</div><span>›</span></article>'
  ).join(""):'<div class="empty-state">Nenhum cliente encontrado.</div>';
}
function renderEquipment(filter=""){
  const target=document.getElementById("equipmentList"); if(!target)return;
  const q=String(filter||"").toLowerCase().trim();
  const rows=equipmentRows().filter(e=>!q||[e.customer,e.name,e.brand,e.model,e.serial,e.room].join(" ").toLowerCase().includes(q));
  target.innerHTML=rows.length?rows.map(e=>
    '<article class="equipment-card clickable-card" data-equipment="'+esc(encodeURIComponent(e.key))+'">'+
      '<div class="equip-icon">'+(String(e.type||e.name).toLowerCase().includes("câmara")?"▣":"❄")+'</div>'+
      '<div><b>'+esc(e.name)+'</b><small>'+esc(e.customer)+(e.room?' · '+esc(e.room):'')+'</small>'+
      '<em>'+esc([e.gas,e.voltage,e.serial&&("S/N "+e.serial)].filter(Boolean).join(" · ")||e.orders.length+" atendimento(s)")+'</em></div><span>›</span></article>'
  ).join(""):'<div class="empty-state">Nenhum equipamento encontrado.</div>';
}

function card(o){return '<article class="order-card" data-order="'+esc(o.id)+'"><div class="order-top"><div><small>OS #'+esc(o.id)+'</small><b>'+esc(o.customer)+'</b></div><span class="tag '+(o.tag==="wait"?"wait":o.tag==="done"?"done":"")+'">'+esc(o.status)+'</span></div><p><b>'+esc(o.equipment)+'</b><br>'+esc(o.complaint)+'</p><div class="order-footer"><span>'+esc(o.when)+'</span><b>'+esc(o.value)+'</b></div></article>'}
function refreshCustomerOptions(){const d=document.getElementById("customerOptions");if(d)d.innerHTML=customerRows().map(c=>'<option value="'+esc(c.name)+'"></option>').join("")}
function render(){
 const list=orders();
 document.getElementById("homeOrders").innerHTML=list.slice(0,3).map(card).join("");
 document.getElementById("orderList").innerHTML=list.map(card).join("");
 document.getElementById("openCount").textContent=list.filter(o=>o.tag!=="done").length;
 renderClients(document.getElementById("clientSearch")?.value||"");
 renderEquipment(document.getElementById("equipmentSearch")?.value||"");
 refreshCustomerOptions();
}
render();

function setStep(n){
  steps.forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===n));
  stepDots.forEach((d,i)=>d.classList.toggle("on",i<n));
  document.getElementById("wizardTitle").textContent=({1:"Cliente",2:"Equipamento",3:"Atendimento"})[n];
}
document.querySelectorAll("[data-action='new-os']").forEach(b=>b.addEventListener("click",()=>{form.reset();setStep(1);dialog.showModal()}));
document.querySelectorAll("[data-next]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.next==="2"&&!form.customer.value.trim()){notify("Informe o cliente.");return}setStep(Number(b.dataset.next))}));
document.querySelectorAll("[data-prev]").forEach(b=>b.addEventListener("click",()=>setStep(Number(b.dataset.prev))));
form.addEventListener("submit",async e=>{
  e.preventDefault();
  const fd=new FormData(form);
  const equipmentText=[fd.get("brand"),fd.get("model"),fd.get("capacity")].filter(Boolean).join(" ")||fd.get("type")||"Equipamento";
  const equipmentKey=[fd.get("customer"),fd.get("serial")||"",equipmentText,fd.get("room")||""].join("|").toLowerCase();
  const item={
    id:String(Date.now()).slice(-6),
    customer:String(fd.get("customer")||"Cliente").trim(),
    phone:String(fd.get("phone")||"").trim(),
    equipment:equipmentText,
    equipmentKey,
    equipmentType:String(fd.get("type")||"").trim(),
    brand:String(fd.get("brand")||"").trim(),
    model:String(fd.get("model")||"").trim(),
    capacity:String(fd.get("capacity")||"").trim(),
    voltage:String(fd.get("voltage")||"").trim(),
    gas:String(fd.get("gas")||"").trim(),
    room:String(fd.get("room")||"").trim(),
    serial:String(fd.get("serial")||"").trim(),
    status:"Aberta",tag:"wait",
    complaint:fd.get("complaint")||"Sem relato inicial",
    when:"Agora",value:"A orçar",
    initialPhotos:(form.elements.photos?.files||[]).length,
    createdAt:new Date().toISOString()
  };
  const initialFiles=[...(form.elements.photos?.files||[])];
  const saved=JSON.parse(localStorage.getItem("refrig-orders")||"[]");saved.unshift(item);localStorage.setItem("refrig-orders",JSON.stringify(saved));
  try{await saveOrderFiles(item.id,initialFiles,"initial")}catch{}
  render();dialog.close();go("orders");notify("OS criada e registrada no histórico.");
});
const q=document.getElementById("orderSearch");q?.addEventListener("input",()=>{const term=q.value.toLowerCase();document.getElementById("orderList").innerHTML=orders().filter(o=>(o.customer+" "+o.equipment+" "+o.id).toLowerCase().includes(term)).map(card).join("")});
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
function findOrder(id){return orders().find(o=>String(o.id)===String(id))}
function setViewDirect(name){
  views.forEach(v=>v.classList.toggle("active",v.dataset.view===name));
  nav.forEach(b=>b.classList.toggle("active",b.dataset.go===name));
  currentView=name;
  window.scrollTo({top:0,behavior:"smooth"});
}
function detailHistory(o){
  const rows=o.history||[{label:"OS aberta",detail:o.complaint||"Atendimento registrado.",when:o.when||"—"}];
  return rows.slice().reverse().map(h=>'<div class="history-row"><i></i><div><small>'+esc(h.when||"")+'</small><b>'+esc(h.label||"Atualização")+'</b><span>'+esc(h.detail||"")+'</span></div></div>').join("");
}
function openOrderDetail(id){
  const o=findOrder(id); if(!o)return;
  lastNonDetailView=currentView==="detail"?"orders":currentView;
  const total=Number(o.laborValue||0)+Number(o.materialValue||0);
  const photos=Number(o.initialPhotos||0)+Number(o.finishPhotos||0);
  detailContent.innerHTML=
    '<article class="detail-hero"><button class="detail-back" type="button">‹</button><div><small>OS #'+esc(o.id)+'</small><h1>'+esc(o.customer)+'</h1><span>'+esc(o.equipment)+'</span></div><span class="tag '+(o.tag==="done"?"done":o.tag==="wait"?"wait":"")+'">'+esc(o.status)+'</span></article>'+
    '<div class="detail-grid">'+
      '<section class="info-card"><span>Problema relatado</span><b>'+esc(o.complaint||"Sem relato")+'</b></section>'+
      '<section class="info-card"><span>Diagnóstico</span><b>'+esc(o.diagnosis||"Ainda não informado")+'</b></section>'+
      '<section class="info-card wide"><span>Serviço executado</span><b>'+esc(o.service||"Ainda não informado")+'</b>'+(o.materials?'<p>Materiais: '+esc(o.materials)+'</p>':'')+'</section>'+
      '<section class="info-card wide"><span>Registro do atendimento</span><div class="value-grid"><div><small>Serviço</small><b>'+moneyValue(o.laborValue)+'</b></div><div><small>Materiais</small><b>'+moneyValue(o.materialValue)+'</b></div><div><small>Total</small><b>'+moneyValue(total)+'</b></div></div><div class="detail-pills"><span>📷 '+photos+' foto(s)</span><span>'+(o.signed?"✍ Assinado":"Assinatura pendente")+'</span><span>'+esc(o.payment||"Pendente")+'</span></div></section>'+
      '<section class="info-card wide"><span>Fotos e assinatura</span><div class="media-gallery" id="orderMediaGallery"><div class="media-loading">Carregando evidências…</div></div></section>'+
      '<section class="info-card wide"><span>Histórico</span><div class="history-list">'+detailHistory(o)+'</div></section>'+
    '</div>'+
    (o.tag==="done"?'<button class="primary full detail-main-action" data-reopen>Reabrir atendimento</button>':'<button class="primary full detail-main-action" data-finish>Finalizar atendimento</button>');
  setViewDirect("detail");
  detailContent.querySelector(".detail-back").onclick=()=>setViewDirect(lastNonDetailView||"orders");
  detailContent.querySelector("[data-finish]")?.addEventListener("click",()=>openFinish(o));
  detailContent.querySelector("[data-reopen]")?.addEventListener("click",()=>{saveOrderDetail(o.id,{status:"Em atendimento",tag:"service"});render();openOrderDetail(o.id);notify("OS reaberta.")});
  renderOrderMedia(o.id);
}
function orderHistoryCard(o){
  const total=Number(o.laborValue||0)+Number(o.materialValue||0);
  return '<article class="mini-os" data-order="'+esc(o.id)+'"><div><small>OS #'+esc(o.id)+' · '+esc(o.when||"")+'</small><b>'+esc(o.service||o.complaint||"Atendimento")+'</b><span>'+esc(o.equipment||"Equipamento")+'</span></div><div><span class="tag '+(o.tag==="done"?"done":o.tag==="wait"?"wait":"")+'">'+esc(o.status||"Aberta")+'</span><strong>'+(total?moneyValue(total):esc(o.value||"A orçar"))+'</strong></div></article>';
}
function openClientDetail(encodedName){
  const name=decodeURIComponent(encodedName),c=customerRows().find(x=>x.name===name); if(!c)return;
  const eq=equipmentRows().filter(e=>e.customer===name);
  const target=document.getElementById("clientDetailContent");
  target.innerHTML=
    '<article class="registry-hero"><button class="registry-back" type="button">‹</button><div><small>Cliente</small><h1>'+esc(c.name)+'</h1><span>'+esc(c.phone||"Sem telefone cadastrado")+'</span></div></article>'+
    '<div class="registry-kpis"><div><small>Equipamentos</small><b>'+eq.length+'</b></div><div><small>Atendimentos</small><b>'+c.orders.length+'</b></div><div><small>Histórico</small><b>'+moneyValue(c.total)+'</b></div></div>'+
    '<section class="registry-section"><div class="section-title"><div><b>Equipamentos</b><small>Prontuários deste cliente</small></div></div>'+
      (eq.length?eq.map(e=>'<article class="equipment-card clickable-card" data-equipment="'+esc(encodeURIComponent(e.key))+'"><div class="equip-icon">❄</div><div><b>'+esc(e.name)+'</b><small>'+esc(e.room||"Local não informado")+'</small><em>'+esc([e.gas,e.voltage].filter(Boolean).join(" · ")||e.orders.length+" atendimento(s)")+'</em></div><span>›</span></article>').join(""):'<div class="empty-state">Nenhum equipamento cadastrado.</div>')+
    '</section>'+
    '<section class="registry-section"><div class="section-title"><div><b>Histórico de atendimentos</b><small>Valores, serviços e status</small></div></div><div class="mini-os-list">'+c.orders.slice().reverse().map(orderHistoryCard).join("")+'</div></section>';
  setViewDirect("client-detail");
  target.querySelector(".registry-back").onclick=()=>go("clients");
}
function openEquipmentDetail(encodedKey){
  const key=decodeURIComponent(encodedKey),e=equipmentRows().find(x=>x.key===key); if(!e)return;
  const target=document.getElementById("equipmentDetailContent");
  const details=[
    e.room&&["Ambiente",e.room],e.type&&["Tipo",e.type],e.brand&&["Marca",e.brand],e.model&&["Modelo",e.model],
    e.capacity&&["Capacidade",e.capacity],e.gas&&["Refrigerante",e.gas],e.voltage&&["Tensão",e.voltage],e.serial&&["Nº de série",e.serial]
  ].filter(Boolean);
  target.innerHTML=
    '<article class="registry-hero equipment-hero"><button class="registry-back" type="button">‹</button><div><small>Equipamento · '+esc(e.customer)+'</small><h1>'+esc(e.name)+'</h1><span>'+(e.nextPreventive?'Próxima preventiva: '+esc(e.nextPreventive):e.orders.length+' atendimento(s) no histórico')+'</span></div></article>'+
    '<section class="equipment-specs">'+details.map(d=>'<div><small>'+esc(d[0])+'</small><b>'+esc(d[1])+'</b></div>').join("")+'</section>'+
    '<section class="registry-section"><div class="section-title"><div><b>Prontuário técnico</b><small>Todo o histórico deste equipamento</small></div><strong>'+moneyValue(e.total)+'</strong></div><div class="mini-os-list">'+e.orders.slice().reverse().map(orderHistoryCard).join("")+'</div></section>';
  setViewDirect("equipment-detail");
  target.querySelector(".registry-back").onclick=()=>go("equipment");
}
document.addEventListener("click",e=>{
  const o=e.target.closest(".order-card[data-order],.mini-os[data-order]"); if(o){openOrderDetail(o.dataset.order);return}
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
  signatureCanvas.width=Math.floor(r.width*ratio);signatureCanvas.height=Math.floor(160*ratio);
  signatureCtx.setTransform(ratio,0,0,ratio,0,0);signatureCtx.lineWidth=2.2;signatureCtx.lineCap="round";signatureCtx.strokeStyle="#0b3346";
}
function sigPoint(e){const r=signatureCanvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
signatureCanvas?.addEventListener("pointerdown",e=>{signatureDrawing=true;hasSignature=true;const p=sigPoint(e);signatureCtx.beginPath();signatureCtx.moveTo(p.x,p.y)});
signatureCanvas?.addEventListener("pointermove",e=>{if(!signatureDrawing)return;const p=sigPoint(e);signatureCtx.lineTo(p.x,p.y);signatureCtx.stroke()});
window.addEventListener("pointerup",()=>signatureDrawing=false);
document.getElementById("clearSignature")?.addEventListener("click",()=>{signatureCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);hasSignature=false});
document.getElementById("cancelFinish")?.addEventListener("click",()=>finishDialog.close());
function openFinish(o){
  finishForm.reset();document.getElementById("finishOrderId").value=o.id;
  finishForm.elements.diagnosis.value=o.diagnosis||"";finishForm.elements.service.value=o.service||"";finishForm.elements.materials.value=o.materials||"";
  finishForm.elements.laborValue.value=o.laborValue||"";finishForm.elements.materialValue.value=o.materialValue||"";finishForm.elements.payment.value=o.payment||"Pendente";
  hasSignature=false;finishDialog.showModal();requestAnimationFrame(resizeSignature);
}
finishForm?.addEventListener("submit",async e=>{
  e.preventDefault();const fd=new FormData(finishForm),id=document.getElementById("finishOrderId").value,o=findOrder(id);if(!o)return;
  const labor=parseMoney(fd.get("laborValue")),materialsValue=parseMoney(fd.get("materialValue")),total=labor+materialsValue;
  const patch={diagnosis:String(fd.get("diagnosis")||""),service:String(fd.get("service")||""),materials:String(fd.get("materials")||""),laborValue:labor,materialValue:materialsValue,payment:String(fd.get("payment")||"Pendente"),nextPreventive:String(fd.get("nextPreventive")||""),finishPhotos:(document.getElementById("finishPhotos").files||[]).length,signed:Boolean(document.getElementById("signedConsent").checked&&hasSignature),status:"Finalizada",tag:"done",value:moneyValue(total)};
  patch.history=[...(o.history||[]),{when:"Agora",label:"Atendimento finalizado",detail:(patch.service||"Serviço concluído")+" · "+patch.value+" · "+patch.payment+(patch.signed?" · assinado":"")}];
  const finishFiles=[...(document.getElementById("finishPhotos").files||[])];
  try{
    await saveOrderFiles(id,finishFiles,"finish");
    if(patch.signed)await saveSignatureMedia(id);
  }catch{}
  saveOrderDetail(id,patch);finishDialog.close();render();openOrderDetail(id);notify("Atendimento salvo no histórico.");
});
