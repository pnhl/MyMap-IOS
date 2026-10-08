import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {subscribeAuthState} from '../services/auth';
import {listInbox,readNotification,type InboxItem} from '../services/notificationInbox';
import { Text } from './Text';
import { GlassSurface, TopIconButton, glassColors, useResponsiveLayout } from './glass';
import { useAppTheme } from './theme';

export function AppHeader({ back = false, smart = false, settings = false, title, subtitle, onSearch, searchLabel = 'Tìm kiếm kỷ niệm' }: { back?: boolean; smart?: boolean; settings?: boolean; title?: string; subtitle?: string; onSearch?: () => void; searchLabel?: string }) {
  const nav = useNavigation<any>();
  const r = useResponsiveLayout();
  const { theme } = useAppTheme();
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request=useRef(0);
  function closeInbox(){request.current++;setInbox(null);setError(null);}
  useEffect(()=>{let owner:string|undefined;return subscribeAuthState((_event,session)=>{const next=session?.user.id||'local';if(owner!==undefined&&owner!==next)closeInbox();owner=next;});},[]);
  useFocusEffect(React.useCallback(()=>()=>{closeInbox();},[]));
  async function openInbox() {
    const token=++request.current;
    setError(null); setInbox([]);
    try { const items=await listInbox();if(token===request.current)setInbox(items); }
    catch { if(token===request.current)setError('Chưa tải được thông báo. Kiểm tra kết nối và thử lại.'); }
  }
  async function openNotification(n:InboxItem){const token=request.current;try{await readNotification(n);if(token!==request.current)return;if(n.callId){closeInbox();nav.navigate('Call',{callId:n.callId});}else if(n.roomId){closeInbox();nav.navigate('Chat',{roomId:n.roomId});}else setInbox(items=>items?.map(item=>item.id===n.id?{...item,read:true}:item)||null);}catch{if(token===request.current)setError('Chưa cập nhật được thông báo.');}}
  return <>
    <View style={s.header}><View style={s.row}>
      {back && <TopIconButton icon="chevron-left" accessibilityLabel="Quay lại" onPress={() => nav.goBack()} />}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.pageTitle, { color: theme.colors.text }, r.width < 360 && { fontSize: 21 }]}>{title || (smart ? 'Đồng hành' : 'Hôm nay')}</Text>
      <TopIconButton icon="alert-octagon" tone="rose" accessibilityLabel="Cứu trợ khẩn cấp SOS" onPress={() => nav.navigate('SOS')} />
      {settings ? <TopIconButton icon="cog-outline" accessibilityLabel="Mở cài đặt" onPress={() => nav.navigate('Settings')} /> : <TopIconButton icon="magnify" accessibilityLabel={onSearch && title === 'Bạn bè' ? 'Tìm bạn bè' : onSearch?searchLabel:'Tìm trong MyMap'} onPress={onSearch || (() => nav.navigate('Search'))} />}
      <TopIconButton icon="bell-outline" accessibilityLabel="Xem thông báo" onPress={() => void openInbox()} />
    </View>{subtitle && <Text style={[s.subtitle, { color: theme.colors.muted }]}>{subtitle}</Text>}</View>
    <Modal visible={inbox !== null} transparent animationType="fade" onRequestClose={closeInbox}>
      <View style={[s.overlay, { backgroundColor: `${theme.colors.bg}E8` }]}><GlassSurface style={s.dialog}>
        <View style={s.inboxHead}><Text style={[s.title, { color: theme.colors.text }]}>Thông báo</Text><TopIconButton icon="close" accessibilityLabel="Đóng thông báo" onPress={closeInbox} /></View>
        <ScrollView style={{ maxHeight: r.height * .5 }}>
          {error ? <Text style={[s.body, { color: theme.colors.muted }]}>{error}</Text> : !inbox?.length ? <Text style={[s.body, { color: theme.colors.muted }]}>Bạn chưa có thông báo.</Text> : inbox.map(n => <Pressable key={n.id} onPress={()=>void openNotification(n)} style={[s.notification, { borderBottomColor: theme.colors.border }]}>
            <Text style={[s.notificationTitle, { color: n.read?theme.colors.muted:theme.colors.text }]}>{n.read?'':'• '}{n.title}</Text>
            {!!n.body && <Text style={[s.body, { color: theme.colors.muted }]}>{n.body}</Text>}
            <Text style={[s.date, { color: theme.colors.faint }]}>{new Date(n.at).toLocaleString('vi-VN')}</Text>
          </Pressable>)}
        </ScrollView>
      </GlassSurface></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({ header: { gap: 8, paddingBottom: 4 }, row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 }, pageTitle: { flex: 1, fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -.6 }, subtitle: { fontSize: 14, lineHeight: 21, maxWidth: 560 }, overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(1,8,29,.8)' }, dialog: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 20, gap: 18 }, inboxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: -.4 }, body: { color: glassColors.muted, fontSize: 14, lineHeight: 21 }, notification: { gap: 5, paddingVertical: 15, borderBottomWidth: .7, borderBottomColor: glassColors.border }, notificationTitle: { color: '#fff', fontSize: 15, fontWeight: '700' }, date: { fontSize: 11, color: glassColors.faint } });
