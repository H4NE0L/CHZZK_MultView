#!/usr/bin/env python3
"""Compatibility entry point; always package the compiled extension."""
import subprocess
import sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
subprocess.run(['node', 'scripts/build.mjs'], cwd=root, check=True)
subprocess.run(['node', 'scripts/package.mjs', *sys.argv[1:]], cwd=root, check=True)
