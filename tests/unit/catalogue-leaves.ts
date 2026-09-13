/**
 * Every string in a catalogue, addressed by the dotted path the i18n guards
 * report: `errors.NO_STUDENTS`, `themes.animals[3]`, `howToSteps[1]`.
 *
 * Numbers, functions and empty objects contribute nothing. A caller that
 * asserts absence over the result proves it non-empty first (`nonEmpty`),
 * because a walk that returns `[]` satisfies every such assertion while
 * reading nothing (#84).
 */
export function stringLeaves(
  table: unknown,
  path = '',
): Array<[string, string]> {
  if (typeof table === 'string') return [[path, table]];
  if (Array.isArray(table))
    return table.flatMap((value, index) =>
      stringLeaves(value, `${path}[${index}]`),
    );
  if (table && typeof table === 'object')
    return Object.entries(table).flatMap(([key, value]) =>
      stringLeaves(value, path ? `${path}.${key}` : key),
    );
  return [];
}
