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

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function notify(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>toast.classList.remove("show"),2200)}
function go(name){currentView=name;views.forEach(v=>v.classList.toggle("active",v.dataset.view===name));nav.forEach(b=>b.classList.toggle("active",b.dataset.go===name));scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));

function orderDetails(){try{return JSON.parse(localStorage.getItem("refrig-order-details")||"{}")}catch{return {}}}
function saveOrderDetail(id,patch){const all=orderDetails();all[String(id)]={...(all[String(id)]||{}),...patch};localStorage.setItem("refrig-order-details",JSON.stringify(all))}
function orders(){
  try{const base=[...JSON.parse(localStorage.getItem("refrig-orders")||"[]"),...demoOrders],detail=orderDetails();return base.map(o=>({...o,...(detail[String(o.id)]||{})}))}catch{return demoOrders}
}
function card(o){return '<article class="order-card" data-order="'+esc(o.id)+'"><div class="order-top"><div><small>OS #'+esc(o.id)+'</small><b>'+esc(o.customer)+'</b></div><span class="tag '+(o.tag==="wait"?"wait":o.tag==="done"?"done":"")+'">'+esc(o.status)+'</span></div><p><b>'+esc(o.equipment)+'</b><br>'+esc(o.complaint)+'</p><div class="order-footer"><span>'+esc(o.when)+'</span><b>'+esc(o.value)+'</b></div></article>'}
function render(){
 const list=orders();
 document.getElementById("homeOrders").innerHTML=list.slice(0,3).map(card).join("");
 document.getElementById("orderList").innerHTML=list.map(card).join("");
 document.getElementById("openCount").textContent=list.length;
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
form.addEventListener("submit",e=>{
  e.preventDefault();
  const fd=new FormData(form);
  const item={id:String(Date.now()).slice(-6),customer:fd.get("customer")||"Cliente",equipment:[fd.get("brand"),fd.get("model"),fd.get("capacity")].filter(Boolean).join(" ")||fd.get("type")||"Equipamento",status:"Aberta",tag:"wait",complaint:fd.get("complaint")||"Sem relato inicial",when:"Agora",value:"A orçar",initialPhotos:(form.elements.photos?.files||[]).length};
  const saved=JSON.parse(localStorage.getItem("refrig-orders")||"[]");saved.unshift(item);localStorage.setItem("refrig-orders",JSON.stringify(saved));render();dialog.close();go("orders");notify("OS criada nesta demonstração.");
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
      '<section class="info-card wide"><span>Histórico</span><div class="history-list">'+detailHistory(o)+'</div></section>'+
    '</div>'+
    (o.tag==="done"?'<button class="primary full detail-main-action" data-reopen>Reabrir atendimento</button>':'<button class="primary full detail-main-action" data-finish>Finalizar atendimento</button>');
  setViewDirect("detail");
  detailContent.querySelector(".detail-back").onclick=()=>setViewDirect(lastNonDetailView||"orders");
  detailContent.querySelector("[data-finish]")?.addEventListener("click",()=>openFinish(o));
  detailContent.querySelector("[data-reopen]")?.addEventListener("click",()=>{saveOrderDetail(o.id,{status:"Em atendimento",tag:"service"});render();openOrderDetail(o.id);notify("OS reaberta.")});
}
document.addEventListener("click",e=>{const c=e.target.closest(".order-card[data-order]");if(c)openOrderDetail(c.dataset.order)});

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
finishForm?.addEventListener("submit",e=>{
  e.preventDefault();const fd=new FormData(finishForm),id=document.getElementById("finishOrderId").value,o=findOrder(id);if(!o)return;
  const labor=parseMoney(fd.get("laborValue")),materialsValue=parseMoney(fd.get("materialValue")),total=labor+materialsValue;
  const patch={diagnosis:String(fd.get("diagnosis")||""),service:String(fd.get("service")||""),materials:String(fd.get("materials")||""),laborValue:labor,materialValue:materialsValue,payment:String(fd.get("payment")||"Pendente"),nextPreventive:String(fd.get("nextPreventive")||""),finishPhotos:(document.getElementById("finishPhotos").files||[]).length,signed:Boolean(document.getElementById("signedConsent").checked&&hasSignature),status:"Finalizada",tag:"done",value:moneyValue(total)};
  patch.history=[...(o.history||[]),{when:"Agora",label:"Atendimento finalizado",detail:(patch.service||"Serviço concluído")+" · "+patch.value+" · "+patch.payment+(patch.signed?" · assinado":"")}];
  saveOrderDetail(id,patch);finishDialog.close();render();openOrderDetail(id);notify("Atendimento salvo no histórico.");
});
