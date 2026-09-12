import source from "../../../contracts/fixtures/hair-passport-read.json";
export const readFixtures = source;
export const cloneReadFixture = () => JSON.parse(JSON.stringify(source.populated)) as typeof source.populated;
export function invalidReadFixture(change: { path: string[]; value?: unknown; remove?: boolean }) {
 const copy = cloneReadFixture();
 let target = copy as unknown as Record<string, unknown>;
 for (const key of change.path.slice(0, -1)) target = target[key] as Record<string, unknown>;
 const key = change.path.at(-1)!;
 if (change.remove) delete target[key]; else target[key] = change.value;
 return copy;
}
