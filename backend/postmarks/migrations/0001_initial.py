# Proxy models for postmarks app (all inherit from common)

from django.db import migrations


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("common", "0009_legacy_erd_tables"),
    ]

    operations = [
        migrations.CreateModel(
            name="Listing",
            fields=[],
            options={"proxy": True, "verbose_name": "Listing", "verbose_name_plural": "Listings"},
            bases=("common.postmark",),
        ),
        migrations.CreateModel(
            name="ListingImage",
            fields=[],
            options={"proxy": True, "verbose_name": "Listing Image", "verbose_name_plural": "Listing Images"},
            bases=("common.postmarkimage",),
        ),
        migrations.CreateModel(
            name="PostmarkShape",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Shape", "verbose_name_plural": "Postmark Shapes"},
            bases=("common.postmarkshape",),
        ),
        migrations.CreateModel(
            name="LetteringStyle",
            fields=[],
            options={"proxy": True, "verbose_name": "Lettering Style", "verbose_name_plural": "Lettering Styles"},
            bases=("common.letteringstyle",),
        ),
        migrations.CreateModel(
            name="FramingStyle",
            fields=[],
            options={"proxy": True, "verbose_name": "Framing Style", "verbose_name_plural": "Framing Styles"},
            bases=("common.framingstyle",),
        ),
        migrations.CreateModel(
            name="Color",
            fields=[],
            options={"proxy": True, "verbose_name": "Color", "verbose_name_plural": "Colors"},
            bases=("common.color",),
        ),
        migrations.CreateModel(
            name="DateFormat",
            fields=[],
            options={"proxy": True, "verbose_name": "Date Format", "verbose_name_plural": "Date Formats"},
            bases=("common.dateformat",),
        ),
        migrations.CreateModel(
            name="PostmarkPublication",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Publication", "verbose_name_plural": "Postmark Publications"},
            bases=("common.postmarkpublication",),
        ),
        migrations.CreateModel(
            name="PostmarkPublicationReference",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Publication Reference", "verbose_name_plural": "Postmark Publication References"},
            bases=("common.postmarkpublicationreference",),
        ),
        migrations.CreateModel(
            name="PostmarkColor",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Color", "verbose_name_plural": "Postmark Colors"},
            bases=("common.postmarkcolor",),
        ),
        migrations.CreateModel(
            name="PostmarkDatesSeen",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Dates Seen", "verbose_name_plural": "Postmark Dates Seen"},
            bases=("common.postmarkdatesseen",),
        ),
        migrations.CreateModel(
            name="PostmarkSize",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Size", "verbose_name_plural": "Postmark Sizes"},
            bases=("common.postmarksize",),
        ),
        migrations.CreateModel(
            name="PostmarkValuation",
            fields=[],
            options={"proxy": True, "verbose_name": "Postmark Valuation", "verbose_name_plural": "Postmark Valuations"},
            bases=("common.postmarkvaluation",),
        ),
        migrations.CreateModel(
            name="Postcover",
            fields=[],
            options={"proxy": True, "verbose_name": "Example Cover", "verbose_name_plural": "Example Covers"},
            bases=("common.postcover",),
        ),
        migrations.CreateModel(
            name="PostcoverPostmark",
            fields=[],
            options={"proxy": True, "verbose_name": "Example Cover Marking", "verbose_name_plural": "Example Cover Markings"},
            bases=("common.postcoverpostmark",),
        ),
        migrations.CreateModel(
            name="PostcoverImage",
            fields=[],
            options={"proxy": True, "verbose_name": "Example Image", "verbose_name_plural": "Example Images"},
            bases=("common.postcoverimage",),
        ),
    ]
