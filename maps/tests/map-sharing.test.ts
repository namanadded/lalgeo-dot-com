import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMap, normalizeGeoJson } from '../lib/map-schema';
import { isPublicAddress, publicUrl, resolveSource } from '../lib/public-data';
import { POST } from '../app/api/v1/maps/route';
import { GET, DELETE } from '../app/api/v1/maps/[id]/route';
import { readJson } from '../lib/map-http';
import { GET as schema } from '../app/openapi.json/route';
import fs from 'node:fs';
import vm from 'node:vm';
const point = { type: 'Feature', properties: { name: 'Central Library', category: 'Library' }, geometry: { type: 'Point', coordinates: [-114.051, 51.0453] } };
const collection = (features: any[]) => ({ type: 'FeatureCollection', features });
const body = { title: 'Calgary test', layers: [{ name: 'Libraries', geojson: collection([point]), labelField: 'name', color: 'green' }] };

test('normalizes map metadata, styles and coordinates; excludes arbitrary project fields', async () => {
 const map = await createMap({ ...body, credentials: 'do-not-copy', layers: [{ ...body.layers[0], labelSettings: { expression: 'alert(1)' }, labelsVisible: false, popoutsVisible: true }] });
 assert.equal(map.featureCount, 1); assert.equal(map.layers[0].labelField, 'name'); assert.equal(map.layers[0].color, 'green');
 assert.equal(map.layers[0].labelsVisible, false); assert.equal(map.layers[0].popoutsVisible, true);
 assert.deepEqual(map.layers[0].geojson.features[0].geometry.coordinates, [-114.051,51.0453]);
 assert.ok(!JSON.stringify(map).includes('alert(1)')); assert.ok(!JSON.stringify(map).includes('do-not-copy'));
});
test('preserves polygon holes and multiline geometry', () => {
 const outer = [[0,0],[10,0],[10,10],[0,0]], hole = [[1,1],[2,1],[2,2],[1,1]];
 const input = collection([{...point, geometry:{type:'Polygon',coordinates:[outer,hole]}},{...point,geometry:{type:'MultiLineString',coordinates:[[[0,0],[1,1]],[[2,2],[3,3]]]}}]);
 const result = normalizeGeoJson(input); assert.equal(result.geojson.features[0].geometry.coordinates.length,2); assert.equal(result.parts,3);
});
test('rejects invalid or oversized geometry instead of dropping features', () => {
 for (const geometry of [null,{type:'Point',coordinates:[200,51]}, {type:'Polygon',coordinates:[[[0,0],[1,1],[2,2],[3,3]]]}, {type:'LineString',coordinates:[[0,0]]}]) {
  assert.throws(()=>normalizeGeoJson(collection([{...point,geometry}])));
 }
 assert.throws(()=>normalizeGeoJson(collection(Array(10001).fill(point))));
});
test('rejects credential URLs and nonpublic targets', () => {
 for (const url of ['http://data.calgary.ca/data','https://127.0.0.1/data','https://[::1]/','https://u:p@data.calgary.ca','https://example.local/','https://example.com:8443','https://example.com/?api_key=secret']) assert.throws(()=>publicUrl(url));
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','fc00::1','::ffff:127.0.0.1','224.0.0.1']) assert.equal(isPublicAddress(ip),false,ip);
 assert.equal(isPublicAddress('8.8.8.8'),true);
});
test('resolves Calgary map pages to their parent datasets, requests a sentinel row', async()=>{
 const fetcher=async(url:string)=>url.includes('/api/views/')?{name:'Community Boundaries',columns:[]}:{results:[{resource:{id:'ab7m-fwn6',name:'Community Boundaries',parent_fxf:['surr-xmvs']},permalink:'https://data.calgary.ca/d/ab7m-fwn6'}]};
 const result=await resolveSource('https://data.calgary.ca/Base-Maps/Community-Boundaries/ab7m-fwn6/about',fetcher);
 assert.equal(new URL(result.url).pathname,'/resource/surr-xmvs.geojson'); assert.equal(new URL(result.url).searchParams.get('$limit'),'10001');
 await assert.rejects(resolveSource('https://data.calgary.ca',fetcher),/Choose a Calgary dataset/);
});
test('source fetching produces a snapshot, and supplied GeoJSON does not refetch',async()=>{
 let calls=0;
 const map=await createMap({sourceUrl:'https://example.com/map.geojson'},async()=>{calls++;return collection([point]);});
 assert.equal(calls,1); assert.equal(map.featureCount,1);
 await createMap({layers:[{sourceUrl:'https://example.com/map.geojson',geojson:collection([point])}]},async()=>{throw Error('unexpected fetch');});
});
test('rejects empty maps and prototype-bearing attributes', async()=>{
 await assert.rejects(createMap({layers:[{geojson:collection([])}]}),/no features/);
 const feature={...point,properties:JSON.parse('{"__proto__":{"polluted":true}}')};
 await assert.rejects(createMap({layers:[{geojson:collection([feature])}]}));
});
test('request body validation handles malformed JSON, content type and oversized body', async()=>{
 await assert.rejects(readJson(new Request('http://localhost',{method:'POST',body:'{}'})),/Content-Type/);
 await assert.rejects(readJson(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'})),/Invalid JSON/);
 await assert.rejects(readJson(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json','content-length':'4000000'},body:'{}'})),/exceeds/);
});
test('create/read/revoke API contract persists snapshot and protects deletion token', async()=>{
 const created=await POST(new Request('http://localhost:3000/api/v1/maps',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 assert.equal(created.status,201); const data=await created.json(); assert.match(data.shareUrl,/\/s\/[a-f0-9]{32}$/); assert.equal(data.deleteToken.length,64);
 const ctx={params:Promise.resolve({id:data.id})};
 try {
  const fetched=await GET(new Request(data.apiUrl),ctx); assert.equal(fetched.status,200); const saved=await fetched.json(); assert.equal(saved.title,'Calgary test'); assert.equal(saved.featureCount,1); assert.equal(saved.deleteToken,undefined); assert.equal(saved.deleteHash,undefined);
  assert.equal((await DELETE(new Request(data.apiUrl,{method:'DELETE'}),ctx)).status,401);
  assert.equal((await DELETE(new Request(data.apiUrl,{method:'DELETE',headers:{Authorization:`Bearer ${'a'.repeat(64)}`}}),ctx)).status,403);
 } finally {
  assert.equal((await DELETE(new Request(data.apiUrl,{method:'DELETE',headers:{Authorization:`Bearer ${data.deleteToken}`}}),ctx)).status,200);
 }
 assert.equal((await GET(new Request(data.apiUrl),ctx)).status,404);
});
test('invalid map ids do not access storage',async()=>{
 assert.equal((await GET(new Request('http://localhost'),{params:Promise.resolve({id:'../secret'})})).status,404);
});
test('OpenAPI is machine-readable with create/search/get/revoke operations',async()=>{
 const doc=await (await schema()).json(); assert.equal(doc.openapi,'3.1.0'); assert.equal(doc.paths['/api/v1/maps'].post.operationId,'createSharedMap');
 assert.ok(doc.paths['/api/v1/datasets']); assert.ok(doc.paths['/api/v1/maps/{id}'].delete.security);
});
test('editor conversion preserves holes and integration uses snapshot API',()=>{
 const html=fs.readFileSync('public/legacy/lalgeosurvey.html','utf8');
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(m[1].trim()) new vm.Script(m[1]);
 const start=html.indexOf('        function coordinatePairToVertex('), end=html.indexOf('        function createGeospatialLayer(',start);
 const context={coordinatePairToVertex:(p:number[])=>({lng:p[0],lat:p[1]}),coordinatesAreEqual:(a:any,b:any)=>a.lat===b.lat&&a.lng===b.lng,createPolygonGeometryFromRings:(rings:any)=>({type:"Polygon",rings})};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 const rings=[[[0,0],[10,0],[10,10],[0,0]],[[1,1],[2,1],[2,2],[1,1]]];
 assert.equal((context as any).geometryPartsFromGeoJson({type:'Polygon',coordinates:rings})[0].geometry.rings.length,2);
 assert.equal((context as any).geometryPartsFromGeoJson({type:'MultiPolygon',coordinates:[rings]})[0].geometry.rings.length,2);
 assert.ok(html.includes('copyShareLinkBtn?.addEventListener("click", openPublicMapSharing)'));
 assert.ok(html.includes('toolsShareMapBtn')); assert.ok(html.includes('if (publicSharedMapId) void loadPublicSharedMap(publicSharedMapId)'));
});
