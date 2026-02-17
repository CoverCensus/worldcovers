"""Custom pagination for API views."""
from rest_framework.pagination import PageNumberPagination


class PostmarkPageNumberPagination(PageNumberPagination):
    """Page number pagination with 10 records per page for api/postmarks/."""
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
