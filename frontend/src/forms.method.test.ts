// SCRUM-257 / SCRUM-285: every <form> says method="post". Without a method a form submits with GET, so if it is
// submitted before the page's script has loaded (or with scripts blocked) what the person typed ends up in the
// address bar, the browser history and the server logs: ZAP found a password there on the sign-in page. This
// stops a new form from forgetting it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") && !path.endsWith(".test.tsx") ? [path] : [];
  });
}

it('every <form> in the app has method="post"', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(join(import.meta.dirname))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<form(?=[\s>])/g)) {
      const openingTag = source.slice(match.index, match.index + 400).split(">")[0];
      if (!/\bmethod="post"/.test(openingTag)) offenders.push(file.slice(import.meta.dirname.length + 1));
    }
  }

  expect(offenders, `forms without method="post": ${offenders.join(", ")}`).toEqual([]);
});
