import * as FileSystem from 'expo-file-system/legacy';
import type {LocationObjectCoords} from 'expo-location';
import {deletePhotoPin,insertPhotoPin} from '../db/database';
import type {PhotoPin} from '../types/photo';
// Capture belongs to MomentCameraScreen. No external camera intent or invented GPS fallback.
export async function savePhotoPinFromUri(uri:string,coords:LocationObjectCoords,title:string){
 const capturedAt=Date.now(),dir=`${FileSystem.documentDirectory}mymap/photos/`,destination=`${dir}${capturedAt}.jpg`;
 await FileSystem.makeDirectoryAsync(dir,{intermediates:true});await FileSystem.copyAsync({from:uri,to:destination});
 try{return await insertPhotoPin({uri:destination,latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,capturedAt,title:title||null,note:null,placeName:null,countryCode:null,timezoneOffsetMinutes:-new Date().getTimezoneOffset()});}
 catch(e){await FileSystem.deleteAsync(destination,{idempotent:true});throw e;}
}
export async function removePhotoPin(pin:PhotoPin){await FileSystem.deleteAsync(pin.uri,{idempotent:true});await deletePhotoPin(pin.id);}
