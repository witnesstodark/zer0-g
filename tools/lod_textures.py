"""Textures for the street view (lods/): the screens' atlas (the Grand Prix poster, the logo, the drink, the car
maker, the sign) and LOD2's single 256 px picture (the course from above on the arena floor, and swatches).
python tools/lod_textures.py   -> lods-src/screens.png, lods-src/far.png"""
import json
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / 'lods-src'
OUT.mkdir(exist_ok=True)
UI = HERE / 'concepts' / 'ui'
# the atlas, in image pixels (top-left origin); lods_build.py uses the same rectangles
RECTS = {'gp': (0, 0, 1024, 576), 'volt': (0, 576, 512, 864), 'oracle': (512, 576, 1024, 864),
         'logo': (0, 864, 434, 1024), 'kanji': (560, 864, 650, 1024)}
atlas = Image.new('RGB', (1024, 1024), (0, 0, 0))
# the slots keep their old names: gp is the league's poster, volt the cyberware clinic, kanji the noodle bar's sign
src = {'gp': 'ad_league2_A.png', 'volt': 'ad_chrome2_A.png', 'oracle': 'ad_oracle2_A.png', 'logo': 'logo_zerog_B.png', 'kanji': 'ad_noodle_A.png'}
CROP = {'volt': (0.14, 0.11, 0.86, 0.89)}
for k, (x0, y0, x1, y1) in RECTS.items():
    im = Image.open(UI / src[k]).convert('RGB')
    if k == 'logo':
        a = np.asarray(im.convert('L')); ys, xs = np.where(a > 18)
        im = im.crop((xs.min(), ys.min(), xs.max(), ys.max()))
    if k in CROP:
        b = CROP[k]
        im = im.crop((int(b[0] * im.width), int(b[1] * im.height), int(b[2] * im.width), int(b[3] * im.height)))
    atlas.paste(im.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
atlas.save(OUT / 'screens.png')
json.dump(RECTS, open(OUT / 'screens.json', 'w'))

# LOD2: the left 192 px square is the arena floor seen from above with the course drawn on it (x across,
# z down the picture), the right strip holds flat colours for the stands and the road
d = json.load(open(HERE / 'experience' / 'assets' / 'track1.json'))
far = Image.new('RGB', (256, 256), (8, 8, 20))
dr = ImageDraw.Draw(far)
P = np.array([p[:3] for p in d['points']])
def px(x, z):           # floor 32 x 44 m into 192 x 256... keep the aspect: 186 x 256
    return (3 + (x + 16) / 32 * 186, (z + 22) / 44 * 256)
for i in range(0, len(P), 2):
    a, b = P[i], P[(i + 2) % len(P)]
    h = min(1, a[1] / 22)
    col = (int(40 + 200 * h), int(210 - 70 * h), 255)
    dr.line([px(a[0], a[2]), px(b[0], b[2])], fill=col, width=5)
for x in range(0, 192, 12):
    dr.line([(x, 0), (x, 255)], fill=(16, 40, 80))
for y in range(0, 256, 12):
    dr.line([(0, y), (191, y)], fill=(16, 40, 80))
for i in range(0, len(P), 2):
    a, b = P[i], P[(i + 2) % len(P)]
    h = min(1, a[1] / 22)
    dr.line([px(a[0], a[2]), px(b[0], b[2])], fill=(int(40 + 200 * h), int(210 - 70 * h), 255), width=4)
# swatches: road cyan, stands dark violet with lights, screens magenta
dr.rectangle([196, 0, 255, 63], fill=(30, 200, 255))
dr.rectangle([196, 64, 255, 127], fill=(20, 12, 40))
for k in range(60):
    x, y = 198 + (k * 37) % 56, 66 + (k * 23) % 60
    dr.point((x, y), fill=[(40, 220, 255), (255, 60, 220), (255, 190, 40)][k % 3])
dr.rectangle([196, 128, 255, 191], fill=(255, 40, 200))
dr.rectangle([196, 192, 255, 255], fill=(12, 12, 24))
far.save(OUT / 'far.png')
print('screens.png, far.png written')
