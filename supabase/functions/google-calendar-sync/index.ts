import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TZ="America/Sao_Paulo";

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
async function authOwner(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return {error:json({error:"unauthorized"},401)};
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false}});
  const {data,error}=await sb.auth.getUser(token);
  if(error||!data.user)return {error:json({error:"unauthorized"},401)};
  const {data:owner}=await sb.from("app_owner").select("user_id").eq("user_id",data.user.id).maybeSingle();
  if(!owner)return {error:json({error:"forbidden"},403)};
  return {sb,user:data.user};
}
async function accessToken(sb:any){
  const [{data:creds,error:credErr},{data:refresh,error:refreshErr}]=await Promise.all([
    sb.rpc("google_calendar_get_oauth_credentials"),
    sb.rpc("google_calendar_get_refresh_token")
  ]);
  if(credErr||refreshErr||!creds?.client_id||!creds?.client_secret||!refresh){
    throw new Error("google_calendar_not_configured");
  }
  const body=new URLSearchParams({
    client_id:creds.client_id,
    client_secret:creds.client_secret,
    refresh_token:refresh,
    grant_type:"refresh_token"
  });
  const res=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body
  });
  const data=await res.json();
  if(!res.ok||!data.access_token)throw new Error("google_refresh_failed");
  return data.access_token as string;
}
async function googleEvent(access:string,calendarId:string,eventId:string|null,body:any){
  const base="https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calendarId)+"/events";
  if(eventId){
    const patch=await fetch(base+"/"+encodeURIComponent(eventId)+"?sendUpdates=none",{
      method:"PATCH",
      headers:{authorization:"Bearer "+access,"content-type":"application/json"},
      body:JSON.stringify(body)
    });
    if(patch.status!==404&&patch.status!==410){
      const data=await patch.json();
      if(!patch.ok)throw new Error("google_event_update_"+patch.status);
      return data;
    }
  }
  const create=await fetch(base+"?sendUpdates=none",{
    method:"POST",
    headers:{authorization:"Bearer "+access,"content-type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await create.json();
  if(!create.ok)throw new Error("google_event_create_"+create.status);
  return data;
}
async function deleteEvent(access:string,calendarId:string,eventId:string){
  const url="https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calendarId)+"/events/"+encodeURIComponent(eventId)+"?sendUpdates=none";
  const res=await fetch(url,{method:"DELETE",headers:{authorization:"Bearer "+access}});
  if(!res.ok&&res.status!==404&&res.status!==410)throw new Error("google_event_delete_"+res.status);
}
function equipmentLabel(e:any){
  return [e?.brand,e?.model,e?.capacity].filter(Boolean).join(" ")||e?.type||"Equipamento";
}
function addMinutes(iso:string,minutes:number){
  return new Date(new Date(iso).getTime()+minutes*60000).toISOString();
}
function nextDate(date:string){
  const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}

async function syncVisit(sb:any,access:string,calendarId:string,visitId:string){
  const {data:v,error}=await sb.from("visits").select("*").eq("id",visitId).maybeSingle();
  if(error||!v)return json({error:"visit_not_found"},404);

  const result:any={kind:"visit",appointment:"unchanged"};
  if(v.status==="cancelled"||!v.scheduled_at){
    if(v.google_event_id){
      await deleteEvent(access,calendarId,v.google_event_id);
      await sb.from("visits").update({
        google_event_id:null,google_calendar_id:calendarId,google_event_url:null,
        google_sync_status:"deleted",google_synced_at:new Date().toISOString(),google_sync_error:null
      }).eq("id",v.id);
      result.appointment="deleted";
    }
    return json({ok:true,...result});
  }

  const title=[v.customer_name,v.title||"Visita"].filter(Boolean).join(" · ");
  const description=[
    "RefrigeristaAPP · Visita / compromisso",
    v.phone?"Telefone: "+v.phone:"",
    v.notes?"Observação: "+v.notes:"",
    v.status==="done"?"Status: concluída":""
  ].filter(Boolean).join("\n");

  const event=await googleEvent(access,calendarId,v.google_event_id||null,{
    summary:title,
    description,
    location:v.address||undefined,
    start:{dateTime:new Date(v.scheduled_at).toISOString(),timeZone:TZ},
    end:{dateTime:addMinutes(v.scheduled_at,Number(v.duration_minutes||60)),timeZone:TZ},
    reminders:{useDefault:false,overrides:[
      {method:"popup",minutes:1440},
      {method:"popup",minutes:60}
    ]}
  });

  await sb.from("visits").update({
    google_event_id:event.id,google_calendar_id:calendarId,google_event_url:event.htmlLink||null,
    google_sync_status:"synced",google_synced_at:new Date().toISOString(),google_sync_error:null
  }).eq("id",v.id);

  result.appointment=v.google_event_id?"updated":"created";
  result.appointment_url=event.htmlLink||null;
  return json({ok:true,...result});
}

async function syncWorkOrder(sb:any,access:string,calendarId:string,workOrderId:string){
  const {data:w,error:wErr}=await sb.from("work_orders").select("*").eq("id",workOrderId).maybeSingle();
  if(wErr||!w)return json({error:"work_order_not_found"},404);

  const [{data:customer},{data:equipment},{data:closing}]=await Promise.all([
    sb.from("customers").select("*").eq("id",w.customer_id).maybeSingle(),
    w.equipment_id?sb.from("equipments").select("*").eq("id",w.equipment_id).maybeSingle():Promise.resolve({data:null}),
    sb.from("work_order_closings").select("*").eq("work_order_id",w.id).maybeSingle()
  ]);

  let site:any=null;
  if(equipment?.site_id){
    const siteR=await sb.from("customer_sites").select("*").eq("id",equipment.site_id).maybeSingle();
    site=siteR.data;
  }

  const equip=equipmentLabel(equipment);
  const title=(customer?.name||"Cliente")+" · "+(w.attendance_type||"Atendimento");
  const description=[
    "RefrigeristaAPP · Atendimento #"+(w.number||""),
    "Equipamento: "+equip+(equipment?.environment?" · "+equipment.environment:""),
    customer?.phone?"Telefone: "+customer.phone:"",
    w.complaint?"Problema: "+w.complaint:"",
    w.diagnosis?"Diagnóstico: "+w.diagnosis:"",
    w.service_report?"Serviço: "+w.service_report:""
  ].filter(Boolean).join("\n");

  const result:any={kind:"work_order",appointment:"unchanged",preventive:"unchanged"};

  if(w.status==="cancelled"||!w.scheduled_at){
    if(w.google_event_id){
      await deleteEvent(access,calendarId,w.google_event_id);
      await sb.from("work_orders").update({
        google_event_id:null,google_calendar_id:calendarId,google_event_url:null,
        google_sync_status:"deleted",google_synced_at:new Date().toISOString(),google_sync_error:null
      }).eq("id",w.id);
      result.appointment="deleted";
    }
  }else{
    const event=await googleEvent(access,calendarId,w.google_event_id||null,{
      summary:title,
      description,
      location:site?.address||undefined,
      start:{dateTime:new Date(w.scheduled_at).toISOString(),timeZone:TZ},
      end:{dateTime:addMinutes(w.scheduled_at,Number(w.appointment_duration_minutes||60)),timeZone:TZ},
      reminders:{useDefault:false,overrides:[
        {method:"popup",minutes:1440},
        {method:"popup",minutes:60}
      ]}
    });
    await sb.from("work_orders").update({
      google_event_id:event.id,google_calendar_id:calendarId,google_event_url:event.htmlLink||null,
      google_sync_status:"synced",google_synced_at:new Date().toISOString(),google_sync_error:null
    }).eq("id",w.id);
    result.appointment=w.google_event_id?"updated":"created";
    result.appointment_url=event.htmlLink||null;
  }

  if(closing?.next_preventive_at){
    const pDate=String(closing.next_preventive_at).slice(0,10);
    const pEvent=await googleEvent(access,calendarId,closing.preventive_google_event_id||null,{
      summary:"Preventiva · "+(customer?.name||"Cliente")+" · "+equip,
      description:[
        "RefrigeristaAPP · preventiva do atendimento #"+(w.number||""),
        equipment?.environment?"Ambiente: "+equipment.environment:"",
        customer?.phone?"Telefone: "+customer.phone:"",
        "Retorno preventivo programado."
      ].filter(Boolean).join("\n"),
      location:site?.address||undefined,
      start:{date:pDate},
      end:{date:nextDate(pDate)},
      reminders:{useDefault:false,overrides:[
        {method:"popup",minutes:10080},
        {method:"popup",minutes:1440}
      ]}
    });
    await sb.from("work_order_closings").update({
      preventive_google_event_id:pEvent.id,
      preventive_google_event_url:pEvent.htmlLink||null,
      preventive_google_synced_at:new Date().toISOString()
    }).eq("work_order_id",w.id);
    result.preventive=closing.preventive_google_event_id?"updated":"created";
    result.preventive_url=pEvent.htmlLink||null;
  }else if(closing?.preventive_google_event_id){
    await deleteEvent(access,calendarId,closing.preventive_google_event_id);
    await sb.from("work_order_closings").update({
      preventive_google_event_id:null,
      preventive_google_event_url:null,
      preventive_google_synced_at:new Date().toISOString()
    }).eq("work_order_id",w.id);
    result.preventive="deleted";
  }

  return json({ok:true,...result});
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let sb:any=null;
  let workOrderId:string|null=null;
  let visitId:string|null=null;
  try{
    const ctx=await authOwner(req);
    if(ctx.error)return ctx.error;
    sb=(ctx as any).sb;
    const body=await req.json().catch(()=>({}));
    workOrderId=body?.work_order_id?String(body.work_order_id):null;
    visitId=body?.visit_id?String(body.visit_id):null;
    if(Boolean(workOrderId)===Boolean(visitId))return json({error:"provide_exactly_one_record_id"},400);

    const {data:conn,error:connErr}=await sb.from("google_calendar_connection")
      .select("calendar_id,status").eq("id",1).maybeSingle();
    if(connErr||!conn||conn.status!=="connected"||!conn.calendar_id){
      return json({error:"google_calendar_not_connected"},409);
    }

    const access=await accessToken(sb);
    if(visitId)return await syncVisit(sb,access,conn.calendar_id,visitId);
    return await syncWorkOrder(sb,access,conn.calendar_id,workOrderId!);
  }catch(error){
    console.error(error);
    try{
      if(sb&&workOrderId){
        await sb.from("work_orders").update({
          google_sync_status:"error",
          google_sync_error:error instanceof Error?error.message:String(error),
          google_synced_at:new Date().toISOString()
        }).eq("id",workOrderId);
      }
      if(sb&&visitId){
        await sb.from("visits").update({
          google_sync_status:"error",
          google_sync_error:error instanceof Error?error.message:String(error),
          google_synced_at:new Date().toISOString()
        }).eq("id",visitId);
      }
    }catch{}
    return json({error:"sync_failed",message:error instanceof Error?error.message:String(error)},500);
  }
});