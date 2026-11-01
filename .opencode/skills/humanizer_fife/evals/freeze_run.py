"""Freeze and verify blind-run artifacts.

    python evals/freeze_run.py --name run3 --of evals/blind evals/rewrite \
        evals/corpus evals/results/v3.6.0-rewrites.json
    python evals/freeze_run.py --verify evals/results/manifests/run3.json

`--of` hashes every file under the given paths (recursively) into a manifest
under evals/results/manifests/<name>.json. `--verify` re-hashes and reports
any file whose content changed since the manifest was written — so the source
corpus, judged pair text, keys, and later-measured rewrite text can never
silently diverge again (audit finding 2: run 3's pairs were judged, then
three rewrite files were edited, so the metrics described different text than
the judge read).

Hashes cover LF-normalized content (CRLF and lone CR become LF), so
verification is independent of the checkout's line-ending configuration; a
line-ending-only edit is not drift. Missing inputs and empty manifests are
hard errors: freezing nothing must not look like evidence.
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # repo root


def sha256(path):
    raw = Path(path).read_bytes()
    return hashlib.sha256(raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")).hexdigest()


def collect(paths):
    manifest = {}
    for raw in paths:
        p = Path(raw).resolve()
        if p.is_file():
            manifest[str(p.relative_to(ROOT)).replace("\\", "/")] = sha256(p)
        elif p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file() and "__pycache__" not in f.parts:
                    manifest[str(f.relative_to(ROOT)).replace("\\", "/")] = sha256(f)
        else:
            print(f"error (missing input): {raw}", file=sys.stderr)
            sys.exit(1)
    if not manifest:
        print("error: nothing frozen; refusing to write an empty manifest",
              file=sys.stderr)
        sys.exit(1)
    return manifest


def main():
    if "--verify" in sys.argv:
        mpath = Path(sys.argv[sys.argv.index("--verify") + 1]).resolve()
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
        if not manifest:
            print(f"error: empty manifest: {mpath}", file=sys.stderr)
            sys.exit(1)
        drift = missing = 0
        for rel, digest in sorted(manifest.items()):
            p = ROOT / rel
            if not p.exists():
                print(f"MISSING {rel}")
                missing += 1
            elif sha256(p) != digest:
                print(f"CHANGED {rel}")
                drift += 1
        total = len(manifest)
        print(f"{total - drift - missing}/{total} unchanged, "
              f"{drift} changed, {missing} missing")
        sys.exit(1 if (drift or missing) else 0)

    if "--name" in sys.argv and "--of" in sys.argv:
        name = sys.argv[sys.argv.index("--name") + 1]
        paths = sys.argv[sys.argv.index("--of") + 1:]
        manifest = collect(paths)
        out_dir = ROOT / "evals" / "results" / "manifests"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f"{name}.json"
        out.write_text(json.dumps(manifest, indent=1, sort_keys=True),
                       encoding="utf-8")
        print(f"froze {len(manifest)} files -> {out}")
        return
    print(__doc__)
    sys.exit(2)


if __name__ == "__main__":
    main()
