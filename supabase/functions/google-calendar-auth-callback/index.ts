import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function serviceKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(direct)return direct;
  throw new Error("SUPABASE_SERVICE_ROLE_KEY unavailable");
}
async function sha256Hex(value:string){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function redirect(base:string,params:Record<string,string>){
  const u=new URL(base);
  for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
  return Response.redirect(u.toString(),302);
}
async function googleJson(url:string,accessToken:string,init:RequestInit={}){
  const res=await fetch(url,{
    ...init,
    headers:{
      "authorization":"Bearer "+accessToken,
      "content-type":"application/json",
      ...(init.headers||{})
    }
  });
  if(!res.ok)throw new Error("google_api_"+res.status);
  return await res.json();
}

Deno.serve(async(req)=>{
  const url=new URL(req.url);
  const state=url.searchParams.get("state")||"";
  const code=url.searchParams.get("code")||"";
  const oauthError=url.searchParams.get("error")||"";
  const fallback="https://lrm-lgtm.github.io/RefrigeristaAPP/";

  try{
    if(!state)return redirect(fallback,{google_calendar:"error",reason:"missing_state"});
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false}});
    const stateHash=await sha256Hex(state);
    const {data:row,error:stateError}=await sb.from("google_oauth_states").select("*").eq("state_hash",stateHash).maybeSingle();
    if(stateError||!row)return redirect(fallback,{google_calendar:"error",reason:"invalid_state"});
    await sb.from("google_oauth_states").delete().eq("state_hash",stateHash);
    const returnUrl=row.return_url||fallback;
    if(new Date(row.expires_at).getTime()<Date.now())return redirect(returnUrl,{google_calendar:"error",reason:"expired_state"});
    if(oauthError)return redirect(returnUrl,{google_calendar:"error",reason:oauthError});
    if(!code)return redirect(returnUrl,{google_calendar:"error",reason:"missing_code"});

    const {data:creds,error:credsError}=await sb.rpc("google_calendar_get_oauth_credentials");
    const clientId=creds?.client_id,clientSecret=creds?.client_secret;
    if(credsError||!clientId||!clientSecret)return redirect(returnUrl,{google_calendar:"error",reason:"oauth_not_configured"});

    const redirectUri=Deno.env.get("SUPABASE_URL")+"/functions/v1/google-calendar-auth-callback";
    const body=new URLSearchParams({
      client_id:clientId,
      client_secret:clientSecret,
      code,
      grant_type:"authorization_code",
      redirect_uri:redirectUri
    });
    const tokenRes=await fetch("https://oauth2.googleapis.com/token",{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body
    });
    const tokens=await tokenRes.json();
    if(!tokenRes.ok||!tokens.access_token)throw new Error("token_exchange_failed");

    let refreshToken=tokens.refresh_token||null;
    if(refreshToken){
      const {error}=await sb.rpc("google_calendar_store_refresh_token",{p_secret:refreshToken});
      if(error)throw error;
    }else{
      const {data:existing}=await sb.rpc("google_calendar_get_refresh_token");
      refreshToken=existing||null;
      if(!refreshToken)throw new Error("missing_refresh_token");
    }

    let googleEmail:string|null=null;
    try{
      const profileRes=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:"Bearer "+tokens.access_token}});
      if(profileRes.ok){
        const profile=await profileRes.json();
        googleEmail=profile.email||null;
      }
    }catch{}

    const {data:existingConnection}=await sb.from("google_calendar_connection").select("calendar_id,calendar_name").eq("id",1).maybeSingle();
    let calendarId=existingConnection?.calendar_id||null;
    const calendarName=existingConnection?.calendar_name||"Luiz Miguel — Atendimentos";

    if(calendarId){
      const check=await fetch("https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calendarId),{
        headers:{authorization:"Bearer "+tokens.access_token}
      });
      if(!check.ok)calendarId=null;
    }

    if(!calendarId){
      const calendar=await googleJson("https://www.googleapis.com/calendar/v3/calendars",tokens.access_token,{
        method:"POST",
        body:JSON.stringify({summary:calendarName,timeZone:"America/Sao_Paulo"})
      });
      calendarId=calendar.id;
    }

    const scopes=String(tokens.scope||"").split(/\s+/).filter(Boolean);
    const {error:updateError}=await sb.from("google_calendar_connection").upsert({
      id:1,
      google_email:googleEmail,
      calendar_id:calendarId,
      calendar_name:calendarName,
      scopes,
      status:"connected",
      connected_by:row.initiated_by,
      connected_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
      last_error:null
    },{onConflict:"id"});
    if(updateError)throw updateError;

    return redirect(returnUrl,{google_calendar:"connected"});
  }catch(error){
    console.error(error);
    try{
      const sb=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false}});
      await sb.from("google_calendar_connection").upsert({
        id:1,status:"error",updated_at:new Date().toISOString(),
        last_error:error instanceof Error?error.message:String(error)
      },{onConflict:"id"});
    }catch{}
    return redirect(fallback,{google_calendar:"error",reason:"callback_failed"});
  }
});