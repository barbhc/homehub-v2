# Homehub — iOS app icon handoff

The chosen icon: **rounded solid white house with a deep-teal check, on the Homehub brand
gradient** (option 13 from the icon explorations). Replaces the generic default button icon.

## What's here
- `AppIcon-1024.png` — App Store master (1024×1024, fully opaque, no alpha, square/full-bleed —
  iOS applies the rounded-corner mask itself; do **not** pre-round it).
- `AppIcon-{180,167,152,120,87,80,76,60,58,40,29,20}.png` — all required device sizes.
- `AppIcon.svg` — vector master (128 viewBox) if you need to regenerate any size.
- `AppIcon.appiconset/Contents.json` — ready Xcode asset-catalog manifest.

## Design
- **Background:** linear gradient 135° `#1B6B5A` (top-left) → `#2D9B82` (bottom-right).
- **House:** solid `#FFFFFF`, rounded corners (~6% radius), centered, full-bleed body.
- **Check:** `#15564A`, stroke ~8% of width, round caps/joins — knocked into the house body.
- No text, no transparency, no drop shadow (iOS adds its own).

## Install (Xcode)
1. Copy the `AppIcon.appiconset` folder into `Assets.xcassets/` (replace the existing AppIcon set),
   and drop the `AppIcon-*.png` files alongside its `Contents.json`.
2. Or, in Xcode: Assets → AppIcon → drag each PNG into its matching slot (the size labels map to
   the filenames by their pixel dimensions).
3. Confirm target → General → App Icons uses "AppIcon". Clean build folder, rebuild.

## Regenerate a size
Rasterize `AppIcon.svg` at the target pixel size (e.g. `rsvg-convert -w 512 -h 512 AppIcon.svg`),
keeping the output square and opaque.
