#!/usr/bin/env python3
"""Export the OpenAPI schema without starting the server.

    python scripts/export_openapi.py [output-path]

Production disables /openapi.json and /docs; publish this artifact to an
authenticated developer portal instead.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys

os.environ.setdefault("SECRET_KEY", "openapi-export-only-not-a-real-secret-000000000000")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("REDIS_HOST", "localhost")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))


def main() -> int:
    from app.main import app

    output = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/openapi.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
