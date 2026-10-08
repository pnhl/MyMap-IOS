#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
device=$(xcrun simctl list devices available -j | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next(x["udid"] for k,v in d["devices"].items() if "iOS" in k for x in v if "iPhone" in x["name"]))')
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" build/iphonesimulator/Build/Products/Release-iphonesimulator/MyMap.app
xcrun simctl launch "$device" com.pnhl.vibecoding
sleep 20
xcrun simctl spawn "$device" launchctl list | grep com.pnhl.vibecoding > build/simulator-process.log
xcrun simctl io "$device" screenshot dist/MyMap-iOS-Simulator.png
