import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

const outputDirectory = "../wwwroot/App_Plugins/TheBuilder.WebAnalytics";

function packageManifest(): Plugin {
  const manifest = JSON.parse(
    readFileSync(new URL("./umbraco-package.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  const clientPackage = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const version = process.env.PACKAGE_VERSION ?? clientPackage.version;

  return {
    name: "thebuilder-package-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "umbraco-package.json",
        source: `${JSON.stringify({ ...manifest, version }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [packageManifest()],
  build: {
    lib: {
      entry: "src/bundle.manifests.ts", // Bundle registers one or more manifests
      formats: ["es"],
      fileName: "web-analytics",
    },
    outDir: outputDirectory, // your web component will be saved in this location
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: [/^@umbraco/],
    },
  },
});
