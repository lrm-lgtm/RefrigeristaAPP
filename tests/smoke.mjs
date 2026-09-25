import fs from "node:fs";

const html=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");

function assert(condition,message){
  if(!condition){throw new Error(message)}
}

assert(!html.includes("\\n"),"index.html contains literal \\n markers");
assert(html.includes('data-view="home"'),"home view missing");
assert(html.includes('data-view="clients"'),"clients view missing");
assert(html.includes('data-view="equipment"'),"equipment view missing");
assert(html.includes('id="globalSearchDialog"'),"global search dialog missing");
assert(html.includes('id="settingsDialog"'),"settings dialog missing");
assert(html.includes("Novo atendimento"),"personal atendimento wording missing");

const cssVersion=(html.match(/styles\.css\?v=(\d+)/)||[])[1];
const appVersion=(html.match(/app\.js\?v=(\d+)/)||[])[1];
const cacheVersion=(sw.match(/refrigerista-v(\d+)/)||[])[1];
assert(cssVersion&&appVersion&&cacheVersion,"version markers missing");
assert(cssVersion===appVersion&&appVersion===cacheVersion,"asset/cache versions are out of sync");

new Function(app);

assert(app.includes("function customerRows()"),"customer grouping missing");
assert(app.includes("function equipmentRows()"),"equipment grouping missing");
assert(app.includes("function renderGlobalSearch("),"global search implementation missing");
assert(app.includes("function updateBaseOrders("),"record editing implementation missing");
assert(app.includes("function orderWhenLabel("),"schedule formatting missing");

console.log("RefrigeristaAPP smoke checks: PASS");
