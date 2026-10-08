const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
exports.loadPure=function(relative){
  const filename=path.resolve(__dirname,'..',relative),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(module,exports){${code}\n})`,{filename})(module,module.exports);
  return module.exports;
};
