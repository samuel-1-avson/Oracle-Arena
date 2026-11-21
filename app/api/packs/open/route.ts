import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  compileTraitTreeCharacter,
  TRAIT_CATALOG,
  TraitId,
  ULTIMATE_TREE_CATALOG,
  UltimateTreeId,
} from '@/lib/game/traits';
import { ElementAffinitySchema } from '@/lib/game/types';

const RequestSchema = z.object({
  existingNames: z.array(z.string().max(60)).max(80).default([]),
  ownerId: z.string().max(128).default('local-player'),
  ownerName: z.string().max(48).default('Arena Tactician'),
  packTheme: z.enum(['standard', 'weekly', 'mythic']).default('standard'),
});

const VALID_TRAIT_IDS = TRAIT_CATALOG.map((t) => t.id);
const VALID_ULTIMATE_IDS = ULTIMATE_TREE_CATALOG.map((u) => u.id);

const PACK_ARTWORKS: Record<string, string> = {
  Solar: '/images/card_kaelen_solaris.jpg',
  Void: '/images/card_lyra_voidweaver.jpg',
  Storm: '/images/card_vex_chronostriker.jpg',
  Aether: '/images/card_seraphina_aether.jpg',
  Cyber: '/images/card_orion_tactician.jpg',
  Iron: '/images/card_malakor_dreadguard.jpg',
  Ember: '/images/card_ignis_pyromancer.jpg',
  Frost: '/images/card_freya_frostbinder.jpg',
};

const PACK_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    champions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          title: { type: Type.STRING },
          element: {
            type: Type.STRING,
            enum: ['Solar', 'Void', 'Storm', 'Aether', 'Cyber', 'Iron', 'Ember', 'Frost'],
          },
          lore: { type: Type.STRING },
          traitIds: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: VALID_TRAIT_IDS,
            },
          },
          ultimateId: {
            type: Type.STRING,
            enum: VALID_ULTIMATE_IDS,
          },
        },
        required: ['name', 'title', 'element', 'lore', 'traitIds', 'ultimateId'],
      },
    },
  },
  required: ['champions'],
};

const AiPackChampionSchema = z.object({
  name: z.string().min(2).max(38),
  title: z.string().min(3).max(52),
  element: ElementAffinitySchema,
  lore: z.string().min(12).max(320),
  traitIds: z.array(z.string()).min(2).max(4),
  ultimateId: z.string(),
});

const AiPackResponseSchema = z.object({
  champions: z.array(AiPackChampionSchema).min(3).max(3),
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY is not configured in Settings > Secrets. Add a key for AI-forged packs or open an Instant Vault Pack.',
        },
        { status: 503 }
      );
    }

    const bodyRaw = await req.json();
    const parsedReq = RequestSchema.safeParse(bodyRaw);
    if (!parsedReq.success) {
      return NextResponse.json(
        { error: parsedReq.error.issues[0]?.message || 'Invalid pack request.' },
        { status: 400 }
      );
    }

    const { existingNames, ownerId, ownerName, packTheme } = parsedReq.data;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = [
      'You are the Oracle Pack Forgemaster for ORACLE ARENA, a fun and easy-to-read collectible card game.',
      'Generate EXACTLY 3 brand-new, memorable, imaginative champions for a Booster Pack.',
      'Keep names punchy and fun (readable for both kids and adults), lore crisp (1-2 vivid sentences), and pick 3 distinct traits per champion from the allowed enum so each card feels special and has clear pros/cons.',
      'Never duplicate any existing champion name listed in the prompt.',
    ].join('\n');

    const contents = [
      `Pack Tier: ${packTheme.toUpperCase()} Booster Pack (3 fresh champions)`,
      `Owner: ${ownerName}`,
      `Avoid duplicating these existing names: ${existingNames.slice(0, 40).join(', ') || 'None'}`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: PACK_RESPONSE_SCHEMA,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      return NextResponse.json(
        { error: 'The Oracle returned an empty booster pack.' },
        { status: 502 }
      );
    }

    const parsedJson = AiPackResponseSchema.parse(JSON.parse(rawText));
    const taken = new Set(existingNames.map((n) => n.toLowerCase()));

    const cards = parsedJson.champions.map((champ, idx) => {
      let safeName = champ.name.trim();
      if (taken.has(safeName.toLowerCase())) {
        safeName = `${safeName} ${idx + 2}`;
      }
      taken.add(safeName.toLowerCase());

      const safeTraits = champ.traitIds.filter((t): t is TraitId =>
        VALID_TRAIT_IDS.includes(t as TraitId)
      );
      const safeUlt = VALID_ULTIMATE_IDS.includes(champ.ultimateId as UltimateTreeId)
        ? (champ.ultimateId as UltimateTreeId)
        : ULTIMATE_TREE_CATALOG[idx % ULTIMATE_TREE_CATALOG.length].id;

      const compiled = compileTraitTreeCharacter({
        name: safeName,
        title: champ.title,
        lore: champ.lore,
        element: champ.element,
        artworkUrl:
          PACK_ARTWORKS[champ.element] || '/images/card_kaelen_solaris.jpg',
        creatorId: ownerId,
        creatorName: 'AI Oracle Booster Pack',
        traitIds: safeTraits.length >= 2 ? safeTraits : ['super_strength', 'true_sight'],
        ultimateId: safeUlt,
      });

      if (packTheme === 'mythic' && idx === 0) {
        compiled.character.rarity = 'Ascendant';
      }

      return compiled.character;
    });

    return NextResponse.json({ cards, source: 'gemini' }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to forge AI booster pack.';
    const status =
      message.includes('API_KEY') || message.includes('PERMISSION_DENIED') || message.includes('403')
        ? 503
        : message.includes('RESOURCE_EXHAUSTED') || message.includes('429')
          ? 429
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
