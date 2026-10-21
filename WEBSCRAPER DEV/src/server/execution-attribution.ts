export type ExecutionCountry = 'GT' | 'NC';

export type ExecutionAttribution = Readonly<{
  executionId: string;
  userId: string;
  country: ExecutionCountry;
}>;

export type PersistedExecutionJob = {
  id: string;
  actorUserId?: string;
  country?: ExecutionCountry;
  stores?: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
};

// Composición explícita: no se configura ni conecta PostgreSQL al importar.
export type ExecutionPersistence = {
  country: ExecutionCountry;
  create: (job: PersistedExecutionJob) => Promise<void>;
  start: (job: PersistedExecutionJob) => Promise<void>;
  finish: (job: PersistedExecutionJob) => Promise<void>;
};

export function executionWorkerEnvironment(base: NodeJS.ProcessEnv, context?: ExecutionAttribution): NodeJS.ProcessEnv {
  const environment = { ...base };
  for (const key of ['CATALOG_EXECUTION_ID', 'CATALOG_EXECUTION_USER_ID', 'CATALOG_EXECUTION_COUNTRY']) delete environment[key];
  if (context) {
    environment.CATALOG_EXECUTION_ID = context.executionId;
    environment.CATALOG_EXECUTION_USER_ID = context.userId;
    environment.CATALOG_EXECUTION_COUNTRY = context.country;
  }
  return environment;
}
