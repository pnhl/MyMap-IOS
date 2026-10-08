const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function moduleFromSource(relative,mocks){
 const filename=path.resolve(__dirname,'..',relative);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(name=>{if(Object.hasOwn(mocks,name))return mocks[name];throw new Error(name);},module,module.exports);
 return module.exports;
}
test('account QR encodes the actual account code and can be decoded',()=>{
 const qr=require('qrcode-generator')(0,'M');const value='mymap:friend:MYMAP_TEST_CODE';
 qr.addData(value);qr.make();const count=qr.getModuleCount(),scale=6,width=(count+8)*scale;
 const pixels=new Uint8ClampedArray(width*width*4);pixels.fill(255);
 for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))for(let y=(row+4)*scale;y<(row+5)*scale;y++)for(let x=(col+4)*scale;x<(col+5)*scale;x++){
  const offset=(y*width+x)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0;
 }
 const decoded=require('jsqr')(pixels,width,width);
 assert.equal(decoded.data,value);
 const app=moduleFromSource('src/services/accountQR.ts',{'expo-image-picker':{},'jpeg-js':require('jpeg-js'),'jsqr':require('jsqr')});
 assert.equal(app.accountCodeFromQR(decoded.data),'MYMAP_TEST_CODE');
 assert.equal(app.accountCodeFromQR('mymap://friend/abc_123'),'ABC_123');
 assert.equal(app.accountCodeFromQR('  raw-code_9  '),'RAW-CODE_9');
 assert.throws(()=>app.accountCodeFromQR('https://unrelated.example'),/không phải/);
});
test('concurrent place edits preserve both places and survive a fresh read',async()=>{
 let raw=null;const storage={getItem:async()=>raw,setItem:async(_key,value)=>{await Promise.resolve();raw=value;}};
 const app=moduleFromSource('src/services/placeMetadata.ts',{'@react-native-async-storage/async-storage':storage});
 const first={key:'10:106',name:'First',latitude:10,longitude:106,note:'Actual note',favorite:true};
 const second={key:'11:107',name:'Second',latitude:11,longitude:107,note:'',favorite:false};
 await Promise.all([app.savePlace(first),app.savePlace(second)]);
 const restored=moduleFromSource('src/services/placeMetadata.ts',{'@react-native-async-storage/async-storage':storage});
 assert.deepEqual(await restored.getSavedPlaces(),[first,second]);
 await restored.savePlace({...first,favorite:false,note:''});
 const list=await restored.getSavedPlaces();assert.equal(list.length,2);assert.equal(list[0].favorite,false);assert.equal(list[0].note,'');
});
test('a failed place save does not block a later retry',async()=>{
 let raw=null,fail=true;const storage={getItem:async()=>raw,setItem:async(_key,value)=>{if(fail){fail=false;throw new Error('storage failure');}raw=value;}};
 const app=moduleFromSource('src/services/placeMetadata.ts',{'@react-native-async-storage/async-storage':storage});
 const place={key:'0:0',name:'Origin',latitude:0,longitude:0,note:'',favorite:true};
 await assert.rejects(app.savePlace(place),/storage failure/);
 await app.savePlace(place);assert.deepEqual(await app.getSavedPlaces(),[place]);
});
