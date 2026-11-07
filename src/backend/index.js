// Velger datalag. `npm run dev:mock` gir testversjonen uten database.
import * as real from "./supabase.js";
import * as mock from "./mock.js";

export default import.meta.env.MODE === "mock" ? mock : real;
