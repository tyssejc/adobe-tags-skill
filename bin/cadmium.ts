#!/usr/bin/env bun
import { run } from "../src/cli.ts";
run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
