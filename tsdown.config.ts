import {
  defineConfig,
} from "tsdown";

const entry = ["./src/index.ts", "./src/node.ts", "./src/web.ts"];

export default defineConfig([
  {
    entry,
    treeshake: false,
    unbundle: true,
    attw: true,
    platform: "node",
    target: "es2020",
    outDir: "./dist",
    clean: true,
    sourcemap: true,
    dts: true,
    format: ["cjs"],
  },
  {
    entry,
    treeshake: false,
    unbundle: true,
    attw: true,
    platform: "node",
    target: "es2020",
    outDir: "./dist",
    clean: true,
    sourcemap: true,
    dts: true,
    format: ["esm"],
  },
]);
