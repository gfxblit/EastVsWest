#!/usr/bin/env python3
"""
Generate a simple pixel art shadow sprite for the game.
Creates a dark, semi-transparent oval shadow.
"""

from PIL import Image, ImageDraw

# Create a 96x96 image with transparency
size = (96, 96)
image = Image.new('RGBA', size, (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

# Draw a dark gray oval shadow (semi-transparent)
# Position it slightly lower and make it an oval (wider than tall)
shadow_color = (0, 0, 0, 100)  # Black with 100/255 opacity
shadow_bbox = [
    20,  # left
    55,  # top (positioned lower)
    76,  # right
    85,  # bottom (flatter oval)
]

draw.ellipse(shadow_bbox, fill=shadow_color)

# Save the image
image.save('../public/shadow.png')
print("Shadow sprite generated: public/shadow.png")
