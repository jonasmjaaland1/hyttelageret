// Planleggeren: lager menyforslag for en hyttetur, eller bytter ut én rett.
// Tar med lageret, så det som allerede er på hytta ikke havner på handlelisten.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { checkMember, AUTH_STATUS } from "./_auth.js";

const CATEGORIES = [
  "frukt", "brod", "meieri", "palegg", "kjott", "frys", "torr",
  "hermetikk", "krydder", "snacks", "drikke", "hus", "annet",
] as const;
const MEAL_TYPES = ["frokost", "lunsj", "middag"] as const;

const Ingredient = z.object({
  name: z.string(),
  amount: z.string(),
  category: z.enum(CATEGORIES),
  have: z.boolean(),
});
const Meal = z.object({
  day: z.number().int(),
  type: z.enum(MEAL_TYPES),
  title: z.string(),
  description: z.string(),
  ingredients: z.array(Ingredient),
});
const PlanResult = z.object({ meals: z.array(Meal) });
const ReplaceResult = z.object({ meal: Meal });

const Body = z.object({
  days: z.number().int().min(1).max(14),
  people: z.number().int().min(1).max(20),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(3),
  wishes: z.string().max(1000).default(""),
  inventory: z.array(z.object({ name: z.string().max(80), status: z.enum(["ok", "lite", "tomt"]) })).max(400),
  replace: z
    .object({
      day: z.number().int(),
      type: z.enum(MEAL_TYPES),
      wish: z.string().max(300).default(""),
      otherTitles: z.array(z.string().max(120)).max(50),
      oldTitle: z.string().max(120),
    })
    .optional(),
});

const anthropic = new Anthropic();

const RULES = `Regler:
- Hytta ligger på fjellet (Bortelid i Agder). Kjøkkenet har komfyr, stekeovn og grill, men ikke alt et hjemmekjøkken har. Foretrekk retter som er greie å lage på hytta, med få gryter.
- Middager kan gjerne være norske hyttefavoritter og vanlig familiemat. Følg ønskene nøye.
- Mengder skal passe antall personer, skrevet kort på norsk, for eksempel "400 g", "1 pk", "2 stk", "1 boks".
- "have" er true bare når ingrediensen tydelig finnes i lageret med status "ok" eller "lite". Basisvarer som salt, pepper og olje regnes bare som tilgjengelige når de står i lageret.
- Ingrediensnavn skal være korte handlelistenavn uten merkenavn, for eksempel "Kjøttdeig", "Tacoskjell", "Rømme".
- "description" er én kort setning som beskriver retten.
- Kategorier: frukt, brod, meieri, palegg, kjott, frys, torr, hermetikk, krydder, snacks, drikke, hus, annet.`;

function inventoryText(inv: z.infer<typeof Body>["inventory"]): string {
  const have = inv.filter(i => i.status !== "tomt").map(i => `${i.name}${i.status === "lite" ? " (lite igjen)" : ""}`);
  return have.length ? have.join(", ") : "(tomt)";
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
  const b = parsed.data;
  const base = `Vi skal på hytta i ${b.days} dag${b.days === 1 ? "" : "er"}, ${b.people} person${b.people === 1 ? "" : "er"}.
Måltider som skal planlegges: ${b.mealTypes.join(", ")}.
Ønsker: ${b.wishes.trim() || "(ingen spesielle)"}
Dette står allerede på hytta: ${inventoryText(b.inventory)}

${RULES}`;

  try {
    if (b.replace) {
      const r = b.replace;
      const prompt = `${base}

Bytt ut ${r.type} dag ${r.day} ("${r.oldTitle}") med en annen rett.${r.wish.trim() ? ` Ønske for den nye retten: ${r.wish.trim()}` : ""}
Den nye retten skal ikke være lik noen av disse: ${[r.oldTitle, ...r.otherTitles].join(", ")}.
Svar med den nye retten som "meal", med day ${r.day} og type "${r.type}".`;
      const response = await anthropic.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        output_config: { effort: "low", format: zodOutputFormat(ReplaceResult) },
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
      if (!response.parsed_output) return res.status(502).json({ error: "unreadable" });
      console.log("plan replace ok", { usage: response.usage });
      return res.status(200).json(response.parsed_output);
    }

    const prompt = `${base}

Lag en meny med ett måltid per valgt måltidstype per dag (dag 1 til ${b.days}). Varier rettene. Første kvelds middag bør være enkel, siden vi kommer fram sent.
Svar med "meals" sortert etter dag og måltid (frokost, lunsj, middag).`;
    const response = await anthropic.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(PlanResult) },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    if (response.stop_reason === "max_tokens" || !response.parsed_output) return res.status(502).json({ error: "unreadable" });
    console.log("plan ok", { days: b.days, meals: response.parsed_output.meals.length, usage: response.usage });
    return res.status(200).json(response.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic API key rejected");
      return res.status(500).json({ error: "server_config" });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      return res.status(502).json({ error: "upstream" });
    }
    console.error("plan failed", e);
    return res.status(500).json({ error: "upstream" });
  }
}
