#!/usr/bin/env python3
"""Mechanical design-rule checks for a repo, a list of files, or one edit.

Usage:
  check_design.py [FILE ...] [--root DIR]        report (no files = scan the whole root)
  check_design.py --root DIR --write-baseline F   record today's counts per rule
  check_design.py --root DIR --baseline F         fail only if a count went UP (the ratchet)
  check_design.py --hook                          PostToolUse hook: read the edit on stdin,
                                                  check only the lines it added, exit 2 to
                                                  show Claude what broke
Options: --all (list every hit, not the first 15 per rule), --json

Rules (ids work in suppressions and in .design-rules.json "rules_off"):
  faint-text   error  text-{gray,slate,zinc,neutral,stone}-50..400: ~2.5:1 on light backgrounds
  tiny-text    error  text under the floor (12px web/RN/Compose, 11pt SwiftUI; 11px if uppercase)
  zoom-lock    error  maximum-scale=1 / user-scalable=no: blocks pinch zoom
  raw-color    warn   a hex colour outside the token files
  palette-class warn  a raw Tailwind palette class (bg-blue-500) instead of a token
  white-surface warn  bg-white / literal white background in an app with dark mode
  inline-svg   warn   an <svg> drawn inside a component: use the app's icon set

Suppress one line with a comment on it or the line above:  design-rules: allow faint-text
Config (optional) .design-rules.json at the root:
  {"token_files": ["src/styles/*.ts"], "ignore": ["src/legacy/*"], "min_text_px": 12,
   "dark_mode": "auto" | true | false, "rules_off": ["inline-svg"]}
Python 3.8+, standard library only.
"""
import fnmatch
import json
import os
import re
import sys

SEVERITY = {
    "faint-text": "error",
    "tiny-text": "error",
    "zoom-lock": "error",
    "raw-color": "warn",
    "palette-class": "warn",
    "white-surface": "warn",
    "inline-svg": "warn",
}
FIX = {
    "faint-text": "use the project's muted-text token; the 500 shade is the lightest gray that passes "
                  "on white (often not on tints). On a dark surface? Measure with contrast.py and "
                  "suppress the line.",
    "tiny-text": "use a step of the type scale at or above the floor; 11px only for uppercase micro labels.",
    "zoom-lock": "remove maximum-scale / user-scalable: people must be able to zoom.",
    "raw-color": "use a token from the project's token file (add one there first if it's missing).",
    "palette-class": "use the token's utility (e.g. text-muted, bg-surface) instead of a raw palette shade.",
    "white-surface": "use the surface token so it flips in dark mode.",
    "inline-svg": "use the app's icon set (Lucide / SF Symbols / Material); keep SVG for logos and art.",
}
WHY = {
    "faint-text": "light gray text fails contrast",
    "tiny-text": "text below the size floor",
    "zoom-lock": "zoom is locked",
    "raw-color": "colour not from the token file",
    "palette-class": "raw Tailwind palette class",
    "white-surface": "literal white surface",
    "inline-svg": "hand-drawn SVG icon",
}

UI_EXT = {".tsx", ".jsx", ".ts", ".js", ".mjs", ".vue", ".svelte", ".astro"}
CSS_EXT = {".css", ".scss", ".sass", ".less"}
SWIFT_EXT = {".swift"}
KOTLIN_EXT = {".kt"}
HTML_EXT = {".html", ".htm"}
ALL_EXT = UI_EXT | CSS_EXT | SWIFT_EXT | KOTLIN_EXT | HTML_EXT

SKIP_DIRS = {  # compared lower-case
    "node_modules", ".git", "dist", "build", ".next", "out", "coverage", "pods", ".expo",
    "deriveddata", ".build", "vendor", ".vercel", ".turbo", ".cache", "android", "ios",
    "design", "mockups", "explorations", "docs", "e2e", "tests", "test", "__tests__",
    "__snapshots__", "__mocks__", "scripts", "public", "evals", "fixtures", "storybook-static",
    "design-prototypes", "design-brief", "prototypes",
}
SKIP_FILE = re.compile(r"\.(test|spec|stories|story|d|min)\.[a-z]+$|\.config\.[a-z]+$", re.I)
TOKEN_NAME = re.compile(r"token|theme|colou?r|palette", re.I)
TOKEN_BASENAMES = {"globals.css", "global.css", "index.css", "app.css", "main.css", "styles.css"}

HEX = re.compile(r"(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])")
GRAYS = "gray|slate|zinc|neutral|stone"
HUES = GRAYS + "|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
FAINT = re.compile(r"(?<![\w:/-])text-(?:%s)-(?:50|100|200|300|400)(?![\w-])" % GRAYS)
PALETTE = re.compile(
    r"(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|"
    r"placeholder|decoration|shadow|accent|caret)-(?:%s)-(?:50|[1-9]00|950)(?:/\d+)?(?![\w-])" % HUES
)
TW_PX = re.compile(r"(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]")
TW_REM = re.compile(r"(?<![\w-])text-\[(\d*\.?\d+)rem\]")
CSS_PX = re.compile(r"font-size\s*:\s*(\d+(?:\.\d+)?)px")
CSS_REM = re.compile(r"font-size\s*:\s*(\d*\.?\d+)rem")
RN_SIZE = re.compile(r"fontSize\s*:\s*(\d+(?:\.\d+)?)\b")
SWIFT_SIZE = re.compile(r"(?:\.system|\.custom)\([^)]*?size:\s*(\d+(?:\.\d+)?)")
KOTLIN_SP = re.compile(r"\b(\d+(?:\.\d+)?)\.sp\b")
ZOOM = re.compile(
    r"maximum-scale\s*=\s*1(?:\.0)?(?![\d.])|user-scalable\s*=\s*(?:no|0)\b|"
    r"maximumScale\s*:\s*1(?:\.0)?(?![\d.])|userScalable\s*:\s*false\b"
)
WHITE = re.compile(
    r"(?<![\w:/-])bg-white(?![\w/-])|background(?:Color)?\s*:\s*['\"](?:#fff(?:fff)?|white)['\"]",
    re.I,
)
SVG = re.compile(r"<svg\b")
ALLOW = re.compile(r"design-rules:\s*allow\s+([\w,\s-]+)")
TOKEN_DECL = re.compile(r"^\s*--[\w-]+\s*:")  # `--ink: #1d1d1b;` defines a token
NOT_COLOUR_BEFORE = re.compile(r"(?:href|to|id|hash|path)\s*[=:]\s*\{?['\"`]$")
COMMENT = re.compile(r"^\s*(//|/\*|\*|<!--|\{/\*|#(?![0-9a-fA-F]{3}))")
DARK_SIGNS = re.compile(r"(?<![\w-])dark:|\.dark\b|prefers-color-scheme:\s*dark|useColorScheme|colorScheme")


def load_config(root):
    path = os.path.join(root, ".design-rules.json")
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def rel(root, path):
    return os.path.relpath(path, root).replace(os.sep, "/")


def is_token_file(relpath, config):
    base = relpath.rsplit("/", 1)[-1]
    if base in TOKEN_BASENAMES or base.startswith("tailwind.config"):
        return True
    if TOKEN_NAME.search(base):
        return True
    return any(fnmatch.fnmatch(relpath, g) for g in config.get("token_files", []))


def ignored(relpath, config):
    return any(fnmatch.fnmatch(relpath, g) for g in config.get("ignore", []))


def walk(root, config):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d.lower() not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            ext = os.path.splitext(name)[1].lower()
            if ext not in ALL_EXT or SKIP_FILE.search(name):
                continue
            r = rel(root, path)
            if ignored(r, config):
                continue
            # HTML outside the app's entry point is usually a mockup: only index.html counts.
            if ext in HTML_EXT and name != "index.html":
                continue
            yield path


def detect_dark(root, config, paths):
    setting = config.get("dark_mode", "auto")
    if setting is not True and setting is not False:
        for path in paths:
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    if DARK_SIGNS.search(fh.read()):
                        return True
            except OSError:
                continue
        return False
    return setting


def floor_for(ext, config):
    if ext in SWIFT_EXT:
        return float(config.get("min_text_pt_swift", 11))
    return float(config.get("min_text_px", 12))


def check_lines(lines, relpath, ext, config, dark_mode, first_line=1):
    """Yield (rule, line_no, snippet) for every hit in these lines."""
    token_file = is_token_file(relpath, config)
    floor = floor_for(ext, config)
    off = set(config.get("rules_off", []))
    allowed_next = set()
    for offset, line in enumerate(lines):
        line_no = first_line + offset
        allow = set(allowed_next)
        allowed_next = set()
        m = ALLOW.search(line)
        if m:
            rules = {r.strip() for r in re.split(r"[\s,]+", m.group(1)) if r.strip()}
            allow |= rules
            if COMMENT.match(line):
                allowed_next = rules
        if COMMENT.match(line):
            continue
        hits = []
        if ext in HTML_EXT:
            hits += [("zoom-lock", z.group(0)) for z in ZOOM.finditer(line)]
        else:
            hits += [("zoom-lock", z.group(0)) for z in ZOOM.finditer(line)]
            if not token_file and not TOKEN_DECL.match(line):
                hits += [("raw-color", h.group(0)) for h in HEX.finditer(line)
                         if not NOT_COLOUR_BEFORE.search(line[:h.start()])]
            if ext in UI_EXT:
                hits += [("faint-text", f.group(0)) for f in FAINT.finditer(line)]
                if not token_file:
                    hits += [("palette-class", p.group(0)) for p in PALETTE.finditer(line)
                             if not FAINT.fullmatch(p.group(0))]
                if dark_mode:
                    hits += [("white-surface", w.group(0)) for w in WHITE.finditer(line)]
                if SVG.search(line) and not re.search(r"icon|logo|brand|mark|illustration", relpath, re.I):
                    hits.append(("inline-svg", "<svg"))
            micro = "uppercase" in line
            limit = min(floor, 11.0) if micro else floor
            for regex, unit in ((TW_PX, "px"), (CSS_PX, "px"), (TW_REM, "rem"), (CSS_REM, "rem")):
                if ext in SWIFT_EXT | KOTLIN_EXT:
                    break
                for s in regex.finditer(line):
                    size = float(s.group(1)) * (16 if unit == "rem" else 1)
                    if size < limit:
                        hits.append(("tiny-text", s.group(0)))
            if ext in UI_EXT:
                hits += [("tiny-text", s.group(0)) for s in RN_SIZE.finditer(line) if float(s.group(1)) < limit]
            if ext in SWIFT_EXT:
                hits += [("tiny-text", s.group(0)) for s in SWIFT_SIZE.finditer(line) if float(s.group(1)) < limit]
            if ext in KOTLIN_EXT:
                hits += [("tiny-text", s.group(0)) for s in KOTLIN_SP.finditer(line) if float(s.group(1)) < limit]
        for rule, snippet in hits:
            if rule in off or rule in allow or "all" in allow:
                continue
            yield rule, line_no, snippet.strip()


def check_file(path, root, config, dark_mode):
    ext = os.path.splitext(path)[1].lower()
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            lines = fh.read().splitlines()
    except OSError as err:
        print(f"check_design.py: cannot read {path}: {err}", file=sys.stderr)
        return []
    r = rel(root, path)
    return [(rule, r, n, s) for rule, n, s in check_lines(lines, r, ext, config, dark_mode)]


def counts(findings):
    out = {rule: 0 for rule in SEVERITY}
    for f in findings:
        out[f[0]] += 1
    return out


def report(findings, root, show_all):
    if not findings:
        print(f"design-rules: no problems found under {root}")
        return
    files = len({f[1] for f in findings})
    print(f"design-rules: {len(findings)} hits in {files} files under {root}")
    by_rule = {}
    for f in findings:
        by_rule.setdefault(f[0], []).append(f)
    for rule in sorted(by_rule, key=lambda r: (SEVERITY[r] != "error", -len(by_rule[r]))):
        items = by_rule[rule]
        print(f"\n{rule} ({SEVERITY[rule]}, {len(items)}): {WHY[rule]}")
        print(f"  fix: {FIX[rule]}")
        shown = items if show_all else items[:15]
        for _, r, n, s in shown:
            print(f"  {r}:{n}  {s}")
        if len(items) > len(shown):
            print(f"  ... and {len(items) - len(shown)} more (--all to list them)")
    c = counts(findings)
    print("\ntotals: " + " · ".join(f"{k} {v}" for k, v in c.items() if v))


def added_text(payload):
    tool_input = payload.get("tool_input") or {}
    pieces = []
    if "content" in tool_input:
        pieces.append(tool_input.get("content") or "")
    if "new_string" in tool_input:
        pieces.append(tool_input.get("new_string") or "")
    for edit in tool_input.get("edits") or []:
        pieces.append(edit.get("new_string") or "")
    return "\n".join(pieces)


def run_hook(stdin_text):
    try:
        payload = json.loads(stdin_text or "{}")
    except json.JSONDecodeError:
        return 0  # not our input to judge; never block an edit on a malformed payload
    path = (payload.get("tool_input") or {}).get("file_path")
    if not path:
        return 0
    ext = os.path.splitext(path)[1].lower()
    if ext not in ALL_EXT or SKIP_FILE.search(os.path.basename(path)):
        return 0
    root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    config = load_config(root)
    r = rel(root, path)
    if ignored(r, config) or any(part.lower() in SKIP_DIRS for part in r.split("/")[:-1]):
        return 0
    if ext in HTML_EXT and os.path.basename(path) != "index.html":
        return 0
    dark = config.get("dark_mode", "auto")
    dark_mode = dark is True  # the hook does not walk the repo; set "dark_mode": true to check surfaces
    hits = list(check_lines(added_text(payload).splitlines(), r, ext, config, dark_mode))
    if not hits:
        return 0
    lines = [f"design-rules: the edit to {r} adds {len(hits)} problem(s):"]
    for rule, _, snippet in hits[:12]:
        lines.append(f"  {rule} ({SEVERITY[rule]}): {snippet} -> {FIX[rule]}")
    if len(hits) > 12:
        lines.append(f"  ... and {len(hits) - 12} more")
    lines.append("Fix them now, or add `design-rules: allow <rule>` with the reason if the line is a measured exception.")
    print("\n".join(lines), file=sys.stderr)
    return 2


def main(argv):
    args = list(argv)
    if "-h" in args or "--help" in args:
        print(__doc__.strip())
        return 0
    if "--hook" in args:
        return run_hook(sys.stdin.read())

    def option(name):
        if name in args:
            i = args.index(name)
            if i + 1 >= len(args):
                raise SystemExit(f"{name} needs a value")
            value = args[i + 1]
            del args[i:i + 2]
            return value
        return None

    root = os.path.abspath(option("--root") or os.getcwd())
    baseline = option("--baseline")
    write_baseline = option("--write-baseline")
    show_all = "--all" in args
    as_json = "--json" in args
    files = [a for a in args if not a.startswith("--")]
    config = load_config(root)
    paths = [os.path.abspath(f) for f in files] if files else list(walk(root, config))
    dark_mode = detect_dark(root, config, paths if files else paths)
    findings = []
    for path in paths:
        findings += check_file(path, root, config, dark_mode)
    current = counts(findings)

    if write_baseline:
        with open(write_baseline, "w", encoding="utf-8") as fh:
            json.dump(current, fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"design-rules: baseline written to {write_baseline}: " +
              " · ".join(f"{k} {v}" for k, v in current.items() if v))
        return 0
    if as_json:
        print(json.dumps({"root": root, "counts": current, "findings": [
            {"rule": r, "severity": SEVERITY[r], "file": f, "line": n, "text": s} for r, f, n, s in findings
        ]}, indent=2))
    else:
        report(findings, root, show_all)
    if baseline:
        with open(baseline, encoding="utf-8") as fh:
            allowed = json.load(fh)
        worse = {k: (allowed.get(k, 0), v) for k, v in current.items() if v > allowed.get(k, 0)}
        better = {k: (allowed.get(k, 0), v) for k, v in current.items() if v < allowed.get(k, 0)}
        if better:
            print("\nbaseline: improved " + ", ".join(f"{k} {a}->{v}" for k, (a, v) in better.items()) +
                  " (lower the baseline with --write-baseline so it stays down)")
        if worse:
            print("\nbaseline: WORSE " + ", ".join(f"{k} {a}->{v}" for k, (a, v) in worse.items()),
                  file=sys.stderr)
            return 1
        return 0
    errors = sum(v for k, v in current.items() if SEVERITY[k] == "error")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
