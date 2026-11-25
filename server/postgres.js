// Adaptador PostgreSQL asíncrono. Mantiene la API prepare/get/all/run de StageHub.
import fs from 'node:fs';

const ID_TABLES = new Set(['users','categories','subcategories','items','units','audit_log']);
export function compileSql(input, args = [], mode = 'all') {
  let sql = input.trim()
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/date\('now','localtime'\)/gi, "(CURRENT_TIMESTAMP AT TIME ZONE 'America/Santiago')::date")
    .replace(/json_extract\(details, '\$\.item_id'\)/gi, "((details->>'item_id')::bigint)")
    .replace(/\bLIKE\s+\?/gi, 'ILIKE ?')
    .replace(/DO UPDATE SET value\s*=\s*value\s*\+\s*1/gi, 'DO UPDATE SET value = counters.value + 1')
    .replace(/LIMIT 90\) ORDER BY day/gi, 'LIMIT 90) AS recent_days ORDER BY day');
  // NO transformar asignaciones SET nombre=?; solo comparaciones de SELECT.
  if(/^SELECT\b/i.test(sql))sql=sql.replace(/\b((?:[a-z_][a-z_0-9]*\.)?(?:username|name|internal_code|serial_number))\s*=\s*\?/gi,'lower($1) = lower(?)');
  const values=[];
  const named = args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !Buffer.isBuffer(args[0]);
  let index=0;
  // No sustituir marcadores dentro de literales SQL ni casts ::tipo.
  sql=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|::[a-z_][a-z_0-9]*|\?|:[a-z_][a-z_0-9]*/gi, token=>{
    if (token==='?') { if(named || index>=args.length) throw new Error('Parámetros SQL incompletos'); values.push(args[index++]); return '$'+values.length; }
    if(token[0]===':' && token[1]!==':') { const key=token.slice(1); if(!named || !Object.hasOwn(args[0],key)) throw new Error('Parámetro SQL faltante: '+key); values.push(args[0][key]); return '$'+values.length; }
    return token;
  });
  if(!named && index!==args.length) throw new Error('Cantidad de parámetros SQL incorrecta');
  const table = sql.match(/^INSERT\s+INTO\s+(\w+)/i)?.[1];
  if(mode==='run' && ID_TABLES.has(table) && !/\bRETURNING\b/i.test(sql)) sql=sql.replace(/;$/,'')+' RETURNING id';
  return {text:sql,values};
}

export async function openPostgres(cfg) {
  const { default: pg } = await import('pg');
  for (const oid of [20,1700]) pg.types.setTypeParser(oid, v=>Number(v));
  for (const oid of [1082,114,3802]) pg.types.setTypeParser(oid,v=>v);
  pg.types.setTypeParser(1184,v=>new Date(v).toISOString().slice(0,19).replace('T',' '));
  pg.types.setTypeParser(1114,v=>v.slice(0,19));
  const url=new URL(cfg.databaseUrl);
  if(!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL debe ser PostgreSQL');
  // Las opciones TLS vienen de este archivo, no de parámetros de la URI que pg pueda sobreescribir.
  for(const k of ['sslmode','sslcert','sslkey','sslrootcert','ssl']) url.searchParams.delete(k);
  const ssl=cfg.pgNoTls ? false : {rejectUnauthorized:true, ...(cfg.databaseCa ? {ca:cfg.databaseCa.replace(/\\n/g,'\n')} : {})};
  const pool=new pg.Pool({connectionString:url.toString(),ssl,max:1,connectionTimeoutMillis:15000,idleTimeoutMillis:30000,statement_timeout:30000});
  pool.on('error',err=>console.error('[postgres] conexión inactiva:',err.code||err.message));
  let client=null;
  const query=(text,values)=>{ if(!client) throw new Error('Operación PostgreSQL fuera de una conexión asignada'); return client.query(text,values); };
  const db={dialect:'postgres',
    async scope(fn,{lock=true}={}) {
      if(client) throw new Error('Conexión PostgreSQL ya en uso');
      const c=await pool.connect(); client=c; let locked=false, broken=false;
      try {
        await c.query('SET search_path TO stagehub, pg_catalog');
        await c.query("SET TIME ZONE 'UTC'");
        if(lock){ await c.query('SELECT pg_advisory_lock(739221040)'); locked=true; }
        return await fn();
      } finally {
        try { if(locked) await c.query('SELECT pg_advisory_unlock(739221040)'); }
        catch { broken=true; }
        client=null; c.release(broken);
      }
    },
    async exec(sql){ return query(sql); },
    prepare(sql){ return {
      async get(...args){ const q=compileSql(sql,args,'get'); return (await query(q.text,q.values)).rows[0]; },
      async all(...args){ const q=compileSql(sql,args,'all'); return (await query(q.text,q.values)).rows; },
      async run(...args){ const q=compileSql(sql,args,'run'); const r=await query(q.text,q.values); return {changes:r.rowCount,lastInsertRowid:r.rows?.[0]?.id}; },
    }; },
    async close(){ await pool.end(); },
  };
  return db;
}
export async function migratePostgres(db,cfg){
  await db.exec(fs.readFileSync(cfg.postgresSchema,'utf8'));
}
