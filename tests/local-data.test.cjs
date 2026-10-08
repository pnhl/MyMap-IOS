const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

// Compile the installed app's TypeScript, replacing only native platform APIs.
function loadModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename })(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.')) {
        const resolved = path.join(path.dirname(relativePath), name).replace(/\\/g, '/');
        const tsPath = resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
        return loadModule(tsPath, mocks);
      }
      throw new Error(`Unexpected native dependency: ${name}`);
    }, module, module.exports,
  );
  return module.exports;
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const counts = { opens: 0, initializations: 0 };
  const adapter = {
    execAsync: async sql => { counts.initializations++; sqlite.exec(sql); },
    runAsync: async (sql, ...args) => {
      const result = sqlite.prepare(sql).run(...args);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...args) || null,
    closeAsync: async () => sqlite.close(),
  };
  const db = loadModule('src/db/database.ts', {
    'expo-sqlite': { openDatabaseAsync: async () => { counts.opens++; return adapter; } },
  });
  return { db, sqlite, counts };
}

const photo = {
  uri: 'file:///mymap/photos/one.jpg', latitude: 10, longitude: 106, accuracy: 5,
  capturedAt: new Date(2026, 8, 16, 12).getTime(), title: null, note: null,
  placeName: null, countryCode: 'VN', timezoneOffsetMinutes: 420,
};
const point = timestamp => ({ latitude: 10, longitude: 106, accuracy: 5, altitude: null, speed: null, heading: null, timestamp });

test('concurrent readers share one initialized database', async () => {
  const { db, sqlite, counts } = fixture();
  try {
    await Promise.all([db.getPhotoPins(), db.getLocationPoints(), db.getDb()]);
    assert.deepEqual(counts, { opens: 1, initializations: 1 });
  } finally { sqlite.close(); }
});

test('a failed open can be retried', async () => {
  let opens = 0;
  const adapter = { execAsync: async () => {} };
  const db = loadModule('src/db/database.ts', {
    'expo-sqlite': { openDatabaseAsync: async () => {
      if (++opens === 1) throw new Error('temporary failure');
      return adapter;
    } },
  });
  await assert.rejects(db.getDb(), /temporary failure/);
  assert.equal(await db.getDb(), adapter);
  assert.equal(opens, 2);
});

test('location history returns the latest window in chronological order', async () => {
  const { db, sqlite } = fixture();
  try {
    await db.getDb();
    sqlite.exec('BEGIN');
    const insert = sqlite.prepare('INSERT INTO location_points (latitude, longitude, timestamp) VALUES (10, 106, ?)');
    for (let timestamp = 1; timestamp <= 25001; timestamp++) insert.run(timestamp);
    sqlite.exec('COMMIT');
    const history = await db.getLocationPoints();
    assert.equal(history.length, 25000);
    assert.equal(history[0].timestamp, 2);
    assert.equal(history.at(-1).timestamp, 25001);
    assert.deepEqual((await db.getLocationPoints(3)).map(p => p.timestamp), [24999, 25000, 25001]);
    await assert.rejects(db.getLocationPoints(-1), /không hợp lệ/);
    await assert.rejects(db.getLocationPoints(1.5), /không hợp lệ/);
  } finally { sqlite.close(); }
});

test('duplicate GPS timestamps are ignored', async () => {
  const { db, sqlite } = fixture();
  try {
    await db.insertLocationPoint(point(100));
    await db.insertLocationPoint(point(100));
    assert.equal((await db.getLocationPoints()).length, 1);
  } finally { sqlite.close(); }
});

test('selected GPS ranges retain old days beyond the latest window and exclude the next day',async()=>{
 const {db,sqlite}=fixture();try{
  await db.getDb();const insert=sqlite.prepare('INSERT INTO location_points(latitude,longitude,timestamp) VALUES(10,106,?)');
  sqlite.exec('BEGIN');for(let t=1;t<=26000;t++)insert.run(t);sqlite.exec('COMMIT');
  assert.equal((await db.getLocationPoints())[0].timestamp,1001);
  assert.deepEqual((await db.getLocationPointsInRange(1,4)).map(x=>x.timestamp),[1,2,3]);
  await assert.rejects(db.getLocationPointsInRange(4,1),/không hợp lệ/);
 }finally{sqlite.close();}
});

test('memory edits survive a read and preserve photo/location metadata', async () => {
  const { db, sqlite } = fixture();
  try {
    const id = await db.insertPhotoPin(photo);
    await db.updatePhotoPin(id, { title: '  Một chiều  ', note: "  Bạn bè & 'kỷ niệm'  ", placeName: '  Đà Lạt  ' });
    const saved = await db.getPhotoPin(id);
    assert.equal(saved.title, 'Một chiều');
    assert.equal(saved.note, "Bạn bè & 'kỷ niệm'");
    assert.equal(saved.placeName, 'Đà Lạt');
    for (const key of ['uri', 'latitude', 'longitude', 'capturedAt', 'timezoneOffsetMinutes']) assert.equal(saved[key], photo[key]);
    await db.updatePhotoPin(id, { title: ' ', note: '', placeName: null });
    assert.equal((await db.getPhotoPin(id)).note, null);
    await assert.rejects(db.updatePhotoPin(999, { title: null, note: null, placeName: null }), /không còn tồn tại/);
  } finally { sqlite.close(); }
});

test('deleting a memory preserves GPS history and other photos', async () => {
  const { db, sqlite } = fixture();
  try {
    await db.insertLocationPoint(point(100));
    const id = await db.insertPhotoPin(photo);
    await db.insertPhotoPin({ ...photo, uri: 'file:///mymap/photos/two.jpg' });
    await db.deletePhotoPin(id);
    assert.equal(await db.getPhotoPin(id), null);
    assert.equal((await db.getPhotoPins()).length, 1);
    assert.equal((await db.getLocationPoints()).length, 1);
  } finally { sqlite.close(); }
});

test('failed photo file deletion preserves the memory for retry', async () => {
  const { db, sqlite } = fixture();
  try {
    const id = await db.insertPhotoPin(photo);
    const pins = loadModule('src/services/photoPins.ts', {
      './platformLocation': {},
      'expo-file-system/legacy': { deleteAsync: async () => { throw new Error('file unavailable'); } },
      'expo-image-picker': {}, 'expo-location': {}, '../db/database': db,
    });
    await assert.rejects(pins.removePhotoPin({ ...photo, id }), /file unavailable/);
    assert.ok(await db.getPhotoPin(id));
  } finally { sqlite.close(); }
});

test('memory search supports accents, multiple terms, notes and dates', () => {
  const { searchMemories } = loadModule('src/utils/memorySearch.ts');
  const photos = [
    { ...photo, id: 1, placeName: 'Đà Lạt', title: 'Một chiều mưa', note: 'Cùng bạn bè' },
    { ...photo, id: 2, placeName: 'Hà Nội', capturedAt: new Date(2026, 7, 1, 12).getTime() },
  ];
  const ids = query => searchMemories(photos, query).map(p => p.id);
  assert.deepEqual(ids('da lat'), [1]);
  assert.deepEqual(ids('ĐÀ LẠT ban be'), [1]);
  assert.deepEqual(ids('chieu mua'), [1]);
  assert.deepEqual(ids('2026-09'), [1]);
  assert.deepEqual(ids('16/9/2026'), [1]);
  assert.deepEqual(ids('ha noi mua'), []);
  assert.deepEqual(ids('    '), [1, 2]);
  assert.equal(photos[0].placeName, 'Đà Lạt');
});
