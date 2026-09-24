"""Read-only checks for the reviewed T65 repair. Run through Django shell.

Before: write expected hashes, not a database backup. After: compare them.
Keep application writes and imports paused between these two steps.
"""
import copy
import csv
import hashlib
import json
import os
from pathlib import Path

from django.core.serializers.json import DjangoJSONEncoder
from common import models


MODEL_NAMES = (
    "Color", "Marking", "Cover", "MarkingVersion", "CoverVersion",
    "Contribution", "Image", "Citation", "DateSeen", "CoverMarking",
    "MarkingRecycleBin", "CoverRecycleBin",
)


def digest(rows):
    text = json.dumps(rows, cls=DjangoJSONEncoder, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(text.encode("ascii")).hexdigest()


def check(phase, mapping_path, state_path, actor_id=1):
    if phase not in ("before", "dry", "after"):
        raise ValueError("T65_PHASE must be before, dry, or after")
    state_path = Path(state_path)
    if phase == "before":
        with open(mapping_path, encoding="ascii", newline="") as fh:
            mapping = list(csv.DictReader(fh))
        colors = {c.pk: c for c in models.Color.objects.all()}
        changes = {}
        for item in mapping:
            source = colors[int(item["color_id"])]
            if json.dumps(source.name, ensure_ascii=True)[1:-1] != item["name"]:
                raise ValueError("Mapping ID/name mismatch")
            if item["action"] not in ("merge", "null"):
                raise ValueError("Unexpected mapping action")
            target = models.Color.objects.get(name=item["target"]) if item["target"] else None
            changes[source.pk] = (source.name, target.pk if target else None,
                                  target.name if target else None)
        state = {"models": {}, "mapping_hash": digest(mapping_path.read_bytes().hex())}
    else:
        state = json.loads(state_path.read_text(encoding="ascii"))
        if state["mapping_hash"] != digest(mapping_path.read_bytes().hex()):
            raise ValueError("Mapping changed since the before check")

    for name in MODEL_NAMES:
        model = getattr(models, name)
        manager = getattr(model, "all_objects", model.objects)
        rows = list(manager.order_by("pk").values())
        if phase == "before":
            expected = copy.deepcopy(rows)
            changed = []
            if name == "Color":
                expected = [r for r in expected if r["id"] not in changes]
            for row in expected:
                if name in ("Marking", "Cover") and row["color_id"] in changes:
                    row["color_id"] = changes[row["color_id"]][1]
                    row["modified_by_id"] = actor_id
                    changed.append(row["id"])
                elif name in ("MarkingVersion", "CoverVersion"):
                    snap = row["snapshot"]
                    for pk, (_, target_pk, _) in changes.items():
                        if snap.get("color_id") in (pk, str(pk)):
                            snap["color_id"] = target_pk
                elif name == "Contribution":
                    data = row["submitted_data"]
                    for pk, (source, target_pk, target_name) in changes.items():
                        by_name = str(data.get("color", "")).casefold() == source.casefold()
                        if by_name or data.get("color_id") in (pk, str(pk)):
                            if target_pk is None:
                                data.pop("color", None)
                                data.pop("color_id", None)
                            else:
                                data["color"] = target_name
                                if "color_id" in data:
                                    data["color_id"] = (str(target_pk) if isinstance(
                                        data["color_id"], str) else target_pk)
                            row["modified_by_id"] = actor_id
                            changed.append(row["id"])
                            break
            for row in expected:
                if row[model._meta.pk.attname] in changed:
                    row.pop("modified_date", None)
            state["models"][name] = {"before": digest(rows), "after": digest(expected),
                                      "changed": changed, "count": len(expected)}
        else:
            entry = state["models"][name]
            if phase == "after":
                for row in rows:
                    if row[model._meta.pk.attname] in entry["changed"]:
                        row.pop("modified_date", None)
            if digest(rows) != entry["before" if phase == "dry" else "after"]:
                raise ValueError(f"FAIL: {name} differs from the expected {phase} state")
        print(f"{name}: {len(rows)} rows checked")

    if phase == "before":
        with state_path.open("x", encoding="ascii") as fh:
            json.dump(state, fh, indent=2, ensure_ascii=True)
    print(f"PASS: {phase}")


if __name__ == "__main__":
    check(os.environ["T65_PHASE"], Path(os.environ["T65_MAPPING"]),
          os.environ["T65_STATE"])
