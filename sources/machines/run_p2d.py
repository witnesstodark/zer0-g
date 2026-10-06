"""Round 2 of the machines: Tripo P2 through AssetHub with detailed textures, from each machine's own concept
(machine_<name>_A.png, as round 1 used) downscaled to 1536 px PNG (AssetHub takes up to 4 MB).

python run_p2d.py submit <names...>   upload the input and submit one job per machine; every id goes into
                                      p2d_<name>/job.json before and after the call (the operation id is fixed
                                      first, so a retry replays the same command instead of paying twice)
python run_p2d.py poll                poll every submitted job by its id, download finished meshes
python run_p2d.py retry [n]           resubmit jobs AssetHub reported "Tripo is busy" for (released, not charged),
                                      keeping n running at most; the failed job's ids stay in its history
Then: PREP_PREFIX=p2d_ blender -b --python tools/machine_prep.py -- machines experience/assets/machines <names>
and node tools/machine_pack.mjs
"""
import json, os, subprocess, sys, uuid, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, 'p2d_jobs.log')
REQ = {'modelId': 'meshGen.tripo_p2_preview', 'faceLimit': 10000, 'inputMode': 'image', 'strictOptions': True,
       'params': {'texture': True, 'pbr': True, 'textureQuality': 'detailed', 'quad': False}}


def ah(*args, timeout=300):
    r = subprocess.run(['assethub', *args], capture_output=True, text=True, timeout=timeout, cwd=HERE, shell=os.name == 'nt')
    out = r.stdout.strip()
    try:
        return json.loads(out), r.returncode
    except Exception:
        return {'raw': out[-3000:], 'stderr': r.stderr[-2000:]}, r.returncode


def log(line):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + line + '\n')
    print(line, flush=True)


def state(name):
    p = os.path.join(HERE, f'p2d_{name}', 'job.json')
    return (json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}), p


def save(name, st):
    _, p = state(name)
    json.dump(st, open(p, 'w', encoding='utf-8'), indent=2)


def submit(name):
    st, _ = state(name)
    if st.get('jobId'):
        log(f'{name}: already submitted, job {st["jobId"]} (not submitting again)')
        return
    d = os.path.join(HERE, f'p2d_{name}')
    if not st.get('uploadId'):
        up_path = os.path.join(d, 'upload.json')
        if os.path.exists(up_path):
            up = json.load(open(up_path, encoding='utf-8'))
        else:
            up, rc = ah('files', 'upload', f'p2d_{name}/input_{name}_1536.png', '--media-type', 'image')
            json.dump(up, open(up_path, 'w', encoding='utf-8'), indent=2)
        if not up.get('uploadId'):
            log(f'{name}: upload failed {json.dumps(up)[:300]}')
            return
        st['uploadId'] = up['uploadId']
    if not st.get('operationId'):
        st['operationId'] = str(uuid.uuid4())
    save(name, st)
    req = dict(REQ, name=f'ZER0-G {name} detailed', source={'uploadId': st['uploadId']})
    rp = os.path.join(d, 'request.json')
    json.dump(req, open(rp, 'w', encoding='utf-8'), indent=2)
    log(f'{name}: submitting, operation {st["operationId"]}, upload {st["uploadId"]}')
    res, rc = ah('mesh', 'generate', '--input-json', f'@p2d_{name}/request.json', '--operation-id', st['operationId'])
    json.dump(res, open(os.path.join(d, 'submit.json'), 'w', encoding='utf-8'), indent=2)
    job = find(res, 'jobId')
    st['jobId'] = job
    st['submitRc'] = rc
    save(name, st)
    log(f'{name}: rc {rc} job {job} {"" if job else json.dumps(res)[:400]}')


def find(o, key):
    if isinstance(o, dict):
        if o.get(key): return o[key]
        for v in o.values():
            r = find(v, key)
            if r: return r
    elif isinstance(o, list):
        for v in o:
            r = find(v, key)
            if r: return r
    return None


def poll():
    names = sorted(n[4:] for n in os.listdir(HERE) if n.startswith('p2d_') and os.path.isdir(os.path.join(HERE, n)))
    for name in names:
        st, _ = state(name)
        if not st.get('jobId') or st.get('downloaded'):
            continue
        res, rc = ah('jobs', 'get', st['jobId'])
        status = find(res, 'status')
        if status != st.get('status'):
            log(f'{name}: job {st["jobId"]} status {status}')
        st['status'] = status
        if status == 'completed':
            out, rc = ah('jobs', 'get', st['jobId'], '--download', '--out-dir', f'p2d_{name}', timeout=600)
            json.dump(out, open(os.path.join(HERE, f'p2d_{name}', 'result.json'), 'w', encoding='utf-8'), indent=2)
            glbs = [f for f in os.listdir(os.path.join(HERE, f'p2d_{name}')) if f.endswith('.glb')]
            if glbs:
                st['downloaded'] = glbs
                st['assetId'] = find(out, 'assetId')
                log(f'{name}: downloaded {glbs}, asset {st["assetId"]}')
        elif status in ('failed', 'cancelled', 'canceled'):
            st['error'] = json.dumps(find(res, 'error') or res)[:500]
            log(f'{name}: FAILED {st["error"]}')
        save(name, st)


def retry(limit):
    """Resubmit jobs that failed before reaching Tripo ("Tripo is busy", released: nothing was charged), at most
    `limit` at a time beside the ones running. The failed job's ids stay in its history."""
    names = sorted(n[4:] for n in os.listdir(HERE) if n.startswith('p2d_') and os.path.isdir(os.path.join(HERE, n)))
    sts = {n: state(n)[0] for n in names}
    running = sum(1 for st in sts.values() if st.get('jobId') and st.get('status') not in ('completed', 'failed', 'cancelled', 'canceled'))
    for n, st in sts.items():
        if running >= limit:
            break
        if st.get('status') == 'failed' and 'PROVIDER_SUBMIT_FAILED' in (st.get('error') or ''):
            st.setdefault('history', []).append({k: st.pop(k, None) for k in ('jobId', 'operationId', 'status', 'error', 'submitRc')})
            save(n, st)
            log(f'{n}: resubmitting after a busy provider (old job {st["history"][-1]["jobId"]}, released)')
            submit(n)
            running += 1


if __name__ == '__main__':
    if sys.argv[1] == 'submit':
        for n in sys.argv[2:]:
            submit(n)
    elif sys.argv[1] == 'retry':
        retry(int(sys.argv[2]) if len(sys.argv) > 2 else 4)
    else:
        poll()
