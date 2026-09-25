import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "access-control-allow-origin":"https://lrm-lgtm.github.io",
      "access-control-allow-headers":"authorization, content-type",
      "access-control-allow-methods":"GET, POST, OPTIONS"
    }
  });
}
function serviceKey(){
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("SUPABASE_SERVICE_ROLE_KEY unavailable");
  return key;
}
async function ownerClient(req:Request){
  const auth=req.headers.get("authorization")||"";
  const token=auth.replace(/^Bearer\s+/i,"");
  if(!token)return {error:json({error:"unauthorized"},401)};
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false}});
  const {data,error}=await sb.auth.getUser(token);
  if(error||!data.user)return {error:json({error:"unauthorized"},401)};
  const {data:owner}=await sb.from("app_owner").select("user_id").eq("user_id",data.user.id).maybeSingle();
  if(!owner)return {error:json({error:"forbidden"},403)};
  return {sb,user:data.user};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  try{
    const ctx=await ownerClient(req);
    if(ctx.error)return ctx.error;
    const {sb}=ctx as any;
    const {data:creds}=await sb.rpc("google_calendar_get_oauth_credentials");
    const configured=Boolean(creds?.client_id&&creds?.client_secret);
    const {data:conn}=await sb.from("google_calendar_connection")
      .select("google_email,calendar_id,calendar_name,status,connected_at,updated_at,last_error")
      .eq("id",1).maybeSingle();

    return json({
      configured,
      connected:conn?.status==="connected"&&Boolean(conn?.calendar_id),
      google_email:conn?.google_email||null,
      calendar_id:conn?.calendar_id||null,
      calendar_name:conn?.calendar_name||"Luiz Miguel — Atendimentos",
      connected_at:conn?.connected_at||null,
      updated_at:conn?.updated_at||null,
      last_error:conn?.last_error||null,
      redirect_uri:Deno.env.get("SUPABASE_URL")+"/functions/v1/google-calendar-auth-callback"
    });
  }catch(error){
    console.error(error);
    return json({error:"internal_error"},500);
  }
});