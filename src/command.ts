export type Cmd = (rest: string[], flags: Record<string, unknown>) => Promise<number>;
