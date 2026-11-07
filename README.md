# Hyttelageret

Matlager og handleliste for hytta på Bortelid. Mobilapp (PWA) på Vercel med Supabase som database og Claude til bildesjekken.

- **Handleliste:** Det som er lite eller tomt havner her av seg selv, delt på Kristiansand og Bortelid.
- **Lager:** Kjøleskap, fryser, tørrskap og husholdning med status Nok, Lite eller Tomt. Fryseren har antall og frysedato.
- **Avreisesjekk:** Ta bilder av et skap. Claude sammenligner bildene med lageret og foreslår endringer du godkjenner.
- **Hjemme / på hytta:** «Vi drar» spør når dere kommer tilbake og hjelper dere med ferskvarer som ikke holder til da. Hjemme viser appen hva som trolig har gått ut før neste tur. «Vi er på hytta» lar dere kaste det som er gått ut.

## Oppsett (én gang)

### 1. Supabase

1. Lag et nytt prosjekt på [supabase.com](https://supabase.com). Velg regionen **Stockholm (eu-north-1)**.
2. Åpne **SQL Editor → New query** og lim inn hele [supabase/schema.sql](supabase/schema.sql).
   Bytt ut de to e-postadressene nederst med din og Christinas før du trykker **Run**.
   Kjør deretter [supabase/002_turer.sql](supabase/002_turer.sql) og [supabase/003_posisjon.sql](supabase/003_posisjon.sql) på samme måte.
3. Gå til **Authentication → Emails → Magic Link** og legg til koden i e-posten, for eksempel:
   ```
   <h2>Kode til Hyttelageret</h2>
   <p>Skriv inn denne koden i appen: <strong>{{ .Token }}</strong></p>
   <p>Eller logg inn med <a href="{{ .ConfirmationURL }}">denne lenken</a>.</p>
   ```
   Koden trengs fordi en app på hjemskjermen på iPhone ikke kan ta imot innloggingslenker.
4. Hent **Project URL** og **anon public key** under **Project Settings → API**.

### 2. Vercel

1. **Add New → Project** og importer GitHub-repoet `hyttelageret`. Vercel finner Vite selv.
2. Legg inn tre miljøvariabler (Environment Variables):

   | Navn | Verdi |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL fra Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon public key fra Supabase |
   | `ANTHROPIC_API_KEY` | API-nøkkelen fra console.anthropic.com |

3. Trykk **Deploy**.
4. Tilbake i Supabase: **Authentication → URL Configuration**. Sett **Site URL** til Vercel-adressen, for eksempel `https://hyttelageret.vercel.app`.

### 3. På mobilen

1. Åpne Vercel-adressen i Safari (eller Chrome på Android).
2. Del → **Legg til på Hjem-skjerm**.
3. Åpne appen fra hjemskjermen, skriv inn e-posten og koden du får tilsendt.

## Utvikling

```bash
npm install
npm run dev:mock   # testversjon uten database, med falsk bildesjekk
npm run dev        # mot ekte Supabase (krever .env.local, se .env.example)
npm run build
npm run typecheck  # sjekker serverfunksjonen
```

Bildesjekken (`api/analyze.ts`) kjører bare på Vercel. Lokalt kan den testes med `vercel dev`.

## Slik henger det sammen

- `src/main.js`: hele brukerflaten.
- `src/backend/supabase.js`: lesing, skriving og sanntid mot Supabase. `mock.js` er testversjonen.
- `api/analyze.ts`: Vercel-funksjon som sjekker at brukeren står på lista, sender bildene til Claude (`claude-opus-5-5`) og returnerer forslag som JSON. API-nøkkelen ligger bare her.
- `supabase/schema.sql`: tabeller og tilgangsregler. Bare adressene i `allowed_emails` kan lese eller endre data. Det håndheves i databasen.
- `public/sw.js`: gjør appen installerbar og lar den åpne seg uten nett. Data krever nett.

## Kostnad

Supabase og Vercel holder seg innenfor gratisnivåene ved bruk av to personer. Bildesjekken betales per gang via Anthropic-kontoen. Bildene krympes til 1280 px før de sendes, og hver sjekk logges med tokenforbruk i Vercel-loggen.

Gratisprosjekter i Supabase settes på pause etter en lengre periode uten bruk. Skjer det, logger du inn på supabase.com og trykker **Restore**.
