const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
exports.loadService=function(relative,mocks={},globals={}){
 const filename=path.resolve(__dirname,'..',relative),module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(!(name in mocks))throw new Error('Missing mock '+name);return mocks[name];},Date,URL,JSON,atob,btoa,unescape,encodeURIComponent,setTimeout,clearTimeout,...globals},{filename});
 return module.exports;
};
exports.memoryDatabase=function(){
 const{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 return{execAsync:async(sql)=>db.exec(sql),runAsync:async(sql,...args)=>db.prepare(sql).run(...args),getAllAsync:async(sql,...args)=>db.prepare(sql).all(...args),getFirstAsync:async(sql,...args)=>db.prepare(sql).get(...args),close:()=>db.close()};
};
