// Usuario y rol efímeros: solo Supabase local Vibe. Nunca se pasan al runtime.
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

export async function prepararModeradorE2E(local) {
 assert.equal(local.API_URL,"http://127.0.0.1:54421")
 const identity=execFileSync("docker",["inspect","--format",'{{ index .Config.Labels "com.supabase.cli.project" }}',"supabase_db_vibe"],{encoding:"utf8"}).trim()
 assert.equal(identity,"vibe")
 const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const nonce=randomUUID().replaceAll("-","")
 const email=`e2e-moderador-${nonce}@ejemplo.local`,password=`Ficticio-${randomBytes(24).toString("hex")}!`
 const username=`e2e_mod_${nonce.slice(0,20)}`
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{vibe_legal:{terms_version:"2026-11-09",privacy_version:"2026-11-09",age_assurance:"adult_self_declared"}}})
 if(error||!data.user)throw new Error("No se pudo crear moderador ficticio")
 const id=data.user.id
 assert.match(id,/^[0-9a-f-]{36}$/)
 function sql(input) {
  try {execFileSync("docker",["exec","-i","supabase_db_vibe","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input,stdio:["pipe","pipe","pipe"]})}
  catch{throw new Error("No se pudo provisionar/limpiar el rol ficticio")}
 }
 async function cleanup(){
  sql(`begin; delete from private.moderation_events where actor_user_id='${id}'; delete from private.platform_roles where user_id='${id}'; delete from private.platform_role_audit where target_user_id='${id}' or actor_user_id='${id}'; commit;`)
  const removed=await admin.from("profiles").delete().eq("user_id",id)
  if(removed.error)throw new Error("No se pudo retirar perfil ficticio")
  const result=await admin.auth.admin.deleteUser(id)
  if(result.error)throw new Error("No se pudo retirar moderador ficticio")
 }
 try {
  const profile=await admin.from("profiles").insert({user_id:id,username,display_name:"Moderador ficticio",profile_type:"artist"}).select("id").single()
  if(profile.error||!profile.data)throw new Error("No se pudo preparar perfil ficticio")
  sql(`insert into private.platform_roles(user_id,role) values('${id}','moderator');`)
  return {user:{id,email,password,profileId:profile.data.id,username,displayName:"Moderador ficticio"},cleanup}
 }catch(error){await cleanup();throw error}
}
