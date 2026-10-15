import { DOCS_ACCENT } from "@thebuilder/umbraco-docs";
import { defineOgConfig } from "@thebuilder/umbraco-docs/og";
import { fileURLToPath } from "node:url";

export default defineOgConfig({
  contentDir: fileURLToPath(new URL("./docs", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  prefix: "/og",
  brand: "TheBuilder · Web Analytics",
  // The card is always dark, so its glow takes the shared accent's dark shade.
  accent: DOCS_ACCENT.dark,
  logo: "/logo-mark.svg",
  root: {
    title: "Web Analytics",
    description: "Bring Vercel Web Analytics and Plausible reports into the Umbraco backoffice.",
  },
});
