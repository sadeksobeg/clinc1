/**
 * Minimal typings for optional `redis` runtime dependency.
 * Resolves `Cannot find module 'redis'` when node_modules is incomplete; when `redis`
 * is installed, its own types take precedence in most setups.
 */
declare module "redis" {
  export function createClient(options: { url: string }): RedisClient;
  export interface RedisClient {
    connect(): Promise<void>;
    on(event: string, listener: (err: Error) => void): unknown;
    xAdd(key: string, id: string, message: Record<string, string>): Promise<string>;
  }
}
