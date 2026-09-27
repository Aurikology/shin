"""One-off acceptance check for rows-usda.jsonl, counted from the OUTPUT file
itself, never from prepare_rows_usda.py's own print statements."""
import json
import sys
from collections import Counter

PATH = sys.argv[1] if len(sys.argv) > 1 else "data/rows-usda.jsonl"

lines = 0
codes = Counter()
with_name = 0
with_size = 0
bad_json = 0

with open(PATH, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        lines += 1
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            bad_json += 1
            continue
        codes[r.get("code")] += 1
        if r.get("name"):
            with_name += 1
        if r.get("size_value") is not None:
            with_size += 1

print(f"lines written        {lines}")
print(f"bad json lines       {bad_json}")
print(f"distinct codes       {len(codes)}")
dupes = {k: v for k, v in codes.items() if v > 1}
print(f"codes appearing >1x  {len(dupes)}")
if dupes:
    print("  sample dupes:", list(dupes.items())[:5])
print(f"with a name          {with_name}  ({100*with_name/max(lines,1):.1f}%)")
print(f"with a size          {with_size}  ({100*with_size/max(lines,1):.1f}%)")
