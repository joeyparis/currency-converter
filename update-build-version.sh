#!/bin/bash

# Currency Converter Build Version Update Script
# Updates the build version in both script.js and sw.js

# Get current timestamp in YYYY.MM.DD.HHMM format
BUILD_VERSION=$(date "+%Y.%m.%d.%H%M")

echo "🔄 Updating build version to: $BUILD_VERSION"

# Update script.js
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/const BUILD_VERSION = '[^']*'/const BUILD_VERSION = '$BUILD_VERSION'/" script.js
else
  # Linux
  sed -i "s/const BUILD_VERSION = '[^']*'/const BUILD_VERSION = '$BUILD_VERSION'/" script.js
fi

# Update sw.js
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/const BUILD_VERSION = '[^']*'/const BUILD_VERSION = '$BUILD_VERSION'/" sw.js
else
  # Linux
  sed -i "s/const BUILD_VERSION = '[^']*'/const BUILD_VERSION = '$BUILD_VERSION'/" sw.js
fi

echo "✅ Build version updated to $BUILD_VERSION in script.js and sw.js"
echo "🚀 Ready to commit and deploy!"
