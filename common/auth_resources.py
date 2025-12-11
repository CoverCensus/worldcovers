###################################################################################################
## WoCo Commons - Resource classes for Auth
## MPC: 2025/10/24
###################################################################################################
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission

from import_export import resources, fields
from import_export.widgets import ForeignKeyWidget, ManyToManyWidget

from allauth.account.models import EmailAddress



User = get_user_model()


class UserResource(resources.ModelResource):
    groups = fields.Field(
        column_name="groups",
        attribute="groups",
        widget=ManyToManyWidget(Group, field="name", separator=";"),
    )
    user_permissions = fields.Field(
        column_name="user_permissions",
        attribute="user_permissions",
        widget=ManyToManyWidget(Permission, field="codename", separator=";"),
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "password",      # hashed password
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "last_login",
            "date_joined",
            "groups",
            "user_permissions",
        )
        import_id_fields = ("id", "username")


class GroupResource(resources.ModelResource):
    permissions = fields.Field(
        column_name="permissions",
        attribute="permissions",
        widget=ManyToManyWidget(
            Permission,
            field="codename",   # will use codename strings like "add_user"
            separator=";",
        ),
    )

    class Meta:
        model = Group
        fields = ("id", "name", "permissions")
        import_id_fields = ("id", "name")



class EmailAddressResource(resources.ModelResource):
    """
    Backup/restore for django-allauth email addresses.
    We link to users by username for portability.
    """

    user = fields.Field(
        column_name="user",
        attribute="user",
        widget=ForeignKeyWidget(User, "username"),  # map by username
    )

    class Meta:
        model = EmailAddress
        fields = (
            "id",
            "user",
            "email",
            "verified",
            "primary",
        )
        import_id_fields = ("id", "email")

###################################################################################################
