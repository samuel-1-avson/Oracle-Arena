import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { STARTER_CHARACTERS } from '@/lib/game/roster';
import {
  CharacterDefinitionSchema,
  OracleProfileSchema,
} from '@/lib/game/types';
import { compileOracleDraft } from '@/lib/oracle/compiler';
import { oracleProvider } from '@/lib/oracle/gemini';

const RequestBodySchema = z.object({
  description: z.string().trim().min(10, 'Describe your character in at least 10 characters.').max(900),
  oracleProfile: OracleProfileSchema.default('Universal Oracle'),
  creatorName: z.string().trim().min(1).max(36).default('Arena Architect'),
  preferredRole: z.string().max(24).optional(),
  preferredElement: z.string().max(24).optional(),
  artworkUrl: z.string().max(240).optional(),
  refinementNote: z.string().trim().max(400).optional(),
  previousDraft: CharacterDefinitionSchema.nullable().optional(),
  existingCardNames: z.array(z.string().max(60)).max(60).optional(),
});

// Lightweight server-side sliding-window rate limiter (Section 13 security guardrail)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 12;
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
            'Oracle consultation limit reached. Please wait a moment before generating another draft.',
        },
        { status: 429 }
      );
    }

    const rawBody = await req.json();
    const parsed = RequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || 'Invalid Oracle request.',
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const starterNames = STARTER_CHARACTERS.map((c) => c.name);
    const existingNames = Array.from(
      new Set([...starterNames, ...(body.existingCardNames ?? [])])
    );

    const rawDraft = await oracleProvider.generateDraft({
      description: body.description,
      oracleProfile: body.oracleProfile,
      preferredRole: body.preferredRole,
      preferredElement: body.preferredElement,
      refinementNote: body.refinementNote,
      previousDraft: body.previousDraft ?? null,
      existingNames,
    });

    const compiled = compileOracleDraft(rawDraft, {
      oracleProfile: body.oracleProfile,
      creatorId: 'local-player',
      creatorName: body.creatorName,
      artworkUrl: body.artworkUrl || undefined,
      existingRoster: STARTER_CHARACTERS,
    });

    return NextResponse.json(compiled, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected Oracle service error.';

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
