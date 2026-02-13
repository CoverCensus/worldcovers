###################################################################################################
## Set a user's password (e.g. after forgot or to fix login).
###################################################################################################
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Set password for a user by username. Ensures the user is active."

    def add_arguments(self, parser):
        parser.add_argument("username", help="Username of the user to update")
        parser.add_argument("password", help="New password to set")

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"]
        password = options["password"]

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"User with username '{username}' not found."))
            return

        user.set_password(password)
        user.is_active = True
        user.save(update_fields=["password", "is_active"])
        self.stdout.write(self.style.SUCCESS(f"Password updated for user '{username}'."))
