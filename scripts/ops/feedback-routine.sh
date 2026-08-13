#!/bin/bash
#
# Weekday beta-feedback triage.
#
# Runs LOCALLY, not as a cloud routine, and that is not a preference: the App
# Store Connect API needs an ES256 signature from ~/.appstoreconnect/private_keys,
# a file that exists only on this Mac and must never be committed. A cloud agent
# has no way to hold it, so a cloud routine would fail every single morning.
#
# Order matters. --peek reports new feedback WITHOUT marking it seen; the ledger
# only advances after triage has actually succeeded. If Claude fails or the
# machine sleeps mid-run, the same feedback is still waiting tomorrow rather
# than silently swallowed.
set -uo pipefail

REPO="/Users/barbchang/Projects/Homehub/homehub-v2"
LOG="$REPO/docs/beta-feedback.md"
RUN_LOG="$HOME/Library/Logs/homehub-feedback.log"
export ASC_KEY_ID=86YGW9ASWY
export ASC_ISSUER_ID=94e74136-1682-4b9a-912b-668a5de478a7
export ASC_APP_ID=6794043154
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$REPO" || exit 1
say() { echo "[$(date '+%Y-%m-%d %H:%M')] $*" >> "$RUN_LOG"; }
notify() { osascript -e "display notification \"$1\" with title \"Homehub beta\"" 2>/dev/null || true; }

say "run start"
PEEK=$(node scripts/ops/testflight-feedback.mjs --new --peek --out /tmp/homehub-feedback 2>&1)
if echo "$PEEK" | grep -q "NO_NEW_FEEDBACK"; then
  say "no new feedback"
  exit 0
fi

COUNT=$(echo "$PEEK" | grep -cE '^  “' || echo "?")
say "new feedback: $COUNT item(s) — triaging"

PROMPT="New TestFlight beta feedback arrived for Homehub. Triage it.

$PEEK

For each item: work out what is actually happening (read the code — this is the
homehub-v2 repo), assign a severity (S1 data loss/privacy/unusable, S2 core flow
broken or badly misleading, S3 confusing but workable, S4 cosmetic), and say what
the fix would be in one or two sentences. If an item is expected behaviour rather
than a bug, say so plainly and say what made it look like a bug.

Then append a dated section to docs/beta-feedback.md in the existing table format
(newest section first, under the '---'). Do not commit, do not push, do not
change any other file — the owner reviews the log before anything ships.

Be brief. She reads this as a product manager, not an engineer."

if claude -p "$PROMPT" --permission-mode acceptEdits >> "$RUN_LOG" 2>&1; then
  # Triage succeeded — NOW advance the ledger so these are not reported again.
  node scripts/ops/testflight-feedback.mjs --new --out /tmp/homehub-feedback > /dev/null 2>&1
  say "triaged $COUNT item(s); ledger advanced"
  notify "$COUNT new report(s) triaged — see docs/beta-feedback.md"
else
  say "TRIAGE FAILED — ledger left alone, will retry tomorrow"
  notify "New feedback arrived but triage failed. Check the log."
fi
