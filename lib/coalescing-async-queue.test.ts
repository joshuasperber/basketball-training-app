import { describe, expect, it, vi } from "vitest";
import { createCoalescingAsyncQueue } from "@/lib/coalescing-async-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("coalescing async queue", () => {
  it("runs changes that arrive during an active write in a follow-up write", async () => {
    const first = deferred<boolean>();
    const payloads: Array<Record<string, number>> = [];
    const worker = vi.fn(async (payload: Record<string, number>) => {
      payloads.push(payload);
      if (payloads.length === 1) return first.promise;
      return true;
    });
    const queue = createCoalescingAsyncQueue<Record<string, number>>({
      merge: (current, incoming) => ({ ...current, ...incoming }),
      worker,
    });

    const initial = queue.enqueue({ league: 1 });
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(1));
    const second = queue.enqueue({ games: 2 });
    const third = queue.enqueue({ league: 3 });

    first.resolve(true);

    await expect(initial).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    await expect(third).resolves.toBe(true);
    expect(worker).toHaveBeenCalledTimes(2);
    expect(payloads).toEqual([{ league: 1 }, { games: 2, league: 3 }]);
    expect(queue.hasPending()).toBe(false);
  });

  it("continues after a failed write so a retry can persist the latest state", async () => {
    const worker = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const queue = createCoalescingAsyncQueue<number>({
      merge: (_current, incoming) => incoming,
      worker,
    });

    await expect(queue.enqueue(1)).resolves.toBe(false);
    await expect(queue.enqueue(2)).resolves.toBe(true);
    expect(worker).toHaveBeenCalledTimes(2);
  });
});
