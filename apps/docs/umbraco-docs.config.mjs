import { defineOgConfig } from "@thebuilder/umbraco-docs/og";
import { fileURLToPath } from "node:url";

export default defineOgConfig({
  contentDir: fileURLToPath(new URL("./docs", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  prefix: "/og",
  brand: "TheBuilder · Web Analytics",
  accent: "#3544b1",
  root: {
    title: "Web Analytics",
    description: "Bring Vercel Web Analytics and Plausible reports into the Umbraco backoffice.",
  },
});
