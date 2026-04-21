'use client';

import { useState, useTransition } from 'react';
import { BtnGhost } from '../../../../components/ui/button';
import { adjustHP, takeRest } from '../../../../lib/server/character-actions';

export function HPControls({ characterId }: { characterId: string }) {
  const [amount, setAmount] = useState(5);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-16 rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-2 py-1 text-center font-mono text-sm text-text outline-none focus:border-gold"
      />
      <BtnGhost
        disabled={pending}
        onClick={() =>
          startTransition(() => adjustHP({ characterId, delta: -amount }).then(() => void 0))
        }
      >
        − Dégâts
      </BtnGhost>
      <BtnGhost
        disabled={pending}
        onClick={() =>
          startTransition(() => adjustHP({ characterId, delta: amount }).then(() => void 0))
        }
      >
        + Soins
      </BtnGhost>
      <BtnGhost
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            takeRest({ characterId, kind: 'short', diceToSpend: 1 }).then(() => void 0),
          )
        }
      >
        ☾ Repos court
      </BtnGhost>
      <BtnGhost
        disabled={pending}
        onClick={() =>
          startTransition(() => takeRest({ characterId, kind: 'long' }).then(() => void 0))
        }
      >
        ☾ Repos long
      </BtnGhost>
    </div>
  );
}
