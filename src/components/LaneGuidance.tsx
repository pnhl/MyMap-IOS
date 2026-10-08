import React from 'react';
import {View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import type {RouteLane} from '../services/roadRouting';
import {Text} from '../ui/Text';
export function LaneGuidance({lanes}:{lanes?:RouteLane[]}){
 if(!lanes?.length)return null;
 return <View style={{flexDirection:'row',gap:5,alignItems:'center',paddingTop:8,flexWrap:'wrap'}}><Text style={{fontSize:11,color:'#B4BED3',marginRight:4}}>Làn đường</Text>{lanes.map((lane,index)=><View key={index} accessible accessibilityLabel={`Làn ${index+1}: ${lane.indications.join(', ')||'Chưa rõ hướng'}${lane.valid?' · phù hợp tuyến':''}`} style={{minHeight:32,padding:5,borderRadius:8,flexDirection:'row',backgroundColor:lane.valid?'#1C695D':'#263247',gap:2}}>{lane.indications.length?lane.indications.map((direction,i)=><MaterialCommunityIcons key={i} name={direction==='uturn'?'arrow-u-left-top':direction.includes('left')?'arrow-left-top':direction.includes('right')?'arrow-right-top':'arrow-up'} size={21} color={lane.valid?'#FFFFFF':'#8995AB'}/>):<Text style={{color:'#8995AB'}}>?</Text>}</View>)}</View>;
}
