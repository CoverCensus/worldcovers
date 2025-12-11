###################################################################################################
## WoCo Commons - Application Settings
## MPC: 2025/10/24
###################################################################################################
from django.apps import AppConfig
from django.apps import apps
import reversion


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "common"
    verbose_name = "Commons"

    def ready(self):
        # Auto-register all non-abstract models in this app with django-reversion
        app_config = apps.get_app_config("common")

        for model in app_config.get_models():
            if model._meta.abstract:
                continue
            if not reversion.is_registered(model):
                reversion.register(model)

###################################################################################################
