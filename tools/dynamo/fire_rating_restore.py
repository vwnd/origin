# Dynamo Python Script node — restore fire ratings changed by
# fire_rating_seed_issues.py.
# IN[0] = the originals log JSON string that the seed script output
# OUT   = per-entry restore results

import clr
import json

clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')

from Autodesk.Revit.DB import BuiltInParameter, StorageType, ElementId
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

doc = DocumentManager.Instance.CurrentDBDocument

log = json.loads(IN[0])
changes = log.get('changes', [])

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


results = []
TransactionManager.Instance.EnsureInTransaction(doc)
try:
    for entry in changes:
        line = {'type_id': entry.get('type_id'), 'name': entry.get('name')}
        if entry.get('status') != 'applied':
            line['result'] = 'skipped: was never applied'
            results.append(line)
            continue
        t = doc.GetElement(ElementId(entry['type_id']))
        p = find_fire_rating_param(t)
        if t is None or p is None or p.IsReadOnly or p.StorageType != StorageType.String:
            line['result'] = 'FAILED: type or writable parameter not found'
        else:
            p.Set(entry.get('original') or '')
            line['result'] = 'restored to {0!r}'.format(entry.get('original') or '')
        results.append(line)
finally:
    TransactionManager.Instance.TransactionTaskDone()

OUT = results
