/**
 * Serialisiert asynchrone Schreibvorgaenge und fasst Aenderungen zusammen, die
 * waehrend eines laufenden Schreibvorgangs eintreffen. Jeder Aufrufer wartet
 * mindestens bis zu der Queue-Generation, die er selbst angefordert hat.
 */
export function createCoalescingAsyncQueue<T>(options: {
  merge: (current: T, incoming: T) => T;
  worker: (payload: T) => Promise<boolean>;
}) {
  let requestedGeneration = 0;
  let completedGeneration = 0;
  let pendingPayload: T | undefined;
  let running: Promise<boolean> | null = null;
  let latestResult = false;

  const start = () => {
    if (running) return running;

    running = (async () => {
      while (completedGeneration < requestedGeneration) {
        const generation = requestedGeneration;
        const payload = pendingPayload;
        pendingPayload = undefined;
        if (payload === undefined) {
          completedGeneration = generation;
          continue;
        }

        try {
          latestResult = await options.worker(payload);
        } catch {
          latestResult = false;
        }
        completedGeneration = generation;
      }
      return latestResult;
    })().finally(() => {
      running = null;
      // Deckt den seltenen Fall ab, dass unmittelbar beim Abschluss noch eine
      // neue Generation eingereiht wurde.
      if (completedGeneration < requestedGeneration) void start();
    });

    return running;
  };

  const waitForGeneration = async (generation: number) => {
    while (completedGeneration < generation) {
      await (running ?? start());
    }
    return latestResult;
  };

  return {
    enqueue(payload: T) {
      requestedGeneration += 1;
      const generation = requestedGeneration;
      pendingPayload = pendingPayload === undefined
        ? payload
        : options.merge(pendingPayload, payload);
      void start();
      return waitForGeneration(generation);
    },
    hasPending() {
      return completedGeneration < requestedGeneration;
    },
  };
}
