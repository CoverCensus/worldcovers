"""Apply current-address verification after credentials are checked."""
from allauth.account.stages import EmailVerificationStage

from common.account_access import has_legacy_access


class ContributorEmailVerificationStage(EmailVerificationStage):
    def handle(self):
        if self.login.user is not None and has_legacy_access(self.login.user):
            return None, True
        # A verified former address does not verify the current account address.
        if self.login.user is not None:
            self.login.email = self.login.user.email
        return super().handle()
