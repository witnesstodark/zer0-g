"""Tile shots/flames/stand-*.png into shots/flames/sheet.png (6 x 3). python tools/sbx/sheet.py"""
from pathlib import Path
from PIL import Image
d = Path(__file__).resolve().parents[2] / 'shots' / 'flames'
ims = [Image.open(p).convert('RGB') for p in sorted(d.glob('stand-*.png'))]
w, h = ims[0].size[0] // 2, ims[0].size[1] // 2
sheet = Image.new('RGB', (w * 6, h * 3))
for k, im in enumerate(ims):
    sheet.paste(im.resize((w, h)), ((k % 6) * w, (k // 6) * h))
sheet.save(d / 'sheet.png')
print('sheet', sheet.size)
