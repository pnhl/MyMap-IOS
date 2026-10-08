import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { accountCodeFromQR } from '../services/accountQR';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
};

export function AccountQRScannerModal({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLocked(false);
      setTorch(false);
      setError(null);
    }
  }, [visible]);

  function handleBarcode(result: BarcodeScanningResult) {
    if (locked) return;
    setLocked(true);
    try {
      onScanned(accountCodeFromQR(result.data));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Không thể đọc mã QR.');
      setTimeout(() => setLocked(false), 1000);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={s.root}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng trình quét QR" onPress={onClose} style={s.iconButton}>
            <MaterialCommunityIcons name="close" color="#fff" size={27} />
          </Pressable>
          <View style={s.headerCopy}>
            <Text style={s.title}>Quét mã kết bạn</Text>
            <Text style={s.subtitle}>Đưa mã QR MyMap vào giữa khung</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Bật đèn pin" onPress={() => setTorch(value => !value)} style={s.iconButton}>
            <MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} color={torch ? '#58E9FF' : '#fff'} size={24} />
          </Pressable>
        </View>

        {!permission ? (
          <View style={s.center}><ActivityIndicator color="#58E9FF" /></View>
        ) : !permission.granted ? (
          <View style={s.center}>
            <MaterialCommunityIcons name="camera-lock-outline" color="#8FB4E8" size={52} />
            <Text style={s.permissionTitle}>Cần quyền máy ảnh</Text>
            <Text style={s.permissionBody}>MyMap chỉ dùng camera để đọc mã QR kết bạn.</Text>
            <Pressable accessibilityRole="button" onPress={() => void requestPermission()} style={s.permissionButton}>
              <Text style={s.permissionButtonText}>Cho phép máy ảnh</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.cameraWrap}>
            <CameraView
              active={visible}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={locked ? undefined : handleBarcode}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={s.overlay}>
              <View style={s.scanFrame} />
              <Text style={s.hint}>{locked ? 'Đã nhận mã…' : 'Giữ điện thoại ổn định'}</Text>
              {error ? <Text style={s.error}>{error}</Text> : null}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020A19' },
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#06142C' },
  headerCopy: { flex: 1 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#91A9CC', fontSize: 12, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(94,150,221,.18)' },
  cameraWrap: { flex: 1, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 260, borderRadius: 28, borderWidth: 3, borderColor: '#58E9FF', backgroundColor: 'transparent', shadowColor: '#58E9FF', shadowOpacity: .8, shadowRadius: 16 },
  hint: { marginTop: 22, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, color: '#fff', fontWeight: '700', backgroundColor: 'rgba(2,10,25,.75)' },
  error: { marginTop: 12, maxWidth: 320, color: '#FF9DB4', textAlign: 'center', backgroundColor: 'rgba(28,3,15,.84)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  permissionTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  permissionBody: { color: '#91A9CC', textAlign: 'center', lineHeight: 20 },
  permissionButton: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 16, backgroundColor: '#156B8E' },
  permissionButtonText: { color: '#fff', fontWeight: '800' },
});
