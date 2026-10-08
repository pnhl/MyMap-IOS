# MyMap Geo Gateway

Cloudflare Worker tùy chọn cho routing. Worker chuẩn hóa kết quả từ OSRM, Valhalla và GraphHopper thành cùng một payload, giữ `GRAPHHOPPER_KEY` ở server, và không cache tọa độ người dùng.

## Chạy và triển khai

1. Chạy `npm install` trong thư mục này.
2. Thêm secret bằng `npx wrangler secret put GRAPHHOPPER_KEY` nếu dùng GraphHopper.
3. Kiểm tra bằng `npm run check`, sau đó triển khai bằng `npm run deploy`.
4. Đặt URL Worker vào `EXPO_PUBLIC_ROUTING_GATEWAY_URL` của app.

Giới hạn `ALLOWED_ORIGINS` thành danh sách origin phân tách bằng dấu phẩy khi dùng từ web; app native thường không gửi header `Origin`. Không lưu GraphHopper key trong biến `EXPO_PUBLIC_*`.
