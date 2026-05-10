#!/usr/bin/env python3
"""
Idempotently patch an nginx server site so each `location / { ... }` that
reverse-proxies clinic-web / ops-dashboard uses:
  include /etc/nginx/snippets/proxy-to-nextjs-cloudflare.conf;
and drops duplicate proxy_set_header / proxy_http_version lines that the
snippet already applies.

Run on the VPS (as root) via scripts/vps-apply-after-git-pull.sh
"""
from __future__ import annotations

import re
import sys
from datetime import datetime
from pathlib import Path

SNIPPET = "include /etc/nginx/snippets/proxy-to-nextjs-cloudflare.conf;"

# Normalized forms (single spaces, trailing semicolon) of directives to remove
# from location / blocks when we rely on the snippet.
REMOVE_NORMALIZED = {
    "proxy_http_version 1.1;",
    "proxy_set_header host $host;",
    "proxy_set_header x-real-ip $remote_addr;",
    "proxy_set_header x-real-ip $clinic_visitor;",
    "proxy_set_header x-forwarded-for $proxy_add_x_forwarded_for;",
    "proxy_set_header x-forwarded-for $clinic_visitor;",
    "proxy_set_header x-forwarded-proto $scheme;",
    "proxy_set_header cf-connecting-ip $http_cf_connecting_ip;",
    "proxy_set_header cf-connecting-ip $clinic_visitor;",
}


def norm_directive(line: str) -> str | None:
    s = line.strip()
    if not s or s.startswith("#"):
        return None
    # strip trailing comments
    if "#" in s:
        s = s[: s.index("#")].strip()
    if not s.endswith(";"):
        s = s + ";"
    return re.sub(r"\s+", " ", s.lower())


def line_should_drop(line: str) -> bool:
    n = norm_directive(line)
    return bool(n and n in REMOVE_NORMALIZED)


def block_needs_patch(inner: str) -> bool:
    low = inner.lower()
    if "proxy_pass" not in low:
        return False
    if SNIPPET in inner:
        return True
    markers = (
        "clinic_web",
        "clinic_ops",
        "127.0.0.1:3000",
        "127.0.0.1:3001",
        "localhost:3000",
        "localhost:3001",
    )
    return any(m in low for m in markers)


def first_body_indent(inner: str) -> str:
    for line in inner.splitlines():
        if line.strip():
            ws = line[: len(line) - len(line.lstrip())]
            return ws if ws else "    "
    return "    "


def patch_location_inner(inner: str) -> tuple[str, bool]:
    """Return (new_inner, changed)."""
    if not block_needs_patch(inner):
        return inner, False

    lines = inner.splitlines(keepends=True)
    kept: list[str] = []
    for line in lines:
        if line_should_drop(line):
            continue
        kept.append(line)

    new_inner = "".join(kept)
    indent = first_body_indent(new_inner)
    include_line = f"{indent}{SNIPPET}\n"

    if SNIPPET in new_inner:
        changed = new_inner != inner
        return new_inner, changed

    # Insert include as the first line inside the block (after opening brace).
    stripped_left = new_inner.lstrip("\n")
    prefix_newlines = new_inner[: len(new_inner) - len(stripped_left)]
    new_inner2 = prefix_newlines + include_line + stripped_left
    return new_inner2, True


def iter_location_root_blocks(content: str):
    pattern = re.compile(r"location\s+/\s*\{", re.MULTILINE)
    pos = 0
    while True:
        m = pattern.search(content, pos)
        if not m:
            break
        open_brace = content.find("{", m.start())
        depth = 0
        i = open_brace
        while i < len(content):
            c = content[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    full_end = i + 1
                    yield m.start(), full_end, content[m.start():full_end]
                    pos = full_end
                    break
            i += 1
        else:
            break


def patch_file(path: Path) -> bool:
    content = path.read_text(encoding="utf-8")
    out: list[str] = []
    idx = 0
    changed = False
    for start, end, block in iter_location_root_blocks(content):
        out.append(content[idx:start])
        open_brace = block.index("{")
        close_brace = block.rindex("}")
        inner = block[open_brace + 1 : close_brace]
        prefix = block[: open_brace + 1]
        suffix = block[close_brace:]
        new_inner, inner_changed = patch_location_inner(inner)
        if inner_changed:
            changed = True
        out.append(prefix + new_inner + suffix)
        idx = end
    out.append(content[idx:])
    new_content = "".join(out)
    if changed and new_content != content:
        bak = path.parent / f"{path.name}.bak-trusted-ip-{datetime.now():%Y%m%d%H%M%S}"
        bak.write_text(content, encoding="utf-8")
        path.write_text(new_content, encoding="utf-8")
        print(f"[nginx-patch] backup: {bak}", file=sys.stderr)
    return changed


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: nginx-ensure-trusted-ip-snippet.py /etc/nginx/sites-available/tenegta.tech", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"[nginx-patch] skip: not a file: {path}", file=sys.stderr)
        return 0
    if patch_file(path):
        print(f"[nginx-patch] updated {path} (trusted-IP snippet include + removed duplicate headers)")
    else:
        print(f"[nginx-patch] no changes needed for {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
