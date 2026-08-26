export interface Health {
  ok: boolean;
  service: string;
}

export interface ResourceEnvelope {
  id: string;
  revision: string;
  payload: Record<string, unknown>;
}

export const RESOURCE = "WorkerLease" as const;

