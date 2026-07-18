import { describe, expect, it } from "vitest";
import { topEventRows, visibleEventRows } from "./event-rows.js";

const rows = [
  { eventName: "Signup", visitors: 12, count: 18 },
  { eventName: "Unknown", visitors: 9, count: 11 },
  { eventName: "Purchase", visitors: 4, count: 6 },
  { eventName: "Others", visitors: 3, count: 5 },
  { eventName: "  ", visitors: 1, count: 1 },
];

describe("analytics event rows", () => {
  it("removes blank and aggregate event names but keeps unknown", () => {
    expect(visibleEventRows(rows).map((row) => row.eventName)).toEqual(["Signup", "Unknown", "Purchase"]);
  });

  it("limits panels after filtering hidden event names", () => {
    expect(topEventRows(rows, 1).map((row) => row.eventName)).toEqual(["Signup"]);
  });
});
