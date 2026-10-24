"""WorldCovers policy at allauth's supported extension points."""
from django import forms
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError

from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.stages import EmailVerificationStage

from common.account_access import has_legacy_access
from common.passwords import validate_password_strength


class SignupForm(forms.Form):
    first_name = forms.CharField(max_length=150)
    last_name = forms.CharField(max_length=150)

    def signup(self, request, user) -> None:
        user.first_name = self.cleaned_data["first_name"]
        user.last_name = self.cleaned_data["last_name"]
        user.save(update_fields=["first_name", "last_name"])
        group, _ = Group.objects.get_or_create(name="Contributors")
        user.groups.add(group)


class ContributorEmailVerificationStage(EmailVerificationStage):
    def handle(self):
        if self.login.user is not None and has_legacy_access(self.login.user):
            return None, True
        return super().handle()


class AccountAdapter(DefaultAccountAdapter):
    def clean_password(self, password, user=None):
        password = super().clean_password(password, user=user)
        error = validate_password_strength(password)
        if error:
            raise ValidationError(error)
        return password

    def get_login_stages(self):
        return [
            "common.account_adapter.ContributorEmailVerificationStage"
            if stage == "allauth.account.stages.EmailVerificationStage" else stage
            for stage in super().get_login_stages()
        ]
