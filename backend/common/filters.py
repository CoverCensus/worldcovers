###################################################################################################
## WoCo Commons - Model Filters
## MPC: 2025/11/15
###################################################################################################
import django_filters
from django.db.models import Q

from .models import (
    Postmark,
    PostalFacilityIdentity,
    AdministrativeUnit,
    AdministrativeUnitIdentity,
    JurisdictionalAffiliation,
    PostmarkPublication,
    Postcover,
)

# ================================================================================================
# POSTMARK FILTERS
# ================================================================================================


class PostmarkListFilter(django_filters.FilterSet):
    """
    List-view filters for Postmark (used by PostmarkViewSet list action).
    Only applies a filter when the param has a real value (ignore empty, "unknown", etc.).
    """
    class Meta:
        model = Postmark
        fields = {
            'postal_facility_identity': ['exact'],
            'postmark_shape': ['exact'],
            'lettering_style': ['exact'],
            'framing_style': ['exact'],
            'rate_location': ['exact'],
            'rate_value': ['exact', 'icontains'],
        }

    # Only filter when value is "true" or "false"; ignore "unknown", empty, or other values.
    is_manuscript = django_filters.CharFilter(method='filter_is_manuscript', label='Is manuscript')

    # Filter by color name: same source as list API's colorsDisplay (postmark_colors -> color.color_name).
    # Frontend sends ?color=black or ?color=Black (iexact so case doesn't matter).
    color = django_filters.CharFilter(method='filter_by_color', label='Color (name)')

    # State: match by state name or abbreviation (current identity). Frontend sends ?state=Iowa.
    state = django_filters.CharFilter(method='filter_by_state_name', label='State (name or abbreviation)')

    # Town: match facility name (same as list API "town" display). Frontend sends ?town=...
    town = django_filters.CharFilter(
        field_name='postal_facility_identity__facility_name',
        lookup_expr='icontains',
        label='Town (facility name contains)',
    )

    # Date range: from PostmarkDatesSeen. Use method filters so we can .distinct() (postmark can have multiple dates_seen).
    earliest_use_year_min = django_filters.NumberFilter(method='filter_earliest_year_min', label='Earliest use year (min)')
    latest_use_year_max = django_filters.NumberFilter(method='filter_latest_year_max', label='Latest use year (max)')

    # Images only: when true, restrict to postmarks that have at least one image. Frontend sends ?has_images=true.
    has_images = django_filters.CharFilter(method='filter_has_images', label='Has images')

    @staticmethod
    def filter_is_manuscript(queryset, name, value):
        if not value or not str(value).strip():
            return queryset
        raw = str(value).strip().lower()
        if raw == 'true':
            return queryset.filter(is_manuscript=True)
        if raw == 'false':
            return queryset.filter(is_manuscript=False)
        return queryset  # "unknown" or anything else: do not filter by is_manuscript

    @staticmethod
    def filter_by_color(queryset, name, value):
        if not value or not str(value).strip():
            return queryset
        return queryset.filter(
            postmark_colors__color__color_name__iexact=str(value).strip()
        ).distinct()

    @staticmethod
    def filter_by_state_name(queryset, name, value):
        """Filter by state name or abbreviation (current identity)."""
        if not value or not str(value).strip():
            return queryset
        value = str(value).strip()
        unit_ids = AdministrativeUnitIdentity.objects.filter(
            effective_to_date__isnull=True
        ).filter(
            Q(unit_name__iexact=value) | Q(unit_abbreviation__iexact=value)
        ).values_list('administrative_unit_id', flat=True).distinct()
        if not unit_ids:
            return queryset.none()
        return queryset.filter(state_id__in=unit_ids)

    @staticmethod
    def filter_earliest_year_min(queryset, name, value):
        if value is None:
            return queryset
        try:
            year = int(value)
        except (TypeError, ValueError):
            return queryset
        return queryset.filter(
            dates_seen__earliest_date_seen__year__gte=year
        ).distinct()

    @staticmethod
    def filter_latest_year_max(queryset, name, value):
        if value is None:
            return queryset
        try:
            year = int(value)
        except (TypeError, ValueError):
            return queryset
        return queryset.filter(
            dates_seen__latest_date_seen__year__lte=year
        ).distinct()

    @staticmethod
    def filter_has_images(queryset, name, value):
        """When value is 'true', only postmarks that have at least one image. Ignore other values."""
        if not value or str(value).strip().lower() != 'true':
            return queryset
        return queryset.filter(images__isnull=False).distinct()


class PostmarkFilter(django_filters.FilterSet):
    """
    Advanced filters for Postmark objects.
    Updated to align with the new PostalFacilityIdentity / JurisdictionalAffiliation
    model structure.
    """

    # Free-text search across key fields
    q = django_filters.CharFilter(
        method="filter_q",
        label="Search (key, facility name, rate, notes)",
    )

    # Location / facility filters
    facility_name = django_filters.CharFilter(
        field_name="postal_facility_identity__facility_name",
        lookup_expr="icontains",
        label="Facility Name (contains)",
    )
    facility_reference = django_filters.CharFilter(
        field_name="postal_facility_identity__postal_facility__reference_code",
        lookup_expr="icontains",
        label="Facility Reference Code (contains)",
    )

    # Administrative unit / jurisdiction filter
    state = django_filters.CharFilter(
        method="filter_by_state",
        label="Administrative Unit (name or abbreviation)",
    )

    # Date usage ranges (from PostmarkDatesSeen)
    earliest_use_year_min = django_filters.NumberFilter(
        field_name="dates_seen__earliest_date_seen__year",
        lookup_expr="gte",
        label="Earliest Use Year (minimum)",
    )
    earliest_use_year_max = django_filters.NumberFilter(
        field_name="dates_seen__earliest_date_seen__year",
        lookup_expr="lte",
        label="Earliest Use Year (maximum)",
    )
    latest_use_year_min = django_filters.NumberFilter(
        field_name="dates_seen__latest_date_seen__year",
        lookup_expr="gte",
        label="Latest Use Year (minimum)",
    )
    latest_use_year_max = django_filters.NumberFilter(
        field_name="dates_seen__latest_date_seen__year",
        lookup_expr="lte",
        label="Latest Use Year (maximum)",
    )

    # Color filter (via PostmarkColor -> Color)
    color = django_filters.CharFilter(
        field_name="postmark_colors__color__color_name",
        lookup_expr="iexact",
        label="Color",
    )

    # Valuation filters
    value_min = django_filters.NumberFilter(
        field_name="valuations__estimated_value",
        lookup_expr="gte",
        label="Minimum Valuation",
    )
    value_max = django_filters.NumberFilter(
        field_name="valuations__estimated_value",
        lookup_expr="lte",
        label="Maximum Valuation",
    )

    # Images present / absent
    has_images = django_filters.BooleanFilter(
        method="filter_has_images",
        label="Has Images",
    )

    class Meta:
        model = Postmark
        fields = [
            "postal_facility_identity",
            "postmark_shape",
            "lettering_style",
            "framing_style",
            "date_format",
            "rate_location",
            "rate_value",
            "is_manuscript",
        ]

    # ---- custom filter methods ---------------------------------------------------------------

    def filter_q(self, queryset, name, value):
        """Free-text search across key postmark fields."""
        if not value:
            return queryset
        return queryset.filter(
            Q(postmark_key__icontains=value)
            | Q(postal_facility_identity__facility_name__icontains=value)
            | Q(rate_value__icontains=value)
            | Q(other_characteristics__icontains=value)
        )

    def filter_by_state(self, queryset, name, value):
        """
        Filter postmarks by administrative unit (state/province/etc),
        using JurisdictionalAffiliation -> PostalFacilityIdentity.
        """
        from datetime import date

        if not value:
            return queryset

        # Find administrative units by abbreviation or name
        admin_units = AdministrativeUnit.objects.filter(
            Q(unit_abbreviation__iexact=value) | Q(unit_name__icontains=value)
        )

        if not admin_units.exists():
            return queryset.none()

        today = date.today()

        # Find current jurisdictional affiliations
        facility_identity_ids = (
            JurisdictionalAffiliation.objects.filter(
                administrative_unit__in=admin_units,
                effective_from_date__lte=today,
            )
            .filter(
                Q(effective_to_date__isnull=True)
                | Q(effective_to_date__gt=today)
            )
            .values_list("postal_facility_identity_id", flat=True)
        )

        return queryset.filter(
            postal_facility_identity_id__in=facility_identity_ids
        )

    def filter_has_images(self, queryset, name, value):
        """Filter postmarks based on whether they have any images."""
        if value is None:
            return queryset
        if value:
            return queryset.filter(images__isnull=False).distinct()
        return queryset.filter(images__isnull=True).distinct()


# ================================================================================================
# "GEOGRAPHIC LOCATION" FILTERS (now mapped onto PostalFacilityIdentity)
# ================================================================================================


class GeographicLocationFilter(django_filters.FilterSet):
    """
    Historical note:
    This used to target GeographicLocation. The underlying model is now
    PostalFacilityIdentity, but the class name is kept the same so imports
    elsewhere don't break.
    """

    location_name = django_filters.CharFilter(
        field_name="facility_name",
        lookup_expr="icontains",
        label="Facility Name (contains)",
    )

    # Filter by current administrative unit of this facility identity
    current_state = django_filters.CharFilter(
        method="filter_by_current_state",
        label="Current State/Province",
    )

    # Bounding box filters using the *stable* PostalFacility lat/long
    latitude_min = django_filters.NumberFilter(
        field_name="postal_facility__latitude",
        lookup_expr="gte",
        label="Latitude (minimum)",
    )
    latitude_max = django_filters.NumberFilter(
        field_name="postal_facility__latitude",
        lookup_expr="lte",
        label="Latitude (maximum)",
    )
    longitude_min = django_filters.NumberFilter(
        field_name="postal_facility__longitude",
        lookup_expr="gte",
        label="Longitude (minimum)",
    )
    longitude_max = django_filters.NumberFilter(
        field_name="postal_facility__longitude",
        lookup_expr="lte",
        label="Longitude (maximum)",
    )

    has_coordinates = django_filters.BooleanFilter(
        method="filter_has_coordinates",
        label="Has Coordinates",
    )

    class Meta:
        model = PostalFacilityIdentity
        fields = ["postal_facility", "facility_name"]

    def filter_by_current_state(self, queryset, name, value):
        """
        Filter facility identities that are currently affiliated with a given
        administrative unit name/abbreviation.
        """
        from datetime import date

        if not value:
            return queryset

        admin_units = AdministrativeUnit.objects.filter(
            Q(unit_abbreviation__iexact=value) | Q(unit_name__icontains=value)
        )

        if not admin_units.exists():
            return queryset.none()

        today = date.today()
        identity_ids = (
            JurisdictionalAffiliation.objects.filter(
                administrative_unit__in=admin_units,
                effective_from_date__lte=today,
            )
            .filter(
                Q(effective_to_date__isnull=True)
                | Q(effective_to_date__gt=today)
            )
            .values_list("postal_facility_identity_id", flat=True)
        )

        return queryset.filter(pk__in=identity_ids)

    def filter_has_coordinates(self, queryset, name, value):
        """Filter based on whether the underlying facility has coordinates."""
        if value is None:
            return queryset
        if value:
            return queryset.filter(
                postal_facility__latitude__isnull=False,
                postal_facility__longitude__isnull=False,
            )
        return queryset.filter(
            Q(postal_facility__latitude__isnull=True)
            | Q(postal_facility__longitude__isnull=True)
        )


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


# ================================================================================================
# PUBLICATION FILTERS
# ================================================================================================


class PostmarkPublicationFilter(django_filters.FilterSet):
    """Advanced filter for publications."""

    title = django_filters.CharFilter(
        field_name="publication_title",
        lookup_expr="icontains",
        label="Title (contains)",
    )
    author = django_filters.CharFilter(
        field_name="author",
        lookup_expr="icontains",
        label="Author (contains)",
    )
    publisher = django_filters.CharFilter(
        field_name="publisher",
        lookup_expr="icontains",
        label="Publisher (contains)",
    )
    isbn = django_filters.CharFilter(
        field_name="isbn",
        lookup_expr="icontains",
        label="ISBN (contains)",
    )

    year_min = django_filters.NumberFilter(
        field_name="publication_date__year",
        lookup_expr="gte",
        label="Publication Year (minimum)",
    )
    year_max = django_filters.NumberFilter(
        field_name="publication_date__year",
        lookup_expr="lte",
        label="Publication Year (maximum)",
    )

    class Meta:
        model = PostmarkPublication
        fields = ["publication_type", "isbn"]

###################################################################################################
