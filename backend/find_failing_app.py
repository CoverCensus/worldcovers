#!/usr/bin/env python3
"""
Find which INSTALLED_APP fails to import during Django startup.
Run from backend/ (same dir as manage.py):

  cd /srv/woco/backend && python find_failing_app.py

Prints which app failed and the full traceback.
"""
import importlib
import os
import sys

# Ensure we can import woco.settings
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "woco.settings")

# Load settings module only (does not run Django app loading)
import woco.settings as settings_module
apps = getattr(settings_module, "INSTALLED_APPS", [])

print(f"Checking {len(apps)} apps...")

for name in apps:
    try:
        # Django loads the module containing the AppConfig (e.g. "common.apps" for "common.apps.CommonConfig")
        if ".apps." in name and name.split(".")[-1].endswith("Config"):
            mod_path = name.rsplit(".", 1)[0]  # common.apps.CommonConfig -> common.apps
        else:
            mod_path = name  # django.contrib.admin -> django.contrib.admin
        importlib.import_module(mod_path)
        print(f"  OK: {name}")
    except Exception as e:
        print(f"  FAIL: {name}", file=sys.stderr)
        print(f"  Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

print("All apps imported successfully.")
