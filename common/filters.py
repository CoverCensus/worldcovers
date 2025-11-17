###################################################################################################
## WoCo Project - Model Filters
## MPC: 2025/11/15
###################################################################################################
import django_filters
from django.db.models import Q
from .models import (
    Postmark, GeographicLocation, AdministrativeUnit,
    PostmarkPublication, Postcover
)


class PostmarkFilter(django_filters.FilterSet):
    """Advanced filter for postmarks"""
    
    # Location filters
    location_name = django_filters.CharFilter(
        field_name='geographic_location__location_name',
        lookup_expr='icontains',
        label='Location Name (contains)'
    )
    location_type = django_filters.ChoiceFilter(
        field_name='geographic_location__location_type',
        choices=GeographicLocation.LOCATION_TYPE_CHOICES,
        label='Location Type'
    )
    
    # Administrative unit filters
    state = django_filters.CharFilter(
        method='filter_by_state',
        label='State/Province (abbreviation or name)'
    )
    
    # Date range filters
    earliest_use_year_min = django_filters.NumberFilter(
        field_name='dates_seen__earliest_date_seen__year',
        lookup_expr='gte',
        label='Earliest Use Year (minimum)'
    )
    earliest_use_year_max = django_filters.NumberFilter(
        field_name='dates_seen__earliest_date_seen__year',
        lookup_expr='lte',
        label='Earliest Use Year (maximum)'
    )
    latest_use_year_min = django_filters.NumberFilter(
        field_name='dates_seen__latest_date_seen__year',
        lookup_expr='gte',
        label='Latest Use Year (minimum)'
    )
    latest_use_year_max = django_filters.NumberFilter(
        field_name='dates_seen__latest_date_seen__year',
        lookup_expr='lte',
        label='Latest Use Year (maximum)'
    )
    
    # Color filter
    color = django_filters.CharFilter(
        field_name='postmark_colors__color__color_name',
        lookup_expr='iexact',
        label='Color'
    )
    
    # Valuation filters
    value_min = django_filters.NumberFilter(
        field_name='valuations__estimated_value',
        lookup_expr='gte',
        label='Minimum Valuation'
    )
    value_max = django_filters.NumberFilter(
        field_name='valuations__estimated_value',
        lookup_expr='lte',
        label='Maximum Valuation'
    )
    
    # Has images filter
    has_images = django_filters.BooleanFilter(
        method='filter_has_images',
        label='Has Images'
    )
    
    # Publication filter
    in_publication = django_filters.NumberFilter(
        field_name='publication_references__postmark_publication',
        label='In Publication (ID)'
    )
    
    class Meta:
        model = Postmark
        fields = {
            'postmark_key': ['exact', 'icontains'],
            'postmark_shape': ['exact'],
            'lettering_style': ['exact'],
            'framing_style': ['exact'],
            'date_format': ['exact'],
            'rate_location': ['exact'],
            'rate_value': ['exact', 'icontains'],
            'condition': ['exact'],
            'is_manuscript': ['exact'],
        }
    
    def filter_by_state(self, queryset, name, value):
        """Filter postmarks by state/province"""
        from .models import GeographicAffiliation
        from datetime import date
        
        # Find administrative unit by abbreviation or name
        admin_units = AdministrativeUnit.objects.filter(
            Q(unit_abbreviation__iexact=value) | Q(unit_name__icontains=value)
        )
        
        if not admin_units.exists():
            return queryset.none()
        
        # Get current affiliations
        location_ids = GeographicAffiliation.objects.filter(
            administrative_unit__in=admin_units,
            effective_to_date__isnull=True
        ).values_list('geographic_location_id', flat=True)
        
        return queryset.filter(geographic_location_id__in=location_ids)
    
    def filter_has_images(self, queryset, name, value):
        """Filter postmarks that have (or don't have) images"""
        if value:
            return queryset.filter(images__isnull=False).distinct()
        else:
            return queryset.filter(images__isnull=True).distinct()


class GeographicLocationFilter(django_filters.FilterSet):
    """Advanced filter for geographic locations"""
    
    location_name = django_filters.CharFilter(
        lookup_expr='icontains',
        label='Location Name (contains)'
    )
    
    # Filter by current administrative unit
    current_state = django_filters.CharFilter(
        method='filter_by_current_state',
        label='Current State/Province'
    )
    
    # Bounding box filter for map queries
    latitude_min = django_filters.NumberFilter(
        field_name='latitude',
        lookup_expr='gte',
        label='Minimum Latitude'
    )
    latitude_max = django_filters.NumberFilter(
        field_name='latitude',
        lookup_expr='lte',
        label='Maximum Latitude'
    )
    longitude_min = django_filters.NumberFilter(
        field_name='longitude',
        lookup_expr='gte',
        label='Minimum Longitude'
    )
    longitude_max = django_filters.NumberFilter(
        field_name='longitude',
        lookup_expr='lte',
        label='Maximum Longitude'
    )
    
    # Has coordinates
    has_coordinates = django_filters.BooleanFilter(
        method='filter_has_coordinates',
        label='Has Coordinates'
    )
    
    class Meta:
        model = GeographicLocation
        fields = ['location_type']
    
    def filter_by_current_state(self, queryset, name, value):
        """Filter locations currently in a specific state"""
        from .models import GeographicAffiliation
        from datetime import date
        
        admin_units = AdministrativeUnit.objects.filter(
            Q(unit_abbreviation__iexact=value) | Q(unit_name__icontains=value)
        )
        
        if not admin_units.exists():
            return queryset.none()
        
        location_ids = GeographicAffiliation.objects.filter(
            administrative_unit__in=admin_units,
            effective_to_date__isnull=True
        ).values_list('geographic_location_id', flat=True)
        
        return queryset.filter(geographic_location_id__in=location_ids)
    
    def filter_has_coordinates(self, queryset, name, value):
        """Filter locations with or without coordinates"""
        if value:
            return queryset.filter(latitude__isnull=False, longitude__isnull=False)
        else:
            return queryset.filter(Q(latitude__isnull=True) | Q(longitude__isnull=True))


class PostcoverFilter(django_filters.FilterSet):
    """Advanced filter for postcovers"""
    
    postcover_key = django_filters.CharFilter(
        lookup_expr='icontains',
        label='Postcover Key (contains)'
    )
    
    description = django_filters.CharFilter(
        lookup_expr='icontains',
        label='Description (contains)'
    )
    
    # Filter by postmark on cover
    has_postmark = django_filters.NumberFilter(
        field_name='postcover_postmarks__postmark',
        label='Has Postmark (ID)'
    )
    
    # Filter by number of postmarks
    postmark_count_min = django_filters.NumberFilter(
        method='filter_postmark_count_min',
        label='Minimum Number of Postmarks'
    )
    postmark_count_max = django_filters.NumberFilter(
        method='filter_postmark_count_max',
        label='Maximum Number of Postmarks'
    )
    
    class Meta:
        model = Postcover
        fields = ['owner_user', 'condition']
    
    def filter_postmark_count_min(self, queryset, name, value):
        """Filter by minimum number of postmarks"""
        from django.db.models import Count
        return queryset.annotate(
            num_postmarks=Count('postcover_postmarks')
        ).filter(num_postmarks__gte=value)
    
    def filter_postmark_count_max(self, queryset, name, value):
        """Filter by maximum number of postmarks"""
        from django.db.models import Count
        return queryset.annotate(
            num_postmarks=Count('postcover_postmarks')
        ).filter(num_postmarks__lte=value)


class PostmarkPublicationFilter(django_filters.FilterSet):
    """Advanced filter for publications"""
    
    title = django_filters.CharFilter(
        field_name='publication_title',
        lookup_expr='icontains',
        label='Title (contains)'
    )
    
    author = django_filters.CharFilter(
        lookup_expr='icontains',
        label='Author (contains)'
    )
    
    publisher = django_filters.CharFilter(
        lookup_expr='icontains',
        label='Publisher (contains)'
    )
    
    year = django_filters.NumberFilter(
        field_name='publication_date__year',
        label='Publication Year'
    )
    
    year_min = django_filters.NumberFilter(
        field_name='publication_date__year',
        lookup_expr='gte',
        label='Publication Year (minimum)'
    )
    
    year_max = django_filters.NumberFilter(
        field_name='publication_date__year',
        lookup_expr='lte',
        label='Publication Year (maximum)'
    )
    
    class Meta:
        model = PostmarkPublication
        fields = ['publication_type', 'isbn']

###################################################################################################
