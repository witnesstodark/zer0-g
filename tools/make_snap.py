"""The finish's photo sound: a camera shutter (two clicks, the blades opening and closing) made from noise with
ffmpeg, no generation. python tools/make_snap.py   (-> experience/assets/sfx/snap.mp3)"""
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'experience' / 'assets' / 'sfx' / 'snap.mp3'
# each click: a few milliseconds of white noise, high passed, dying fast; the second a touch lower and softer,
# 70 ms after the first; a little room on both
click = lambda d, hp, lp, vol: (f'anoisesrc=d={d}:c=white:a=1:r=44100,highpass=f={hp},lowpass=f={lp},'
                                f"volume='{vol}*exp(-t*160)':eval=frame")
graph = (f'{click(0.05, 1800, 9000, 1.0)}[a];'
         f'{click(0.06, 900, 6000, 0.7)},adelay=70[b];'
         '[a][b]amix=inputs=2:normalize=0,aecho=0.6:0.3:18:0.25,apad=pad_dur=0.1,loudnorm=I=-16:TP=-1.5:LRA=11[out]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-filter_complex', graph, '-map', '[out]', '-ac', '1', '-ar', '44100', '-b:a', '96k', str(OUT)], check=True)
print(OUT, OUT.stat().st_size, 'bytes')
