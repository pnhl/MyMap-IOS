import React from 'react';
import {View} from 'react-native';
import {Text} from '../ui/Text';
import {measuredConsumption} from '../utils/vehicleConsumption';
import type {Expense,Vehicle} from '../types/catalog';
export function VehicleInsights({id,vehicle,expenses}:{id:string;vehicle:Vehicle;expenses:Expense[]}){
 const electric=vehicle.fuel==='electric',report=measuredConsumption(id,electric?'charging':'fuel',expenses);
 return <View style={{gap:6}}><Text>{report.fills} lần {electric?'sạc':'đổ nhiên liệu'} · {report.totalPaid.toLocaleString('vi-VN')} đ</Text><Text>{report.per100Km==null?'Ghi ít nhất 2 lần đầy bình/pin với mốc km và lượng mua để tính mức tiêu hao.':`Tiêu hao đo được: ${report.per100Km.toFixed(2)} ${electric?'kWh':'lít'}/100 km · ${report.distanceKm.toFixed(1)} km qua ${report.intervals} chu kỳ.`}</Text>{report.per100Km!=null&&<Text>Đo theo lượng mua giữa các lần đầy; bao gồm hao hụt {electric?'sạc điện':'nhiên liệu'}. Không suy ra từ mức tiêu hao dự kiến.</Text>}</View>;
}
