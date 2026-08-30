import type { ClientConfig } from "./config.js";
import { ClientError } from "./errors.js";
import type { Health } from "./types.js";

export class Client {
  private readonly config: Readonly<ClientConfig>;

  constructor(config: ClientConfig) {
    if (!config.baseUrl.trim()) {
      throw new ClientError("invalid_base");
    }
    this.config = Object.freeze({ ...config });
  }

  healthUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/v1/health`;
  }

  decodeHealth(body: Uint8Array): Health {
    if (body.byteLength > this.config.maxResponseBytes) {
      throw new ClientError("too_large");
    }
    try {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(body));
      if (!isHealth(decoded)) {
        throw new ClientError("invalid_shape");
      }
      return Object.freeze({ ok: decoded.ok, service: decoded.service });
    } catch (error) {
      if (error instanceof ClientError) {
        throw error;
      }
      throw new ClientError("invalid_json");
    }
  }
}

function isHealth(value: unknown): value is Health {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean" &&
    "service" in value &&
    typeof value.service === "string" &&
    value.service.length > 0
  );
}
