#!/usr/bin/env bash

set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
DESTINATION="$SCRIPT_DIR/src/bug.wasm"

ARCH="macos_arm64"
SWIFTWASM="swift-wasm-5.6.0-RELEASE"
SWIFTWASM_URL="https://github.com/swiftwasm/swift/releases/download/$SWIFTWASM/$SWIFTWASM-$ARCH.pkg"

if ! command -v brew > /dev/null; then
    echo "Need homebrew"
    exit 1
fi

if ! command -v swiftenv > /dev/null; then
    brew install swiftenv
fi

SDK="/Library/Developer/Toolchains/$SWIFTWASM.xctoolchain"

if [ ! -d "$SDK" ]; then
    swiftenv install "$SWIFTWASM_URL"
fi

SWIFT="$SDK/usr/bin/swift"

MODE="release"

cd "$SCRIPT_DIR/BugRepro"
$SWIFT build --triple wasm32-unknown-wasi -c $MODE -Xlinker --allow-undefined

cp ".build/$MODE/BugRepro.wasm" "$DESTINATION"
