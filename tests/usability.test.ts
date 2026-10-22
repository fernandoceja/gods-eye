import { describe, expect, it } from "vitest";
import { SimClock } from "../src/clock.ts";
import { flightDetail } from "../src/present.ts";

describe("usability", () => {
  it("starts live", () => {
    const clock = new SimClock();
    expect(clock.live).toBe(true);
    expect(clock.rate).toBe(1);
  });
  it("hints Press Live when replay hides sampled planes", () => {
    expect(flightDetail(true, false, 0, 12)).toBe("Press Live to see planes");
    expect(flightDetail(true, true, 0, 12)).not.toBe("Press Live to see planes");
    expect(flightDetail(true, false, 3, 12)).not.toBe("Press Live to see planes");
    expect(flightDetail(false, false, 0, 12)).not.toBe("Press Live to see planes");
  });
});
