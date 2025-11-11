###################################################################################################
## WoCo Project - WSGI Definition
## MPC: 2025/10/24
###################################################################################################
import os

from django.core.wsgi import get_wsgi_application


###
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "woco.settings")

application = get_wsgi_application()

###################################################################################################
