"""Prove that account limits survive a change of worker process."""
import os
from pathlib import Path
import subprocess
import sys

from allauth.core import ratelimit
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import RequestFactory, TransactionTestCase, override_settings


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache",
                        "LOCATION": "test_account_rate_cache"}},
    ACCOUNT_RATE_LIMITS={"login": "1/m/ip"},
)
class SharedAccountLimitTests(TransactionTestCase):
    def test_a_second_worker_observes_the_first_workers_limit(self):
        call_command("createcachetable", verbosity=0)
        try:
            cache.clear()
            request = RequestFactory().post("/", REMOTE_ADDR="127.0.0.1",
                                           HTTP_X_FORWARDED_FOR="192.0.2.1")
            self.assertTrue(ratelimit.consume(request, action="login"))
            script = '''
import sys
import django
from django.conf import settings
settings.DATABASES["default"]["NAME"] = sys.argv[1]
settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache",
                               "LOCATION": "test_account_rate_cache"}}
settings.ACCOUNT_RATE_LIMITS = {"login": "1/m/ip"}
django.setup()
from allauth.core import ratelimit
from django.test import RequestFactory
factory = RequestFactory()
for ip in ("192.0.2.1", "198.51.100.2"):
    request = factory.post("/", REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="203.0.113.5, " + ip)
    print(ratelimit.consume(request, action="login"))
'''
            result = subprocess.run(
                [sys.executable, "-c", script, connection.settings_dict["NAME"]],
                cwd=Path(__file__).resolve().parents[2],
                env={**os.environ, "DJANGO_SETTINGS_MODULE": "woco.settings"},
                capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), ["False", "True"])
        finally:
            with connection.cursor() as cursor:
                cursor.execute("DROP TABLE IF EXISTS test_account_rate_cache")
