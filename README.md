# MyMap iOS

Bản iOS tách từ MyMap 1.0.4. Giao diện và nghiệp vụ dùng React Native/Expo; chức năng native dùng Swift và các SDK iOS. Repo này không chứa Kotlin, Gradle, APK, keystore hoặc cấu hình build Android/Fire OS.

## Cấu trúc

```text
App.tsx                       Điểm vào giao diện React Native
src/                          Bản đồ, chỉ đường, bạn bè, kỷ niệm, nhạc, tài khoản
src/services/coreLocation.ts  Điều phối GPS iOS qua Expo/CoreLocation
src/services/iosTravel.ts     Giao diện JS cho cầu nối Swift
src/widgets/                  Widget giao diện SwiftUI qua Expo Widgets
modules/my-map-ios/ios/        Swift: cảm biến, cuộc gọi, xuất video, chia sẻ
modules/my-map-capabilities/ios/
                              Swift: Face ID, Keychain, AES, Vision, giọng nói, AI
modules/my-map-safety/ios/     Swift: CoreMotion, CoreLocation, EXIF, PhotoKit, WatchConnectivity
modules/my-map-game-center/ios/
                              Swift: Game Center → Firebase Auth
supabase/                     SQL và Edge Functions dùng chung
functions/                    Firebase backend dùng chung
cloudflare/geo-gateway/        Gateway bản đồ và chỉ đường dùng chung
scripts/                      Chuẩn bị CocoaPods, AI framework và build Simulator
ios/                          Được Expo prebuild sinh ra trên Mac; không commit
```

Các SQL có tiền tố `android_` là tên lịch sử của migration phía máy chủ; chúng dùng Firebase/Supabase chung và không gọi Android SDK.

## Chuẩn bị và chạy trên Mac

1. Cài Node.js 24+, Xcode và CocoaPods. Cần Xcode 26+ nếu muốn dùng Foundation Models; app cơ bản đặt deployment target iOS 16.4.
2. Sao chép `.env.example` thành `.env` và cấu hình Supabase, OAuth iOS/Web cùng các provider cần dùng. Không đưa khóa máy chủ vào biến `EXPO_PUBLIC_*`.
3. Đăng ký ứng dụng Firebase iOS với bundle ID `com.pnhl.vibecoding`, tải `GoogleService-Info.plist` về thư mục gốc. Bật các phương thức đăng nhập cần dùng trên Firebase. Plist và `.env` được Git bỏ qua.
4. Điền `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` và `GOOGLE_IOS_REVERSED_CLIENT_ID` theo Firebase iOS. Quảng cáo phải dùng app/unit ID dành riêng cho iOS; template để trống ad units.
5. Chạy:

```sh
npm run prepare:ios
npm run ios
```

Script chuẩn bị tải đúng XCFramework iOS của llama.rn 0.12.9 và kiểm tra SHA-256, sau đó tạo `ios/MyMap.xcworkspace` và cài Pods. Không tải mô hình GGUF trong quá trình build; người dùng tự chọn tải mô hình trong app.

Build Simulator không ký:

```sh
npm run build:ios:simulator
```

Để chạy trên iPhone, mở workspace bằng Xcode, chọn Development Team và kiểm tra provisioning cho Sign in with Apple/Game Center. Để tạo IPA, dùng Xcode Archive hoặc EAS Build với tài khoản Apple phù hợp. Repo có `eas.json`; cần liên kết dự án EAS và cung cấp file Firebase/biến môi trường trên môi trường build riêng. Không có IPA hay chứng chỉ ký trong repo.

## Các chuyển đổi chính

| Phần Android | Bản iOS |
|---|---|
| Định vị hệ thống/foreground service | CoreLocation qua `expo-location`, task ghi hành trình nền, dùng chung nguồn GPS cho các màn hình |
| `TravelPlatformModule.kt` | `MyMapTravelModule.swift`: cảnh báo khi app mở, âm cảnh báo, mở cuộc gọi có xác nhận |
| Media3 xuất video/Android FileProvider | `MyMapMomentsModule.swift`: AVFoundation xuất MP4, UIActivityViewController chia sẻ; có hủy và giới hạn tệp riêng của app |
| ML Kit/Gemini Nano/AICore | Foundation Models trên iOS 26 khi thiết bị hỗ trợ; GGUF/llama.rn là lựa chọn cục bộ khác |
| Hash mô hình Android | CryptoKit SHA-256 đọc tệp theo từng khối |
| SpeechRecognizer Android | Apple Speech, bắt buộc on-device, xin quyền micro/speech và hỗ trợ dừng/hết thời gian |
| Android Keystore/biometric/OCR/TTS | Keychain, CryptoKit, LocalAuthentication, Vision và AVSpeechSynthesizer |
| EXIF, album và activity recognition | ImageIO, PhotoKit và CoreMotion trong module Swift |
| AppWidget Android | WidgetKit/SwiftUI thông qua Expo Widgets; mặc định tắt, bật bằng flag và build lại |
| Google Play Services / `google-services.json` | Firebase iOS plist và Google Sign-In iOS; Apple/Game Center có module riêng |
| Amazon APS, Play Integrity, Doze exemption, APK signing | Loại khỏi bản iOS; không giả lập kết quả thành công |
| Android Auto | CarPlay native scene/MapKit và chỉ dẫn từ tuyến MyMap; cần entitlement navigation được Apple chấp thuận |
| Wear OS | Apple Watch companion SwiftUI và WatchConnectivity: chỉ dẫn, tốc độ, rung vùng địa điểm, yêu cầu SOS |

Giữ lại phần React Native cho bản đồ, lựa chọn tuyến đường, giao thông, các provider hiện có, kỷ niệm, cộng đồng, tin nhắn, LiveKit, nhạc cục bộ/radio, dữ liệu ngoại tuyến và cài đặt. Việc chuyển nền tảng không tự hoàn thiện các tính năng nghiệp vụ còn thiếu của bản Android.

## Widget và giới hạn iOS

- Widget mặc định không được tạo trong bản build. Để bật, đặt `EXPO_PUBLIC_ENABLE_IOS_WIDGET=true`, chạy lại prebuild và cấp App Group `group.com.pnhl.vibecoding` cho app/extension trên Apple Developer. Chọn ảnh trong MyMap rồi tự thêm widget từ màn hình chính. Không có API tự ghim widget như Android.
- Widget không giữ Firebase token hoặc LiveKit secret. Ảnh xem trước được sao chép vào App Group sau khi người dùng chọn; đổi tài khoản xóa dữ liệu widget. Ảnh bạn bè có timeline tự ẩn sau 15 phút khi chưa được cập nhật; không có tác vụ tải ảnh bạn bè độc lập khi app bị đóng.
- Ghi vị trí nền cần quyền Always và còn phụ thuộc iOS. Force quit không đảm bảo tiếp tục ghi. Theo dõi va chạm trong màn hình cài đặt chỉ chạy khi app mở; không có Android foreground service hay tự gọi số khẩn cấp.
- Lớp che dữ liệu bảo vệ ảnh xem trước khi chuyển app và khi đang quay màn hình nếu khóa app bật; iOS không cung cấp cơ chế chặn mọi screenshot giống `FLAG_SECURE`.
- Apple Intelligence phụ thuộc thiết bị, phiên bản iOS, trạng thái mô hình và ngôn ngữ. Khi không khả dụng, người dùng có thể chọn GGUF. Không gửi câu hỏi lên dịch vụ AI đám mây.
- Local Spotube không được mở bằng package Android trên iOS. Nhạc cục bộ/radio của MyMap là trình phát chính; giao thức Spotube dùng chung còn trong mã nhưng cần kiểm thử iOS riêng nếu bật lại tích hợp đó.

## Kiểm chứng

Trên Windows đã kiểm tra TypeScript, kiểm thử nghiệp vụ dùng chung và điều phối GPS iOS, cấu hình Expo và autolinking của bốn module Swift. Đây không phải xác nhận app đã biên dịch hoặc chạy trên iPhone.

GitHub Actions chạy kiểm thử JS/TS và parse cú pháp Swift trên Mac khi push. Workflow **iOS test IPA** build IPA cho thiết bị chưa ký, Simulator, kiểm tra khởi động và target Watch. Cấu hình Firebase iOS và client environment được lưu riêng trong repository secrets. Xem [hướng dẫn bản test và trạng thái các phần iOS](docs/IOS_TEST_BUILD.md) để tải/cài, chọn build capability và kiểm thử thiết bị thật. Apple/Game Center, App Group và CarPlay không tự được cấp quyền khi ký IPA bằng tài khoản miễn phí.

Tài liệu nền tảng: [Expo Widgets](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/), [React Native Firebase](https://rnfirebase.io/), [Apple Speech](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition).
