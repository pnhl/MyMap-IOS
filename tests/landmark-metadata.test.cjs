const test=require('node:test'),assert=require('node:assert/strict');const{loadService}=require('./service-loader.cjs');
function fixture(fetch){return loadService('src/services/landmarkMetadata.ts',{}, {fetch,AbortController});}
const sample=url=>({entities:{Q42:{id:'Q42',type:'item',labels:{vi:{value:'Địa danh'},en:{value:'Landmark'}},descriptions:{vi:{value:'Mô tả cộng đồng'}},sitelinks:{viwiki:{url}}}}});
test('landmark metadata prefers Vietnamese labels and only opens known HTTPS Wikipedia hosts',()=>{
 const s=fixture(()=>{});const result=s.parseLandmarkMetadata(sample('https://vi.wikipedia.org/wiki/Test'),'Q42');assert.equal(result.label,'Địa danh');assert.equal(result.description,'Mô tả cộng đồng');assert.ok(result.wikipediaUrl);for(const url of ['javascript:alert(1)','https://vi.wikipedia.org.evil.test/wiki/Test','https://user:password@vi.wikipedia.org/wiki/Test'])assert.equal(s.parseLandmarkMetadata(sample(url),'Q42').wikipediaUrl,null);assert.throws(()=>s.parseLandmarkMetadata(sample('https://vi.wikipedia.org/wiki/Test'),'../../etc'));assert.throws(()=>s.parseLandmarkMetadata({entities:{}},'Q42'));
});
test('Wikidata caches actual entity results and canceled requests never call the API',async()=>{
 let calls=0;const s=fixture(async()=>{calls++;return{ok:true,json:async()=>sample('https://vi.wikipedia.org/wiki/Test')};});await s.getLandmarkMetadata('Q42');await s.getLandmarkMetadata('Q42');assert.equal(calls,1);const c=new AbortController();c.abort();await assert.rejects(s.getLandmarkMetadata('Q42',c.signal),/hủy/);assert.equal(calls,1);
});
