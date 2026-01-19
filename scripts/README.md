# Test Scripts

## Join Test Script

Test script to join a game session and verify lobby synchronization.

### Usage

```bash
node scripts/join-test.js <JOIN_CODE>
```

### Example

1. Start Supabase (if not already running):
   ```bash
   npx supabase start
   ```

2. Open the game in a browser and host a game. Note the join code displayed.

3. Run the join test script with the join code:
   ```bash
   node scripts/join-test.js ABC123
   ```

4. Watch your browser lobby - you should see "TestPlayer-xxxx" appear!

5. The script will stay connected. Press `Ctrl+C` to disconnect and exit.

### What It Does

- Creates a Supabase client and authenticates anonymously
- Creates a Network instance
- Joins the game session with the provided join code
- Creates a SessionPlayersSnapshot to monitor the lobby
- Displays the current lobby players
- Listens for lobby updates and displays them in real-time
- Stays connected until you press Ctrl+C

### Environment Variables

You can override the default Supabase configuration:

```bash
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_ANON_KEY="your-anon-key" \
node scripts/join-test.js ABC123
```

### Debugging

The script shows:
- All postgres_changes events
- Current lobby state
- When players join/leave
- Network connection status

This helps you verify that:
- SessionPlayersSnapshot is properly syncing via Network
- Browser lobby UI updates when players join
- Real-time events are working correctly

## Thrust Spritesheet Generator

Generates a vertical spritesheet from a sequence of 5 thrust animation frames (`thrust-1.png` through `thrust-5.png`).

### Usage

```bash
node scripts/generate-thrust-spritesheet.js --input-dir public/assets/raw --output public/assets/vfx/thrust-right.png --crop 1024x1024+512+512 --output-width 64 --tolerance 15
```

### Features

- **Alpha Extraction**: Automatically detects background color (sampled from a 32x32 patch at 512,512) and makes it transparent with a configurable tolerance.
- **Custom Cropping**: Extracts a specific sub-rectangle (`WxH+X+Y`) from the input frames.
- **Output Resizing**: Resizes the cropped frames to the desired output width, maintaining the crop's aspect ratio.

### Options

- `--input-dir`: Directory containing the input PNGs (default: `public/assets/raw`)
- `--crop`: Area to extract and output size in `WxH+X+Y` format (default: `1024x1024+0+0`)
- `--output-width`: Final width of each frame (default: matches crop width)
- `--tolerance`: Color distance tolerance for alpha extraction (0-255, default: `10`)
- `--output`: Path to the output spritesheet PNG (default: `public/assets/vfx/thrust-right.png`)

## VFX Variant Generator

Generates 4-directional variants (Up, Down, Left, Right) from a single horizontal or vertical spritesheet.

### Usage

```bash
node scripts/generate_vfx.js --source public/assets/vfx/slash-original.png --input-layout h
```

### Options

- `--source`: Path to the original horizontal or vertical spritesheet.
- `--input-layout`: `h` for horizontal, `v` for vertical (default: `h`).
- `--width`: Width of a single frame (default: `64`).
- `--height`: Height of a single frame (default: `64`).
- `--frames`: Number of frames in the sheet (default: `5`).
- `--output`: Directory to save the generated variants.

### What It Does

- **Right**: The original sequence (converted to horizontal if the input was vertical).
- **Left**: Horizontally flipped version of the original.
- **Up**: Rotated 270 degrees.
- **Down**: Rotated 90 degrees.
- **Prefixing**: Automatically uses the source filename (minus `-original`) as a prefix for the outputs (e.g., `slash-up.png`).


