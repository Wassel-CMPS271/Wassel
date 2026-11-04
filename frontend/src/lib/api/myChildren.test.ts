import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../../../docs/contracts/samples/runs/parent-children.json";
import { getMyChildren, type Child } from "./myChildren";
import { ApiError } from "./errors";

const children = sample satisfies Child[];
const fetch = vi.fn();
beforeEach(() => { fetch.mockReset(); vi.stubGlobal("fetch", fetch); });
afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("authenticated Parent children contract", () => {
  it("requests only the session parent's children with cookies and no caller-supplied identity", async () => {
    fetch.mockResolvedValue(response(children));
    expect(await getMyChildren()).toEqual(children);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/parent\/children$/), {
      method: "GET", credentials: "include", headers: undefined, body: undefined,
    });
  });

  it("returns an empty family without replacing it with samples", async () => {
    fetch.mockResolvedValue(response([]));
    expect(await getMyChildren()).toEqual([]);
  });

  it("accepts an assigned route with no estimated pickup and future extension fields", async () => {
    const payload = [{ ...children[1], expectedPickupTime: null, futureField: "compatible" }];
    fetch.mockResolvedValue(response(payload));
    expect(await getMyChildren()).toEqual(payload);
  });

  it.each([401, 403, 404, 500, 503])("propagates HTTP %s instead of falling back to fixtures", async status => {
    fetch.mockResolvedValue(new Response(status === 401 ? null : JSON.stringify({ detail: "Parent request refused" }), { status }));
    await expect(getMyChildren()).rejects.toMatchObject({ status });
  });

  it("preserves useful server error information for its caller", async () => {
    fetch.mockResolvedValue(response({ detail: "Access denied" }, 403));
    await expect(getMyChildren()).rejects.toEqual(new ApiError(403, "Access denied"));
  });

  it("does not disguise a network failure as an empty family", async () => {
    fetch.mockRejectedValue(new TypeError("offline"));
    await expect(getMyChildren()).rejects.toThrow("offline");
  });

  it.each([null, {}, [null], [{ studentId: "missing fields" }], [{ ...children[1], driver: null }], [{ ...children[1], vehicle: null }], [{ ...children[0], expectedPickupTime: "07:30" }], [{ ...children[1], expectedPickupTime: "25:99" }]])("rejects a malformed contract response: %j", async payload => {
    fetch.mockResolvedValue(response(payload));
    await expect(getMyChildren()).rejects.toThrow("Invalid parent children response");
  });

  it("propagates invalid JSON as a load failure", async () => {
    fetch.mockResolvedValue(new Response("not JSON", { status: 200 }));
    await expect(getMyChildren()).rejects.toThrow();
  });
});
