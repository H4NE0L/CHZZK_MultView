#!/usr/bin/env python3
"""Create the unpacked-extension ZIP without tests or development files."""
import json
import sys
import zipfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / f"CZ-Control-Room-v{manifest['version']}.zip"
output.parent.mkdir(parents=True, exist_ok=True)
files = [root / name for name in ['manifest.json', 'README.md', 'CHANGELOG.md']]
files += sorted(p for folder in ['src', 'assets'] for p in (root / folder).rglob('*') if p.is_file())
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, file.relative_to(root).as_posix())
print(f'{output} ({len(files)} files)')
