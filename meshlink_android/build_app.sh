#!/bin/bash
# MeshLink Android App Build Script
# Builds a release APK/AAB ready for Google Play Store

set -e

echo "=========================================="
echo "  MeshLink Android App Build Script"
echo "=========================================="

# Check if gradle wrapper exists
if [ ! -f "gradlew" ]; then
    echo "❌ Gradle wrapper not found. Running setup..."
    gradle wrapper --gradle-version 8.5
fi

# Make gradlew executable
chmod +x gradlew

# Clean previous builds
echo "🧹 Cleaning previous builds..."
./gradlew clean

# Build debug APK
echo "🔨 Building debug APK..."
./gradlew assembleDebug

# Build release AAB (for Play Store)
echo "📦 Building release AAB..."
./gradlew bundleRelease

echo ""
echo "✅ Build complete!"
echo ""
echo "Debug APK:  app/build/outputs/apk/debug/app-debug.apk"
echo "Release AAB: app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "For Play Store upload: app/build/outputs/bundle/release/app-release.aab"
