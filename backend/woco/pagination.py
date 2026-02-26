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


class PostmarkListPagination(PageSizePagination):
    """
    Pagination for postmarks list. Supports ?include_count=false to skip the slow
    COUNT query on 50k+ rows for faster first paint. When count is skipped,
    next/previous links use heuristics (full page => assume next exists).
    """
    def paginate_queryset(self, queryset, request, view=None):
        self.request = request
        self._defer_count = bool(request and request.query_params.get("include_count") == "false")
        if self._defer_count:
            from django.core.paginator import Paginator
            from django.utils.functional import cached_property

            class NoCountPaginator(Paginator):
                @cached_property
                def count(self):
                    return 0  # Skip expensive count query

            self.django_paginator_class = NoCountPaginator
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        if getattr(self, "_defer_count", False):
            # Build next/previous without count: next if we got a full page
            from urllib.parse import urlencode, urlparse, urlunparse

            page_size = self.get_page_size(self.request)
            has_next = len(data) >= page_size if data else False
            page_number = self.request.query_params.get(self.page_query_param, 1)
            try:
                page_number = int(page_number)
            except (TypeError, ValueError):
                page_number = 1

            url = self.request.build_absolute_uri()
            parsed = urlparse(url)
            query = parsed.query

            def replace_page_param(params, page_val):
                p = self.request.query_params.copy()
                p[self.page_query_param] = str(page_val)
                return urlencode(p, doseq=True)

            next_link = None
            if has_next:
                next_link = urlunparse(parsed._replace(query=replace_page_param(query, page_number + 1)))
            prev_link = None
            if page_number > 1:
                prev_link = urlunparse(parsed._replace(query=replace_page_param(query, page_number - 1)))

            return Response(OrderedDict([
                ("count", None),
                ("next", next_link),
                ("previous", prev_link),
                ("results", data),
            ]))
        return super().get_paginated_response(data)


class LargePageSizePagination(PageNumberPagination):
    """Use for list endpoints that are often consumed in full (e.g. administrative units for filter dropdown)."""
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500
