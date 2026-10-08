import React from 'react';
import {View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {GlassButton,type IconName} from './glass';
import {Text} from './Text';
export function ActionButton({title,icon,...props}:Omit<React.ComponentProps<typeof GlassButton>,'children'>&{title:string;icon?:IconName}){
 return <GlassButton tone="blue" {...props}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}>{icon&&<MaterialCommunityIcons name={icon} size={19} color="#fff"/>}<Text style={{color:'#fff',fontWeight:'700'}}>{title}</Text></View></GlassButton>;
}
