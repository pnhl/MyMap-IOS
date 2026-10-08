import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import qrcode from 'qrcode-generator';
/** Real, scannable account code. Never shows a decorative/fake QR pattern. */
export function AccountQRCode({ code, size = 114 }: { code: string; size?: number }) {
  const qr = useMemo(()=>{const matrix=qrcode(0,'M');matrix.addData(`mymap:friend:${code}`);matrix.make();return matrix;},[code]);
  const count = qr.getModuleCount(); const cell = size/(count+8);
  return <View accessible accessibilityLabel={`Mã QR kết bạn: ${code}`} style={[s.outer,{width:size,height:size}]}>
    {Array.from({length:count},(_,row)=>Array.from({length:count},(_,column)=>qr.isDark(row,column) ? <View key={`${row}:${column}`} style={{position:'absolute',left:(column+4)*cell,top:(row+4)*cell,width:cell+.2,height:cell+.2,backgroundColor:'#091E49'}}/> : null))}
  </View>;
}
const s=StyleSheet.create({outer:{backgroundColor:'#EAF8FF',borderRadius:8}});
