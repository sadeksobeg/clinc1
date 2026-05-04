import { describe, expect, it } from "vitest";
import {
  convInboundQueueKey,
  convPostIngestLaneQueueKey,
  convQueueKeyForClaimLane,
  convQueueKeyForPostIngestJob,
} from "./inboundDeferredQueue";
import type { PostIngestJobV2 } from "./inboundDeferredJobV2";

describe("inboundDeferredQueue v4 lane keys", () => {
  it("uses distinct Redis keys for fast and slow", () => {
    expect(convPostIngestLaneQueueKey(42, "fast")).toBe("queue:inbound:conv:42:fast");
    expect(convPostIngestLaneQueueKey(42, "slow")).toBe("queue:inbound:conv:42:slow");
    expect(convInboundQueueKey(42)).toBe("queue:inbound:conv:42");
  });

  it("claim lane mapping covers legacy", () => {
    expect(convQueueKeyForClaimLane(5, "fast")).toBe(convPostIngestLaneQueueKey(5, "fast"));
    expect(convQueueKeyForClaimLane(5, "legacy")).toBe(convInboundQueueKey(5));
  });

  it("enqueue key prefers explicit lane on job", () => {
    const j = {
      conversation_id: 3,
      clinic_id: 1,
      patient_id: 1,
      inbound_message_id: 1,
      dedupeHash: "x",
      from: "f",
      text: "t",
      lane: "slow" as const,
    } satisfies Pick<PostIngestJobV2, "conversation_id" | "clinic_id" | "patient_id" | "inbound_message_id" | "dedupeHash" | "from" | "text" | "lane">;
    expect(convQueueKeyForPostIngestJob(j)).toBe(convPostIngestLaneQueueKey(3, "slow"));
    const legacy = { ...j, lane: undefined };
    expect(convQueueKeyForPostIngestJob(legacy)).toBe(convInboundQueueKey(3));
  });
});
