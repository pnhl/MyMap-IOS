#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ "$(uname -s)" = Darwin ] || { echo 'Cần macOS và Xcode để chuẩn bị iOS.' >&2; exit 1; }
command -v xcodebuild >/dev/null
command -v pod >/dev/null || { echo 'Cài CocoaPods trên Mac trước khi chạy.' >&2; exit 1; }
[ -f GoogleService-Info.plist ] || { echo 'Đặt GoogleService-Info.plist của Firebase iOS tại gốc dự án.' >&2; exit 1; }
[ "${MYMAP_SKIP_DEPENDENCY_INSTALL:-false}" = true ] || npm ci --ignore-scripts
node scripts/prepare-ios-ai.cjs
npm run typecheck
npm test
npx expo prebuild --platform ios --no-install
[ "${MYMAP_SKIP_POD_INSTALL:-false}" = true ] || (cd ios && pod install)
echo 'Đã chuẩn bị ios/MyMap.xcworkspace. Chọn Apple Development Team trong Xcode.'
