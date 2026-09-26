import fs from "node:fs";

const html=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
const cloud=fs.readFileSync("cloud.js","utf8");
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
assert(html.includes('id="googleCalendarConnectBtn"'),"Google Calendar connect control missing");
assert(html.includes('name="appointmentDurationMinutes"'),"appointment duration selector missing");
assert(html.includes('data-view="visits"'),"visits view missing");
assert(html.includes('id="visitDialog"'),"visit dialog missing");
assert(html.includes('id="shareDialog"'),"share dialog missing");
assert(html.includes('id="signatureStatus"'),"signature status missing");
assert(html.includes('data-action="new-visit"'),"quick visit action missing");

const cssVersion=(html.match(/styles\.css\?v=(\d+)/)||[])[1];
const appVersion=(html.match(/app\.js\?v=(\d+)/)||[])[1];
const cloudVersion=(html.match(/cloud\.js\?v=(\d+)/)||[])[1];
const cacheVersion=(sw.match(/refrigerista-v(\d+)/)||[])[1];
assert(cssVersion&&appVersion&&cloudVersion&&cacheVersion,"version markers missing");
assert(cssVersion===appVersion&&appVersion===cloudVersion&&cloudVersion===cacheVersion,"asset/cache versions are out of sync");
assert(sw.includes("./cloud.js?v="+cloudVersion),"cloud.js is not cached by the service worker");

new Function(app);
new Function(cloud);

assert(app.includes("function customerRows()"),"customer grouping missing");
assert(app.includes("function equipmentRows()"),"equipment grouping missing");
assert(app.includes("function renderGlobalSearch("),"global search implementation missing");
assert(app.includes("function updateBaseOrders("),"record editing implementation missing");
assert(app.includes("function orderWhenLabel("),"schedule formatting missing");
assert(app.includes("function visitRows()"),"visit local storage missing");
assert(app.includes("function renderVisits()"),"visit rendering missing");
assert(app.includes("pendingVisitConversionId"),"visit to attendance conversion missing");
assert(app.includes("whatsappShareHref"),"WhatsApp summary sharing missing");
assert(app.includes("getSignatureDataUrl"),"receipt signature embedding missing");
assert(app.includes("signedAt"),"signature timestamp missing");
assert(cloud.includes("signInWithPassword"),"password login missing");
assert(cloud.includes("signUp"),"first access flow missing");
assert(cloud.includes("uploadLocalData"),"manual cloud upload missing");
assert(cloud.includes("downloadCloudData"),"manual cloud download missing");
assert(cloud.includes("refreshGoogleCalendarStatus"),"Google Calendar status integration missing");
assert(cloud.includes("google-calendar-auth-start"),"Google Calendar OAuth start call missing");
assert(cloud.includes("google-calendar-sync"),"Google Calendar sync call missing");
assert(cloud.includes("google-calendar-disconnect"),"Google Calendar disconnect call missing");
assert(cloud.includes("rawLocalVisits"),"visit cloud sync missing");
assert(cloud.includes("visit_id"),"visit Google Calendar sync missing");

console.log("RefrigeristaAPP smoke checks: PASS");
