#!/bin/sh
# ============================================================
# Builds "Chart Desk.app" and installs it to /Applications.
#
#   ./build.sh            build + install
#   ./build.sh --no-install   build into ./build only
#
# Needs only Command Line Tools (clang). No Xcode, no Swift —
# the CLT Swift toolchain on this Mac has an SDK version
# mismatch, which is why the app is Objective-C.
# ============================================================
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$HERE/build"
APP="$BUILD/Chart Desk.app"
DEST="/Applications/Chart Desk.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "→ compiling"
clang -fobjc-arc -fmodules -O2 \
  -mmacosx-version-min=12.0 \
  -framework Cocoa -framework WebKit \
  -o "$APP/Contents/MacOS/Chart Desk" \
  "$HERE/main.m"

echo "→ bundling"
cp "$HERE/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$HERE/Info.plist"   "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# Ad-hoc signature. Unsigned bundles get quarantined and refuse to
# launch on Apple silicon; a self-signature is enough for a local app.
echo "→ signing (ad-hoc)"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP" && echo "  signature ok"

if [ "$1" = "--no-install" ]; then
  echo "✓ built at $APP"
  exit 0
fi

echo "→ installing to $DEST"
rm -rf "$DEST"
cp -R "$APP" "$DEST"
# Nudge Launch Services so the icon and the name appear immediately
# instead of whenever it next rescans.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$DEST" 2>/dev/null || true
touch "$DEST"
echo "✓ installed — open it from Applications or Spotlight (\"Chart Desk\")"
