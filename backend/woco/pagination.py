"""
Custom pagination so API respects ?page_size= from the client (e.g. 10 per page for catalog).
"""
from collections import OrderedDict

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PageSizePagination(PageNumberPagination):
    """PageNumberPagination that honors page_size query param. Default 10 per page."""
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class MarkingListPagination(PageSizePagination):
    """
    Pagination for the markings list. Supports ?include_count=false to skip
    the slow COUNT query on 50k+ rows for faster first paint. When count is
    skipped, we manually slice the queryset (Django Paginator breaks with
    count=0).
    """
    def paginate_queryset(self, queryset, request, view=None):
        self.request = request
        self._defer_count = bool(request and request.query_params.get("include_count") == "false")

        if self._defer_count:
            # Manually paginate without running COUNT - Django Paginator caps slice
            # when count=0 and returns empty results, so we slice directly
            page_number = request.query_params.get(self.page_query_param, 1)
            try:
                page_number = int(page_number)
            except (TypeError, ValueError):
                page_number = 1
            page_number = max(1, page_number)
            page_size = self.get_page_size(request)
            offset = (page_number - 1) * page_size
            self.page = list(queryset[offset:offset + page_size])
            self.request = request
            return self.page

        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        if getattr(self, "_defer_count", False):
            from urllib.parse import urlencode, urlparse, urlunparse

            page_size = self.get_page_size(self.request)
            has_next = len(data) >= page_size if data else False
            page_number = self.request.query_params.get(self.page_query_param, 1)
            try:
                page_number = int(page_number)
            except (TypeError, ValueError):
                page_number = 1

            def build_link(page_val):
                p = self.request.query_params.copy()
                p[self.page_query_param] = str(page_val)
                parsed = urlparse(self.request.build_absolute_uri())
                return urlunparse(parsed._replace(query=urlencode(p, doseq=True)))

            next_link = build_link(page_number + 1) if has_next else None
            prev_link = build_link(page_number - 1) if page_number > 1 else None

            return Response(OrderedDict([
                ("count", None),
                ("next", next_link),
                ("previous", prev_link),
                ("results", data),
            ]))
        return super().get_paginated_response(data)


class LargePageSizePagination(PageNumberPagination):
    """Use for list endpoints that are often consumed in full (e.g. regions for filter dropdown)."""
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500
