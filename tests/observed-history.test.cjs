const test=require('node:test'),assert=require('node:assert/strict');
const{loadService,memoryDatabase}=require('./service-loader.cjs');
const geo=loadService('src/utils/geo.ts'),stats=loadService('src/utils/observedJourneyStats.ts',{'./geo':geo});
test('recap reads beyond the former 25,000-fix cap while keeping each page bounded',async()=>{
 const db=memoryDatabase();try{
 await db.execAsync(`CREATE TABLE location_points(latitude REAL,longitude REAL,accuracy REAL,altitude REAL,speed REAL,heading REAL,timestamp INTEGER UNIQUE);WITH RECURSIVE fixes(i) AS(SELECT 0 UNION ALL SELECT i+1 FROM fixes WHERE i<25999) INSERT INTO location_points SELECT 21,105,10,NULL,NULL,NULL,1000+i*15000 FROM fixes;`);
 let maxPage=0,calls=0;const wrapped={...db,getAllAsync:async(...args)=>{calls++;const rows=await db.getAllAsync(...args);maxPage=Math.max(maxPage,rows.length);return rows;}};
 const reader=loadService('src/services/observedHistory.ts',{'../db/database':{getDb:async()=>wrapped},'../utils/observedJourneyStats':stats});
 const result=await reader.observedHistory(1000,1000+26000*15000);assert.equal(result.pointCount,26000);assert.equal(result.observedMinutes,25999/4);assert.equal(result.distanceMeters,0);assert.ok(maxPage<=2048);assert.equal(calls,13);assert.equal(result.visits.length,1);
 }finally{db.close();}
});
test('visits spanning pages keep the same centroid and stay length as a complete chronological series',()=>{
 const points=Array.from({length:21},(_,i)=>({latitude:21+i*.000001,longitude:105,accuracy:10,timestamp:i*30000}));const stream=new stats.ObservedJourneyAccumulator();stream.append(points.slice(0,8));stream.append(points.slice(8,16));stream.append(points.slice(16));const paged=stream.result(),whole=stats.observedJourneyStats(points);assert.equal(paged.distanceMeters,whole.distanceMeters);assert.equal(paged.observedMinutes,10);assert.equal(paged.visits.length,1);assert.equal(paged.visits[0].durationMs,600000);assert.equal(paged.visits[0].latitude,whole.visits[0].latitude);
});
test('an offline gap closes the previous stay rather than marking it ongoing',()=>{
 const now=Date.now(),points=Array.from({length:11},(_,i)=>({latitude:21,longitude:105,accuracy:10,timestamp:now-600000+i*30000}));points.push({latitude:21,longitude:105,accuracy:10,timestamp:now});const result=stats.observedJourneyStats(points);assert.equal(result.visits.length,1);assert.equal(result.visits[0].leftAt,now-300000);assert.equal(result.observedMinutes,5);
});
test('profile daily statistics cover all stored fixes and retain only per-day results',async()=>{
 const db=memoryDatabase();try{await db.execAsync(`CREATE TABLE location_points(latitude REAL,longitude REAL,accuracy REAL,altitude REAL,speed REAL,heading REAL,timestamp INTEGER UNIQUE);WITH RECURSIVE fixes(i) AS(SELECT 0 UNION ALL SELECT i+1 FROM fixes WHERE i<25999) INSERT INTO location_points SELECT 21,105,10,NULL,NULL,NULL,1000+i*15000 FROM fixes;`);const reader=loadService('src/services/observedHistory.ts',{'../db/database':{getDb:async()=>db},'../utils/observedJourneyStats':stats}),days=await reader.dailyObservedHistory(1000,1000+26000*15000);assert.equal(days.reduce((sum,day)=>sum+day.pointCount,0),26000);assert.ok(days.length<10);assert.ok(days.every(day=>day.distanceMeters===0&&day.visits>=1));}finally{db.close();}
});
