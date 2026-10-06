"""The arena's screens: the frames of the jumbotron show and the sponsor ribbon's strip, in one atlas.
Frames are 340 x 192 cells (6 across, 7 down) of a 2048 atlas: the logo, the cup, the anime key art, live
pictures of the race, the pilots one by one, the sponsors, the countdown. Below them two 2048 x 128 strips make the
ribbon (4096 px long): ZER0-G, the cup, the sponsors' names and the pilots' faces, round and round. Text in Press
Start 2P (SIL OFL 1.1, tools/fonts/PressStart2P-OFL.txt). The shader (screens.glsl / city.js) plays them.
python tools/screens_atlas.py   -> experience/assets/ui/board.jpg (2048), lods/board.png (1024), board.json"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

HERE = Path(__file__).resolve().parents[1]
UI = HERE / 'experience' / 'assets' / 'ui'
C = HERE / 'concepts'
PIX = str(HERE / 'tools' / 'fonts' / 'PressStart2P.ttf')
CW, CH, COLS = 340, 192, 6
STRIP_Y, STRIP_H = 7 * CH, 128
S = CH / 144                      # the frames were laid out at 256 x 144; everything scales by this
atlas = Image.new('RGB', (2048, 2048), (0, 0, 0))
frames = {}

PILOTS = [('kai', 'KAI ROOK', 'VOLT FALCON', '#29d3ff'), ('orion', 'ORION KADE', 'SILVER COMET', '#dfe8ff'), ('raijin', 'RAIJIN', 'THUNDER ONI', '#ff3b30'),
          ('mara', 'MARA VEX', 'RED NOVA', '#ff4a2b'), ('kira', 'KIRA BLAZE', 'WILD SPARK', '#ffd23a'), ('nyx', 'NYX-7', 'GHOST NEEDLE', '#aef6ff'),
          ('zeke', 'DR. ZEKE', 'GOLD ORACLE', '#ffb21f'), ('sora', 'MADAME SORA', 'RING EMPRESS', '#b76bff'), ('hollow', 'DR. HOLLOW', 'STATIC KING', '#7dff3a'),
          ('brakk', 'BRAKK', 'IRON GECKO', '#7dff3a'), ('gorgo', 'GORGO', 'DEEP KRAKEN', '#3bffd0'), ('bolt', 'BIG BOLT', 'HAMMERHEAD', '#ff8a1f'),
          ('lune', 'LUNE', 'PHANTOM LUNE', '#ff6fd8'), ('pixel', 'PIXEL', 'TINY TERROR', '#b4ff3a'), ('medusa', 'MEDUSA PRIME', 'VIPER COIL', '#3bff8a'),
          ('shade', 'SHADE', 'NIGHT WOLF', '#9a4dff'), ('baron', 'BARON SKULL', 'DEATH PARADE', '#5a7dff'), ('mak', 'SIR MAK', 'TOP HAT', '#ff2bd6')]


def font(px):
    return ImageFont.truetype(PIX, max(8, int(round(px * S / 4)) * 4))


def cell(k):
    return (k % COLS) * CW, (k // COLS) * CH


def put(k, im, name):
    x, y = cell(k)
    atlas.paste(im.resize((CW, CH), Image.LANCZOS) if im.size != (CW, CH) else im, (x, y))
    frames[name] = k


def blank(color=(4, 4, 14)):
    im = Image.new('RGB', (CW, CH), color)
    d = ImageDraw.Draw(im)
    for x in range(0, CW, 20):
        d.line([(x, 0), (x, CH)], fill=(14, 18, 40))
    for y in range(0, CH, 20):
        d.line([(0, y), (CW, y)], fill=(14, 18, 40))
    return im


def text(im, s, xy, px, fill, anchor='mm', shadow=(0, 0, 0)):
    d = ImageDraw.Draw(im)
    x, y = xy[0] * S if xy[0] > 0 else xy[0], xy[1] * S
    if xy[0] == CW // 2 or xy[0] == CW - 8:
        x = xy[0]
    d.text((x + 2, y + 2), s, font=font(px), fill=shadow, anchor=anchor)
    d.text((x, y), s, font=font(px), fill=fill, anchor=anchor)


def fit(src, w=CW, h=CH):
    im = Image.open(src).convert('RGB')
    r = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * r + 1), int(im.height * r + 1)), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))


# 0: the logo
im = blank()
logo = Image.open(UI / 'logo.jpg').convert('RGB')
logo.thumbnail((300, 136))
im.paste(logo, ((CW - logo.width) // 2, (CH - logo.height) // 2 - 6))
text(im, 'GRAND PRIX', (CW // 2, 124), 8, (255, 90, 220))
put(0, im, 'logo')
# 1: WIN THE ZER0-G CUP
im = blank((10, 6, 2))
text(im, 'WIN THE', (CW // 2, 46), 16, (255, 255, 255))
text(im, 'ZER0-G', (CW // 2, 80), 24, (255, 200, 40))
text(im, 'CUP', (CW // 2, 112), 16, (255, 200, 40))
put(1, im, 'win')
# 2-5: the anime key art
for k, name in ((2, 'art_cup'), (3, 'art_race'), (4, 'art_faceoff'), (5, 'art_volt')):
    src = C / 'ui' / f'{name}_A.png'
    if src.exists():
        put(k, fit(src), name)
# 6-8: live pictures of the race
for k, shot in enumerate(['16-race.png', '15-race.png', '17-race.png']):
    src = HERE / 'shots' / 'local' / shot
    if src.exists():
        im = fit(src)
        text(im, '* LIVE', (10, 12), 8, (255, 40, 40), anchor='lm')
        text(im, 'NEON CITY', (CW - 8, CH - 10), 8, (255, 255, 255), anchor='rm')
        put(6 + k, im, f'live{k}')
# 9: tonight
im = blank()
text(im, 'NEON CITY', (CW // 2, 40), 16, (41, 211, 255))
text(im, 'GRAND PRIX', (CW // 2, 72), 16, (255, 43, 214))
text(im, 'TONIGHT 23:00', (CW // 2, 108), 8, (255, 255, 255))
put(9, im, 'tonight')
# 10-27: the pilots
for i, (pid, pname, mname, col) in enumerate(PILOTS):
    im = Image.new('RGB', (CW, CH), (4, 4, 14))
    face = Image.open(UI / f'pilot_{pid}.jpg').convert('RGB').resize((CH, CH), Image.LANCZOS)
    im.paste(face, (0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([CH, 0, CW, CH], fill=(8, 8, 24))
    d.rectangle([CH, 0, CH + 4, CH], fill=col)
    d.text((CH + 14, 22), f'#{i + 1:02d}', font=ImageFont.truetype(PIX, 12), fill=col, anchor='lm')
    for j, line in enumerate(pname.split(' ')[:2]):
        d.text((CH + 14, 64 + j * 26), line, font=ImageFont.truetype(PIX, 12 if len(line) > 7 else 16), fill=(255, 255, 255), anchor='lm')
    for j, line in enumerate(mname.split(' ')[:2]):
        d.text((CH + 14, 136 + j * 18), line, font=ImageFont.truetype(PIX, 12), fill=col, anchor='lm')
    put(10 + i, im, f'pilot_{pid}')
# 28-32: the sponsors, as on old boards
SPONSORS = [('CHROMEHAUS', 'UPGRADE YOUR NERVES', (41, 211, 255), (6, 14, 24)), ('VOLT', 'STAY WIRED', (60, 240, 255), (4, 4, 10)),
            ('OMNIGRID', 'WE KEEP THE LIGHTS ON', (255, 60, 200), (12, 4, 18)), ('ORACLE', 'MOTORS - ABOVE THE STREETS', (255, 190, 50), (14, 8, 2)),
            ('NIGHT NOODLES', 'OPEN 24H', (255, 70, 50), (16, 4, 4))]
for k, (big, small, col, bg) in enumerate(SPONSORS):
    im = blank(bg)
    text(im, big, (CW // 2, 64), 24 if len(big) <= 6 else 16, col)
    text(im, small, (CW // 2, 104), 8, (230, 230, 230))
    if big == 'VOLT':
        ImageDraw.Draw(im).polygon([(int(px * S), int(py * S)) for px, py in [(36, 30), (24, 72), (40, 72), (30, 114), (58, 60), (42, 60), (54, 30)]], fill=col)
    put(28 + k, im, f'sponsor{k}')
# 33-38: big words
for k, (word, col, px) in enumerate([('ZER0-G', (41, 211, 255), 32), ('GET READY', (255, 255, 255), 16), ('3', (41, 211, 255), 64),
                                     ('2', (255, 210, 60), 64), ('1', (255, 60, 200), 64), ('GO!', (255, 255, 255), 48)]):
    im = blank()
    text(im, word, (CW // 2, CH // 2 + 4), px, col)
    put(33 + k, im, f'word{k}')
# 39: VS, 40: THE PILOTS
im = blank((14, 2, 6)); text(im, 'VS', (CW // 2, CH // 2 + 4), 48, (255, 40, 60)); put(39, im, 'vs')
im = blank(); text(im, 'THE', (CW // 2, 50), 16, (255, 255, 255)); text(im, 'PILOTS', (CW // 2, 90), 24, (255, 43, 214)); put(40, im, 'pilots')

# the ribbon: two strips that read as one 4096 px band
strip = Image.new('RGB', (4096, STRIP_H), (2, 2, 8))
d = ImageDraw.Draw(strip)
x = 16
items = [('ZER0-G GRAND PRIX', (41, 211, 255)), ('face', 0), ('WIN THE ZER0-G CUP', (255, 200, 40)), ('face', 3), ('CHROMEHAUS', (41, 211, 255)),
         ('face', 6), ('VOLT  STAY WIRED', (60, 240, 255)), ('face', 9), ('OMNIGRID', (255, 60, 200)), ('face', 12), ('ORACLE MOTORS', (255, 190, 50)),
         ('face', 15), ('NIGHT NOODLES 24H', (255, 70, 50)), ('face', 17), ('NEON CITY TONIGHT', (255, 43, 214)), ('face', 1), ('ZER0-G', (41, 211, 255)),
         ('face', 4), ('DRIFT  BOOST  WIN', (255, 255, 255)), ('face', 7)]
k = 0
while x < 4096 - 40:
    kind, val = items[k % len(items)]
    if kind == 'face':
        pid = PILOTS[val][0]
        face = Image.open(UI / f'pilot_{pid}.jpg').convert('RGB').resize((STRIP_H - 16, STRIP_H - 16), Image.LANCZOS)
        strip.paste(face, (x, 8))
        x += STRIP_H + 8
    else:
        f = ImageFont.truetype(PIX, 48)
        w = d.textlength(kind, font=f)
        d.text((x + 3, STRIP_H // 2 + 3), kind, font=f, fill=(0, 0, 0), anchor='lm')
        d.text((x, STRIP_H // 2), kind, font=f, fill=val, anchor='lm')
        x += int(w) + 40
        d.text((x - 26, STRIP_H // 2), '*', font=f, fill=(255, 255, 255), anchor='mm')
    k += 1
atlas.paste(strip.crop((0, 0, 2048, STRIP_H)), (0, STRIP_Y))
atlas.paste(strip.crop((2048, 0, 4096, STRIP_H)), (0, STRIP_Y + STRIP_H))

atlas.save(UI / 'board.jpg', quality=92, subsampling=0)        # the LED look quantizes it anyway
atlas.resize((1024, 1024), Image.LANCZOS).save(HERE / 'lods' / 'board.png', optimize=True)
json.dump({'cell': [CW, CH], 'cols': COLS, 'strip': [STRIP_Y, STRIP_H], 'frames': frames}, open(HERE / 'tools' / 'board.json', 'w'), indent=1)
print(len(frames), 'frames', sorted(frames.values())[-1])
