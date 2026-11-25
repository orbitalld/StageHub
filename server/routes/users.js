import crypto from 'node:crypto';
import { HttpError } from '../http.js';
import { V } from '../validate.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { createUser, countUsers } from '../users.js';
import { publicUser, makeLoginLimiter } from '../auth.js';
import { legacyRole, ROLE_LABELS, effectiveRole } from '../permissions.js';

const emailOf = body => {
  const email = V.str(body,'email','El correo',{required:true,max:254}).toLowerCase();
  const [local,domain,...rest] = email.split('@');
  if(rest.length || !domain || local.length>64 || !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/i.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) V.fail('email','Ingresa un correo electrónico válido');
  return email;
};
const sha = token => crypto.createHash('sha256').update(token).digest('hex');
const sqlTime = d => d.toISOString().slice(0,19).replace('T',' ');
const listed = u => ({...publicUser(u), active:Boolean(u.active), approval_status:u.approval_status, email_verified:Boolean(u.email_verified_at), verification_required:Boolean(u.verification_required), created_at:u.created_at,last_login_at:u.last_login_at});
async function issueCode(db,cfg,u){
  const code=crypto.randomBytes(24).toString('base64url');
  await db.prepare('UPDATE users SET verification_hash=?,verification_expires_at=? WHERE id=?').run(sha(code),sqlTime(new Date(Date.now()+24*3600_000)),u.id);
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${cfg.mailKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:cfg.mailFrom,to:[u.email],subject:'Verifica tu correo en StageHub',text:`Copia este código en la opción Verificar correo de StageHub (válido 24 horas):\n\n${code}\n\nSi no solicitaste una cuenta, ignora este mensaje.`}),signal:AbortSignal.timeout(15000)}).catch(()=>null);
  if(!res?.ok)throw new HttpError(503,'No se pudo enviar el correo. Intenta reenviar el código más tarde.');
}
export function registerUserRoutes(router,{db,cfg}) {
  const reg=makeLoginLimiter({max:12,windowMs:3600_000});
  const verify=makeLoginLimiter({max:12,windowMs:15*60_000});
  const bool=v=>db.dialect==='postgres'?v:Number(v);
  const mailEnabled=Boolean(cfg.mailKey&&cfg.mailFrom);
  router.add('POST','/api/auth/register',{auth:false},async c=>{
    if(await countUsers(db)===0)throw new HttpError(409,'Primero debe configurarse el Master');
    const key=String(c.ip);reg.check(key);reg.fail(key);
    const email=emailOf(c.body);
    const u=await tx(db,async()=>{
      if(await db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email))throw new HttpError(409,'Ya existe una cuenta con ese correo');
      const u=await createUser(db,{username:'u_'+crypto.randomBytes(12).toString('hex'),full_name:c.body.full_name,password:c.body.password,role:'user'});
      await db.prepare('UPDATE users SET email=?,active=?,approval_status=?,verification_required=? WHERE id=?').run(email,bool(false),'pending',mailEnabled?1:0,u.id);
      await audit(db,u,'crear','user',u.id,'Nueva solicitud de cuenta');return {...u,email};
    });
    if(mailEnabled)await issueCode(db,cfg,u);
    c.status=201;return {verification_required:mailEnabled,message:mailEnabled?'Cuenta registrada. Revisa tu correo y verifica el código. Luego el Master debe aprobar tu acceso.':'Cuenta registrada. El Master debe comprobar tu correo y aprobar tu acceso.'};
  });
  router.add('POST','/api/auth/verify-email',{auth:false},async c=>{
    const key=String(c.ip);verify.check(key);verify.fail(key);
    const email=emailOf(c.body),code=V.str(c.body,'code','El código',{max:100,required:true});
    const u=await db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email);
    if(!u || !u.verification_hash || u.verification_hash!==sha(code) || u.verification_expires_at<=sqlTime(new Date()))throw new HttpError(422,'Código incorrecto o vencido');
    await db.prepare("UPDATE users SET email_verified_at=datetime('now'),verification_hash=NULL,verification_expires_at=NULL WHERE id=?").run(u.id);
    return {message:'Correo verificado. Espera la aprobación del Master.'};
  });
  router.add('POST','/api/auth/resend-email',{auth:false},async c=>{
    if(!mailEnabled)throw new HttpError(409,'La verificación automática no está configurada');
    const key=String(c.ip);reg.check(key);reg.fail(key);
    const email=emailOf(c.body);
    const u=await db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email);
    if(u && !u.email_verified_at && u.approval_status==='pending'){
      await db.prepare('UPDATE users SET verification_required=1 WHERE id=?').run(u.id);await issueCode(db,cfg,u);
    }
    return {message:'Si existe una cuenta pendiente, se enviará un código.'};
  });
  const W={perm:'users:write'};
  router.add('GET','/api/users',W,async()=> (await db.prepare('SELECT * FROM users ORDER BY id').all()).map(listed));
  router.add('PUT','/api/users/:id',W,async c=>await tx(db,async()=>{
    const id=Number(c.params.id);
    if(!Number.isSafeInteger(id)||id<1)throw new HttpError(404,'Usuario no encontrado');
    const u=await db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if(!u)throw new HttpError(404,'Usuario no encontrado');
    if(id===c.user.id)throw new HttpError(409,'No puedes cambiar tus propios permisos ni desactivar tu cuenta');
    const role=V.oneOf(c.body,'role','El rol',Object.keys(ROLE_LABELS));
    const status=V.oneOf(c.body,'approval_status','El estado',['pending','approved','rejected']);
    if(typeof c.body.active!=='boolean')V.fail('active','El estado activo debe ser verdadero o falso');
    const active=status==='approved'&&c.body.active;
    if(status==='approved'&&u.verification_required&&!u.email_verified_at)throw new HttpError(409,'El usuario debe verificar su correo antes de ser aprobado');
    if(status==='approved'&&u.email&&!u.email_verified_at&&!u.verification_required&&u.approval_status!=='approved'&&c.body.confirm_manual_email!==true)throw new HttpError(422,'Confirma que comprobaste manualmente el correo de esta persona');
    if(effectiveRole(u)==='master'&&u.active&&u.approval_status==='approved'&&(!active||role!=='master')){
      const n=(await db.prepare("SELECT COUNT(*) AS n FROM users WHERE access_role='master' AND active=? AND approval_status='approved'").get(bool(true))).n;
      if(n<=1)throw new HttpError(409,'Debe quedar al menos un Master activo');
    }
    await db.prepare('UPDATE users SET role=?,access_role=?,approval_status=?,active=? WHERE id=?').run(legacyRole(role),role,status,bool(active),id);
    if(role!==effectiveRole(u)||!active||status!==u.approval_status)await db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    await audit(db,c.user,'editar','user',id,`Permisos de ${u.full_name}: ${ROLE_LABELS[role]} / ${status}${active?'':' (sin acceso)'}`,{role,status,active});
    return listed(await db.prepare('SELECT * FROM users WHERE id=?').get(id));
  }));
}
