"""
Atomic data backfill (single transaction):

1. For every distinct Region referenced by UserLocationAssignment, create a
   matching Collection.
2. For every state name/abbrev / state_region_id referenced in any
   Contribution.submitted_data that does not yet have a Collection, create one
   too — so Contribution.collection can be populated for every existing row.
3. Replicate every UserLocationAssignment(user, region) as
   CollectionAssignment(user, collection_for_region) and add the user to the
   `Editors` group.
4. Add every other authenticated, non-superuser user to the `Contributors`
   group (no-op if already there).
5. Backfill Contribution.collection for every existing row by resolving
   submitted_data.state_region_id → Collection, falling back to a
   case-insensitive match on Region name or abbrev.

If step 5 leaves any Contribution row with collection=NULL the migration
raises and the whole transaction rolls back. The follow-up migration 0054
that flips Contribution.collection to NOT NULL will also catch any stragglers.
"""
from django.db import migrations


def _resolve_collection_for_state(Region, Collection, submitted_data):
    sd = submitted_data or {}
    state_region_id = sd.get("state_region_id")
    try:
        srid = int(state_region_id) if state_region_id is not None else None
    except (TypeError, ValueError):
        srid = None

    if srid is not None:
        coll = Collection.objects.filter(region_id=srid).first()
        if coll is not None:
            return coll
        # Region exists but no Collection yet — create one (with placeholder name from Region).
        region = Region.objects.filter(pk=srid).first()
        if region is not None:
            return _ensure_collection_for_region(Collection, region)

    state_str = (sd.get("state") or "").strip()
    if not state_str:
        return None
    region = (
        Region.objects.filter(name__iexact=state_str).order_by("region_tier", "name").first()
        or Region.objects.filter(abbrev__iexact=state_str).order_by("region_tier", "name").first()
    )
    if region is None:
        return None
    return _ensure_collection_for_region(Collection, region)


def _ensure_collection_for_region(Collection, region, actor_user=None):
    """Get-or-create a Collection for the given Region, using the region's name."""
    coll = Collection.objects.filter(region_id=region.pk).first()
    if coll is not None:
        return coll
    # TimestampedModel needs created_by / modified_by; reuse `actor_user` or fallback to first superuser, else first user.
    User = Collection._meta.get_field("created_by").related_model
    creator = actor_user
    if creator is None:
        creator = User.objects.filter(is_superuser=True).order_by("pk").first()
    if creator is None:
        creator = User.objects.order_by("pk").first()
    if creator is None:
        # No users at all — should not happen in any real environment, but bail clearly.
        raise RuntimeError(
            "Cannot backfill Collections: no User exists to attribute creation to."
        )
    return Collection.objects.create(
        name=region.name,
        description="",
        region_id=region.pk,
        is_active=True,
        created_by_id=creator.pk,
        modified_by_id=creator.pk,
    )


def backfill(apps, schema_editor):
    UserLocationAssignment = apps.get_model("common", "UserLocationAssignment")
    Region = apps.get_model("common", "Region")
    Collection = apps.get_model("common", "Collection")
    CollectionAssignment = apps.get_model("common", "CollectionAssignment")
    Contribution = apps.get_model("common", "Contribution")
    User = apps.get_model(
        Contribution._meta.get_field("contributor").related_model._meta.app_label,
        Contribution._meta.get_field("contributor").related_model._meta.model_name,
    )
    Group = apps.get_model("auth", "Group")

    # 1 + 3: Collection per assigned Region; CollectionAssignment per UserLocationAssignment.
    editors_group, _ = Group.objects.get_or_create(name="Editors")
    contributors_group, _ = Group.objects.get_or_create(name="Contributors")

    region_to_collection = {}
    for region_id in UserLocationAssignment.objects.values_list("region_id", flat=True).distinct():
        region = Region.objects.filter(pk=region_id).first()
        if region is None:
            continue
        coll = _ensure_collection_for_region(Collection, region)
        region_to_collection[region_id] = coll

    editor_user_ids = set()
    for ula in UserLocationAssignment.objects.all().select_related("user"):
        coll = region_to_collection.get(ula.region_id)
        if coll is None:
            continue
        CollectionAssignment.objects.get_or_create(
            user_id=ula.user_id,
            collection_id=coll.pk,
            defaults={
                "created_by_id": ula.user_id,
                "modified_by_id": ula.user_id,
            },
        )
        editor_user_ids.add(ula.user_id)

    # Add all assigned users to the Editors group.
    if editor_user_ids:
        editors_group.user_set.add(*list(editor_user_ids))

    # 4: Add every other non-superuser to Contributors.
    other_user_ids = list(
        User.objects.filter(is_active=True, is_superuser=False)
        .exclude(pk__in=editor_user_ids)
        .values_list("pk", flat=True)
    )
    if other_user_ids:
        contributors_group.user_set.add(*other_user_ids)

    # 2 + 5: Backfill Contribution.collection.
    unresolved = []
    for contrib in Contribution.objects.filter(collection__isnull=True).iterator():
        coll = _resolve_collection_for_state(Region, Collection, contrib.submitted_data)
        if coll is None:
            unresolved.append(contrib.pk)
            continue
        contrib.collection_id = coll.pk
        contrib.save(update_fields=["collection"])

    if unresolved:
        raise RuntimeError(
            "Contribution backfill could not resolve a Collection for the following "
            "Contribution IDs (no matching Region by submitted_data.state / "
            "state_region_id): {}. Either correct the offending submitted_data rows "
            "or pre-create Regions/Collections to cover those states, then re-run "
            "the migration.".format(unresolved)
        )


def reverse_backfill(apps, schema_editor):
    """Best-effort reverse: clear Contribution.collection and drop generated rows.

    We do NOT attempt to rebuild UserLocationAssignment from CollectionAssignment
    here; the previous migration's reverse leaves the legacy table in place.
    """
    CollectionAssignment = apps.get_model("common", "CollectionAssignment")
    Collection = apps.get_model("common", "Collection")
    Contribution = apps.get_model("common", "Contribution")
    Contribution.objects.update(collection=None)
    CollectionAssignment.objects.all().delete()
    Collection.objects.all().delete()


class Migration(migrations.Migration):

    atomic = True

    dependencies = [
        ("common", "0052_seed_role_groups"),
    ]

    operations = [
        migrations.RunPython(backfill, reverse_backfill),
    ]
