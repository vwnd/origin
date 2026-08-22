# Dynamo Python Script node — seed fire-rating issues into a TEST model
# for compliance-check demo/testing. MODIFIES THE MODEL unless dry_run.
# IN[0] = dry_run (bool, default True)
# OUT   = originals log (JSON string) — save it; input for fire_rating_restore.py
#
# Seeds three issue classes:
#   1. spelling variants: equivalent wall-type ratings rewritten to mixed
#      forms ("2 HR" / "2 hours" / "120 min")
#   2. missing value: one rated door type blanked
#   3. under-rated door: one door type hosted in rated walls set to "20 min"

import clr
import json
import re

clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')

from Autodesk.Revit.DB import (
    FilteredElementCollector, BuiltInCategory, BuiltInParameter, StorageType)
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

doc = DocumentManager.Instance.CurrentDBDocument

dry_run = True
try:
    if IN[0] is not None:
        dry_run = bool(IN[0])
except Exception:
    pass

FIRE_RATING_BIPS = []
for name in ('FIRE_RATING', 'DOOR_FIRE_RATING'):
    try:
        FIRE_RATING_BIPS.append(getattr(BuiltInParameter, name))
    except AttributeError:
        pass


def find_fire_rating_param(el):
    if el is None:
        return None
    for bip in FIRE_RATING_BIPS:
        try:
            p = el.get_Parameter(bip)
        except Exception:
            p = None
        if p is not None:
            return p
    try:
        return el.LookupParameter('Fire Rating')
    except Exception:
        return None


def writable_string_rating_param(el):
    p = find_fire_rating_param(el)
    if p is None or p.IsReadOnly or p.StorageType != StorageType.String:
        return None
    return p


def rating_text(el):
    p = find_fire_rating_param(el)
    if p is not None and p.HasValue and p.StorageType == StorageType.String:
        return p.AsString()
    return None


def hours_from(text):
    """Best-effort parse of an hour figure out of a rating string."""
    if not text:
        return None
    m = re.search(r'(\d+(?:\.\d+)?)', text)
    if not m:
        return None
    val = float(m.group(1))
    if re.search(r'min', text, re.IGNORECASE):
        val = val / 60.0
    return val


def type_of(el):
    try:
        return doc.GetElement(el.GetTypeId())
    except Exception:
        return None


def name_of(el_type):
    try:
        p = el_type.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM)
        if p is not None:
            return p.AsString()
        return el_type.Name
    except Exception:
        return '?'


def collect_instances(category):
    return FilteredElementCollector(doc)\
        .OfCategory(category)\
        .WhereElementIsNotElementType()\
        .ToElements()


# Gather rated wall and door types (deduplicated by type id, stable order).
def rated_types(category):
    seen, result = set(), []
    for inst in collect_instances(category):
        t = type_of(inst)
        if t is None or t.Id.IntegerValue in seen:
            continue
        seen.add(t.Id.IntegerValue)
        txt = rating_text(t)
        if txt and hours_from(txt) and writable_string_rating_param(t):
            result.append((t, txt, inst))
    return result


rated_wall_types = rated_types(BuiltInCategory.OST_Walls)
rated_door_types = rated_types(BuiltInCategory.OST_Doors)

VARIANTS = ['{0} HR', '{0} hours', '{1} min']  # {0}=hours, {1}=minutes
plan = []

# 1. Spelling variants on up to 3 rated wall types.
for i, (wt, txt, _) in enumerate(rated_wall_types[:3]):
    hrs = hours_from(txt)
    hrs_label = int(hrs) if hrs == int(hrs) else hrs
    new_val = VARIANTS[i % len(VARIANTS)].format(hrs_label, int(hrs * 60))
    if new_val != txt:
        plan.append({'issue': 'spelling-variant', 'element_kind': 'wall type',
                     'type_id': wt.Id.IntegerValue, 'name': name_of(wt),
                     'original': txt, 'new': new_val})

# 2. Blank one rated door type.
if rated_door_types:
    dt, txt, _ = rated_door_types[0]
    plan.append({'issue': 'missing-value', 'element_kind': 'door type',
                 'type_id': dt.Id.IntegerValue, 'name': name_of(dt),
                 'original': txt, 'new': ''})

# 3. Under-rate one door type whose instances sit in rated host walls.
for door in collect_instances(BuiltInCategory.OST_Doors):
    try:
        host = door.Host
    except Exception:
        host = None
    host_type = type_of(host) if host is not None else None
    host_hrs = hours_from(rating_text(host_type)) if host_type is not None else None
    dt = type_of(door)
    if host_hrs and host_hrs >= 1 and dt is not None and writable_string_rating_param(dt):
        already = [p for p in plan if p['type_id'] == dt.Id.IntegerValue]
        if not already:
            plan.append({'issue': 'under-rated-door', 'element_kind': 'door type',
                         'type_id': dt.Id.IntegerValue, 'name': name_of(dt),
                         'original': rating_text(dt) or '', 'new': '20 min',
                         'host_wall_rating': rating_text(host_type)})
            break

applied = []
if not dry_run and plan:
    TransactionManager.Instance.EnsureInTransaction(doc)
    try:
        from Autodesk.Revit.DB import ElementId
        for entry in plan:
            t = doc.GetElement(ElementId(entry['type_id']))
            p = writable_string_rating_param(t)
            if p is None:
                entry['status'] = 'skipped: parameter not writable'
                continue
            p.Set(entry['new'])
            entry['status'] = 'applied'
            applied.append(entry)
    finally:
        TransactionManager.Instance.TransactionTaskDone()
else:
    for entry in plan:
        entry['status'] = 'planned (dry run)' if dry_run else 'planned'

log = {
    'dry_run': dry_run,
    'planned': len(plan),
    'applied': len(applied),
    'note': 'Save this output. Feed it to fire_rating_restore.py IN[0] to undo.',
    'changes': plan,
}
OUT = json.dumps(log, indent=2)
