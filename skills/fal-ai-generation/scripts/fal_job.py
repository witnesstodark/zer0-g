"""Small portable fal queue helper. Dry runs never import the SDK or use the network."""
import argparse
import hashlib
import json
import mimetypes
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen


def now():
    return datetime.now(timezone.utc).isoformat()


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8"))


def save_json(file, value, exclusive=False):
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    if exclusive:
        with file.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
    else:
        temporary = file.with_name(file.name + ".tmp")
        temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        temporary.replace(file)


def client(env_file=None):
    env_file = Path(env_file) if env_file else Path.cwd() / ".env"
    if env_file.is_file():
        from dotenv import dotenv_values
        values = dotenv_values(env_file)
    else:
        values = {}
    names = ("FAL_KEY", "FALAI_KEY", "MRMAK_MCP_FAL_AUTHORIZATION")
    key = next((os.environ.get(name) for name in names if os.environ.get(name)), None)
    key = key or next((values.get(name) for name in names if values.get(name)), None)
    if not key:
        raise ValueError("Set FAL_KEY in the environment or selected .env file.")
    key = re.sub(r"^(Bearer|Key)\s+", "", key.strip(), flags=re.I)
    os.environ["FAL_KEY"] = key
    import fal_client
    return fal_client


def submit(args, sdk=None):
    inputs = read_json(args.input)
    if not isinstance(inputs, dict):
        raise ValueError("The model input file must contain a JSON object.")
    if args.dry_run:
        return {"dry_run": True, "endpoint_id": args.endpoint, "input_fields": sorted(inputs)}
    if "example.invalid" in json.dumps(inputs):
        raise ValueError("Replace example reference URLs with actual uploads before submitting.")
    receipt = Path(args.out) / "job.json"
    if receipt.exists():
        raise ValueError("A job receipt already exists here. Use status/result to continue it.")
    sdk = sdk or client(args.env)
    job = {"provider": "fal.ai", "endpoint_id": args.endpoint, "input": inputs,
           "created_at": now(), "status": "submission_pending"}
    # Exclusive creation prevents two helper processes from submitting into the same task.
    save_json(receipt, job, exclusive=True)
    try:
        handle = sdk.submit(args.endpoint, arguments=inputs)
        job.update(request_id=handle.request_id, status="submitted")
        for name in ("status_url", "response_url", "cancel_url"):
            value = getattr(handle, name, None)
            if isinstance(value, str):
                job[name] = value
        save_json(receipt, job)
    except Exception as error:
        # Keep the guard even when the network response or receipt write failed.
        job.update(status="submission_unknown", error_type=type(error).__name__)
        save_json(receipt, job)
        raise RuntimeError("Submission outcome is unknown. Inspect account history before resubmitting.") from None
    return {"status": job["status"], "request_id": job["request_id"], "receipt": str(receipt)}


def queue_status(sdk, job):
    status = sdk.status(job["endpoint_id"], job["request_id"], with_logs=False)
    if isinstance(status, sdk.Completed):
        return "COMPLETED"
    if isinstance(status, sdk.InProgress):
        return "IN_PROGRESS"
    if isinstance(status, sdk.Queued):
        return "IN_QUEUE"
    return "UNKNOWN"


def media_urls(value, url_collection=False):
    if isinstance(value, dict):
        if isinstance(value.get("url"), str):
            yield value
        for key, item in value.items():
            if key != "url":
                yield from media_urls(item, url_collection or key.endswith("_urls"))
    elif isinstance(value, list):
        for item in value:
            yield from media_urls(item, url_collection)
    elif url_collection and isinstance(value, str) and value.startswith("https://"):
        yield {"url": value}


def download_result(result, folder):
    saved, seen = [], set()
    folder.mkdir(parents=True, exist_ok=True)
    for item in media_urls(result):
        url = item["url"]
        if url in seen:
            continue
        seen.add(url)
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Media downloads require an HTTPS URL without embedded credentials.")
        suffix = Path(parsed.path).suffix.lower()
        if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
            suffix = mimetypes.guess_extension(item.get("content_type", "")) or ".bin"
        name = f"{len(saved)+1:02d}-{hashlib.sha256(url.encode()).hexdigest()[:10]}{suffix}"
        destination = folder / name
        if not destination.is_file():
            partial = destination.with_name(destination.name + ".part")
            size = 0
            with urlopen(url, timeout=60) as response, partial.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > 512 * 1024 * 1024:
                        raise ValueError("Media exceeds the helper's 512 MB per-file limit; download it separately.")
                    output.write(chunk)
            partial.replace(destination)
        saved.append({"path": str(destination), "bytes": destination.stat().st_size,
                      "kind": item.get("map_type") or item.get("file_name") or "media"})
    return saved


def resume(args, sdk=None):
    receipt = Path(args.job)
    job = read_json(receipt)
    if not job.get("request_id") or not job.get("endpoint_id"):
        raise ValueError("Receipt has no request ID. Recover it from account history before continuing.")
    result_file = receipt.parent / "result.json"
    # A saved result remains useful after provider queue history has expired.
    if args.command == "result" and result_file.exists():
        result = read_json(result_file)
    else:
        sdk = sdk or client(args.env)
        status = queue_status(sdk, job)
        job.update(status=status, checked_at=now())
        save_json(receipt, job)
        if args.command == "status" or status != "COMPLETED":
            return {"status": status, "request_id": job["request_id"]}
        result = sdk.result(job["endpoint_id"], job["request_id"])
        save_json(result_file, result)
    if isinstance(result, dict) and (result.get("error") or result.get("error_type")):
        job.update(status="provider_error")
        save_json(receipt, job)
        raise RuntimeError("Provider returned an error. Inspect the saved result; do not mark this job accepted.")
    outputs = download_result(result, receipt.parent / "assets")
    job.update(status="downloaded" if outputs else "result_saved", outputs=outputs)
    save_json(receipt, job)
    return {"status": job["status"], "outputs": outputs, "result": str(result_file), "review": "pending"}


def upload(args, sdk=None):
    source = Path(args.file)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    receipt = Path(args.out)
    if receipt.exists():
        previous = read_json(receipt)
        if previous.get("sha256") == digest and previous.get("url"):
            return {"reused": True, "receipt": str(receipt)}
        raise ValueError("Upload receipt belongs to another file. Choose a new output path.")
    sdk = sdk or client(args.env)
    url = sdk.upload_file(source)
    save_json(receipt, {"url": url, "source_name": source.name, "sha256": digest, "created_at": now()}, exclusive=True)
    return {"uploaded": True, "receipt": str(receipt)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", help="Explicit .env file; otherwise use only the current directory's .env")
    commands = parser.add_subparsers(dest="command", required=True)
    send = commands.add_parser("submit", help="Start one requested generation, or validate inputs with --dry-run")
    send.add_argument("--endpoint", required=True)
    send.add_argument("--input", required=True)
    send.add_argument("--out", required=True)
    send.add_argument("--dry-run", action="store_true")
    for name in ("status", "result"):
        command = commands.add_parser(name)
        command.add_argument("--job", required=True)
    up = commands.add_parser("upload", help="Upload a local reference; save its URL without printing it")
    up.add_argument("--file", required=True)
    up.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        result = submit(args) if args.command == "submit" else upload(args) if args.command == "upload" else resume(args)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (ValueError, FileExistsError, FileNotFoundError, RuntimeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
    except Exception as error:
        # SDK exception bodies can contain signed URLs or other private request details.
        print(json.dumps({"error": "Operation failed; preserve the receipt and inspect the provider status.", "type": type(error).__name__}), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
