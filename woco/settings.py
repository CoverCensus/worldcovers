###################################################################################################
## WoCo Project - Configuration
## MPC: 2025/10/24
###################################################################################################
import os, sys

from datetime import datetime
from pathlib import Path

from decouple import config


###
# Build paths inside the project like this: BASE_DIR / 'subdir'.
###
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = "DUMMY-KEY-HERE-NO-FALSE-POSITIVES-NO-WHAMMY-NO-WHAMMY-STOP"

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config("DEBUG", default=True, cast=bool)
TESTING = "test" in sys.argv or "PYTEST_VERSION" in os.environ

ALLOWED_HOSTS = []
INTERNAL_IPS = [
    "127.0.0.1"
]

DJANGO_APP_HOSTNAME = config("DJANGO_APP_HOSTNAME", default="hellowoco.app")

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
    "import_export",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    "colorfield",
    "reversion",
    "reversion_compare",

    "common.apps.CommonConfig"
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
    "djangorestframework_camel_case.middleware.CamelCaseMiddleWare",
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
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": "woco",
        "TEST": {
            "NAME": "test_woco"
        },
        "OPTIONS": {
            "read_default_file": str(BASE_DIR / "mysql.cnf")
        }
    }
}

# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 4},
    }
]

# Authentication (provided by AllAuth)
SITE_ID = 1
ACCOUNT_LOGIN_METHODS = {"email", "username"}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'username*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = "none" if DEBUG or TESTING else "mandatory"
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
STATICFILES_DIRS = [
    BASE_DIR / "assets",
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

# REST Framework settings (if using API)
REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 100,
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    
    "DEFAULT_RENDERER_CLASSES": [
        "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
        "djangorestframework_camel_case.render.CamelCaseBrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "djangorestframework_camel_case.parser.CamelCaseJSONParser",
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
    "TITLE": "WorldCovers API",
    "DESCRIPTION": "WorldCovers REST interface for postmark and stampless cover data",
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
POSTMARK_IMAGE_MAX_WIDTH = 4000
POSTMARK_IMAGE_MAX_HEIGHT = 4000
POSTMARK_IMAGE_QUALITY = 95

# Logging Configuration
DJANGO_LOG_LEVEL = "DEBUG" if DEBUG else config("DJANGO_LOG_LEVEL", default="WARNING")
LOG_FILENAME = config("LOG_FILENAME", default="woco.log")
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
        "file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": BASE_DIR / "logs" / LOG_FILENAME,
            "when": "midnight",
            "interval": 1,
            "backupCount": 30,
            "formatter": "verbose",
            "encoding": "utf-8",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console", "file"],
            "level": DJANGO_LOG_LEVEL,
            "propagate": False,
        },
        "common": {  # Replace with your app name
            "handlers": ["console", "file"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# CORS (adjust for frontend)
CORS_ALLOWED_ORIGINS = [ 
    "http://localhost:8080", 
] if DEBUG else [ 
    f"https://{DJANGO_APP_HOSTNAME}/", 
]

# Security Settings (for production)
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

###################################################################################################
