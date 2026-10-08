import {TextInput} from '../ui/TextInput';
import { Text } from '../ui/Text';
import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import {
  type AuthResult,
  confirmPhoneCode,
  signInWithEmail,
  signUpWithEmail,
  signInAnonymously,
  signInWithApple,
  signInWithGameCenter,
  sendPhoneCode,
  sendPasswordReset,
  handleAuthUrl,
} from '../services/auth';
import GoogleFirebaseButton from '../components/GoogleFirebaseButton';
import {LEGAL_SUMMARY,LEGAL_VERSION} from '../content/legal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {travelNative} from '../services/travelPlatform';
import {isAmazonLocationDevice} from '../services/platformLocation';
import {
  GlassButton,
  GlassSegmentedTabs,
  GlassSurface,
  IconBadge,
  glassColors,
  useResponsiveLayout,
} from '../ui/glass';
import { ScreenScaffold, SectionTitle } from '../ui/ScreenScaffold';

type AuthMode = 'signin' | 'phone' | 'signup';
type SocialProvider = 'google' | 'apple' | 'gamecenter' | 'guest';

export default function LoginScreen() {
  const nav = useNavigation<any>();
  const r = useResponsiveLayout();
  const submitting = useRef(false);
  const [acceptedTerms,setAcceptedTerms]=useState(false);
  const [isFire,setIsFire]=useState(false);
  useEffect(()=>{void Promise.all([isAmazonLocationDevice(),travelNative?.getBuildInfo()]).then(([device,info])=>setIsFire(device||info?.channel==='amazon'));},[]);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    // Lắng nghe callback Firebase khi một provider dùng deep link.
    const handleDeepLink = async (url: string | null) => {
      if (!url || !url.includes('auth/callback')) return;
      setLoading(true);
      setErrorMsg(null);
      const res = await handleAuthUrl(url);
      setLoading(false);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Đăng nhập thành công! Đang chuyển hướng…');
        redirectTimer.current = setTimeout(() => {
          if (nav.canGoBack()) {
            nav.goBack();
          } else {
            nav.navigate('Tabs');
          }
        }, 600);
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) void handleDeepLink(url);
    });

    return () => {
      sub.remove();
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [nav]);

  const handleTabChange = (k: AuthMode) => {
    setMode(k);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const completeAuth = (message = 'Đăng nhập thành công! Đang mở ứng dụng…') => {
    setSuccessMsg(message);
    redirectTimer.current = setTimeout(() => {
      if (nav.canGoBack()) {
        nav.goBack();
      } else {
        nav.navigate('Tabs');
      }
    }, 600);
  };

  const handleProviderResult = (result: AuthResult) => {
    if (result.error) {
      setErrorMsg(result.error);
      return;
    }
    completeAuth();
  };

  // 1. Đăng nhập Khách (Anonymous / Guest Mode) - Miễn phí
  const handleGuestLogin = async () => {
    if (submitting.current || socialLoading || loading) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSocialLoading('guest');
    try {
      const res = await signInAnonymously();
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        completeAuth('Đã đăng nhập với tư cách Khách! Đang mở ứng dụng…');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi đăng nhập khách.');
    } finally {
      setSocialLoading(null);
    }
  };

  const handleNativeProvider = async (provider: 'apple' | 'gamecenter') => {
    if (submitting.current || socialLoading || loading) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSocialLoading(provider);
    try {
      const result = provider === 'apple'
        ? await signInWithApple()
        : await signInWithGameCenter();
      handleProviderResult(result);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : `Không thể đăng nhập bằng ${provider}.`);
    } finally {
      setSocialLoading(null);
    }
  };

  const handlePhoneSubmit = async () => {
    if (submitting.current || loading) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    submitting.current = true;
    setLoading(true);
    try {
      if (!otpSent) {
        const result = await sendPhoneCode(phone);
        if (!result.success) {
          setErrorMsg(result.error || 'Không thể gửi mã OTP.');
        } else {
          setOtpSent(true);
          setSuccessMsg('Mã xác minh đã được gửi. Nhập 6 chữ số để tiếp tục.');
        }
        return;
      }

      const result = await confirmPhoneCode(otp);
      handleProviderResult(result);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể xác thực số điện thoại.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  // 2. Gửi yêu cầu đặt lại mật khẩu (Forgot Password)
  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Vui lòng nhập địa chỉ email vào ô bên trên để nhận link đặt lại mật khẩu.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await sendPasswordReset(cleanEmail);
      if (!res.success) {
        setErrorMsg(res.error || 'Không thể gửi email đặt lại mật khẩu.');
      } else {
        setSuccessMsg(`Đã gửi email khôi phục mật khẩu đến ${cleanEmail}. Hãy kiểm tra hộp thư của bạn.`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đã xảy ra lỗi.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Submit Form Firebase Email/Password
  const handleSubmit = async () => {
    if (submitting.current || loading) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    // Mode Signin / Signup với mật khẩu
    if (!password || password.length < 6) {
      setErrorMsg('Mật khẩu cần có ít nhất 6 ký tự.');
      return;
    }

    if (mode === 'signup') {
      if(!acceptedTerms){setErrorMsg('Đọc và đồng ý Điều khoản sử dụng, Chính sách quyền riêng tư trước khi đăng ký.');return;}
      if (password !== confirmPassword) {
        setErrorMsg('Mật khẩu xác nhận không khớp.');
        return;
      }
    }

    submitting.current = true;
    setLoading(true);
    try {
      if (mode === 'signin') {
        const result = await signInWithEmail(cleanEmail, password);
        if (result.error) {
          setErrorMsg(result.error);
        } else {
          completeAuth('Đã đăng nhập. Đang mở ứng dụng…');
        }
      } else {
        const result = await signUpWithEmail(cleanEmail, password, fullName);
        if (result.error) {
          setErrorMsg(result.error);
        } else {
          await AsyncStorage.setItem('mymap.legal.accepted.v1',JSON.stringify({version:LEGAL_VERSION,at:Date.now()}));
          if (!result.session) {
            setSuccessMsg('Đã tạo tài khoản. Kiểm tra email để xác nhận trước khi đăng nhập.');
            return;
          }
          completeAuth('Đã tạo tài khoản và đăng nhập.');
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Đã xảy ra lỗi không xác định.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <ScreenScaffold
      title="Tài khoản MyMap"
      subtitle="Đăng nhập để đồng bộ bạn bè, ETA và danh bạ SOS"
      icon="shield-lock-outline"
      iconTone="cyan"
      quote="Mỗi hành trình đều đáng nhớ"
    >
      <GlassSurface style={{padding:14,gap:8}}>
        <Text numberOfLines={3} style={{fontSize:11,lineHeight:17,color:glassColors.muted}}>{LEGAL_SUMMARY}</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}><TouchableOpacity onPress={()=>nav.navigate('Legal',{document:'terms'})}><Text style={{color:glassColors.cyan,fontSize:12}}>Điều khoản sử dụng</Text></TouchableOpacity><TouchableOpacity onPress={()=>nav.navigate('Legal',{document:'privacy'})}><Text style={{color:glassColors.cyan,fontSize:12}}>Chính sách quyền riêng tư</Text></TouchableOpacity></View>
        {mode==='signup'&&<TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:acceptedTerms}} onPress={()=>setAcceptedTerms(v=>!v)} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:44}}><MaterialCommunityIcons name={acceptedTerms?'checkbox-marked':'checkbox-blank-outline'} size={23} color={glassColors.cyan}/><Text style={{fontSize:12,flex:1}}>Tôi đồng ý Điều khoản & Quyền riêng tư</Text></TouchableOpacity>}
      </GlassSurface>
      <SectionTitle>Đăng nhập</SectionTitle>
      <View style={s.socialContainer}>
        {!isFire&&<GoogleFirebaseButton
          disabled={loading || socialLoading !== null}
          loading={socialLoading === 'google'}
          onStart={() => {
            setErrorMsg(null);
            setSuccessMsg(null);
            setSocialLoading('google');
          }}
          onFinish={() => setSocialLoading(null)}
          onResult={handleProviderResult}
          onError={setErrorMsg}
        />}

        {Platform.OS === 'ios' && Constants.expoConfig?.extra?.appleServicesEnabled === true && (
          <View style={[s.appleButtonWrap, socialLoading !== null && socialLoading !== 'apple' && s.btnDisabled]}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={16}
              style={s.appleNativeBtn}
              onPress={() => void handleNativeProvider('apple')}
            />
            {socialLoading === 'apple' && (
              <View pointerEvents="none" style={s.providerLoadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>
        )}

        {Platform.OS === 'ios' && Constants.expoConfig?.extra?.appleServicesEnabled === true && (
          <TouchableOpacity
            style={[s.socialBtn, s.gameCenterBtn, socialLoading !== null && socialLoading !== 'gamecenter' && s.btnDisabled]}
            onPress={() => void handleNativeProvider('gamecenter')}
            disabled={loading || socialLoading !== null}
            activeOpacity={0.8}
          >
            {socialLoading === 'gamecenter' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="gamepad-variant-outline" size={22} color="#FFFFFF" />
            )}
            <Text style={s.appleBtnText}>Tiếp tục với Game Center</Text>
          </TouchableOpacity>
        )}

        {/* Nút Khách (Guest / Ẩn danh) */}
        <TouchableOpacity
          style={[s.socialBtn, s.guestBtn, socialLoading === 'guest' && s.btnDisabled]}
          onPress={handleGuestLogin}
          disabled={loading || socialLoading !== null}
          activeOpacity={0.8}
        >
          {socialLoading === 'guest' ? (
            <ActivityIndicator size="small" color={glassColors.cyan} />
          ) : (
            <MaterialCommunityIcons name="incognito" size={22} color={glassColors.cyan} />
          )}
          <View style={s.guestTextWrap}>
            <Text style={s.guestBtnText}>Dùng thử với tư cách Khách</Text>
            <Text style={s.guestBtnSub}>Tự động tạo hồ sơ tạm · Miễn phí</Text>
          </View>
        </TouchableOpacity>
        <Text style={s.providerNote}>
          {isFire ? 'Đăng nhập bằng email hoặc dùng thử với tài khoản khách trên thiết bị Fire.' : 'Chọn cách đăng nhập phù hợp với bạn. Bạn cũng có thể dùng thử với tài khoản khách.'}
        </Text>
      </View>

      {/* Phân cách */}
      <View style={s.dividerRow}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>HOẶC DÙNG TÀI KHOẢN</Text>
        <View style={s.dividerLine} />
      </View>

      {/* Firebase Email/Password */}
      <GlassSegmentedTabs<AuthMode>
        tabs={[
          { key: 'signin', label: 'Mật khẩu', icon: 'login-variant' },
          { key: 'phone', label: 'Điện thoại', icon: 'phone-outline' },
          { key: 'signup', label: 'Đăng ký', icon: 'account-plus-outline' },
        ]}
        active={mode}
        onChange={handleTabChange}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.formWrap}
      >
        <GlassSurface style={s.card}>
          <View style={s.cardHead}>
            <IconBadge
              name={
                mode === 'signin'
                  ? 'login-variant'
                  : mode === 'phone'
                    ? 'cellphone-key'
                    : 'account-plus-outline'
              }
              tone={mode === 'signup' ? 'violet' : 'cyan'}
              size={24}
            />
            <View style={s.headCopy}>
              <Text style={s.cardTitle}>
                {mode === 'signin'
                  ? 'Chào mừng bạn trở lại'
                  : mode === 'phone'
                    ? 'Đăng nhập bằng số điện thoại'
                    : 'Tạo tài khoản'}
              </Text>
              <Text style={s.cardDesc}>
                {mode === 'signin'
                  ? 'Nhập email và mật khẩu của bạn.'
                  : mode === 'phone'
                    ? 'Nhận mã xác minh qua số điện thoại của bạn.'
                    : 'Tạo tài khoản để kết nối với bạn bè và lưu những khoảnh khắc cùng nhau.'}
              </Text>
            </View>
          </View>

          {/* Inline notification: Error */}
          {errorMsg && (
            <View style={s.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#FF6E88" />
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Inline notification: Success */}
          {successMsg && (
            <View style={s.successBanner}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color={glassColors.green} />
              <Text style={s.successText}>{successMsg}</Text>
            </View>
          )}

          {/* Field: Full Name (Sign Up only) */}
          {mode === 'signup' && (
            <View style={s.field}>
              <Text style={s.fieldLabel}>HỌ VÀ TÊN (TÙY CHỌN)</Text>
              <View style={s.inputContainer}>
                <MaterialCommunityIcons name="account-outline" size={20} color={glassColors.cyan} style={s.fieldIcon} />
                <TextInput
                  style={s.textInput}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Ví dụ: Minh Nguyễn"
                  placeholderTextColor={glassColors.faint}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </View>
            </View>
          )}

          {mode !== 'phone' && (
            <>
              {/* Field: Email */}
              <View style={s.field}>
                <Text style={s.fieldLabel}>ĐỊA CHỈ EMAIL</Text>
                <View style={s.inputContainer}>
                  <MaterialCommunityIcons name="email-outline" size={20} color={glassColors.cyan} style={s.fieldIcon} />
                  <TextInput
                    style={s.textInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={glassColors.faint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>
              </View>

              {/* Field: Password */}
              <View style={s.field}>
                <View style={s.passwordLabelRow}>
                  <Text style={s.fieldLabel}>MẬT KHẨU</Text>
                  {mode === 'signin' && (
                    <TouchableOpacity onPress={handleForgotPassword} disabled={loading} activeOpacity={0.7}>
                      <Text style={s.forgotText}>Quên mật khẩu?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={s.inputContainer}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color={glassColors.cyan} style={s.fieldIcon} />
                  <TextInput
                    style={s.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Tối thiểu 6 ký tự"
                    placeholderTextColor={glassColors.faint}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={s.eyeBtn}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={glassColors.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Field: Confirm Password (Sign Up only) */}
              {mode === 'signup' && (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>XÁC NHẬN MẬT KHẨU</Text>
                  <View style={s.inputContainer}>
                    <MaterialCommunityIcons name="lock-check-outline" size={20} color={glassColors.cyan} style={s.fieldIcon} />
                    <TextInput
                      style={s.textInput}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Nhập lại mật khẩu"
                      placeholderTextColor={glassColors.faint}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      editable={!loading}
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {mode === 'phone' && (
            <>
              <View style={s.field}>
                <Text style={s.fieldLabel}>SỐ ĐIỆN THOẠI QUỐC TẾ</Text>
                <View style={s.inputContainer}>
                  <MaterialCommunityIcons name="phone-outline" size={20} color={glassColors.cyan} style={s.fieldIcon} />
                  <TextInput
                    style={s.textInput}
                    value={phone}
                    onChangeText={(value) => {
                      setPhone(value);
                      if (otpSent) {
                        setOtpSent(false);
                        setOtp('');
                      }
                    }}
                    placeholder="+84901234567"
                    placeholderTextColor={glassColors.faint}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    editable={!loading}
                  />
                </View>
              </View>

              {otpSent && (
                <View style={s.field}>
                  <View style={s.passwordLabelRow}>
                    <Text style={s.fieldLabel}>MÃ OTP</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setOtpSent(false);
                        setOtp('');
                        setSuccessMsg(null);
                      }}
                      disabled={loading}
                    >
                      <Text style={s.forgotText}>Gửi lại / đổi số</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.inputContainer}>
                    <MaterialCommunityIcons name="message-processing-outline" size={20} color={glassColors.cyan} style={s.fieldIcon} />
                    <TextInput
                      style={s.textInput}
                      value={otp}
                      onChangeText={setOtp}
                      placeholder="6 chữ số"
                      placeholderTextColor={glassColors.faint}
                      keyboardType="number-pad"
                      autoComplete="sms-otp"
                      maxLength={6}
                      editable={!loading}
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {/* Submit Action Button */}
          <GlassButton
            style={s.submitBtn}
            tone={mode === 'signup' ? 'purple' : 'blue'}
            onPress={mode === 'phone' ? handlePhoneSubmit : handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <View style={s.btnRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={s.btnText}>Đang xử lý…</Text>
              </View>
            ) : (
              <View style={s.btnRow}>
                <MaterialCommunityIcons
                  name={mode === 'signin' ? 'login' : mode === 'phone' ? 'cellphone-key' : 'account-plus'}
                  size={20}
                  color="#fff"
                />
                <Text style={s.btnText}>
                  {mode === 'signin'
                    ? 'Đăng nhập Firebase'
                    : mode === 'phone'
                      ? otpSent ? 'Xác nhận mã OTP' : 'Gửi mã OTP'
                      : 'Đăng ký tài khoản Firebase'}
                </Text>
              </View>
            )}
          </GlassButton>
        </GlassSurface>
      </KeyboardAvoidingView>

      {/* Local-first Reassurance Card */}
      <SectionTitle>Quyền riêng tư & Lưu trữ cục bộ</SectionTitle>
      <GlassSurface style={s.infoCard}>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="shield-check-outline" size={26} color={glassColors.green} />
          <View style={s.infoCopy}>
            <Text style={s.infoTitle}>Dữ liệu hành trình lưu trên máy của bạn</Text>
            <Text style={s.infoDesc}>
              MyMap lưu trữ điểm GPS và kỷ niệm cục bộ qua SQLite. Bạn không bắt buộc phải đăng nhập để ghi hành trình. Đăng nhập chỉ cần thiết khi bạn muốn tìm bạn bè, gửi cảnh báo SOS tới người thân hoặc đồng bộ đám mây.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.skipBtn}
          activeOpacity={0.75}
          onPress={() => nav.goBack()}
        >
          <Text style={s.skipText}>Tiếp tục dùng ngoại tuyến (Local-first)</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={glassColors.cyan} />
        </TouchableOpacity>
      </GlassSurface>
    </ScreenScaffold>
  );
}

const s = StyleSheet.create({
  socialContainer: {
    gap: 10,
    marginBottom: 4,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1.2,
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  googleBtnText: {
    color: '#3C4043',
    fontWeight: '800',
    fontSize: 14.5,
  },
  appleBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 2,
  },
  appleBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14.5,
  },
  appleButtonWrap: {
    height: 48,
    position: 'relative',
  },
  appleNativeBtn: {
    width: '100%',
    height: 48,
  },
  providerLoadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  gameCenterBtn: {
    backgroundColor: '#17181C',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  guestBtn: {
    backgroundColor: 'rgba(10, 40, 87, 0.75)',
    borderColor: 'rgba(72, 227, 255, 0.45)',
    justifyContent: 'flex-start',
    paddingVertical: 8,
  },
  guestTextWrap: {
    flex: 1,
  },
  guestBtnText: {
    color: '#EAF8FF',
    fontWeight: '800',
    fontSize: 13.5,
  },
  guestBtnSub: {
    color: glassColors.muted,
    fontSize: 10.5,
    marginTop: 1,
  },
  providerNote: {
    color: glassColors.faint,
    fontSize: 10.5,
    lineHeight: 15,
    paddingHorizontal: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 10,
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(132, 207, 255, 0.25)',
  },
  dividerText: {
    color: glassColors.faint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  formWrap: {
    gap: 12,
  },
  card: {
    padding: 18,
    gap: 14,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  headCopy: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 17,
  },
  cardDesc: {
    color: glassColors.muted,
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 68, 100, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 130, 0.45)',
  },
  errorText: {
    flex: 1,
    color: '#FFB8C6',
    fontSize: 12,
    fontWeight: '700',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(74, 222, 128, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.45)',
  },
  successText: {
    flex: 1,
    color: '#B6F5CE',
    fontSize: 12,
    fontWeight: '700',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: glassColors.cyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotText: {
    color: glassColors.muted,
    fontSize: 10.5,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(132, 207, 255, 0.35)',
    backgroundColor: 'rgba(4, 24, 62, 0.65)',
    paddingHorizontal: 13,
  },
  fieldIcon: {
    marginRight: 9,
  },
  textInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 10,
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    marginTop: 6,
    minHeight: 50,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  infoCard: {
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  infoCopy: {
    flex: 1,
  },
  infoTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13.5,
  },
  infoDesc: {
    color: glassColors.muted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 4,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(166, 215, 255, 0.12)',
    marginTop: 2,
  },
  skipText: {
    color: glassColors.cyan,
    fontSize: 12,
    fontWeight: '700',
  },
});
