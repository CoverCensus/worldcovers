
"""
Custom pagination so API respects ?page_size= from the client (e.g. 10 per page for catalog).
"""
from rest_framework.pagination import PageNumberPagination


class PageSizePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_count(self, queryset):
        return None  # disable expensive COUNT(*)

class LargePageSizePagination(PageNumberPagination):
    """Use for list endpoints that are often consumed in full (e.g. administrative units for filter dropdown)."""
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500

