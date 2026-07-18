import { describe, expect, it, vi } from "vitest";
import { DebouncedRequest, RequestCoordinator, settleRequest } from "./request-coordinator.js";

describe("RequestCoordinator", () => {
  it("turns a rejected request into an error result", async () => {
    const coordinator = new RequestCoordinator();
    const result = await coordinator.run(async () => { throw new Error("offline"); });

    expect(result).toMatchObject({ status: "error", error: expect.any(Error) });
  });

  it("marks an older result as stale", async () => {
    const coordinator = new RequestCoordinator();
    let resolveFirst!: (value: string) => void;
    const first = coordinator.run(() => new Promise<string>((resolve) => { resolveFirst = resolve; }));
    const second = coordinator.run(async () => "latest");
    resolveFirst("old");

    await expect(first).resolves.toEqual({ status: "stale" });
    await expect(second).resolves.toEqual({ status: "success", value: "latest" });
  });

  it("marks an explicitly cancelled request as cancelled", async () => {
    const coordinator = new RequestCoordinator();
    const pending = coordinator.run((signal) => new Promise<string>((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    coordinator.cancel();

    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });
});

describe("DebouncedRequest", () => {
  it("only runs the latest scheduled request", async () => {
    vi.useFakeTimers();
    const request = new DebouncedRequest(20);
    const firstTask = vi.fn(async () => "first");
    const secondTask = vi.fn(async () => "second");
    void request.schedule(firstTask);
    const latest = request.schedule(secondTask);

    await vi.advanceTimersByTimeAsync(20);
    await expect(latest).resolves.toEqual({ status: "success", value: "second" });
    expect(firstTask).not.toHaveBeenCalled();
    expect(secondTask).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("settleRequest", () => {
  it("settles a network rejection instead of propagating it", async () => {
    await expect(settleRequest(Promise.reject(new Error("network"))))
      .resolves.toMatchObject({ status: "error" });
  });
});
