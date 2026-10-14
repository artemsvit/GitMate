import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const { buildBlockMap } = createRequire(import.meta.url)('app-builder-lib/out/targets/blockmap/blockmap');
test('release blockmaps use the installed builder API and match final artifact size and digest', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gitmate-blockmap-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'artifact.zip');const bytes=crypto.randomBytes(96*1024);await fs.writeFile(file,bytes);
  const info=await buildBlockMap(file,'gzip',file+'.blockmap');assert.equal(info.size,bytes.length);assert.equal(info.sha512,crypto.createHash('sha512').update(bytes).digest('base64'));
  const map=JSON.parse(zlib.gunzipSync(await fs.readFile(file+'.blockmap')).toString());assert.equal(map.version,'2');assert.equal(map.files[0].sizes.reduce((sum:number,size:number)=>sum+size,0),bytes.length);assert.deepEqual(await fs.readFile(file),bytes);
});
