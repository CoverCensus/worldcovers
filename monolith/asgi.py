###################################################################################################
## Monolith Project - ASGI Definition
## MPC: 2025/10/24
###################################################################################################
import os

from django.core.asgi import get_asgi_application


###
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "monolith.settings")

application = get_asgi_application()

###################################################################################################
