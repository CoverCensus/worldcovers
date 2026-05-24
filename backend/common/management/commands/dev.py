"""'woco dev' -- local launcher for the Vite + Django dev session.

Behavior mirrors the old run.sh (now removed) and is driven by Django's
DEBUG setting:

  DEBUG=True   Start Vite dev server on :8080 + Django on :8000 (HMR).
               Open http://localhost:8080
  DEBUG=False  Build the frontend (frontend/dist/), then serve via
               Django only. Open http://127.0.0.1:8000

Ctrl+C tears down both processes. If either child exits on its own,
the other is terminated too.
"""
import os
import signal
import subprocess
import sys

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run the local dev session (Vite + Django, or build + Django)."

    def handle(self, *args, **options):
        repo_root = settings.REPO_ROOT
        frontend = repo_root / "frontend"

        if not settings.DEBUG:
            self.stdout.write(
                "DEBUG=False detected. Building frontend (frontend/dist/)..."
            )
            subprocess.check_call(["npm", "run", "build"], cwd=str(frontend))
            self.stdout.write("Starting Django at http://127.0.0.1:8000/ ...")
            os.chdir(str(repo_root))
            os.execvp(
                sys.executable,
                [sys.executable, "backend/manage.py", "runserver"],
            )
            return

        self.stdout.write(
            "DEBUG=True. Starting Vite dev server at "
            "http://localhost:8080/ (HMR)..."
        )
        vite = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(frontend),
            start_new_session=True,
        )

        self.stdout.write(
            "Starting Django at http://127.0.0.1:8000/ (proxied by Vite)..."
        )
        django = subprocess.Popen(
            [sys.executable, "backend/manage.py", "runserver"],
            cwd=str(repo_root),
            start_new_session=True,
        )

        children = [vite, django]

        def shutdown(signum, frame):
            self.stdout.write("\nShutting down...")
            for child in children:
                if child.poll() is None:
                    try:
                        os.killpg(os.getpgid(child.pid), signal.SIGTERM)
                    except ProcessLookupError:
                        pass

        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)

        try:
            pid, _ = os.wait()
        except ChildProcessError:
            return
        except KeyboardInterrupt:
            shutdown(signal.SIGINT, None)
            pid = None

        for child in children:
            if pid is not None and child.pid == pid:
                continue
            if child.poll() is None:
                try:
                    os.killpg(os.getpgid(child.pid), signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(os.getpgid(child.pid), signal.SIGKILL)

        sys.exit(0)
