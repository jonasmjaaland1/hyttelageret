// Bildesjekk: tar imot bilder av ett skap og lista over registrerte varer,
// spør Claude, og returnerer forslag som JSON. API-nøkkelen finnes bare her på serveren.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { checkMember, AUTH_STATUS } from "./_auth.js";
import { z } from "zod";

const PLACES: Record<string, string> = {
  kjol: "kjøleskapet",
  frys: "fryseren",
  torr: "matskapet (tørrvarer, hermetikk, krydder, drikke)",
  hus: "skapet for husholdningsartikler (dopapir, oppvask, tenning og annet som ikke er mat)",
};
const CATEGORIES = [
  "frukt", "brod", "meieri", "palegg", "kjott", "frys", "torr",
  "hermetikk", "krydder", "snacks", "drikke", "hus", "annet",
] as const;
const LEVELS = ["ok", "lite", "tomt"] as const;
const MAX_IMAGES = 5;
const MAX_IMAGE_CHARS = 1_400_000; // base64, ca. 1 MB per bilde

const Result = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      seen: z.enum(["ja", "nei", "usikker"]),
      level: z.enum(LEVELS).nullable(),
    }),
  ),
  new: z.array(
    z.object({
      name: z.string(),
      category: z.enum(CATEGORIES),
      staple: z.boolean(),
      level: z.enum(LEVELS),
      count: z.number().int(),
      shelf_days: z.number().int().nullable(),
    }),
  ),
});

const Body = z.object({
  place: z.enum(["kjol", "frys", "torr", "hus"]),
  known: z
    .array(z.object({ id: z.string(), name: z.string().max(80), status: z.enum(LEVELS) }))
    .max(300),
  images: z.array(z.string().min(100).max(MAX_IMAGE_CHARS)).min(1).max(MAX_IMAGES),
});

const anthropic = new Anthropic(); // leser ANTHROPIC_API_KEY

function buildPrompt(place: string, known: z.infer<typeof Body>["known"]): string {
  return `Bildene viser ${PLACES[place]} på en hytte på fjellet. Oppgaven er å oppdatere lageroversikten for dette stedet.

Registrerte varer her (JSON): ${JSON.stringify(known)}

For HVER registrerte vare, avgjør:
- "seen": "ja" hvis du tydelig ser varen; "nei" hvis stedet der den naturlig ville stått er godt synlig og varen ikke er der; "usikker" hvis den kan være skjult bak noe, utenfor bildet, eller du ikke kan skille den fra noe annet.
- "level": "ok", "lite" eller "tomt" når seen er "ja", ellers null. Bruk "lite" bare når det tydelig er lite igjen (nesten tom flaske eller pose, siste pakke).
Velg heller "usikker" enn "nei" når du er i tvil. Et feil "nei" fører til at vi kjøper noe vi allerede har.

List også varer du ser tydelig som IKKE står i listen over ("new"). Bruk korte norske navn slik folk skriver dem på en handleliste (for eksempel "Kaffe", "Hvetemel", "Leverpostei"), ikke merkenavn. Slå sammen like varer. For hver ny vare: "category", "staple" (true hvis det er en basisvare man vanligvis alltid vil ha på hytta, som kaffe, salt, olje eller dopapir), "level", "count" (antall pakker; 1 hvis du ikke kan telle), og "shelf_days": omtrent hvor mange dager varen holder seg der den står etter at den er kjøpt eller åpnet (for eksempel melk 7, brød 4, smør 60, ketchup 180). Bruk null for varer som holder seg i mange måneder, som tørrvarer, hermetikk, husholdningsartikler og alt i fryseren.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const auth = await checkMember(req);
  if (auth !== "ok") return res.status(AUTH_STATUS[auth]).json({ error: auth });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_request" });
  const { place, known, images } = parsed.data;

  const content: Anthropic.ContentBlockParam[] = images.map((data) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: data.replace(/^data:image\/\w+;base64,/, "") },
  }));
  content.push({ type: "text", text: buildPrompt(place, known) });

  try {
    const response = await anthropic.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Result) },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return res.status(502).json({ error: "unreadable" });
    }
    console.log("analyze ok", { place, images: images.length, usage: response.usage });
    return res.status(200).json(response.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (e instanceof Anthropic.BadRequestError) {
      console.error("bad request to Claude", e.message);
      return res.status(400).json({ error: "image_rejected" });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic API key rejected");
      return res.status(500).json({ error: "server_config" });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      return res.status(502).json({ error: "upstream" });
    }
    console.error("analyze failed", e);
    return res.status(500).json({ error: "upstream" });
  }
}
