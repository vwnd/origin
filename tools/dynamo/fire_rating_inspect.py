# Dynamo Python Script node — inspect fire-rating data on walls and doors.
# Read-only. Works under IronPython2 and CPython3 Dynamo engines.
# OUT = [summary_json, rows]

import clr
import json

clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')

from Autodesk.Revit.DB import (
    FilteredElementCollector, BuiltInCategory, BuiltInParameter, StorageType)
from RevitServices.Persistence import DocumentManager

doc = DocumentManager.Instance.CurrentDBDocument

FIRE_RATING_BIPS = []
for name in ('FIRE_RATING', 'DOOR_FIRE_RATING'):
    try:
        FIRE_RATING_BIPS.append(getattr(BuiltInParameter, name))
    except AttributeError:
        pass


def param_text(p):
    if p is None or not p.HasValue:
        return None
    if p.StorageType == StorageType.String:
        return p.AsString()
    return p.AsValueString()


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


def fire_rating_of(el):
    """Returns (value, source): source is 'instance', 'type', or None."""
    p = find_fire_rating_param(el)
    if p is not None and p.HasValue:
        return param_text(p), 'instance'
    try:
        el_type = doc.GetElement(el.GetTypeId())
    except Exception:
        el_type = None
    tp = find_fire_rating_param(el_type)
    if tp is not None and tp.HasValue:
        return param_text(tp), 'type'
    # parameter exists but empty vs. parameter absent
    if p is not None or tp is not None:
        return '', 'empty'
    return None, None


def level_name_of(el):
    try:
        lvl = doc.GetElement(el.LevelId)
        if lvl is not None:
            return lvl.Name
    except Exception:
        pass
    return None


def type_name_of(el):
    try:
        t = doc.GetElement(el.GetTypeId())
        if t is not None:
            p = t.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM)
            if p is not None:
                return p.AsString()
            return t.Name
    except Exception:
        pass
    return None


def collect(category):
    return FilteredElementCollector(doc)\
        .OfCategory(category)\
        .WhereElementIsNotElementType()\
        .ToElements()


rows = []
spellings = {}

for wall in collect(BuiltInCategory.OST_Walls):
    rating, source = fire_rating_of(wall)
    rows.append({
        'id': wall.Id.IntegerValue,
        'category': 'Wall',
        'type': type_name_of(wall),
        'level': level_name_of(wall),
        'fire_rating': rating,
        'rating_source': source,
    })
    if rating:
        spellings[rating] = spellings.get(rating, 0) + 1

wall_rating_by_id = {}
for r in rows:
    wall_rating_by_id[r['id']] = r['fire_rating']

for door in collect(BuiltInCategory.OST_Doors):
    rating, source = fire_rating_of(door)
    host_id = None
    host_rating = None
    try:
        if door.Host is not None:
            host_id = door.Host.Id.IntegerValue
            host_rating = wall_rating_by_id.get(host_id)
            if host_rating is None:
                host_rating, _ = fire_rating_of(door.Host)
    except Exception:
        pass
    rows.append({
        'id': door.Id.IntegerValue,
        'category': 'Door',
        'type': type_name_of(door),
        'level': level_name_of(door),
        'fire_rating': rating,
        'rating_source': source,
        'host_wall_id': host_id,
        'host_wall_rating': host_rating,
    })
    if rating:
        spellings[rating] = spellings.get(rating, 0) + 1

walls = [r for r in rows if r['category'] == 'Wall']
doors = [r for r in rows if r['category'] == 'Door']

summary = {
    'walls_total': len(walls),
    'walls_rated': len([r for r in walls if r['fire_rating']]),
    'walls_rating_param_empty': len([r for r in walls if r['rating_source'] == 'empty']),
    'doors_total': len(doors),
    'doors_rated': len([r for r in doors if r['fire_rating']]),
    'doors_rating_param_empty': len([r for r in doors if r['rating_source'] == 'empty']),
    'doors_in_rated_walls_missing_own_rating': len([
        r for r in doors if r.get('host_wall_rating') and not r['fire_rating']]),
    'rating_spellings': spellings,
}

OUT = [json.dumps(summary, indent=2), rows]
