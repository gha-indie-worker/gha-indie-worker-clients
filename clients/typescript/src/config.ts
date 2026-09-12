import { ClientError } from "./errors.js";

export interface ClientConfig {
  baseUrl: string;
  bearerToken?: string;
  maxResponseBytes: number;
}

export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
): ClientConfig {
  const baseUrl = env["GHA_INDIE_WORKER_API_BASE"]?.trim();
  if (!baseUrl) {
    throw new ClientError("invalid_base");
  }
  const bearerToken = env["GHA_INDIE_WORKER_TOKEN"];
  return {
    baseUrl,
    ...(bearerToken ? { bearerToken } : {}),
    maxResponseBytes: 64 * 1024,
  };
}
