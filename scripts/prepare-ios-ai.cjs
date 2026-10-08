// Only download the pinned iOS XCFramework; do not download Android JNI binaries.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
async function main(){
 if(process.platform!=='darwin')throw Error('Run iOS native preparation on macOS.');
 const root=path.dirname(require.resolve('llama.rn/package.json'));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'install/native-artifacts.json')));
 const artifact=manifest.artifacts.find(a=>a.name==='ios-xcframework');
 if(pkg.version!=='0.12.9'||artifact?.sha256!=='ae9a37ae15a9e8d6ef0330f4afa3d8199af3590f7ecf371bfe48b35fd946c4ae')throw Error('Review and pin the iOS artifact before changing llama.rn.');
 const framework=path.join(root,artifact.relativePath),marker=path.join(root,artifact.markerPath);
 if(fs.existsSync(framework)&&fs.existsSync(marker)&&fs.readFileSync(marker,'utf8').trim()===artifact.sha256)return;
 if(fs.existsSync(framework))throw Error('Unverified iOS framework exists; reinstall dependencies with npm ci --ignore-scripts.');
 const archive=path.join(root,'install','mymap-ios-framework.tar.gz');
 try{
  const response=await fetch('https://github.com/mybigday/llama.rn/releases/download/v0.12.9/'+artifact.assetName,{signal:AbortSignal.timeout(300000)});
  if(!response.ok||!response.body)throw Error('Could not download official iOS framework.');
  const hash=crypto.createHash('sha256'),stream=Readable.fromWeb(response.body);stream.on('data',chunk=>hash.update(chunk));
  await pipeline(stream,fs.createWriteStream(archive));if(hash.digest('hex')!==artifact.sha256)throw Error('iOS framework SHA-256 mismatch.');
  const listing=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});
  if(listing.status!==0||listing.stdout.split('\n').filter(Boolean).some(name=>name.startsWith('/')||name.split('/').includes('..')||!name.replace(/^\.\//,'').startsWith('ios/')))throw Error('Invalid iOS framework archive layout.');
  const extraction=spawnSync('tar',['-xzf',archive,'-C',root],{stdio:'inherit'});if(extraction.status!==0||!fs.existsSync(framework))throw Error('Could not extract iOS framework.');
  fs.writeFileSync(marker,artifact.sha256+'\n');console.log('Verified and prepared llama.rn iOS XCFramework.');
 }finally{if(fs.existsSync(archive))fs.unlinkSync(archive);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
