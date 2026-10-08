import React from 'react';
import {View} from 'react-native';
import {Text} from '../ui/Text';
import {mapScale} from '../utils/mapScale';
export function MapScale({viewport,top,approximate=false}:{viewport:{latitude:number;zoom:number}|null;top:number;approximate?:boolean}){
 const scale=viewport?mapScale(viewport.latitude,viewport.zoom):null;if(!scale)return null;
 return <View pointerEvents="none" accessibilityLabel={`Tỷ lệ bản đồ ${approximate?'xấp xỉ ':''}${scale.label}`} style={{position:'absolute',left:12,top,zIndex:11,backgroundColor:'#FFFFFFE8',padding:5,borderRadius:6}}><Text style={{fontSize:10,color:'#263247',textAlign:'center'}}>{approximate?'≈ ':''}{scale.label}</Text><View style={{width:scale.width,height:5,borderBottomWidth:2,borderLeftWidth:2,borderRightWidth:2,borderColor:'#263247'}}/></View>;
}
