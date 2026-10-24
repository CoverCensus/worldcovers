###################################################################################################
## Set a user's password (e.g. after forgot or to fix login).
###################################################################################################
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from common.passwords import validate_password_strength


class Command(BaseCommand):
    help = "Set a user's password without changing account activation or verification."

    def add_arguments(self, parser):
        parser.add_argument("username", help="Username of the user to update")
        parser.add_argument("password", help="New password to set")

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"]
        password = options["password"]
        error = validate_password_strength(password)
        if error:
            raise CommandError(error)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError("User not found.")

        user.set_password(password)
        user.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS(f"Password updated for user '{username}'."))
