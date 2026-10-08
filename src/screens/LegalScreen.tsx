import React from 'react';
import {Linking, View} from 'react-native';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface, GlassButton, glassColors} from '../ui/glass';
import {Text} from '../ui/Text';
import {LEGAL_DOCUMENTS, LEGAL_VERSION, type LegalDocument} from '../content/legal';
export default function LegalScreen({route}: {route: {params?: {document: LegalDocument}}}) {
 const document = LEGAL_DOCUMENTS[route.params?.document || 'about'];
 return <ScreenScaffold title={document.title} subtitle={`MyMap · 1.0.0 · ${LEGAL_VERSION.split('-').reverse().join('/')}`}>
  {document.sections.map(section => <GlassSurface key={section.title} style={{padding:18,gap:9}}><Text style={{fontSize:18,fontWeight:'800'}}>{section.title}</Text><Text style={{fontSize:14,lineHeight:23,color:glassColors.muted}}>{section.body}</Text></GlassSurface>)}
  <View style={{gap:8}}>{[['Google/Firebase','https://policies.google.com/privacy'],['AdMob','https://policies.google.com/technologies/ads'],['Supabase','https://supabase.com/privacy'],['OpenFreeMap','https://openfreemap.org/tos/'],['OpenStreetMap','https://osmfoundation.org/wiki/Privacy_Policy'],['Mapillary · Thông tin API','https://www.mapillary.com/developer/api-documentation'],['TomTom · Thông tin API','https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/raster-flow-tiles'],['VietFuel · Nguồn dữ liệu','https://github.com/TranQui004/vietfuel-api'],['Spotube · Quyền riêng tư','https://github.com/team-spotube/spotube/blob/master/PRIVACY_POLICY.md'],['Radio Browser · Thông tin dịch vụ','https://api.radio-browser.info/']].map(([label,url])=><GlassButton key={label} tone="neutral" onPress={()=>void Linking.openURL(url!)}><Text>{label}</Text></GlassButton>)}</View>
 </ScreenScaffold>;
}
