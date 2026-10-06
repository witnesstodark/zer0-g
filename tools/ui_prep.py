"""The game's pictures from the concept images: the ZER0-G logo and the mode icons (cropped to their light), the
ads on the arena's screens, the eighteen pilots' portraits (their painted borders trimmed).
python tools/ui_prep.py   (concepts/ -> experience/assets/ui/)"""
from pathlib import Path
from PIL import Image
import numpy as np

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / 'experience' / 'assets' / 'ui'
OUT.mkdir(parents=True, exist_ok=True)
C = HERE / 'concepts'
PILOTS = ['kai', 'orion', 'raijin', 'mara', 'kira', 'nyx', 'zeke', 'sora', 'hollow', 'brakk', 'gorgo', 'bolt',
          'lune', 'pixel', 'medusa', 'shade', 'baron', 'mak']
# some portraits came with a painted border: trim that much of each side (share of the size)
TRIM = {'gorgo': 0.05, 'kira': 0.13, 'shade': 0.05, 'zeke': 0.075}
# the ads: the source and the part of it that is the ad (left, top, right, bottom as shares; None = all of it)
ADS = {
    'ad_league': ('ad_league2_A.png', None),
    'ad_chrome': ('ad_chrome2_A.png', (0.14, 0.11, 0.86, 0.89)),
    'ad_omni': ('ad_omni2_A.png', (0.06, 0.04, 0.96, 0.96)),
    'ad_volt': ('ad_volt2_A.png', (0.32, 0.06, 0.68, 0.94)),
    'ad_oracle': ('ad_oracle2_A.png', None),
    'ad_noodle': ('ad_noodle_A.png', None),
}


def crop_to_light(im, pad=24, level=18):
    a = np.asarray(im.convert('L'))
    ys, xs = np.where(a > level)
    return im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad), min(im.height, ys.max() + pad)))


logo = crop_to_light(Image.open(C / 'ui' / 'logo_zerog_B.png').convert('RGB'))
logo.thumbnail((1600, 1600))
logo.save(OUT / 'logo.jpg', quality=92)
print('logo', logo.size)
for name in ('icon_gp', 'icon_ta'):
    im = crop_to_light(Image.open(C / 'ui' / f'{name}_A.png').convert('RGB'), pad=30)
    side = max(im.size)
    sq = Image.new('RGB', (side, side))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.resize((384, 384), Image.LANCZOS).save(OUT / f'{name}.jpg', quality=90)
for name, (src, box) in ADS.items():
    im = Image.open(C / 'ui' / src).convert('RGB')
    if box:
        im = im.crop((int(box[0] * im.width), int(box[1] * im.height), int(box[2] * im.width), int(box[3] * im.height)))
    im.thumbnail((1024, 1024))
    im.save(OUT / f'{name}.jpg', quality=84)
    print(name, im.size)
for name in PILOTS:
    im = Image.open(C / 'pilots' / f'pilot_{name}_anime_A.png').convert('RGB')
    t = TRIM.get(name, 0.0)
    if t:
        im = im.crop((int(t * im.width), int(t * im.height), int((1 - t) * im.width), int((1 - t) * im.height)))
    im.resize((384, 384), Image.LANCZOS).save(OUT / f'pilot_{name}.jpg', quality=86)
for old in ('gp.jpg', 'volt.jpg', 'kanji.jpg', 'oracle.jpg', 'pilot_kai.jpg.bak'):
    if (OUT / old).exists():
        (OUT / old).unlink()
print(sorted((p.name, p.stat().st_size // 1024) for p in OUT.iterdir()))
