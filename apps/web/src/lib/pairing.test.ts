import { describe, expect, it } from "vitest";
import { receiverOf, ringOrder } from "./pairing";

const player = (id: string, joinedAt: string) => ({ id, joinedAt });

describe("ringOrder", () => {
  it("참가 시각 순으로, 같으면 id 순으로 줄을 세운다", () => {
    const ordered = ringOrder([
      player("c", "2026-10-30T01:00:02.000Z"),
      player("b", "2026-10-30T01:00:01.000Z"),
      player("a", "2026-10-30T01:00:01.000Z"),
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("원래 배열을 바꾸지 않는다", () => {
    const input = [player("b", "2"), player("a", "1")];
    ringOrder(input);
    expect(input.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("receiverOf", () => {
  const ordered = ringOrder([
    player("u1", "1"),
    player("u2", "2"),
    player("u3", "3"),
    player("u4", "4"),
  ]);

  it("각자 다음 사람에게 주고, 마지막 사람은 첫 사람에게 준다", () => {
    expect(receiverOf(ordered, "u1")?.id).toBe("u2");
    expect(receiverOf(ordered, "u3")?.id).toBe("u4");
    expect(receiverOf(ordered, "u4")?.id).toBe("u1");
  });

  it("모두가 정확히 한 번씩 받고, 자기 자신에게 주지 않는다", () => {
    const receivers = ordered.map((p) => receiverOf(ordered, p.id)?.id);
    expect(new Set(receivers).size).toBe(ordered.length);
    ordered.forEach((p, i) => expect(receivers[i]).not.toBe(p.id));
  });

  it("목록에 없는 사람이면 null이다", () => {
    expect(receiverOf(ordered, "nobody")).toBeNull();
  });

  it("혼자면 자기 자신에게 준다", () => {
    expect(receiverOf([player("solo", "1")], "solo")?.id).toBe("solo");
  });
});
