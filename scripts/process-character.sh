#!/bin/bash
# scripts/process-character.sh
# Automates downloading and processing a PixelLab character

CHAR_ID=$1
if [ -z "$CHAR_ID" ]; then
  echo "Usage: $0 <character_id>"
  exit 1
fi

TEMP_DIR=".temp/character_$CHAR_ID"
mkdir -p "$TEMP_DIR"

echo "Downloading character $CHAR_ID..."
# Using --fail to exit if the character is not ready (423 Locked)
curl --fail -L "https://api.pixellab.ai/mcp/characters/$CHAR_ID/download" -o "$TEMP_DIR/character.zip"

if [ $? -ne 0 ]; then
  echo "Download failed. Character might not be ready (animations pending)."
  echo "Check status with: get_character(character_id=\"$CHAR_ID\")"
  exit 1
fi

echo "Unzipping..."
unzip -o -q "$TEMP_DIR/character.zip" -d "$TEMP_DIR"

echo "Generating sprite sheet..."
node scripts/generate-spritesheet.js "$TEMP_DIR"

if [ $? -ne 0 ]; then
  echo "Sprite sheet generation failed."
  exit 1
fi

echo "Cleaning up..."
rm -rf "$TEMP_DIR"

echo "Done! Character assets installed."

