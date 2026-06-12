import type { HarvesterResourceRow, HarvesterVmAction } from './harvesterTypes';

/** VM action catalog aligned with harvester-ui-extension kubevirt.io.virtualmachine model */
export function buildVmActions(row: HarvesterResourceRow | null, selectedCount = 0): HarvesterVmAction[] {
  const running = row?.state === 'running';
  const stopped = row?.state === 'stopped';
  const paused = row?.state === 'paused';
  const migrating = row?.state === 'migrating';
  const hasSelection = selectedCount > 0 || row !== null;

  return [
    { id: 'start', label: 'Start', icon: '▶', enabled: hasSelection && stopped, bulkable: true },
    { id: 'stop', label: 'Stop', icon: '■', enabled: hasSelection && running && !migrating, bulkable: true },
    { id: 'forceStop', label: 'Force Stop', icon: '⏹', enabled: hasSelection && (running || paused), bulkable: true, danger: true },
    { id: 'pause', label: 'Pause', icon: '⏸', enabled: hasSelection && running, bulkable: false },
    { id: 'unpause', label: 'Unpause', icon: '⏵', enabled: hasSelection && paused, bulkable: false },
    { id: 'restart', label: 'Restart', icon: '↻', enabled: hasSelection && running, bulkable: true },
    { id: 'softreboot', label: 'Soft Reboot', icon: '⟳', enabled: hasSelection && running, bulkable: true },
    { id: 'backup', label: 'Backup', icon: '💾', enabled: hasSelection && running, bulkable: false },
    { id: 'vmSnapshot', label: 'Take Snapshot', icon: '📸', enabled: hasSelection && running, bulkable: false },
    { id: 'migrate', label: 'Migrate', icon: '⇄', enabled: hasSelection && running && !migrating, bulkable: true },
    { id: 'abortMigration', label: 'Abort Migration', icon: '✕', enabled: hasSelection && migrating, bulkable: false },
    { id: 'storageMigration', label: 'Storage Migration', icon: '⇆', enabled: hasSelection && running, bulkable: false },
    { id: 'addVolume', label: 'Add Volume', icon: '+', enabled: hasSelection && running, bulkable: false },
    { id: 'addNic', label: 'Add NIC', icon: '+', enabled: hasSelection && running, bulkable: false },
    { id: 'createTemplate', label: 'Create Template', icon: '⧉', enabled: hasSelection && row !== null, bulkable: false },
    { id: 'viewLogs', label: 'View Logs', icon: '≡', enabled: hasSelection && running, bulkable: false },
    { id: 'console', label: 'Serial Console', icon: '⌨', enabled: hasSelection && running, bulkable: false },
    { id: 'vnc', label: 'VNC', icon: '🖥', enabled: hasSelection && running, bulkable: false },
  ];
}

export function buildGenericActions(creatable: boolean): HarvesterVmAction[] {
  const actions: HarvesterVmAction[] = [];
  if (creatable) {
    actions.push({ id: 'create', label: 'Create', icon: '+', enabled: true });
  }
  actions.push(
    { id: 'refresh', label: 'Refresh', icon: '↻', enabled: true },
    { id: 'yaml', label: 'Edit as YAML', icon: '{ }', enabled: false },
    { id: 'delete', label: 'Delete', icon: '🗑', enabled: false, danger: true },
  );
  return actions;
}
