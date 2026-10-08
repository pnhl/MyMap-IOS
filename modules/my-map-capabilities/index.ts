import {requireOptionalNativeModule} from 'expo';
type Capabilities = {
  hashAiModel?(uri:string):Promise<string>;
  aiHardware?():Promise<{local64Bit:boolean;availableBytes:number;totalBytes:number;systemSupported:boolean}>;
  systemAi?(action:'status'|'generate',input:string):Promise<string|{status:'available'|'downloadable'|'downloading'|'unavailable'}>;
  stopAi?():Promise<void>;
  speechInputAvailable?():Promise<boolean>;
  recognizeSpeech?(language:string):Promise<{text:string;offline:boolean}>;
  stopRecognition?():Promise<void>;
  analyzePhoto(uri:string):Promise<{text:string;labels:Array<{label:string;confidence:number}>;dhash:string;provider:string}>;
  authenticate(reason:string):Promise<boolean>;
  encrypt(value:string):Promise<string>;
  decrypt(value:string):Promise<string>;
  sign(value:string):Promise<{signature:string;publicKey:string;algorithm:string}>;
  speak(text:string,language:string):Promise<boolean>;
  stopSpeaking():Promise<void>;
  setPrivateScreen(enabled:boolean):Promise<void>;
};
export default requireOptionalNativeModule<Capabilities>('MyMapCapabilities');
