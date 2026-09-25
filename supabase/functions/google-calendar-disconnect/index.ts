import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body:unknown,status=200){
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
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("SUPABASE_SERVICE_ROLE_KEY unavailable");
  return key;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(!token)return json({error:"unauthorized"},401);
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false}});
    const {data:userData,error:userError}=await sb.auth.getUser(token);
    if(userError||!userData.user)return json({error:"unauthorized"},401);
    const {data:owner}=await sb.from("app_owner").select("user_id").eq("user_id",userData.user.id).maybeSingle();
    if(!owner)return json({error:"forbidden"},403);

    const {data:refresh}=await sb.rpc("google_calendar_get_refresh_token");
    if(refresh){
      try{
        await fetch("https://oauth2.googleapis.com/revoke",{
          method:"POST",
          headers:{"content-type":"application/x-www-form-urlencoded"},
          body:new URLSearchParams({token:refresh})
        });
      }catch{}
    }
    await sb.rpc("google_calendar_delete_refresh_token");
    await sb.from("google_calendar_connection").update({
      status:"disconnected",
      google_email:null,
      connected_by:null,
      connected_at:null,
      updated_at:new Date().toISOString(),
      last_error:null
    }).eq("id",1);
    return json({ok:true});
  }catch(error){
    console.error(error);
    return json({error:"internal_error"},500);
  }
});