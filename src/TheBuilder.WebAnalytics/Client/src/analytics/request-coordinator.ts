export type RequestResult<T> =
  | { status: "success"; value: T }
  | { status: "error"; error: unknown }
  | { status: "cancelled" }
  | { status: "stale" };

export type SettledRequestResult<T> =
  | { status: "success"; value: T }
  | { status: "error"; error: unknown };

export class RequestCoordinator {
  #generation = 0;
  #abort?: AbortController;

  get signal(): AbortSignal | undefined {
    return this.#abort?.signal;
  }

  async run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<RequestResult<T>> {
    this.#abort?.abort();
    const generation = ++this.#generation;
    const abort = new AbortController();
    this.#abort = abort;

    try {
      const value = await request(abort.signal);
      if (generation !== this.#generation) return { status: "stale" };
      if (abort.signal.aborted) return { status: "cancelled" };
      return { status: "success", value };
    } catch (error) {
      if (generation !== this.#generation) return { status: "stale" };
      if (abort.signal.aborted) return { status: "cancelled" };
      return { status: "error", error };
    }
  }

  cancel(): void {
    this.#abort?.abort();
    this.#abort = undefined;
  }
}

export class DebouncedRequest {
  readonly #coordinator = new RequestCoordinator();
  readonly #delay: number;
  #timer?: number;
  #cancelPending?: () => void;

  constructor(delay = 300) {
    this.#delay = delay;
  }

  run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<RequestResult<T>> {
    this.cancelScheduled();
    return this.#coordinator.run(request);
  }

  schedule<T>(request: (signal: AbortSignal) => Promise<T>): Promise<RequestResult<T>> {
    this.cancel();
    return new Promise((resolve) => {
      this.#cancelPending = () => resolve({ status: "cancelled" });
      this.#timer = globalThis.setTimeout(() => {
        this.#timer = undefined;
        this.#cancelPending = undefined;
        void this.#coordinator.run(request).then(resolve);
      }, this.#delay);
    });
  }

  cancel(): void {
    this.cancelScheduled();
    this.#coordinator.cancel();
  }

  private cancelScheduled(): void {
    if (this.#timer !== undefined) globalThis.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#cancelPending?.();
    this.#cancelPending = undefined;
  }
}

export async function settleRequest<T>(request: Promise<T>): Promise<SettledRequestResult<T>> {
  try {
    return { status: "success", value: await request };
  } catch (error) {
    return { status: "error", error };
  }
}
