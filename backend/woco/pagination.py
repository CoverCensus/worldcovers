"""
Custom pagination so API respects ?page_size= from the client (e.g. 10 per page for catalog).
"""
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PageSizePagination(PageNumberPagination):
    """PageNumberPagination that honors page_size query param. Default 10 per page."""
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class FastPageSizePagination(PageSizePagination):
    """
    Same as PageSizePagination but uses a capped count so list responses stay fast on
    large tables (e.g. 50k+ postmarks). Count is at most cap_count_at; real total may be higher.
    """
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
    cap_count_at = 10001

    def _get_count(self, queryset):
        from django.db import connection
        if connection.vendor != "postgresql":
            return super()._get_count(queryset)
        # Capped count: subquery with LIMIT so the DB stops after cap_count_at rows
        qs = queryset.order_by().values_list("pk", flat=True)[: self.cap_count_at]
        compiler = qs.query.get_compiler(queryset.db)
        sql, params = compiler.as_sql()
        capped_sql = f"SELECT COUNT(*) FROM ({sql}) AS _cap"
        with connection.cursor() as cursor:
            cursor.execute(capped_sql, params)
            return cursor.fetchone()[0]

    def get_paginated_response(self, data):
        response = super().get_paginated_response(data)
        if self.count is not None and self.count >= self.cap_count_at:
            response.data["count_capped"] = True
        return response


class LargePageSizePagination(PageNumberPagination):
    """Use for list endpoints that are often consumed in full (e.g. administrative units for filter dropdown)."""
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500
