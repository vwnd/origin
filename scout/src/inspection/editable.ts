/**
 * Which Revit parameters Scout is allowed to report on.
 *
 * Findings are only worth filing if they can be acted on. Speckle's parameter
 * updater can write back instance, type and system-type parameters that are
 * text, numeric, boolean, or ElementId-backed and resolvable by name; it cannot
 * touch read-only values, and it needs an `internalDefinitionName` to address
 * the parameter at all.
 *
 * So editability is decided here, at index time — a parameter that cannot be
 * changed is never stored, never judged, and never paid for.
 *
 * The published data carries no read-only flag (parameter leaves are only
 * `{value, name, internalDefinitionName?, units?}`), so this works from two
 * signals instead:
 *
 * 1. **No `internalDefinitionName` ⇒ not editable.** The delta payload requires
 *    that field, so such a parameter literally cannot be expressed as a change.
 *    This alone excludes every `Material Quantities.*` entry (area, volume,
 *    density), which are derived from geometry and material assignment.
 * 2. **A deny-list of Revit definitions that are computed or identity-owned.**
 *    These do have a definition name but the API refuses writes.
 */

/**
 * Read-only Revit parameter definitions, by exact name.
 *
 * Identity parameters are the notable trap: `Type Name`, `Family`, `Type` and
 * `Family and Type` all look like ordinary editable text and are where
 * misspellings tend to live, but Revit owns them — renaming a type is a
 * different operation, not a parameter write.
 */
const READ_ONLY_DEFINITIONS = new Set([
  // Type and family identity — renamed through the type, not as a parameter.
  "ALL_MODEL_TYPE_NAME",
  "ALL_MODEL_FAMILY_NAME",
  "ELEM_FAMILY_PARAM",
  "ELEM_TYPE_PARAM",
  "ELEM_FAMILY_AND_TYPE_PARAM",
  "SYMBOL_ID_PARAM",
  // Auto-generated identifiers.
  "IFC_GUID",
  "IFC_TYPE_GUID",
  // Model-organisation values Revit controls.
  "DESIGN_OPTION_PARAM",
  // Derived from the type's layer structure.
  "WALL_ATTR_WIDTH_PARAM",
  "FLOOR_ATTR_THICKNESS_PARAM",
  // Host references. These carry the host element's *name*, so a wall type
  // misspelling shows up here too — but the value is a pointer, not text.
  // "Correcting" it would re-host the element rather than fix the spelling.
  "HOST_ID_PARAM",
  "INSTANCE_FREE_HOST_PARAM",
  "SKETCH_PLANE_PARAM"
]);

/**
 * Patterns for definitions Revit computes from geometry. Matching by pattern
 * rather than listing every one keeps this robust across categories — the same
 * suffixes recur for walls, floors, stairs and rails.
 */
const READ_ONLY_PATTERNS: RegExp[] = [
  /_COMPUTED$/, // HOST_AREA_COMPUTED, HOST_VOLUME_COMPUTED, HOST_PERIMETER_COMPUTED
  /^CURVE_ELEM_/, // CURVE_ELEM_LENGTH
  /^STAIRS_ACTUAL_/, // measured back off the built stair
  /^STRUCTURAL_ELEVATION_AT_/, // derived from placement
  /^ANALYTICAL_/, // derived from the material's thermal properties
  /^CONTINUOUSRAIL_LENGTH/ // measured along the rail
];

export function isEditableDefinition(
  internalDefinitionName: string | null
): boolean {
  if (!internalDefinitionName) return false;
  if (READ_ONLY_DEFINITIONS.has(internalDefinitionName)) return false;
  return !READ_ONLY_PATTERNS.some((pattern) =>
    pattern.test(internalDefinitionName)
  );
}

/**
 * The `path` a delta uses to address a parameter.
 *
 * Speckle's own payload writes it rooted at the object, e.g.
 * `properties.Parameters.Type Parameters.Identity Data.Fire Rating`, while the
 * index stores key paths relative to `properties`. This adds the prefix back.
 */
export function toDeltaPath(keyPath: string): string {
  return `properties.${keyPath}`;
}
