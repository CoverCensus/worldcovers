###################################################################################################
## WoCo Commons - Model Filters
## MPC: 2025/11/15
###################################################################################################
import django_filters
from django.db.models import Q

from .models import Marking, MarkingType


class MarkingListFilter(django_filters.FilterSet):
    """
    List-view filters for Marking. Phase 1 ports the prior PostmarkListFilter
    onto the unified Marking model. The Phase 2 API rewrite will wire this
    into MarkingViewSet and add the `type` discriminator filter that the
    frontend already passes.
    """

    type = django_filters.ChoiceFilter(
        field_name='type',
        choices=MarkingType.choices,
        label='Marking type',
    )
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
    earliest_use_year_min = django_filters.NumberFilter(
        method='filter_earliest_use_year_min',
        label='Earliest observed year is at least',
    )
    latest_use_year_max = django_filters.NumberFilter(
        method='filter_latest_use_year_max',
        label='Latest observed year is at most',
    )

    class Meta:
        model = Marking
        fields = []

    @staticmethod
    def filter_earliest_use_year_min(queryset, name, value):
        # Filter on the unioned (direct + cover-mediated) earliest date that
        # `with_date_range` annotates onto the Marking queryset. Idempotent:
        # re-annotating with the same expression is safe.
        if value is None:
            return queryset
        return queryset.with_date_range().filter(earliest_seen__year__gte=int(value))

    @staticmethod
    def filter_latest_use_year_max(queryset, name, value):
        # Filter on the unioned (direct + cover-mediated) latest date that
        # `with_date_range` annotates onto the Marking queryset.
        if value is None:
            return queryset
        return queryset.with_date_range().filter(latest_seen__year__lte=int(value))

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
            Q(post_office__post_office_regions__region__name__iexact=value)
            | Q(post_office__post_office_regions__region__abbrev__iexact=value)
        ).distinct()

    @staticmethod
    def filter_has_images(queryset, name, value):
        if not value or str(value).strip().lower() != 'true':
            return queryset
        from .models import Image
        marking_ids_with_images = Image.objects.filter(
            subject_type=Image.SUBJECT_MARKING,
        ).values_list('subject_id', flat=True)
        return queryset.filter(pk__in=marking_ids_with_images)


class MarkingFilter(django_filters.FilterSet):
    """Advanced filters for Marking objects."""

    q = django_filters.CharFilter(method="filter_q", label="Search (code, catalog/inscription text)")
    type = django_filters.ChoiceFilter(field_name='type', choices=MarkingType.choices, label='Marking type')
    state = django_filters.CharFilter(method="filter_by_state", label="Region (name or abbreviation)")
    color = django_filters.CharFilter(field_name="color__name", lookup_expr="iexact", label="Color")
    has_images = django_filters.BooleanFilter(method="filter_has_images", label="Has Images")

    class Meta:
        model = Marking
        fields = ["type", "is_manuscript", "shape", "lettering", "color", "date_fmt"]

    def filter_q(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(
            Q(code__icontains=value)
            | Q(catalog_txt__icontains=value)
            | Q(inscription_txt__icontains=value)
            | Q(desc__icontains=value)
        )

    def filter_by_state(self, queryset, name, value):
        if not value:
            return queryset
        value = str(value).strip()
        return queryset.filter(
            Q(post_office__post_office_regions__region__name__iexact=value)
            | Q(post_office__post_office_regions__region__abbrev__iexact=value)
        ).distinct()

    def filter_has_images(self, queryset, name, value):
        if value is None:
            return queryset
        from .models import Image
        marking_ids_with_images = Image.objects.filter(
            subject_type=Image.SUBJECT_MARKING,
        ).values_list('subject_id', flat=True)
        if value:
            return queryset.filter(pk__in=marking_ids_with_images)
        return queryset.exclude(pk__in=marking_ids_with_images)


###################################################################################################
