interface R2Object { body: ReadableStream<Uint8Array>; }
interface R2Bucket { put(key: string, value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string, options?: unknown): Promise<R2Object | null>; get(key: string): Promise<R2Object | null>; delete(key: string): Promise<void>; }
interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown>; }
interface D1Database { prepare(query: string): D1PreparedStatement; }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; }
interface ScheduledController { scheduledTime: number; cron: string; noRetry(): void; }
interface ExportedHandler<Env> { fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>; scheduled?(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>; }
