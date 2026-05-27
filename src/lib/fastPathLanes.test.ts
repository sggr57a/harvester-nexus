import { describe, expect, it } from 'vitest';
import { lanesInDrop, projectFastPathLanes, totalLaneIops } from './fastPathLanes';
import type { FastPathLaneSample } from './liveTelemetry';

function lane(over: Partial<FastPathLaneSample>): FastPathLaneSample {
  return {
    id: 'spdk', label: 'SPDK', queueDepth: 10, queueCapacity: 64, drops: 0, irqRate: 100_000, iops: 200_000,
    ...over,
  };
}

describe('fastPathLanes · projectFastPathLanes', () => {
  it('always emits 12 segments per lane', () => {
    const out = projectFastPathLanes([lane({})]);
    expect(out[0].segmentCount).toBe(12);
  });

  it('queueFill is the queueDepth / queueCapacity ratio, clamped to 0..1', () => {
    expect(projectFastPathLanes([lane({ queueDepth: 0, queueCapacity: 64 })])[0].queueFill).toBe(0);
    expect(projectFastPathLanes([lane({ queueDepth: 32, queueCapacity: 64 })])[0].queueFill).toBe(0.5);
    expect(projectFastPathLanes([lane({ queueDepth: 128, queueCapacity: 64 })])[0].queueFill).toBe(1);
  });

  it('classifies optimal / busy / backlog / drop', () => {
    expect(projectFastPathLanes([lane({ queueDepth: 10, queueCapacity: 64 })])[0].status).toBe('optimal');
    expect(projectFastPathLanes([lane({ queueDepth: 40, queueCapacity: 64 })])[0].status).toBe('busy');
    expect(projectFastPathLanes([lane({ queueDepth: 60, queueCapacity: 64 })])[0].status).toBe('backlog');
    expect(projectFastPathLanes([lane({ drops: 3, queueDepth: 10, queueCapacity: 64 })])[0].status).toBe('drop');
  });

  it('drop status fully lights all 12 segments', () => {
    const out = projectFastPathLanes([lane({ drops: 3 })])[0];
    expect(out.segmentsLit).toBe(12);
    expect(out.segmentsCritical).toBeGreaterThan(0);
  });

  it('backlog status emits non-zero warning segments', () => {
    const out = projectFastPathLanes([lane({ queueDepth: 60, queueCapacity: 64 })])[0];
    expect(out.segmentsWarning).toBeGreaterThan(0);
  });

  it('preserves the lane id and label', () => {
    const out = projectFastPathLanes([lane({ id: 'rdma', label: 'RDMA' })])[0];
    expect(out.id).toBe('rdma');
    expect(out.label).toBe('RDMA');
  });
});

describe('fastPathLanes · totalLaneIops', () => {
  it('sums IOPS across all lanes', () => {
    const lanes = projectFastPathLanes([lane({ iops: 100 }), lane({ id: 'dpdk', iops: 200 }), lane({ id: 'rdma', iops: 50 })]);
    expect(totalLaneIops(lanes)).toBe(350);
  });
});

describe('fastPathLanes · lanesInDrop', () => {
  it('counts lanes with status === drop', () => {
    const lanes = projectFastPathLanes([
      lane({ id: 'spdk', drops: 1 }),
      lane({ id: 'dpdk', drops: 0, queueDepth: 5 }),
      lane({ id: 'rdma', drops: 4 }),
    ]);
    expect(lanesInDrop(lanes)).toBe(2);
  });
});
