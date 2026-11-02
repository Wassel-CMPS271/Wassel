import { afterEach, expect, it, vi } from "vitest";
import { loadParentChildren } from "./parentChildrenSource";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["test", "production", "development"])("uses real HTTP in %s even with the obsolete preview flag", async environment => {
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "true");
  const fetcher = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await loadParentChildren()).toEqual([]);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/parent/children"), expect.objectContaining({ credentials: "include" }));
});
it("propagates backend failures without sample fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
  await expect(loadParentChildren()).rejects.toMatchObject({ status: 404 });
});
