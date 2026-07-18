export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading"; previous?: T }
  | { status: "success"; data: T }
  | { status: "error"; message: string; previous?: T };

export const idleState = <T>(): AsyncState<T> => ({ status: "idle" });

export function loadingState<T>(state?: AsyncState<T>): AsyncState<T> {
  const previous = state && "data" in state ? state.data : state && "previous" in state ? state.previous : undefined;
  return previous === undefined ? { status: "loading" } : { status: "loading", previous };
}

export const successState = <T>(data: T): AsyncState<T> => ({ status: "success", data });

export function errorState<T>(message: string, state?: AsyncState<T>): AsyncState<T> {
  const previous = state && "data" in state ? state.data : state && "previous" in state ? state.previous : undefined;
  return previous === undefined ? { status: "error", message } : { status: "error", message, previous };
}

export function stateData<T>(state: AsyncState<T>): T | undefined {
  return "data" in state ? state.data : "previous" in state ? state.previous : undefined;
}
