import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sample from "../../../../docs/contracts/samples/runs/parent-children.json";
import { isParentHomePreview, loadParentChildren } from "./parentChildrenSource";
import { getDevelopmentChildren } from "./myChildren.development";

const fetch = vi.fn();
beforeEach(() => { fetch.mockReset(); vi.stubGlobal("fetch", fetch); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["test", "production"])("never exposes development fixtures in %s even with the preview flag", async environment => {
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "true");
  fetch.mockResolvedValue(new Response("[]", { status: 200 }));
  expect(isParentHomePreview()).toBe(false);
  expect(await loadParentChildren()).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(getDevelopmentChildren()).rejects.toThrow("restricted to development");
});

it("uses the real authenticated endpoint in development by default", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false");
  fetch.mockResolvedValue(new Response("[]", { status: 200 }));
  expect(isParentHomePreview()).toBe(false);
  expect(await loadParentChildren()).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("requires explicit development opt-in and returns contract fixtures without HTTP", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "true");
  expect(isParentHomePreview()).toBe(true);
  expect(await loadParentChildren()).toEqual(sample);
  expect(fetch).not.toHaveBeenCalled();
});

it("returns independent copies so a preview cannot mutate later loads", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "true");
  const first = await loadParentChildren();
  first[1].firstName = "Mutated preview";
  first[1].driver!.phone = "changed";
  expect(await loadParentChildren()).toEqual(sample);
});

it("does not activate fixtures when the real endpoint fails", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false");
  fetch.mockResolvedValue(new Response("", { status: 404 }));
  await expect(loadParentChildren()).rejects.toMatchObject({ status: 404 });
});
