#!/usr/bin/env python3
"""
Generate a placeholder sprite sheet for the walking animation.
Creates an 8-directional walking animation with 6 frames per direction.
Format: 576x768px (6 columns × 8 rows of 96×96px frames)
"""

from PIL import Image, ImageDraw, ImageFont
import math

# Sprite sheet dimensions
FRAME_WIDTH = 96
FRAME_HEIGHT = 96
COLUMNS = 6  # frames per direction
ROWS = 8     # directions
SPRITE_SHEET_WIDTH = FRAME_WIDTH * COLUMNS  # 576
SPRITE_SHEET_HEIGHT = FRAME_HEIGHT * ROWS   # 768

# Directions (rows in sprite sheet, top to bottom)
DIRECTIONS = [
    "South",      # 0 (down)
    "South-East", # 1
    "East",       # 2 (right)
    "North-East", # 3
    "North",      # 4 (up)
    "North-West", # 5
    "West",       # 6 (left)
    "South-West", # 7
]

def create_sprite_sheet():
    """Create a sprite sheet with animated walking frames."""
    # Create blank sprite sheet
    sprite_sheet = Image.new('RGBA', (SPRITE_SHEET_WIDTH, SPRITE_SHEET_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sprite_sheet)

    # For each direction (row)
    for row, direction in enumerate(DIRECTIONS):
        # For each frame (column)
        for col in range(COLUMNS):
            # Calculate frame position
            x = col * FRAME_WIDTH
            y = row * FRAME_HEIGHT

            # Draw a simple character representation
            # Body (circle)
            body_color = (100, 150, 200, 255)  # Blue-ish player
            center_x = x + FRAME_WIDTH // 2
            center_y = y + FRAME_HEIGHT // 2

            # Body size varies slightly per frame for animation effect
            animation_offset = math.sin((col / COLUMNS) * math.pi * 2) * 3
            body_radius = 25 + animation_offset

            # Draw body
            draw.ellipse(
                [center_x - body_radius, center_y - body_radius,
                 center_x + body_radius, center_y + body_radius],
                fill=body_color,
                outline=(50, 100, 150, 255),
                width=2
            )

            # Draw direction indicator (small arrow)
            arrow_length = 15
            arrow_color = (255, 200, 0, 255)  # Yellow arrow

            # Calculate arrow angle based on direction
            # Directions map to angles: S=90, SE=45, E=0, NE=315, N=270, NW=225, W=180, SW=135
            angle_map = {
                0: 90,   # South
                1: 45,   # South-East
                2: 0,    # East
                3: 315,  # North-East
                4: 270,  # North
                5: 225,  # North-West
                6: 180,  # West
                7: 135,  # South-West
            }

            angle_deg = angle_map[row]
            angle_rad = math.radians(angle_deg)

            # Arrow endpoint
            arrow_x = center_x + math.cos(angle_rad) * arrow_length
            arrow_y = center_y + math.sin(angle_rad) * arrow_length

            # Draw arrow
            draw.line(
                [(center_x, center_y), (arrow_x, arrow_y)],
                fill=arrow_color,
                width=3
            )

            # Add small circle at arrow tip
            draw.ellipse(
                [arrow_x - 3, arrow_y - 3, arrow_x + 3, arrow_y + 3],
                fill=arrow_color
            )

            # Add frame number in corner (for debugging)
            try:
                # Try to use a small font if available
                font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 10)
            except:
                # Fall back to default font
                font = ImageFont.load_default()

            frame_label = f"{col}"
            text_x = x + 5
            text_y = y + 5
            draw.text((text_x, text_y), frame_label, fill=(255, 255, 255, 200), font=font)

    return sprite_sheet

def main():
    """Generate and save the sprite sheet."""
    print("Generating player walking sprite sheet...")
    print(f"  Dimensions: {SPRITE_SHEET_WIDTH}x{SPRITE_SHEET_HEIGHT}px")
    print(f"  Frame size: {FRAME_WIDTH}x{FRAME_HEIGHT}px")
    print(f"  Layout: {COLUMNS} frames × {ROWS} directions")

    sprite_sheet = create_sprite_sheet()

    output_path = "public/assets/player/player-walk-spritesheet.png"
    sprite_sheet.save(output_path, "PNG")

    print(f"✓ Sprite sheet saved to: {output_path}")
    print(f"  File size: {sprite_sheet.size}")

    # Verify the image
    test_img = Image.open(output_path)
    print(f"✓ Verified: {test_img.size[0]}x{test_img.size[1]}px, mode={test_img.mode}")

if __name__ == "__main__":
    main()
