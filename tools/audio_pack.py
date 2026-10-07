"""The game's sound files from the generated takes: effects and announcer lines trimmed of silence,
levelled (loudnorm) and made small (mono mp3); the three music tracks re-encoded at 128 kbps.
python tools/audio_pack.py   (sfx/*.job, music/*.job.json -> experience/assets/sfx, experience/assets/music)"""
import glob, os, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
SFX = HERE / 'experience' / 'assets' / 'sfx'
MUS = HERE / 'experience' / 'assets' / 'music'
SFX.mkdir(parents=True, exist_ok=True)
MUS.mkdir(parents=True, exist_ok=True)
# loudness per kind (LUFS): the voice on top, the engine under everything
LEVEL = {'engine': -24, 'crowd': -26, 'pit': -24, 'move': -20, 'back': -20, 'pass': -22, 'wind': -21, 'drift': -22, 'heal': -19, 'nitro': -18, 'nitro_go': -14}
LOOPS = {'engine', 'wind', 'drift'}      # kept whole: they loop
# round 7, the menus in rock: of the two takes of the start hit the second (it hits at once; the first swells
# for a second, then stops dead) goes in as gtr_start
RENAME = {'gtr_start2': 'gtr_start'}
SKIP = {'gtr_start'}
LEVEL.update({'gtr_start2': -12, 'gtr_select': -15, 'gtr_move': -19, 'gtr_back': -17, 'heal_tick': -18})
for job in sorted(glob.glob(str(HERE / 'sfx' / '*.job'))):
    name = Path(job).stem
    if name.startswith('v_') or name in SKIP:
        continue                    # the first announcer (superseded by sfx/voice2 below), unused takes
    src = glob.glob(job + '/assets/*')
    if not src:
        print('missing', name); continue
    lufs = LEVEL.get(name, -14 if name.startswith('v_') else -18)
    trim = [] if name in LOOPS else ['silenceremove=start_periods=1:start_threshold=-50dB', 'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB', 'areverse']
    tail = ['areverse', 'afade=t=in:d=0.12', 'areverse'] if name.startswith('gtr_') else []      # no hard stop
    af = ','.join(trim + tail + [f'loudnorm=I={lufs}:TP=-1.5:LRA=11'])
    out = SFX / f'{RENAME.get(name, name)}.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src[0], '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', str(out)], check=True)
# the announcer, round 2 (sfx/voice2): an angry, hoarse cyberpunk voice. The take is pitched down a little,
# driven into a soft clip, narrowed like a stadium horn and given the arena's slapback, then levelled
GRIT = ('aresample=44100,asetrate=39690,aresample=44100,atempo=1.1111,highpass=f=140,lowpass=f=6500,'
        'acompressor=threshold=-22dB:ratio=6:attack=4:release=90,volume=4,aeval=val(0)/(1+abs(val(0))),'
        'aecho=0.8:0.45:55|110:0.28|0.16,loudnorm=I=-13:TP=-1.5:LRA=11')
# the announcer, round 3 (sfx/voice3, Stefan: "a retro villain"): George on ElevenLabs v3, pitched well down, a
# touch of bit crush for the arcade cabinet, driven, a horn's band, a big arena echo. It replaces round 2's lines
VILLAIN = ('aresample=44100,asetrate=37926,aresample=44100,atempo=1.1628,highpass=f=110,lowpass=f=5200,'
           'acrusher=level_in=1:level_out=1:bits=11:mode=log:aa=1:mix=0.35,'
           'acompressor=threshold=-24dB:ratio=7:attack=3:release=80,volume=5,aeval=val(0)/(1+abs(val(0))),'
           'aecho=0.8:0.5:60|140|260:0.3|0.18|0.1,loudnorm=I=-12.5:TP=-1.5:LRA=11')
VOICE_DIR, VOICE_FX = ('voice3', VILLAIN)
for job in sorted(glob.glob(str(HERE / 'sfx' / VOICE_DIR / '*.job'))):
    name = Path(job).stem
    src = glob.glob(job + '/assets/*')
    if not src or name.startswith('test'):
        continue
    trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src[0], '-af', trim + VOICE_FX, '-ac', '1', '-ar', '44100', '-b:a', '96k', str(SFX / f'v_{name}.mp3')], check=True)
# the rock round (2026-10-06): the title theme (a build, then the riff slams in at 6.06 s), two race tracks
# round 5: two harder race tracks (relentless hard rock at 172 BPM), played in turn with the first two
for name, job in (('race', 'rock_eleven'), ('race2', 'rock_sonilo'), ('title', 'rocktitle_eleven'), ('race3', 'hard_eleven'), ('race4', 'hard_sonilo')):
    src = glob.glob(str(HERE / 'music' / f'{job}.job.json' / 'assets' / '*'))[0]
    out = MUS / f'{name}.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '44100', '-b:a', '128k', str(out)], check=True)
total = sum(p.stat().st_size for p in list(SFX.iterdir()) + list(MUS.iterdir()))
print('sfx', len(list(SFX.iterdir())), 'music', len(list(MUS.iterdir())), 'total', total // 1024, 'KB')
