"""Export the database to site/data/data.json.  Add --push to commit and push it too.

    python scripts/export_site.py [--push]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import config, export  # noqa: E402
from bot.db import DB  # noqa: E402

if __name__ == "__main__":
    data = export.build(DB(config.load().db_path))
    changed = export.write_and_push(data) if "--push" in sys.argv else export.write(data)
    print(f"{len(data['watched'])} watched, {len(data['suggestions'])} suggestions, "
          f"{len(data['people'])} people -> {export.OUT} ({'updated' if changed else 'no changes'})")
