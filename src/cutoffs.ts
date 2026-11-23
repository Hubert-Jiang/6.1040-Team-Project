import type { assembleApplication } from "./assembly.ts";

type Application = ReturnType<typeof assembleApplication>;

/**
 * Handles every gathering whose cutoff or end has passed as of `now`. Unconfirmed gatherings past their
 * cutoff are closed, the seats of every gathering at its cutoff are frozen, and gatherings past their end
 * are closed. Returns nothing and never raises for one gathering: a failure there is logged and the rest go on.
 */
export async function sweepCutoffs({ concepts }: Application, now: Date): Promise<void> {
  const { Hosting, Reserving } = concepts;

  for (const { gathering, status } of await Hosting._getPastCutoff({ now })) {
    await attempt(gathering, async () => {
      if (status === "OPEN") await Hosting.expireUnconfirmed({ gathering, now });
      // confirmed and booked gatherings stay on the list until they end, so most of them are locked already
      const [pool] = await Reserving._getAvailability({ resource: gathering });
      if (pool && !pool.locked) await Reserving.lock({ resource: gathering });
    });
  }

  for (const { gathering } of await Hosting._getEnded({ now })) {
    await attempt(gathering, () => Hosting.closeEnded({ gathering, now }));
  }
}

/** Runs one gathering's step. Another server may have handled it first, which shows up as an error here and is only logged. */
async function attempt(gathering: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (error) {
    console.warn(`Cutoff sweep skipped gathering ${gathering}: ${error}`);
  }
}
