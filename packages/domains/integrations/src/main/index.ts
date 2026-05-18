export { registerIntegrationHandlers, ensureIntegrationSchema } from './handlers'
export type { IntegrationHandles } from './handlers'
export {
  startSyncPoller,
  pushTaskAfterEdit,
  pushNewTaskToProviders,
  pushArchiveToProviders,
  pushUnarchiveToProviders,
  startDiscoveryPoller,
  resetSyncFlags
} from './sync'
export { getAdapter, getRegisteredProviders, registerAdapter } from './adapters'
export type { ProviderAdapter, NormalizedIssue, ExternalGroup, ExternalScope } from './adapters'
