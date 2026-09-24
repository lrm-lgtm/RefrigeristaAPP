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

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function notify(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>toast.classList.remove("show"),2200)}
function go(name){views.forEach(v=>v.classList.toggle("active",v.dataset.view===name));nav.forEach(b=>b.classList.toggle("active",b.dataset.go===name));scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));

function orders(){
  try{return [...JSON.parse(localStorage.getItem("refrig-orders")||"[]"),...demoOrders]}catch{return demoOrders}
}
function card(o){return '<article class="order-card"><div class="order-top"><div><small>OS #'+esc(o.id)+'</small><b>'+esc(o.customer)+'</b></div><span class="tag '+(o.tag==="wait"?"wait":"")+'">'+esc(o.status)+'</span></div><p><b>'+esc(o.equipment)+'</b><br>'+esc(o.complaint)+'</p><div class="order-footer"><span>'+esc(o.when)+'</span><b>'+esc(o.value)+'</b></div></article>'}
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
  const item={id:String(Date.now()).slice(-6),customer:fd.get("customer")||"Cliente",equipment:[fd.get("brand"),fd.get("model"),fd.get("capacity")].filter(Boolean).join(" ")||fd.get("type")||"Equipamento",status:"Aberta",tag:"wait",complaint:fd.get("complaint")||"Sem relato inicial",when:"Agora",value:"A orçar"};
  const saved=JSON.parse(localStorage.getItem("refrig-orders")||"[]");saved.unshift(item);localStorage.setItem("refrig-orders",JSON.stringify(saved));render();dialog.close();go("orders");notify("OS criada nesta demonstração.");
});
const q=document.getElementById("orderSearch");q?.addEventListener("input",()=>{const term=q.value.toLowerCase();document.getElementById("orderList").innerHTML=orders().filter(o=>(o.customer+" "+o.equipment+" "+o.id).toLowerCase().includes(term)).map(card).join("")});
let deferredPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;document.getElementById("installBtn").hidden=false});document.getElementById("installBtn")?.addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null});
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
