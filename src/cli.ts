export async function run(argv: string[]): Promise<number> {
  const [command] = argv;
  if (!command || command === "--help") {
    console.log("cadmium <command> [args]\nCommands: init, sync, status, overview, ls, refs, sets-variable, grep, triggers, unpublished");
    return 0;
  }
  console.error(`Unknown command: ${command}`);
  return 1;
}
