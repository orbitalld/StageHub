import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

test('identidad e iconos web públicos: manifest válido, imágenes del tamaño declarado y API aún privada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagehub-brand-'));
  let app;
  try {
    app = await createApp(buildConfig({ databaseUrl:'', dataDir:dir, port:0, host:'127.0.0.1' }));
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const res = await fetch(base + '/');
    assert.equal(res.status,200);
    const html = await res.text();
    assert.match(html,/rel="manifest" href="\/manifest.webmanifest\?v=0\.4\.8"/);
    assert.match(html,/rel="apple-touch-icon" sizes="180x180"/);
    const response = await fetch(base + '/manifest.webmanifest?v=0.4.8');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/application\/manifest\+json/);
    const manifest = await response.json();
    assert.equal(manifest.short_name,'StageHub');
    assert.equal(manifest.display,'standalone');
    assert.equal(manifest.scope,'/');
    assert.equal(manifest.start_url,'/');
    assert.ok(manifest.icons.some(i=>i.sizes==='192x192'&&i.purpose==='any'));
    assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='any'));
    assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
    for(const icon of [...manifest.icons,{src:'/assets/stagehub-icon-180.png',sizes:'180x180'},{src:'/assets/stagehub-icon-32.png',sizes:'32x32'}]){
      const r=await fetch(base+icon.src);
      assert.equal(r.status,200);
      assert.equal(r.headers.get('content-type'),'image/png');
      const bytes=Buffer.from(await r.arrayBuffer());
      assert.equal(bytes.subarray(1,4).toString(),'PNG');
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
    }
    for(const asset of ['stagehub-emblem.png','stagehub-wordmark.png']){
      const r=await fetch(base+'/assets/'+asset);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');await r.arrayBuffer();
    }
    assert.equal((await fetch(base+'/api/items')).status,401);
    const main=await (await fetch(base+'/js/main.js')).text();
    assert.match(main,/function brand\(/);
    assert.match(main,/stagehub-emblem\.png/);
    assert.match(main,/stagehub-wordmark\.png/);
    assert.doesNotMatch(main,/h\('i',\s*\{\},\s*'S'\)/);
  } finally { if(app) await app.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
