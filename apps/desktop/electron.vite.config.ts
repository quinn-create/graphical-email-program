import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const workspacePackages = [
  "@mattermail/shared",
  "@mattermail/security",
  "@mattermail/domain",
  "@mattermail/database",
  "@mattermail/gmail",
  "@mattermail/clio",
  "@mattermail/drive",
  "@mattermail/quest-email",
  "@mattermail/extraction",
  "@mattermail/matching",
  "@mattermail/learning",
  "@mattermail/reporting",
  "@mattermail/ai-core",
  "@mattermail/ai-openai",
  "@mattermail/ai-anthropic",
  "@mattermail/ai-gemini",
  "@mattermail/ai-xai",
  "@mattermail/ai-mistral",
  "@mattermail/ai-openrouter",
  "@mattermail/ai-azure-openai",
  "@mattermail/ai-openai-compatible",
  "@mattermail/ai-ollama",
];

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: workspacePackages,
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
        external: ["better-sqlite3", "electron"],
      },
    },
    resolve: {
      alias: Object.fromEntries(
        workspacePackages.map((name) => {
          const pkg = name.replace("@mattermail/", "");
          return [name, resolve(__dirname, `../../packages/${pkg}/src/index.ts`)];
        }),
      ),
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
        external: ['electron'],
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
    plugins: [react()],
  },
});
