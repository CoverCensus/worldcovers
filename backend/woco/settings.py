###################################################################################################
## WoCo Project - Configuration
## MPC: 2025/10/24
###################################################################################################
import os
import sys

from datetime import datetime
from pathlib import Path

from decouple import config

from woco.site_role import derive_site_role, validate_site_role


###
# Build paths inside the project like this: BASE_DIR / 'subdir'.
###
BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
# Read from env (decouple). No default -- the app refuses to start if
# DJANGO_SECRET_KEY is missing, which is the correct behaviour for a
# secret. Generate a new value with './woco secretkey' from the repo root
# and put it in the repo-root .env (dev) or backend/.env (deployed hosts;
# written by deploy/provision.sh). decouple searches upward from this
# directory, so backend/.env wins when both exist.
SECRET_KEY = config("DJANGO_SECRET_KEY")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config("DEBUG", default=True, cast=bool)
TESTING = "test" in sys.argv or "PYTEST_VERSION" in os.environ

if TESTING:
    # The suite creates ~650 users per run in setUp() and never verifies a
    # password (every API test uses force_authenticate). Django's default
    # PBKDF2 at 1,000,000 iterations made those hashes ~110 s of a 137 s run.
    # Django's testing docs recommend MD5 for test settings; this applies only
    # under manage.py test / pytest (docs/issues.md #179).
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

INTERNAL_IPS = [
    "127.0.0.1",
    "localhost"
]

DJANGO_APP_HOSTNAME = config("DJANGO_APP_HOSTNAME", default="hellowoco.app")

# Product name shown in email subjects and bodies, the API schema and the admin
# header. The USPCS decided on 2026-10-23 that the catalog presents as "APMC"
# (Trello T98); the frontend keeps its own copy in src/constants/brand.ts.
SITE_NAME = "APMC"

# Which site this install is (Trello T84). The SPA is the same bundle on both
# sites, so it asks GET /api/v2/site/ and the backend answers from these. The
# role is derived from the hostname (see woco/site_role.py), so neither server
# needs a new .env entry; WOCO_SITE_ROLE overrides it with exactly "production"
# or "staging" and anything else refuses to start.
WOCO_PRODUCTION_URL = config("WOCO_PRODUCTION_URL", default="https://hellowoco.app")
WOCO_SITE_ROLE = validate_site_role(
    config(
        "WOCO_SITE_ROLE",
        default=derive_site_role(DJANGO_APP_HOSTNAME, WOCO_PRODUCTION_URL),
    )
)

ALLOWED_HOSTS = [
    DJANGO_APP_HOSTNAME, 
    f"www.{DJANGO_APP_HOSTNAME}",
    *INTERNAL_IPS
]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",

    "django_admin_logs",
    "django_extensions",
    "allauth",
    "allauth.account",
    "allauth.headless",
    "import_export",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    "colorfield",
    "reversion",
    "reversion_compare",

    "common.apps.CommonConfig",
]
if not TESTING:
    # django_debug_toolbar cannot be present in automated testing
    INSTALLED_APPS = [
        *INSTALLED_APPS,
        "debug_toolbar"
    ]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",

    "allauth.account.middleware.AccountMiddleware",
    "reversion.middleware.RevisionMiddleware",
]
if not TESTING:
    # django_debug_toolbar cannot be present in automated testing
    MIDDLEWARE = [
        "debug_toolbar.middleware.DebugToolbarMiddleware",
        *MIDDLEWARE
    ]

ROOT_URLCONF = "woco.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        }
    }
]

WSGI_APPLICATION = "woco.wsgi.application"

# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases
_db_name = config("DB_NAME", default="worldcovers")
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": _db_name,
        "TEST": {
            "NAME": f"test_{_db_name}"
        },
        "OPTIONS": {
            "read_default_file": str(REPO_ROOT / "mysql.cnf")
        }
    }
}

# MariaDB cannot enforce partial unique constraints, so allauth's
# account.EmailAddress model triggers models.W036 on every manage.py
# check. Uniqueness is still enforced in application code by allauth.
SILENCED_SYSTEM_CHECKS = ["models.W036"]

# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators
# Allauth and the password APIs also apply common.passwords' shared rules.
# Keep the Django minimum for admin password forms.
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    }
]

# Authentication (provided by AllAuth)
SITE_ID = 1
ACCOUNT_LOGIN_METHODS = {"email", "username"}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = 3
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED = False
ACCOUNT_CONFIRM_EMAIL_ON_GET = False
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = False
ACCOUNT_SIGNUP_FORM_CLASS = "common.account_adapter.SignupForm"
ACCOUNT_ADAPTER = "common.account_adapter.AccountAdapter"
# Subjects already carry the product name; without this allauth prepends
# "[<Site.name>] " from django.contrib.sites (SITE_ID=1, "example.com").
ACCOUNT_EMAIL_SUBJECT_PREFIX = ""
HEADLESS_CLIENTS = ("browser",)
HEADLESS_ONLY = True
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

LOGIN_REDIRECT_URL = '/'
ACCOUNT_LOGOUT_REDIRECT_URL = '/'

# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "static"

# React SPA (frontend) - built output served as site home
# Put your React app in frontend/ and run `npm run build`; index.html + /assets/ served from here
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

STATICFILES_DIRS = [
    FRONTEND_DIST
]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Admin Logging Settings
DJANGO_ADMIN_LOGS_DELETETABLE = True

# Don't clutter production logs with unchanged object saves
DJANGO_ADMIN_LOGS_IGNORE_UNCHANGED = False if DEBUG else True 

# Reversion pruning policy (used by the prune_revisions management command).
# Delete version rows older than RETENTION_DAYS, but always keep the most
# recent KEEP_PER_OBJECT versions for every object.
REVERSION_PRUNE_RETENTION_DAYS = 180
REVERSION_PRUNE_KEEP_PER_OBJECT = 3

# REST Framework settings (if using API)
REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "woco.pagination.PageSizePagination",
    "PAGE_SIZE": 10,
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter"
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema"
}

# API Documentation
SPECTACULAR_SETTINGS = {
    "TITLE": f"{SITE_NAME} API",
    "DESCRIPTION": f"{SITE_NAME} REST interface for postal marking and stampless cover data",
    "VERSION": "2.0.0",
    "SWAGGER_UI_SETTINGS": {
        "supportedSubmitMethods": [],
        "tryItOutEnabled": False,
        "persistAuthorization": False,
        "displayAuthSelector": False
    },
    "SERVE_PERMISSIONS": [],
    "SERVE_AUTHENTICATION": []
}

# File Upload Settings
FILE_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100MB

# Image Processing Settings
MARKING_IMAGE_MAX_WIDTH = 4000
MARKING_IMAGE_MAX_HEIGHT = 4000
MARKING_IMAGE_QUALITY = 95

# Logging Configuration
# Tests run at WARNING: DEBUG is True at import time locally and in CI, and the
# django.db.backends.schema logger is not DEBUG-gated, so every migration's DDL
# and every expected 4xx used to be written to the console and woco.log on each
# test run (docs/issues.md #179).
DJANGO_LOG_LEVEL = "DEBUG" if DEBUG and not TESTING else config("DJANGO_LOG_LEVEL", default="WARNING")
LOG_FILENAME = config("LOG_FILENAME", default="woco.log")
LOG_DIR = BASE_DIR / "logs"
LOG_PATH = LOG_DIR / LOG_FILENAME


def _logging_can_use_file():
    """Return True if we can create/append to the log file (avoids PermissionError at startup)."""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a"):
            pass
        return True
    except Exception:
        return False


_use_file_handler = _logging_can_use_file()
_log_handlers = ["console"]
_file_handler_config = {}
if _use_file_handler:
    _log_handlers.append("file")
    _file_handler_config["file"] = {
        "class": "logging.handlers.TimedRotatingFileHandler",
        "filename": str(LOG_PATH),
        "when": "midnight",
        "interval": 1,
        "backupCount": 30,
        "formatter": "verbose",
        "encoding": "utf-8",
    }

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        **_file_handler_config,
    },
    "loggers": {
        "django": {
            "handlers": _log_handlers,
            "level": DJANGO_LOG_LEVEL,
            "propagate": False,
        },
        "common": {
            "handlers": _log_handlers,
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# CORS (adjust for frontend). Session auth requires credentials.
CORS_ALLOW_CREDENTIALS = True
# 8080 = common dev port; 5173 = Vite default
CORS_ALLOWED_ORIGINS = [
    "http://localhost:8080",
    "http://localhost:8000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    f"https://{DJANGO_APP_HOSTNAME}"
]

# CSRF: allow frontend origins so cookie-based auth works with same-host.
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    f"https://{DJANGO_APP_HOSTNAME}",
]

# Security Settings (for production)
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Email configuration (used for password reset and notifications)
# Default to real SMTP so staging behaves like production unless explicitly overridden.
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", cast=int, default=587)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", cast=bool, default=True)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", cast=bool, default=False)
DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default=f"{SITE_NAME} <no-reply@{DJANGO_APP_HOSTNAME}>",
)
# Email(s) to notify when a user requests login access. Comma-separated or single.
# Falls back to ADMINS or staff users if not set.
LOGIN_REQUEST_ADMIN_EMAIL = config("LOGIN_REQUEST_ADMIN_EMAIL", default="")

###################################################################################################

FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default=f"https://{DJANGO_APP_HOSTNAME}")
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": f"{FRONTEND_BASE_URL.rstrip('/')}/verify-email?key={{key}}",
    "account_signup": f"{FRONTEND_BASE_URL.rstrip('/')}/auth",
    "account_reset_password": f"{FRONTEND_BASE_URL.rstrip('/')}/auth",
}
