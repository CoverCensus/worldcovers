###################################################################################################
## WoCo Commons - Model Filters
## MPC: 2025/11/15
###################################################################################################
import django_filters
from django.db.models import Q

from .models import (
    Postmark,
    AdministrativeUnit,
    AdministrativeUnitIdentity,
    Postcover,
)

# ================================================================================================
# POSTMARK FILTERS
# ================================================================================================


class PostmarkListFilter(django_filters.FilterSet):
    """
    List-view filters for Postmark (used by PostmarkViewSet list action).
    Only applies a filter when the param has a real value.
    """
    class Meta:
        model = Postmark
        fields = {}

    is_manuscript = django_filters.CharFilter(method='filter_is_manuscript', label='Is manuscript')
    color = django_filters.CharFilter(method='filter_by_color', label='Color (name)')
    state = django_filters.CharFilter(method='filter_by_state_name', label='State (name or abbreviation)')
    town = django_filters.CharFilter(
        field_name='post_office__name',
        lookup_expr='icontains',
        label='Town (post office name contains)',
    )
    shape = django_filters.NumberFilter(
        field_name='shape',
        lookup_expr='exact',
        label='Shape id',
    )
    has_images = django_filters.CharFilter(method='filter_has_images', label='Has images')

    @staticmethod
    def filter_is_manuscript(queryset, name, value):
        if not value or not str(value).strip():
            return queryset
        raw = str(value).strip().lower()
        if raw == 'true':
            return queryset.filter(is_manuscript=True)
        if raw == 'false':
            return queryset.exclude(is_manuscript=True)
        return queryset

    @staticmethod
    def filter_by_color(queryset, name, value):
        if not value or not str(value).strip():
            return queryset
        return queryset.filter(color__name__iexact=str(value).strip())

    @staticmethod
    def filter_by_state_name(queryset, name, value):
        if not value or not str(value).strip():
            return queryset
        value = str(value).strip()
        return queryset.filter(
            Q(post_office__region__name__iexact=value)
            | Q(post_office__region__abbrev__iexact=value)
        )

    @staticmethod
    def filter_has_images(queryset, name, value):
        if not value or str(value).strip().lower() != 'true':
            return queryset
        return queryset.filter(images__isnull=False).distinct()


class PostmarkFilter(django_filters.FilterSet):
    """Advanced filters for Postmark objects."""

    q = django_filters.CharFilter(method="filter_q", label="Search (code, catalog text)")
    state = django_filters.CharFilter(method="filter_by_state", label="Administrative Unit (name or abbreviation)")

    color = django_filters.CharFilter(field_name="color__name", lookup_expr="iexact", label="Color")

    value_min = django_filters.NumberFilter(field_name="valuations__amt", lookup_expr="gte", label="Minimum Valuation")
    value_max = django_filters.NumberFilter(field_name="valuations__amt", lookup_expr="lte", label="Maximum Valuation")

    has_images = django_filters.BooleanFilter(method="filter_has_images", label="Has Images")

    class Meta:
        model = Postmark
        fields = ["is_manuscript", "shape", "lettering", "color", "date_type", "date_fmt"]

    def filter_q(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(
            Q(code__icontains=value)
            | Q(catalog_txt__icontains=value)
            | Q(inscription_txt__icontains=value)
        )

    def filter_by_state(self, queryset, name, value):
        if not value:
            return queryset
        value = str(value).strip()
        return queryset.filter(
            Q(post_office__region__name__iexact=value)
            | Q(post_office__region__abbrev__iexact=value)
        )

    def filter_has_images(self, queryset, name, value):
        if value is None:
            return queryset
        if value:
            return queryset.filter(images__isnull=False).distinct()
        return queryset.filter(images__isnull=True).distinct()


# ================================================================================================
# POSTCOVER FILTERS
# ================================================================================================


class PostcoverFilter(django_filters.FilterSet):
    """Advanced filter for postcovers."""

    postcover_key = django_filters.CharFilter(
        lookup_expr="icontains",
        label="Postcover Key (contains)",
    )

    description = django_filters.CharFilter(
        lookup_expr="icontains",
        label="Description (contains)",
    )

    # Filter by presence of a specific postmark on the cover
    has_postmark = django_filters.NumberFilter(
        field_name="postcover_postmarks__postmark",
        label="Has Postmark (ID)",
    )

    # Filter by number of postmarks on the cover
    postmark_count_min = django_filters.NumberFilter(
        method="filter_postmark_count_min",
        label="Minimum Number of Postmarks",
    )
    postmark_count_max = django_filters.NumberFilter(
        method="filter_postmark_count_max",
        label="Maximum Number of Postmarks",
    )

    class Meta:
        model = Postcover
        # `condition` no longer exists on Postcover in the updated model
        fields = ["owner_user"]

    def filter_postmark_count_min(self, queryset, name, value):
        """Filter by minimum number of postmarks on the cover."""
        from django.db.models import Count

        return (
            queryset.annotate(num_postmarks=Count("postcover_postmarks"))
            .filter(num_postmarks__gte=value)
        )

    def filter_postmark_count_max(self, queryset, name, value):
        """Filter by maximum number of postmarks on the cover."""
        from django.db.models import Count

        return (
            queryset.annotate(num_postmarks=Count("postcover_postmarks"))
            .filter(num_postmarks__lte=value)
        )


###################################################################################################
