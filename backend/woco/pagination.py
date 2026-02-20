"""
Custom pagination so API respects ?page_size= from the client (e.g. 10 per page for catalog).
"""
from rest_framework.pagination import PageNumberPagination


class PageSizePagination(PageNumberPagination):
    """PageNumberPagination that honors page_size query param. Default 10 per page."""
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class LargePageSizePagination(PageNumberPagination):
    """Use for list endpoints that are often consumed in full (e.g. administrative units for filter dropdown)."""
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500
