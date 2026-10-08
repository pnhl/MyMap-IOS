# Bản test iOS

## Những phần đã bổ sung

| Phần | Triển khai | Điều kiện dùng trên thiết bị |
|---|---|---|
| Firebase iOS | Đăng ký bundle `com.pnhl.vibecoding`, cấu hình riêng trong GitHub Secrets, Google URL scheme đọc từ plist | Firebase phải bật provider đăng nhập tương ứng |
| IPA test | Workflow `iOS test IPA` build Release cho thiết bị, đóng `Payload/MyMap.app`, ghi SHA-256 | IPA chưa ký; ký lại bằng AltStore/Sideloadly trước khi cài |
| Simulator | Build Release, cài bằng simctl, mở app, kiểm tra tiến trình còn chạy và lưu ảnh màn hình | Đây là kiểm tra khởi động; chưa thay thế QA trên iPhone |
| WidgetKit | Chọn ảnh của mình/bạn bè/nhóm/ngày này năm xưa; liên kết mở khoảnh khắc; nút tắt/xóa ảnh; thay cả timeline khi xóa; tuần tự hóa thay đổi để tránh rò ảnh lúc đổi tài khoản | Cần build có widget và App Group được provisioning. Không có ảnh trước khi người dùng chọn |
| Apple Watch | Ứng dụng SwiftUI và target watchOS 9+; chỉ dẫn, khoảng cách, tốc độ, trạng thái kết nối; ảnh dữ liệu không được gửi sang đồng hồ | Cần build có companion, cài trên Watch và bật trong MyMap |
| Watch SOS | Người dùng xác nhận gửi yêu cầu; iPhone mở màn hình SOS hoặc hiện thông báo; báo rõ khi chưa nối | Không tự gọi cứu hộ; cần mở/xác nhận trên iPhone |
| Haptic | Rung thông báo vùng địa điểm khi đồng hồ đang kết nối, tiện ích được bật | Kết nối WatchConnectivity; không báo thành công nếu chưa reachable |
| CarPlay | Scene native CPMapTemplate + MapKit, tuyến từ provider MyMap, chỉ dẫn, follow/zoom theo tốc độ, nút về giữa/dừng; CoreLocation trong lúc CarPlay kết nối | Cần Apple phê duyệt entitlement navigation CarPlay và provisioning; không bật trong IPA sideload cơ bản |
| Bảo vệ dữ liệu | Xóa tuyến khi đổi tài khoản; không đồng bộ companion khi tắt; che preview và màn hình đang bị quay khi khóa ứng dụng bật | iOS không chặn mọi screenshot; hệ thống vẫn có giới hạn riêng |
| Video tổng kết | Nút hủy; hủy khi rời màn hình, đổi tài khoản hoặc xuống nền; native xóa MP4 dở dang và giải phóng writer | Chỉ xuất khi app đang mở; không giữ tác vụ render nền không giới hạn |
| Apple/Game Center | Chỉ hiện trong build có bật capability; Game Center báo rõ khi bản sideload thiếu quyền | Cần paid provisioning và cấu hình Firebase/Apple |

Giao diện và nghiệp vụ tiếp tục dùng React Native; Swift dành cho WidgetKit/WatchConnectivity/CarPlay/CoreLocation và các API hệ thống. Không thêm Kotlin, Android hoặc Flutter engine vào bản iOS.

## Chạy GitHub Actions

GitHub → Actions → **iOS test IPA** → Run workflow:

- `widgets=false`, `companions=false`: IPA cơ bản dành cho ký lại bằng công cụ sideload.
- `simulator=true`: build/cài/chạy Simulator và lưu screenshot.
- `widgets=true`: tạo extension WidgetKit, cần App Group khi ký.
- `companions=true`: thêm ứng dụng Apple Watch vào target iOS. Bật thêm `widgets=true` nếu cần cả widget.

CarPlay không tự bật trong workflow sideload. Để dùng bản có quyền được Apple phê duyệt, đặt `MYMAP_ENABLE_CARPLAY=true` khi prebuild và dùng profile có `com.apple.developer.carplay-maps`. Đăng nhập Apple/Game Center cần `MYMAP_ENABLE_APPLE_SERVICES=true`. Các tiện ích trong cài đặt luôn mặc định tắt.

Secrets đã cấu hình gồm `FIREBASE_IOS_PLIST_BASE64`, `MYMAP_IOS_ENV`. Chỉ cấu hình client được đóng vào app; khóa LiveKit máy chủ không được đưa vào IPA hoặc repo. Không thay secret iOS bằng plist Android.

## Cài bản test

1. Tải artifact **MyMap-iOS-IPA-…** và giải nén.
2. Chọn `MyMap-iOS-unsigned.ipa` trong AltStore/Sideloadly, ký bằng tài khoản Apple của bạn và cài vào iPhone.
3. Nếu iOS yêu cầu, tin cậy hồ sơ phát triển và bật Developer Mode.
4. Kiểm tra với tài khoản test; bật quyền vị trí/camera/micro khi dùng chức năng tương ứng.

Không đổi `.zip` của Simulator thành `.ipa`. Bản Simulator không chạy trên iPhone. Công cụ ký lại có thể đổi bundle ID hoặc loại extension/entitlement; đăng nhập và capability phải kiểm tra lại sau khi ký.

## Cần kiểm thử thực tế

- Khởi động, đăng nhập email/Google, đổi tài khoản, khóa/sinh trắc.
- GPS, chỉ đường, follow/zoom, mất mạng, quyền vị trí gần đúng/Always, khóa màn hình và force quit.
- Camera/video, Vision, xuất/hủy video tổng kết, chia sẻ iPad.
- Micro/nhạc nền/LiveKit và audio interruption.
- Apple Intelligence trên thiết bị hỗ trợ; GGUF tải chủ động và giới hạn bộ nhớ trên máy thật.
- Widget trên App Group thật, tự ẩn ảnh bạn bè sau 15 phút và xóa khi đăng xuất.
- Watch ghép thật, stale data sau 60 giây, mất kết nối và SOS khi iPhone ở nền.
- CarPlay với entitlement và xe/Simulator phù hợp. Khoảng cách chỉ dẫn nền hiện dùng GPS đến điểm maneuver; không có reroute provider tự động trong lúc JS bị iOS đình chỉ.
- APNs/FCM, App Attest, Universal Links, billing/HealthKit/passkeys và toàn bộ catalog chưa được tuyên bố hoàn thiện trong lượt ưu tiên iOS này. Quyền đẩy thông báo máy chủ và các dịch vụ Apple vẫn cần cấu hình/kiểm thử riêng.

Không gọi kiểm tra cú pháp Swift hoặc test JS là kiểm chứng đã chạy đầy đủ trên iPhone. Kết quả native và tên artifact nằm trong từng run của GitHub Actions.
