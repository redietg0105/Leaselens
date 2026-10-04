/**
 * Pure dispatch rules from packages/shared: vendor ranking, cost estimate, auto-dispatch decision,
 * queue order, and which area of the app each role uses.
 */
import {
  areaForRole,
  autoDispatchDecision,
  estimateCostUsd,
  homePathForRole,
  QUEUE_URGENCY_RANK,
  rankVendors,
  type AutoDispatchInput,
  type VendorForMatching,
} from '@leaselens/shared';

const v = (over: Partial<VendorForMatching> & Pick<VendorForMatching, 'id' | 'trades'>): VendorForMatching => ({
  name: over.id,
  hourlyRate: 100,
  firstTimeFixRate: 0.8,
  available: true,
  ...over,
});

describe('rankVendors', () => {
  const vendors = [
    v({ id: 'plumber-cheap', trades: ['PLUMBING'], hourlyRate: 80, firstTimeFixRate: 0.74 }),
    v({ id: 'plumber-good', trades: ['PLUMBING'], hourlyRate: 95, firstTimeFixRate: 0.88 }),
    v({ id: 'plumber-busy', trades: ['PLUMBING'], hourlyRate: 70, firstTimeFixRate: 0.95, available: false }),
    v({ id: 'plumber-pricey', trades: ['PLUMBING'], hourlyRate: 200, firstTimeFixRate: 0.9 }),
    v({ id: 'electrician', trades: ['ELECTRICAL'], hourlyRate: 50, firstTimeFixRate: 0.99 }),
    v({ id: 'handyman', trades: ['STRUCTURAL', 'OTHER'], hourlyRate: 60 }),
  ];

  it('only offers vendors with the right trade', () => {
    const ids = rankVendors('PLUMBING', vendors, 10).map((m) => m.vendorId);
    expect(ids).not.toContain('electrician');
    expect(ids).not.toContain('handyman');
    expect(ids).toHaveLength(4);
    expect(rankVendors('PEST', vendors)).toEqual([]);
  });

  it('returns the top 3, available vendors ahead of unavailable ones', () => {
    const top = rankVendors('PLUMBING', vendors);
    expect(top).toHaveLength(3);
    expect(top.map((m) => m.vendorId)).not.toContain('plumber-busy');
    expect(top[0].vendorId).toBe('plumber-good'); // best first-time-fix among affordable, available ones
  });

  it('explains each match in plain words with an estimated cost', () => {
    const [best] = rankVendors('PLUMBING', vendors);
    expect(best.estimatedCostUsd).toBe(190); // $95/h × 2 h
    expect(best.reason).toBe('Plumbing · available now · fixes 88% on first visit · $95/h, about $190');
  });

  it('breaks ties by cost, then name', () => {
    const twins = [
      v({ id: 'b', trades: ['PEST'], hourlyRate: 70 }),
      v({ id: 'a', trades: ['PEST'], hourlyRate: 70 }),
    ];
    expect(rankVendors('PEST', twins).map((m) => m.vendorId)).toEqual(['a', 'b']);
  });

  it('estimates cost as hourly rate × typical hours for the trade', () => {
    expect(estimateCostUsd(100, 'HVAC')).toBe(250);
    expect(estimateCostUsd(75, 'LOCKS_ACCESS')).toBe(75);
  });
});

describe('autoDispatchDecision', () => {
  const top = rankVendors('PLUMBING', [v({ id: 'p', trades: ['PLUMBING'], hourlyRate: 95 })])[0]; // ≈ $190
  const ok: AutoDispatchInput = {
    urgency: 'ROUTINE',
    status: 'TRIAGED',
    aiValid: true,
    confidence: 0.9,
    emergencyRule: null,
    top,
    limitUsd: 250,
  };

  it('dispatches a routine, confident job below the limit', () => {
    expect(autoDispatchDecision(ok).dispatch).toBe(true);
  });

  it('respects the limit: just below dispatches, equal or above does not', () => {
    expect(autoDispatchDecision({ ...ok, limitUsd: 190.01 }).dispatch).toBe(true);
    expect(autoDispatchDecision({ ...ok, limitUsd: 190 })).toEqual({
      dispatch: false,
      reason: 'Estimated $190 is not below the $190 limit',
    });
    expect(autoDispatchDecision({ ...ok, limitUsd: 100 }).dispatch).toBe(false);
  });

  it.each([
    ['limit 0 (off)', { limitUsd: 0 }],
    ['URGENT', { urgency: 'URGENT' as const }],
    ['EMERGENCY', { urgency: 'EMERGENCY' as const }],
    ['unknown urgency', { urgency: null }],
    ['waiting for tenant answers', { status: 'NEEDS_INFO' as const }],
    ['needs review', { status: 'NEEDS_REVIEW' as const }],
    ['an emergency rule matched', { emergencyRule: 'gas-smell' }],
    ['invalid AI output', { aiValid: false }],
    ['confidence 0.79', { confidence: 0.79 }],
    ['no confidence', { confidence: null }],
    ['no vendor with the trade', { top: undefined }],
    ['best vendor unavailable', { top: { ...top, available: false } }],
  ])('does not dispatch when %s', (_label, change) => {
    expect(autoDispatchDecision({ ...ok, ...change }).dispatch).toBe(false);
  });

  it('accepts confidence of exactly 0.8', () => {
    expect(autoDispatchDecision({ ...ok, confidence: 0.8 }).dispatch).toBe(true);
  });
});

describe('queue order', () => {
  it('is EMERGENCY, URGENT, unknown, ROUTINE', () => {
    const order = (['ROUTINE', 'NONE', 'EMERGENCY', 'URGENT'] as const).slice().sort((a, b) => QUEUE_URGENCY_RANK[a] - QUEUE_URGENCY_RANK[b]);
    expect(order).toEqual(['EMERGENCY', 'URGENT', 'NONE', 'ROUTINE']);
  });
});

describe('role areas', () => {
  it.each([
    ['TENANT', '/tenant', '/tenant'],
    ['VENDOR', '/vendor', '/vendor/jobs'],
    ['COORDINATOR', '/staff', '/staff'],
    ['LEASING', '/staff', '/staff'],
    ['MANAGER', '/staff', '/staff'],
  ] as const)('%s → area %s, home %s', (role, area, home) => {
    expect(areaForRole(role)).toBe(area);
    expect(homePathForRole(role)).toBe(home);
  });
});
