import { NextRequest, NextResponse } from 'next/server';
import {
  validateAndAdvanceMultiplayerTurn,
  ValidateTurnPayloadSchema,
} from '@/lib/game/multiplayer';
import { BattleState } from '@/lib/game/types';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = ValidateTurnPayloadSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid multiplayer turn payload.',
          details: parsed.error.issues.slice(0, 3).map((i) => i.message),
        },
        { status: 400 }
      );
    }

    const { battleState, action, expectedSide } = parsed.data;

    const validation = validateAndAdvanceMultiplayerTurn(
      battleState as unknown as BattleState,
      action,
      expectedSide
    );

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    return NextResponse.json(validation.result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to validate battle turn.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
