import { describe, expect, it } from 'vitest';
import { HARVESTER_NAV_ITEMS, findHarvesterNavItem } from './harvesterNav';
import { HCI } from './harvesterTypes';
import { buildDemoDashboard, buildDemoResourceList } from './harvesterResourceCatalog';
import { buildVmActions } from './harvesterVmActions';

describe('harvesterNav', () => {
  it('includes core Harvester root resources from upstream UI extension', () => {
    const ids = HARVESTER_NAV_ITEMS.map((item) => item.id);
    expect(ids).toContain(HCI.DASHBOARD);
    expect(ids).toContain(HCI.VM);
    expect(ids).toContain(HCI.HOST);
    expect(ids).toContain(HCI.VOLUME);
    expect(ids).toContain(HCI.IMAGE);
    expect(ids).toContain(HCI.SETTING);
  });

  it('finds nav metadata by resource type', () => {
    const vm = findHarvesterNavItem(HCI.VM);
    expect(vm?.label).toBe('Virtual Machines');
    expect(vm?.creatable).toBe(true);
  });
});

describe('harvesterResourceCatalog', () => {
  it('builds demo VM rows from machines dashboard', () => {
    const list = buildDemoResourceList(HCI.VM);
    expect(list.dataSource).toBe('demo');
    expect(list.rows.length).toBeGreaterThan(0);
    expect(list.rows.every((row) => row.type === HCI.VM)).toBe(true);
  });

  it('builds demo dashboard with cluster counts', () => {
    const dash = buildDemoDashboard();
    expect(dash.vmCount).toBeGreaterThan(0);
    expect(dash.nodeCount).toBeGreaterThan(0);
    expect(dash.recentEvents.length).toBeGreaterThan(0);
  });
});

describe('harvesterVmActions', () => {
  it('enables start for stopped VMs and stop for running VMs', () => {
    const stopped = buildVmActions({
      id: 'vm-1',
      name: 'test',
      type: HCI.VM,
      state: 'stopped',
      age: '1h',
    });
    expect(stopped.find((a) => a.id === 'start')?.enabled).toBe(true);
    expect(stopped.find((a) => a.id === 'stop')?.enabled).toBe(false);

    const running = buildVmActions({
      id: 'vm-2',
      name: 'test2',
      type: HCI.VM,
      state: 'running',
      age: '1h',
    });
    expect(running.find((a) => a.id === 'stop')?.enabled).toBe(true);
    expect(running.find((a) => a.id === 'migrate')?.enabled).toBe(true);
  });
});
