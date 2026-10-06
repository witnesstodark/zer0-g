"""Tile images into one sheet: python tools/sbx/grid.py out.png cols scale img1 img2 ..."""
import sys
from PIL import Image
out, cols, scale, files = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4:]
ims = [Image.open(p).convert('RGB') for p in files]
w, h = int(ims[0].size[0] * scale), int(ims[0].size[1] * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
for k, im in enumerate(ims):
    sheet.paste(im.resize((w, h)), ((k % cols) * w, (k // cols) * h))
sheet.save(out)
print(out, sheet.size)
