#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ "$(uname -s)" = Darwin ] || { echo 'Cần macOS và Xcode để biên dịch Swift/iOS.' >&2; exit 1; }
[ -d ios/MyMap.xcworkspace ] || { echo 'Chạy npm run prepare:ios trước.' >&2; exit 1; }
xcodebuild -workspace ios/MyMap.xcworkspace -scheme MyMap -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/ios-simulator CODE_SIGNING_ALLOWED=NO build
echo 'Simulator app: build/ios-simulator/Build/Products/Release-iphonesimulator/MyMap.app'
