// Same shared staff key as the FastAPI server. Set it with:
//   npx convex env set STAFF_KEY <value>
export function isStaff(key: string): boolean {
  const expected = process.env.STAFF_KEY;
  if (!expected || key.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
