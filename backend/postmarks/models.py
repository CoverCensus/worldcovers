from common.models import (
    Postmark as CommonPostmark,
    PostmarkImage as CommonPostmarkImage,
    PostmarkPublication as CommonPostmarkPublication,
    PostmarkPublicationReference as CommonPostmarkPublicationReference,
    PostmarkShape as CommonPostmarkShape,
    LetteringStyle as CommonLetteringStyle,
    FramingStyle as CommonFramingStyle,
    Color as CommonColor,
    DateFormat as CommonDateFormat,
    PostmarkColor as CommonPostmarkColor,
    PostmarkDatesSeen as CommonPostmarkDatesSeen,
    PostmarkSize as CommonPostmarkSize,
    PostmarkValuation as CommonPostmarkValuation,
    Postcover as CommonPostcover,
    PostcoverPostmark as CommonPostcoverPostmark,
    PostcoverImage as CommonPostcoverImage,
)


class Listing(CommonPostmark):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Listing"
        verbose_name_plural = "Listings"


class ListingImage(CommonPostmarkImage):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Listing Image"
        verbose_name_plural = "Listing Images"


class PostmarkShape(CommonPostmarkShape):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Shape"
        verbose_name_plural = "Postmark Shapes"


class LetteringStyle(CommonLetteringStyle):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Lettering Style"
        verbose_name_plural = "Lettering Styles"


class FramingStyle(CommonFramingStyle):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Framing Style"
        verbose_name_plural = "Framing Styles"


class Color(CommonColor):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Color"
        verbose_name_plural = "Colors"


class DateFormat(CommonDateFormat):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Date Format"
        verbose_name_plural = "Date Formats"


class PostmarkPublication(CommonPostmarkPublication):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Publication"
        verbose_name_plural = "Postmark Publications"


class PostmarkPublicationReference(CommonPostmarkPublicationReference):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Publication Reference"
        verbose_name_plural = "Postmark Publication References"


class PostmarkColor(CommonPostmarkColor):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Color"
        verbose_name_plural = "Postmark Colors"


class PostmarkDatesSeen(CommonPostmarkDatesSeen):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Dates Seen"
        verbose_name_plural = "Postmark Dates Seen"


class PostmarkSize(CommonPostmarkSize):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Size"
        verbose_name_plural = "Postmark Sizes"


class PostmarkValuation(CommonPostmarkValuation):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Valuation"
        verbose_name_plural = "Postmark Valuations"


class Postcover(CommonPostcover):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Cover"
        verbose_name_plural = "Example Covers"


class PostcoverPostmark(CommonPostcoverPostmark):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Cover Marking"
        verbose_name_plural = "Example Cover Markings"


class PostcoverImage(CommonPostcoverImage):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Image"
        verbose_name_plural = "Example Images"
