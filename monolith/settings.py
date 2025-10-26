###################################################################################################
## Monolith Project - Configuration
## MPC: 2025/10/24
###################################################################################################
import os, sys

from pathlib import Path


###
# Build paths inside the project like this: BASE_DIR / 'subdir'.
###
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = "DUMMY-KEY-HERE-NO-FALSE-POSITIVES-NO-WHAMMY-NO-WHAMMY-STOP"

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

TESTING = "test" in sys.argv or "PYTEST_VERSION" in os.environ

ALLOWED_HOSTS = []

INTERNAL_IPS = [
    "127.0.0.1"
]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "django_admin_logs"
]
if not TESTING:
    # django_debug_toolbar cannot be present in automated testing
    INSTALLED_APPS = [
        *INSTALLED_APPS,
        "debug_toolbar"
    ]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware"
]
if not TESTING:
    # django_debug_toolbar cannot be present in automated testing
    MIDDLEWARE = [
        "debug_toolbar.middleware.DebugToolbarMiddleware",
        *MIDDLEWARE
    ]

ROOT_URLCONF = "monolith.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        }
    }
]

WSGI_APPLICATION = "monolith.wsgi.application"

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
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    }
]

# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/
STATIC_URL = "static/"

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Admin Logging Settings
DJANGO_ADMIN_LOGS_DELETETABLE = True

# Don't clutter production logs with unchanged object saves
DJANGO_ADMIN_LOGS_IGNORE_UNCHANGED = False if DEBUG else True 

###################################################################################################
