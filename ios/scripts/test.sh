#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
IOS_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
DERIVED_DATA_PATH=${LALGEO_DERIVED_DATA_PATH:-/tmp/lalgeo-ios-derived-data}
RESULT_BUNDLE_PATH=${LALGEO_RESULT_BUNDLE_PATH:-/tmp/lalgeo-ios-tests.xcresult}

if [ ! -d "$IOS_DIR/LalGeoMaps.xcodeproj" ]; then
  echo "LalGeoMaps.xcodeproj is missing. Run 'xcodegen generate' in $IOS_DIR." >&2
  exit 1
fi

SIMULATOR_ID=${LALGEO_SIMULATOR_ID:-}
if [ -z "$SIMULATOR_ID" ]; then
  SIMULATOR_ID=$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/{print $2; exit}')
fi

if [ -z "$SIMULATOR_ID" ]; then
  echo "No available iPhone simulator was found." >&2
  exit 1
fi

rm -rf "$RESULT_BUNDLE_PATH"

xcodebuild \
  -project "$IOS_DIR/LalGeoMaps.xcodeproj" \
  -scheme LalGeoMaps \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -resultBundlePath "$RESULT_BUNDLE_PATH" \
  -enableCodeCoverage YES \
  CODE_SIGNING_ALLOWED=NO \
  test

