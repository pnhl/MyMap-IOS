#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist build
sdk="${1:-iphoneos}"
case "$sdk" in iphoneos) destination='generic/platform=iOS';; iphonesimulator) destination='generic/platform=iOS Simulator';; *) exit 2;; esac
xcodebuild -version
xcodebuild -workspace ios/MyMap.xcworkspace -scheme MyMap -configuration Release \
  -destination "$destination" -derivedDataPath "build/$sdk" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build 2>&1 | tee "build/$sdk.log" | awk '/^SwiftCompile|^CompileC |^Ld |error:|\*\* BUILD/ {print substr($0,1,220); fflush()}' || {
    tail -180 "build/$sdk.log"; exit 1;
  }
app="build/$sdk/Build/Products/Release-$sdk/MyMap.app"
test -d "$app"
if [ "$sdk" = iphoneos ]; then
  /usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$app/Info.plist" | grep -qx iPhoneOS
  staging=$(mktemp -d)
  trap 'rm -rf "$staging"' EXIT
  mkdir "$staging/Payload"
  ditto "$app" "$staging/Payload/MyMap.app"
  (cd "$staging" && /usr/bin/zip -qry "$OLDPWD/dist/MyMap-iOS-unsigned.ipa" Payload)
  shasum -a 256 dist/MyMap-iOS-unsigned.ipa > dist/MyMap-iOS-unsigned.sha256
else
  ditto -c -k --sequesterRsrc --keepParent "$app" dist/MyMap-iOS-Simulator.zip
fi
