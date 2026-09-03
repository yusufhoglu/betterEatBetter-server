import { ConcurrencyGate } from './llmConcurrencyGate';
import { IntegrationError } from '../errors/IntegrationError';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ConcurrencyGate', () => {
  it('lets up to maxConcurrent normal callers run at once', async () => {
    const gate = new ConcurrencyGate({ maxConcurrent: 2, premiumBurstSlots: 0, maxQueueDepth: 10 });

    const r1 = await gate.acquire();
    const r2 = await gate.acquire();
    expect(gate.stats).toMatchObject({ active: 2, normalQueued: 0 });

    let thirdAcquired = false;
    const third = gate.acquire().then((release) => {
      thirdAcquired = true;
      return release;
    });

    await flush();
    expect(thirdAcquired).toBe(false);
    expect(gate.stats).toMatchObject({ active: 2, normalQueued: 1 });

    r1();
    const r3 = await third;
    expect(thirdAcquired).toBe(true);

    r2();
    r3();
    expect(gate.stats).toMatchObject({ active: 0, normalQueued: 0 });
  });

  it('rejects with LLM_OVERLOADED once a lane queue is full', async () => {
    const gate = new ConcurrencyGate({ maxConcurrent: 1, premiumBurstSlots: 0, maxQueueDepth: 1 });

    const held = await gate.acquire();
    void gate.acquire(); // fills the single normal queue slot

    await expect(gate.acquire()).rejects.toMatchObject({ code: 'LLM_OVERLOADED', httpStatus: 503 });
    await expect(gate.acquire()).rejects.toBeInstanceOf(IntegrationError);

    held();
  });

  it('gives premium callers burst slots above the normal ceiling', async () => {
    const gate = new ConcurrencyGate({ maxConcurrent: 1, premiumBurstSlots: 2, maxQueueDepth: 10 });

    const normal = await gate.acquire('normal'); // active = 1, at normal cap

    let normalQueued = false;
    void gate.acquire('normal').then(() => {
      normalQueued = true;
    });
    await flush();
    expect(normalQueued).toBe(false); // normal is capped

    const p1 = await gate.acquire('premium'); // burst slot
    const p2 = await gate.acquire('premium'); // burst slot
    expect(gate.stats.active).toBe(3);

    normal();
    p1();
    p2();
  });

  it('serves a waiting premium caller before a waiting normal caller', async () => {
    const gate = new ConcurrencyGate({ maxConcurrent: 1, premiumBurstSlots: 0, maxQueueDepth: 10 });

    const held = await gate.acquire('normal');

    const order: string[] = [];
    void gate.acquire('normal').then((r) => {
      order.push('normal');
      r();
    });
    void gate.acquire('premium').then((r) => {
      order.push('premium');
      r();
    });
    await flush();

    held();
    await flush();
    await flush();

    expect(order).toEqual(['premium', 'normal']);
  });

  it('is idempotent — calling a releaser twice frees only one slot', async () => {
    const gate = new ConcurrencyGate({ maxConcurrent: 1, premiumBurstSlots: 0, maxQueueDepth: 5 });

    const release = await gate.acquire();
    release();
    release();
    expect(gate.stats.active).toBe(0);

    const again = await gate.acquire();
    expect(gate.stats.active).toBe(1);
    again();
  });
});
