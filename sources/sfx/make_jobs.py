"""Write the input of every sound effect and announcer line and submit them to fal (one job each).
python make_jobs.py   (receipts in <name>.job/, see fal-ai-generation's fal_job.py)"""
import json, subprocess, os, sys

FAL = os.path.join('..', '..', '..', '.claude', 'skills', 'fal-ai-generation', 'scripts', 'fal_job.py')
ENV = os.path.join('..', '..', '..', '.env')
SFX = 'fal-ai/elevenlabs/sound-effects/v2'
TTS = 'fal-ai/elevenlabs/tts/eleven-v3'

sfx = {
    'engine': ('A futuristic anti-gravity hover racer engine, steady high-pitched turbine whine with a low electric hum, seamless loop, no doppler', 4, True),
    'boost': ('A sci-fi racing ship booster ignition: a sharp rising jet whoosh with a punchy thump, then a roaring afterburner tail', 2.2, False),
    'dash': ('A quick electric zap and rising synth swoosh as a racer drives over a speed boost pad', 1.0, False),
    'jump': ('A springy magnetic launch, a bright synth whoomp as a hover craft is thrown into the air', 1.0, False),
    'land': ('A heavy hover craft lands hard on a metal road: a low thud with a short metallic clank', 0.7, False),
    'rail': ('A hover craft scraping along an electric energy barrier: crackling sparks and an electric buzz', 1.0, False),
    'bump': ('Two futuristic racing ships bump into each other at high speed: a hard metallic clang with a short electric crackle', 0.6, False),
    'explode': ('A futuristic racing ship explodes: a big punchy sci-fi explosion with a deep boom and crackling debris', 2.0, False),
    'mine': ('A sci-fi mine detonates under a racer: a sharp electric blast and a deep bass thump', 1.0, False),
    'pass': ('A futuristic racing ship flies past very fast: a short doppler whoosh with a jet whine', 1.0, False),
    'beep': ('A single clean electronic race countdown beep, mid pitch, short, arcade style', 0.5, False),
    'beep_go': ('A single long high electronic beep for the start of a race, arcade style, bright', 1.0, False),
    'lap': ('A bright short arcade chime for completing a lap, two rising synth notes', 0.8, False),
    'move': ('A short crisp futuristic menu cursor tick, clean digital blip', 0.5, False),
    'select': ('A confident futuristic menu confirm sound, a bright synth stab with a short whoosh', 0.6, False),
    'back': ('A short soft futuristic menu cancel sound, a descending digital blip', 0.5, False),
    'pit': ('A soft electric charging hum rising in pitch, energy refilling, sci-fi', 2.0, False),
    'spin': ('A fast whirling spin attack of a sci-fi racer: a rotating whoosh with an electric swish', 0.8, False),
    'crowd': ('A huge stadium crowd cheering and roaring at a futuristic race, wide, distant', 4.0, False),
    'warning': ('A short urgent electronic warning alarm, two quick pulses, sci-fi cockpit low energy', 0.8, False),
    # round 5: the drift, the nitro, the pit's refill, the wind
    'heal': ('A single short bubbly electronic bloop, a liquid video game energy refill tick, round and bright', 0.5, False),
    'hop': ('A quick punchy hop of a hover racer starting a drift: a short springy thump with a sharp electric zap', 0.5, False),
    'drift': ('Continuous crackling electric sparks and a hissing magnetic screech, a hover racer sliding sideways, seamless loop', 2.0, True),
    'nitro': ('A short bright arcade power-up charge sound, a rising synth ping, a nitro cell is full', 0.6, False),
    'nitro_go': ('A violent nitro boost blast of a futuristic racer: a deep explosive thump, a roaring jet whoosh and a rising afterburner scream', 1.8, False),
    'wind': ('Strong rushing wind at very high speed, roaring air buffeting past a cockpit, seamless loop, no engine', 3.0, True),
    # round 7: the menus in rock (Stefan: a hard hit on the guitar when you press start)
    'gtr_start': ('One massive heavily distorted electric guitar power chord slammed hard together with a crash cymbal and a kick drum, a short reverse whoosh rushing into it, then the chord ringing out with a little feedback, the start sound of a 1990s rock arcade racing game', 2.0, False),
    'gtr_start2': ('A huge arena rock stinger: an overdriven electric guitar power chord hit with a kick drum and a crash cymbal, aggressive and loud, ringing out', 1.8, False),
    'gtr_select': ('A short punchy palm-muted distorted electric guitar chord stab with a tight snare hit, rock video game menu confirm sound', 0.7, False),
    'gtr_move': ('A tiny electric guitar pick click on a muted string, very short and crisp, video game menu cursor tick', 0.5, False),
    'gtr_back': ('A short distorted electric guitar slide down the neck, rock video game menu cancel sound', 0.7, False),
    # round 8: the heal strip's refill tick, played fast and rising ("tu-tu-tu-tu")
    'heal_tick': ('One single short clean bright electronic blip, a retro video game health refill tick, a soft square wave beep with a tiny echo', 0.5, False),
}
voice = {
    'v_hyperlane': '[shouting] Hyperlane!',
    'v_zerog': '[shouting] Zero... G!',
    'v_zerogravity': '[shouting] Zero Gravity!',
    'v_three': '[excited] Three!',
    'v_two': '[excited] Two!',
    'v_one': '[excited] One!',
    'v_go': '[shouting] GO!',
    'v_final': '[excited] Final lap!',
    'v_goal': '[shouting] Goal!',
    'v_boost': '[excited] Boost power!',
    'v_retired': 'Retired.',
    'v_out': '[excited] Course out!',
    'v_record': '[excited] New record!',
    'v_select': '[excited] Select your machine!',
    'v_ready': '[excited] Get ready!',
}
only = set(sys.argv[1:])
for name, (text, dur, loop) in sfx.items():
    if only and name not in only:
        continue
    inp = {'text': text, 'duration_seconds': dur, 'prompt_influence': 0.6, 'loop': loop, 'output_format': 'mp3_44100_128'}
    json.dump(inp, open(f'{name}.input.json', 'w'), indent=1)
    if not os.path.exists(f'{name}.job'):
        subprocess.run([sys.executable, FAL, '--env', ENV, 'submit', '--endpoint', SFX, '--input', f'{name}.input.json', '--out', f'{name}.job'])
for name, text in voice.items():
    if only and name not in only:
        continue
    inp = {'text': text, 'voice': 'Brian', 'stability': 0.35}
    json.dump(inp, open(f'{name}.input.json', 'w'), indent=1)
    if not os.path.exists(f'{name}.job'):
        subprocess.run([sys.executable, FAL, '--env', ENV, 'submit', '--endpoint', TTS, '--input', f'{name}.input.json', '--out', f'{name}.job'])
