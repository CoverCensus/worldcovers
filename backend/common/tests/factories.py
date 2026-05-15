"""
Lightweight object-creation helpers shared across the common test suite.

These are intentionally not full-blown factory_boy factories — the dataset
we need is small and direct ORM calls give us tighter control over the
fixture state. Each helper accepts overrides as kwargs so individual tests
can vary the minimum number of fields they care about.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission

from common.models import (
    Collection,
    CollectionAssignment,
    Color,
    Contribution,
    Cover,
    CoverMarking,
    DateSeen,
    Image,
    Lettering,
    Marking,
    MarkingType,
    PostOffice,
    PostOfficeRegion,
    Region,
    Shape,
)


User = get_user_model()


def make_user(
    username: str = "user1",
    email: str | None = None,
    password: str = "pa$$word123",
    is_superuser: bool = False,
    is_staff: bool = False,
    groups: list[str] | None = None,
):
    """Create (or fetch) a user with optional group memberships."""
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={
            "email": email or f"{username}@example.com",
            "is_superuser": is_superuser,
            "is_staff": is_staff or is_superuser,
        },
    )
    user.set_password(password)
    user.is_superuser = is_superuser
    user.is_staff = is_staff or is_superuser
    user.email = email or f"{username}@example.com"
    user.save()
    if groups:
        for name in groups:
            grp, _ = Group.objects.get_or_create(name=name)
            user.groups.add(grp)
    return user


def make_superuser(username: str = "admin", password: str = "pa$$word123"):
    return make_user(username=username, password=password, is_superuser=True, is_staff=True)


def make_editor(username: str = "editor", password: str = "pa$$word123"):
    """Create a user in the Editors group with review_contribution perm.

    Migration 0052 normally seeds the Editors group, but we re-grant the
    permissions inline so the test suite is hermetic and doesn't depend on
    that data migration succeeding before this code runs.
    """
    user = make_user(username=username, password=password, groups=["Editors"])
    editors, _ = Group.objects.get_or_create(name="Editors")
    perm_codenames = [
        "review_contribution",
        "change_contribution",
        "add_referencework",
        "change_referencework",
        "view_contribution",
    ]
    for codename in perm_codenames:
        perm = Permission.objects.filter(
            content_type__app_label="common", codename=codename
        ).first()
        if perm:
            editors.permissions.add(perm)
    user.groups.add(editors)
    return user


def make_contributor(username: str = "contributor", password: str = "pa$$word123"):
    return make_user(username=username, password=password, groups=["Contributors"])


def make_color(name: str = "Black", hex_val: str = "#000000", creator=None) -> Color:
    creator = creator or make_user("color_seed")
    color, _ = Color.objects.get_or_create(
        name=name,
        defaults={"hex_val": hex_val, "created_by": creator, "modified_by": creator},
    )
    return color


def make_region(
    name: str = "Virginia",
    abbrev: str = "VA",
    region_tier: str = "STATE",
    creator=None,
) -> Region:
    creator = creator or make_user("region_seed")
    region, _ = Region.objects.get_or_create(
        name=name,
        defaults={
            "abbrev": abbrev,
            "region_tier": region_tier,
            "created_by": creator,
            "modified_by": creator,
        },
    )
    return region


def make_post_office(
    name: str = "Richmond",
    region: Region | None = None,
    creator=None,
) -> PostOffice:
    """Create a PostOffice and -- if a region is given -- link it via the
    PostOfficeRegion junction so `PostOffice.region` (a property that resolves
    through the junction) returns the expected Region.
    """
    creator = creator or make_user("po_seed")
    region = region if region is not None else make_region(creator=creator)
    po, _ = PostOffice.objects.get_or_create(
        name=name,
        defaults={"created_by": creator, "modified_by": creator},
    )
    PostOfficeRegion.objects.get_or_create(
        post_office=po,
        region=region,
        defaults={"created_by": creator, "modified_by": creator},
    )
    return po


def link_post_office_to_region(po: PostOffice, region: Region, creator=None) -> PostOfficeRegion:
    """Add an additional PostOfficeRegion link for a PostOffice."""
    creator = creator or po.created_by
    link, _ = PostOfficeRegion.objects.get_or_create(
        post_office=po,
        region=region,
        defaults={"created_by": creator, "modified_by": creator},
    )
    return link


def make_shape(name: str = "Circle", code: str | None = "C", creator=None) -> Shape:
    creator = creator or make_user("shape_seed")
    shape, _ = Shape.objects.get_or_create(
        name=name,
        defaults={"code": code, "created_by": creator, "modified_by": creator},
    )
    return shape


def make_lettering(name: str = "Serif", creator=None) -> Lettering:
    creator = creator or make_user("lettering_seed")
    lettering, _ = Lettering.objects.get_or_create(
        name=name,
        defaults={"created_by": creator, "modified_by": creator},
    )
    return lettering


def make_collection(
    name: str = "Virginia Collection",
    region: Region | None = None,
    creator=None,
) -> Collection:
    creator = creator or make_user("collection_seed")
    region = region or make_region(creator=creator)
    coll, _ = Collection.objects.get_or_create(
        region=region,
        defaults={
            "name": name,
            "created_by": creator,
            "modified_by": creator,
        },
    )
    return coll


def assign_editor(user, collection: Collection, creator=None) -> CollectionAssignment:
    creator = creator or user
    ca, _ = CollectionAssignment.objects.get_or_create(
        user=user,
        collection=collection,
        defaults={"created_by": creator, "modified_by": creator},
    )
    return ca


def make_marking(
    *,
    type: str = MarkingType.TOWNMARK,
    code: str | None = "VA-001",
    inscription_txt: str = "RICHMOND VA",
    is_manuscript: bool = False,
    post_office: PostOffice | None = None,
    color: Color | None = None,
    shape: Shape | None = None,
    lettering: Lettering | None = None,
    creator=None,
    **kwargs,
) -> Marking:
    creator = creator or make_user("marking_seed")
    post_office = post_office or make_post_office(creator=creator)
    color = color or make_color(creator=creator)
    if not is_manuscript:
        shape = shape or make_shape(creator=creator)
        lettering = lettering or make_lettering(creator=creator)
    marking = Marking(
        type=type,
        code=code,
        inscription_txt=inscription_txt,
        is_manuscript=is_manuscript,
        post_office=post_office,
        color=color,
        shape=shape,
        lettering=lettering,
        created_by=creator,
        modified_by=creator,
        **kwargs,
    )
    marking.save()
    return marking


def make_cover(creator=None, code: str = "COV-001", **kwargs) -> Cover:
    creator = creator or make_user("cover_seed")
    cover = Cover(code=code, created_by=creator, modified_by=creator, **kwargs)
    cover.save()
    return cover


def make_cover_marking(cover: Cover, marking: Marking, creator=None) -> CoverMarking:
    creator = creator or make_user("cm_seed")
    cm, _ = CoverMarking.objects.get_or_create(
        cover=cover,
        marking=marking,
        defaults={"created_by": creator, "modified_by": creator},
    )
    return cm


def make_date_seen(
    *,
    subject,
    date_value,
    granularity: str = "DAY",
    creator=None,
) -> DateSeen:
    """Attach a polymorphic DateSeen row to a Cover or Marking.

    `subject` may be either a Cover or a Marking; subject_type is inferred
    from the model class. DateSeen no longer has a direct FK back to Cover --
    it's a polymorphic table keyed by (subject_type, subject_id), mirroring
    the Citation / Image pattern.
    """
    creator = creator or make_user("date_seed")
    if isinstance(subject, Cover):
        subject_type = DateSeen.SUBJECT_COVER
    elif isinstance(subject, Marking):
        subject_type = DateSeen.SUBJECT_MARKING
    else:
        raise TypeError(f"DateSeen subject must be Cover or Marking, got {type(subject).__name__}")
    ds = DateSeen(
        subject_type=subject_type,
        subject_id=subject.pk,
        date=date_value,
        granularity=granularity,
        created_by=creator,
        modified_by=creator,
    )
    ds.save()
    return ds


def make_cover_date_seen(cover: Cover, date_value, granularity: str = "DAY", creator=None) -> DateSeen:
    """Convenience wrapper for the common case of attaching a date to a Cover."""
    return make_date_seen(
        subject=cover, date_value=date_value, granularity=granularity, creator=creator
    )


def make_image_for_marking(marking: Marking, uploader=None, view: str = "FULL", display_order: int = 0) -> Image:
    uploader = uploader or make_user("image_uploader")
    image = Image(
        subject_type=Image.SUBJECT_MARKING,
        subject_id=marking.pk,
        original_filename="test.jpg",
        storage_filename=f"va/{marking.pk}-{display_order}.jpg",
        file_checksum="0" * 64,
        mime_type="image/jpeg",
        image_width=100,
        image_height=100,
        file_size_bytes=1024,
        image_view=view,
        display_order=display_order,
        uploaded_by=uploader,
        created_by=uploader,
        modified_by=uploader,
    )
    image.save()
    return image


def make_contribution(
    *,
    contributor=None,
    collection: Collection | None = None,
    submitted_data: dict | None = None,
    status: str = Contribution.STATUS_PENDING,
) -> Contribution:
    contributor = contributor or make_contributor()
    collection = collection or make_collection(creator=contributor)
    return Contribution.objects.create(
        contributor=contributor,
        collection=collection,
        submitted_data=submitted_data or {"state": "Virginia", "town": "Richmond", "type": "TOWNMARK"},
        status=status,
    )
