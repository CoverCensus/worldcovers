###################################################################################################
## WoCo Commons - Signals
## User activation: send email when admin sets user Active (True)
###################################################################################################
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models.signals import pre_save
from django.dispatch import receiver


User = get_user_model()


@receiver(pre_save, sender=User)
def send_activation_email_when_user_activated(sender, instance, **kwargs):
    """
    When a user is changed from inactive to active in Django admin (or created as active),
    send them an email so they know they can sign in.
    """
    # New user being created with Active checked and email set
    if not instance.pk:
        if instance.is_active and (instance.email or "").strip():
            _send_activation_email(instance.email.strip())
        return

    # Existing user: only send when transitioning inactive -> active
    try:
        previous = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    if not previous.is_active and instance.is_active and (instance.email or "").strip():
        _send_activation_email(instance.email.strip())


def _send_activation_email(to_email):
    """Send 'Your account is now active' email to the given address."""
    frontend_base = getattr(settings, "FRONTEND_BASE_URL", None) or f"https://{settings.DJANGO_APP_HOSTNAME}"
    if not frontend_base.startswith(("http://", "https://")):
        frontend_base = f"https://{frontend_base.lstrip('/')}"
    login_url = f"{frontend_base.rstrip('/')}/auth"

    subject = "Your WorldCovers Account Is Now Active"
    message_lines = [
        "Hello,",
        "",
        "Good news — your WorldCovers account has just been activated.",
        "",
        f"You can now sign in here: {login_url}",
        "",
        "If you did not expect this change, please contact the site administrator.",
    ]
    message = "\n".join(message_lines)

    # HTML version with a clickable login link/button
    html_message = f"""
            <p>Hello,</p>

            <p>Good news! Your <strong>WorldCovers</strong> account has been successfully activated.</p>

            <p>You can now sign in using the link below:</p>

            <p>
            <a href="{login_url}" 
                style="display:inline-block;padding:10px 16px;margin-top:8px;background-color:#7b4b4b;color:#ffffff;text-decoration:none;border-radius:4px;">
                Sign in to WorldCovers
            </a>
            </p>

            <p>If you did not expect this change or believe this was done in error, please contact the site administrator immediately.</p>

            <p>Best regards,<br>
            WorldCovers Team</p>
            """

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or "no-reply@worldcovers.org"
    send_mail(
        subject,
        message,
        from_email,
        [to_email],
        fail_silently=False,
        html_message=html_message,
    )

###################################################################################################
