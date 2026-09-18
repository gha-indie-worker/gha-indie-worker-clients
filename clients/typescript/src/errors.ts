export type ClientErrorCode =
  | "invalid_base"
  | "empty_token"
  | "http"
  | "too_large"
  | "invalid_json"
  | "invalid_shape";

export class ClientError extends Error {
  constructor(readonly code: ClientErrorCode) {
    super(code);
    this.name = "ClientError";
  }
}

export function asClientError(error: unknown): ClientError {
  return error instanceof ClientError ? error : new ClientError("http");
}
