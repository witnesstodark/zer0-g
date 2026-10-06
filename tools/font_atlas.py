"""The HUD's bitmap font: Orbitron Black (SIL OFL 1.1, tools/fonts/OFL.txt) drawn into two atlases with the same
layout, the glyphs in white and their outline in black, plus the metrics as JSON. The game draws its text from
them in a worker's OffscreenCanvas (no web fonts there), so it looks the same on every machine.
python tools/font_atlas.py   -> experience/assets/ui/font_fill.png, font_line.png, font.json"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / 'experience' / 'assets' / 'ui'
SIZE = 80
LINE = 6                        # outline width (px)
CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:./-+!?'\"%#()&,_<>=*[]"
font = ImageFont.truetype(str(HERE / 'tools/fonts/Orbitron.ttf'), SIZE)
font.set_variation_by_axes([900])
ascent, descent = font.getmetrics()
cell_h = ascent + descent + 2 * LINE + 4
W = 2048
x = y = 0
meta = {}
cells = []
for ch in CHARS:
    l, t, r, b = font.getbbox(ch)
    adv = font.getlength(ch)
    w = int(r - min(l, 0)) + 2 * LINE + 4
    if x + w > W:
        x, y = 0, y + cell_h
    cells.append((ch, x, y, w, l))
    meta[ch] = [x, y, w, cell_h, round(adv, 1), LINE + 2 - min(l, 0)]
    x += w
H = y + cell_h
H = 1 << (H - 1).bit_length()
fill = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(fill)
for ch, cx, cy, w, l in cells:
    d.text((cx + LINE + 2 - min(l, 0), cy + LINE + 2), ch, font=font, fill=255)
line = fill.filter(ImageFilter.MaxFilter(2 * LINE + 1)).filter(ImageFilter.GaussianBlur(1.2))
white = Image.merge('RGBA', (Image.new('L', (W, H), 255),) * 3 + (fill,))
black = Image.merge('RGBA', (Image.new('L', (W, H), 0),) * 3 + (line,))
white.save(OUT / 'font_fill.png', optimize=True)
black.save(OUT / 'font_line.png', optimize=True)
json.dump({'size': SIZE, 'ascent': ascent, 'descent': descent, 'pad': LINE + 2, 'cellHeight': cell_h, 'space': round(font.getlength(' '), 1),
           'glyphs': meta}, open(OUT / 'font.json', 'w'))
print('atlas', W, H, 'cell', cell_h, 'glyphs', len(meta))
