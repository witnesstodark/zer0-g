"""The announcer, round 2: an angry, hoarse cyberpunk voice (ElevenLabs v3, Callum, with tags). One job per line.
python make_voice.py   (receipts in <line>.job/; tools/audio_pack.py roughens and packs them)"""
import json, os, subprocess, sys
FAL = os.path.join('..', '..', '..', '..', '.claude', 'skills', 'fal-ai-generation', 'scripts', 'fal_job.py')
ENV = os.path.join('..', '..', '..', '..', '.env')
LINES = {
    'ready': '[angry] [low, growling] Get ready...',
    'three': '[angry] [shouting] Three!',
    'two': '[angry] [shouting] Two!',
    'one': '[angry] [shouting] One!',
    'go': '[furious] [shouting] GO!',
    'final': '[angry] [shouting] Final lap!',
    'goal': '[triumphant] [shouting] Goal!',
    'boost': '[angry] [shouting] Boost power!',
    'retired': '[contemptuous] [low] Retired.',
    'out': '[angry] [shouting] Course out!',
    'record': '[impressed] [shouting] New record!',
    'select': '[growling] Select your machine.',
    'title': '[furious] [shouting] Zero... G!',
}
for name, text in LINES.items():
    if os.path.exists(f'{name}.job'):
        continue
    json.dump({'text': text, 'voice': 'Callum', 'stability': 0.3}, open(f'{name}.input.json', 'w'), indent=1)
    subprocess.run([sys.executable, FAL, '--env', ENV, 'submit', '--endpoint', 'fal-ai/elevenlabs/tts/eleven-v3', '--input', f'{name}.input.json', '--out', f'{name}.job'])
