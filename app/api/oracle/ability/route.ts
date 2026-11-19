import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compileSingleOracleAbility } from '@/lib/oracle/compiler';
import { oracleProvider } from '@/lib/oracle/gemini';

const AbilityRequestSchema = z.object({
  characterId: z.string().trim().min(2).max(64),
  characterName: z.string().trim().min(2).max(48),
  characterRole: z.string().trim().min(2).max(24),
  characterElement: z.string().trim().min(2).max(24),
  characterLevel: z.number().int().min(1).max(10).default(2),
  existingAbilityNames: z.array(z.string().max(60)).max(20).default([]),
  abilityDescription: z
    .string()
    .trim()
    .min(10, 'Describe your new ability in at least 10 characters.')
    .max(600),
  category: z.enum(['special', 'ultimate']).default('special'),
});

// Lightweight server-side sliding-window rate limiter
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 14;
const requestBuckets = new Map<string, number[]>();

function isRateLimited(clientKey: string): boolean {
  const now = Date.now();
  const timestamps = (requestBuckets.get(clientKey) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (timestamps.length >= RATE_MAX_REQUESTS) {
    requestBuckets.set(clientKey, timestamps);
    return true;
  }
  timestamps.push(now);
  requestBuckets.set(clientKey, timestamps);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          error:
            'Ability Forge consultation limit reached. Please wait a moment before forging another ability.',
        },
        { status: 429 }
      );
    }

    const rawBody = await req.json();
    const parsed = AbilityRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || 'Invalid ability forge request.',
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const rawAbility = await oracleProvider.generateAbility({
      characterName: body.characterName,
      characterRole: body.characterRole,
      characterElement: body.characterElement,
      characterLevel: body.characterLevel,
      existingAbilityNames: body.existingAbilityNames,
      abilityDescription: body.abilityDescription,
      category: body.category,
    });

    const compiled = compileSingleOracleAbility(rawAbility, {
      category: body.category,
      characterId: body.characterId,
      characterLevel: body.characterLevel,
    });

    return NextResponse.json(compiled, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected Ability Forge error.';

    if (
      message.includes('API_KEY') ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('403')
    ) {
      return NextResponse.json(
        {
          error:
            'Oracle AI authentication failed. Check that GEMINI_API_KEY is configured in Settings > Secrets.',
        },
        { status: 503 }
      );
    }

    if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
      return NextResponse.json(
        {
          error:
            'Gemini API quota temporarily reached. Please retry shortly or check your API key tier in Settings > Secrets.',
        },
        { status: 429 }
      );
    }

    if (message.includes('UNAVAILABLE') || message.includes('503')) {
      return NextResponse.json(
        {
          error:
            'The Oracle AI model is temporarily experiencing high demand. Please retry in a few seconds.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
