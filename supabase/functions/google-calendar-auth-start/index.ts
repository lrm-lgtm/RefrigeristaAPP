import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL="https://lrm-lgtm.github.io/RefrigeristaAPP/";
const SCOPES=[
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.app.created"
];

function json(body: unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "access-control-allow-origin":"https://lrm-lgtm.github.io",
      "access-control-allow-headers":"authorization, content-type",
      "access-control-allow-methods":"POST, OPTIONS"
    }
  });
}
function serviceKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(direct)return direct;
  throw new Error("SUPABASE_SERVICE_ROLE_KEY unavailable");
}
function base64url(bytes:Uint8Array){
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function sha256Hex(value:string){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function safeReturnUrl(value:unknown){
  try{
    const url=new URL(String(value||APP_URL));
    if(url.origin!=="https://lrm-lgtm.github.io"||!url.pathname.startsWith("/RefrigeristaAPP"))return APP_URL;
    return url.toString();
  }catch{return APP_URL}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"");
    if(!token)return json({error:"unauthorized"},401);

    const sb=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false}});
    const {data:userData,error:userError}=await sb.auth.getUser(token);
    const user=userData.user;
    if(userError||!user)return json({error:"unauthorized"},401);

    const {data:owner}=await sb.from("app_owner").select("user_id").eq("user_id",user.id).maybeSingle();
    if(!owner)return json({error:"forbidden"},403);

    const {data:creds,error:credsError}=await sb.rpc("google_calendar_get_oauth_credentials");
    const clientId=creds?.client_id;
    const clientSecret=creds?.client_secret;
    const redirectUri=Deno.env.get("SUPABASE_URL")+"/functions/v1/google-calendar-auth-callback";
    if(credsError||!clientId||!clientSecret){
      return json({
        error:"google_oauth_not_configured",
        message:"Credenciais OAuth do Google ainda não foram cadastradas.",
        redirect_uri:redirectUri
      },503);
    }

    const body=await req.json().catch(()=>({}));
    const returnUrl=safeReturnUrl(body?.return_url);
    const random=new Uint8Array(24);crypto.getRandomValues(random);
    const state=crypto.randomUUID()+"."+base64url(random);
    const stateHash=await sha256Hex(state);
    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();

    await sb.from("google_oauth_states").delete().lt("expires_at",new Date().toISOString());
    const {error:insertError}=await sb.from("google_oauth_states").insert({
      state_hash:stateHash,
      initiated_by:user.id,
      return_url:returnUrl,
      expires_at:expiresAt
    });
    if(insertError)throw insertError;

    const params=new URLSearchParams({
      client_id:clientId,
      redirect_uri:redirectUri,
      response_type:"code",
      scope:SCOPES.join(" "),
      access_type:"offline",
      prompt:"consent",
      include_granted_scopes:"true",
      state
    });
    return json({authorization_url:"https://accounts.google.com/o/oauth2/v2/auth?"+params.toString(),redirect_uri:redirectUri});
  }catch(error){
    console.error(error);
    return json({error:"internal_error",message:error instanceof Error?error.message:String(error)},500);
  }
});