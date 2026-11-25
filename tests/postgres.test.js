import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSql } from '../server/postgres.js';
import { checkStorage, putPhoto, getPhoto, deletePhoto } from '../server/storage.js';
test('PostgreSQL traduce marcadores, fecha, SQL de búsqueda y RETURNING',()=>{
 assert.deepEqual(compileSql('INSERT INTO items(name, internal_code) VALUES (:name,:internal_code)',[{name:'Beam',internal_code:'ILU-01'}],'run'),{text:'INSERT INTO items(name, internal_code) VALUES ($1,$2) RETURNING id',values:['Beam','ILU-01']});
 assert.deepEqual(compileSql("SELECT * FROM items WHERE name LIKE ? ESCAPE '\\' AND internal_code = ?",['%beam%','X']),{text:"SELECT * FROM items WHERE name ILIKE $1 ESCAPE '\\' AND lower(internal_code) = lower($2)",values:['%beam%','X']});
 assert.equal(compileSql("UPDATE users SET last_login_at=datetime('now') WHERE id=?",[1]).text,'UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1');
 assert.match(compileSql("SELECT * FROM audit_log WHERE json_extract(details, '$.item_id') = ?",[4]).text,/\(\(details->>'item_id'\)::bigint\) = \$1/);
 assert.match(compileSql('INSERT INTO counters(key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1',['x'],'run').text,/counters\.value \+ 1$/);
 assert.equal(compileSql('UPDATE categories SET name=?, color=? WHERE id=?',['Beam','#ffffff',1]).text,'UPDATE categories SET name=$1, color=$2 WHERE id=$3');
 assert.throws(()=>compileSql('SELECT ?',[]));
 assert.deepEqual(compileSql("SELECT '?' AS example, ? AS value",['hi']).values,['hi']);
});
test('Storage usa bucket privado, clave solo backend y operaciones correctas (HTTP simulado)',async()=>{
 const cfg={supabaseUrl:'https://example.supabase.co',supabaseKey:'sb_secret_test',storageBucket:'stagehub-photos'}; const original=globalThis.fetch,log=[];const img=Buffer.from('image-data');
 globalThis.fetch=async(url,opts)=>{log.push({url,...opts});if(url.includes('/bucket/'))return Response.json({public:false});if(url.includes('/authenticated/'))return new Response(img);return Response.json({ok:true});};
 try{await checkStorage(cfg);await putPhoto(cfg,'abc.png',img);assert.deepEqual(await getPhoto(cfg,'abc.png'),img);await deletePhoto(cfg,'abc.png');assert.equal(log[1].method,'POST');assert.equal(log[1].headers.apikey,'sb_secret_test');assert.equal(log[1].headers.Authorization,undefined);assert.equal(log[3].method,'DELETE');assert.deepEqual(JSON.parse(log[3].body),{prefixes:['abc.png']});}finally{globalThis.fetch=original;}
});
