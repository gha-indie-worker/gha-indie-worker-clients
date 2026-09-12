export interface Health {
  readonly ok: boolean;
  readonly service: string;
}

export interface ResourceEnvelope {
  readonly id: string;
  readonly revision: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export const RESOURCE = "WorkerLease" as const;
