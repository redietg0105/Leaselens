/**
 * Fictional sample data for local development (docs/SPEC.md section 6).
 * Pure function — no database access — so it can be unit tested.
 * All people, companies and addresses are invented. Emails use the reserved `.test` TLD.
 * Lease PDFs are added with the lease-abstraction feature.
 */
import type {
  Category,
  MediaKind,
  NotificationChannel,
  Role,
  Urgency,
  WorkOrderStatus,
} from '@prisma/client';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** SLA from creation, by urgency. */
export const SLA_HOURS: Record<Urgency, number> = { EMERGENCY: 4, URGENT: 24, ROUTINE: 72 };

export const SEED_MODEL = 'seed';
export const SEED_PROMPT_VERSION = 'seed-v0';

export interface SeedData {
  properties: { id: string; name: string; address: string }[];
  units: { id: string; buildingId: string; number: string; stack: string; floor: number; unitType: string }[];
  vendors: {
    id: string;
    name: string;
    trades: Category[];
    serviceArea: string;
    hourlyRate: number;
    firstTimeFixRate: number;
    available: boolean;
  }[];
  users: { id: string; email: string; name: string; role: Role; unitId?: string; vendorId?: string }[];
  workOrders: {
    id: string;
    unitId: string;
    createdById: string;
    description: string;
    status: WorkOrderStatus;
    urgency: Urgency | null;
    category: Category | null;
    createdAt: Date;
    slaDueAt: Date | null;
  }[];
  media: { id: string; workOrderId: string; path: string; kind: MediaKind }[];
  triageResults: {
    id: string;
    workOrderId: string;
    rawJson: unknown;
    valid: boolean;
    category: Category | null;
    urgency: Urgency | null;
    confidence: number | null;
    emergencyRule: string | null;
    model: string;
    promptVersion: string;
    overriddenById?: string;
    overrideReason?: string;
    overriddenAt?: Date;
    createdAt: Date;
  }[];
  dispatches: {
    id: string;
    workOrderId: string;
    vendorId: string;
    approvedById: string | null;
    autoDispatched: boolean;
    scheduledFor: Date | null;
    completedAt: Date | null;
    completionNote: string | null;
    costUsd: number | null;
    createdAt: Date;
  }[];
  notifications: { id: string; channel: NotificationChannel; to: string; body: string; sentAt: Date | null; createdAt: Date }[];
  auditLogs: {
    id: string;
    actorId: string | null;
    action: string;
    entity: string;
    entityId: string;
    before: unknown;
    after: unknown;
    at: Date;
  }[];
}

const BUILDINGS = [
  { key: 'a', name: 'Building A — Juniper Row', address: '1201 Juniper Row NW, Washington, DC 20010' },
  { key: 'b', name: 'Building B — Larkspur Court', address: '418 Larkspur Ct SE, Washington, DC 20003' },
  { key: 'c', name: 'Building C — Halden Place', address: '77 Halden Pl NE, Washington, DC 20002' },
  { key: 'd', name: 'Building D — Ostrander Lofts', address: '2950 Ostrander St NW, Washington, DC 20008' },
] as const;

const FLOORS = [1, 2, 3, 4, 5];
const STACKS = [
  { stack: '01', unitType: '1BR' },
  { stack: '02', unitType: '2BR' },
];

const unitId = (building: string, number: string) => `seed_unit_${building}_${number}`;

export function buildSeedData(now: Date = new Date()): SeedData {
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * HOUR);
  const sla = (createdAt: Date, urgency: Urgency | null) =>
    urgency ? new Date(createdAt.getTime() + SLA_HOURS[urgency] * HOUR) : null;

  const properties = BUILDINGS.map((b) => ({ id: `seed_bldg_${b.key}`, name: b.name, address: b.address }));

  // 4 buildings × 5 floors × 2 stacks = 40 units. Unit number = floor + stack, e.g. "302".
  const units = BUILDINGS.flatMap((b) =>
    FLOORS.flatMap((floor) =>
      STACKS.map(({ stack, unitType }) => {
        const number = `${floor}${stack}`;
        return { id: unitId(b.key, number), buildingId: `seed_bldg_${b.key}`, number, stack, floor, unitType };
      }),
    ),
  );

  const vendors: SeedData['vendors'] = [
    { id: 'seed_vendor_flow', name: 'Capital Flow Plumbing', trades: ['PLUMBING'], serviceArea: 'All DC', hourlyRate: 95, firstTimeFixRate: 0.88, available: true },
    { id: 'seed_vendor_rooter', name: 'Beltline Rooter & Drain', trades: ['PLUMBING'], serviceArea: 'NW and NE DC', hourlyRate: 80, firstTimeFixRate: 0.74, available: true },
    { id: 'seed_vendor_rivermark', name: 'Rivermark Electric', trades: ['ELECTRICAL'], serviceArea: 'All DC', hourlyRate: 110, firstTimeFixRate: 0.91, available: true },
    { id: 'seed_vendor_air', name: 'Northpoint Air Comfort', trades: ['HVAC'], serviceArea: 'All DC', hourlyRate: 105, firstTimeFixRate: 0.85, available: true },
    { id: 'seed_vendor_appliance', name: 'Ward Street Appliance Repair', trades: ['APPLIANCE'], serviceArea: 'NW and SE DC', hourlyRate: 85, firstTimeFixRate: 0.79, available: false },
    { id: 'seed_vendor_pest', name: 'Greenshield Pest Control', trades: ['PEST'], serviceArea: 'All DC', hourlyRate: 70, firstTimeFixRate: 0.82, available: true },
    { id: 'seed_vendor_build', name: 'Cobblestone Builders', trades: ['STRUCTURAL', 'OTHER'], serviceArea: 'All DC', hourlyRate: 90, firstTimeFixRate: 0.76, available: true },
    { id: 'seed_vendor_lock', name: 'Keystep Lock & Door', trades: ['LOCKS_ACCESS'], serviceArea: 'All DC', hourlyRate: 75, firstTimeFixRate: 0.93, available: true },
  ];

  const TENANT = 'seed_user_tenant';
  const COORDINATOR = 'seed_user_coordinator';
  const users: SeedData['users'] = [
    { id: TENANT, email: 'tenant@leaselens.test', name: 'Jordan Ellery', role: 'TENANT', unitId: unitId('a', '302') },
    { id: 'seed_user_vendor', email: 'vendor@leaselens.test', name: 'Sam Thornbury', role: 'VENDOR', vendorId: 'seed_vendor_flow' },
    { id: COORDINATOR, email: 'coordinator@leaselens.test', name: 'Riley Castellan', role: 'COORDINATOR' },
    { id: 'seed_user_leasing', email: 'leasing@leaselens.test', name: 'Avery Lindqvist', role: 'LEASING' },
    { id: 'seed_user_manager', email: 'manager@leaselens.test', name: 'Morgan Pell', role: 'MANAGER' },
  ];

  // Only the tenant in A-302 has a login; other requests were phoned in and logged by the coordinator.
  // A-202, A-302 and A-402 share stack 02, so the three leaks there form a recurring-issue cluster.
  type WO = {
    key: string; building: string; unit: string; by: string; description: string;
    status: WorkOrderStatus; urgency: Urgency | null; category: Category | null; daysAgo: number;
    triage?: { confidence: number; subIssue: string; emergencyRule?: string; valid?: boolean };
  };
  const wos: WO[] = [
    { key: '01', building: 'a', unit: '302', by: TENANT, description: 'Kitchen faucet drips all the time, even when the handle is fully off.', status: 'TRIAGED', urgency: 'ROUTINE', category: 'PLUMBING', daysAgo: 18, triage: { confidence: 0.91, subIssue: 'Dripping kitchen faucet' } },
    { key: '02', building: 'a', unit: '302', by: TENANT, description: 'Water is coming through the bathroom ceiling and dripping fast onto the floor.', status: 'DISPATCHED', urgency: 'EMERGENCY', category: 'PLUMBING', daysAgo: 2, triage: { confidence: 0.95, subIssue: 'Active leak through ceiling', emergencyRule: 'active-leak-ceiling' } },
    { key: '03', building: 'a', unit: '402', by: COORDINATOR, description: 'Cabinet under the bathroom sink is wet and there is a water stain on the floor.', status: 'TRIAGED', urgency: 'URGENT', category: 'PLUMBING', daysAgo: 9, triage: { confidence: 0.84, subIssue: 'Leak under bathroom sink' } },
    { key: '04', building: 'a', unit: '202', by: COORDINATOR, description: 'Small puddle under the bathroom sink every morning.', status: 'SUBMITTED', urgency: null, category: null, daysAgo: 0.2 },
    { key: '05', building: 'b', unit: '101', by: COORDINATOR, description: 'Resident smells gas near the stove in the kitchen.', status: 'TRIAGED', urgency: 'EMERGENCY', category: 'APPLIANCE', daysAgo: 6, triage: { confidence: 0.88, subIssue: 'Possible gas leak at stove', emergencyRule: 'gas-smell' } },
    { key: '06', building: 'b', unit: '302', by: COORDINATOR, description: 'Bedroom outlet sparked when a lamp was plugged in and there is a burning smell.', status: 'DISPATCHED', urgency: 'EMERGENCY', category: 'ELECTRICAL', daysAgo: 4, triage: { confidence: 0.93, subIssue: 'Sparking outlet', emergencyRule: 'sparking-burning' } },
    { key: '07', building: 'c', unit: '201', by: COORDINATOR, description: 'Heat is not working. Thermostat is set to 70 but the apartment is 61°F.', status: 'TRIAGED', urgency: 'URGENT', category: 'HVAC', daysAgo: 3, triage: { confidence: 0.86, subIssue: 'No heat' } },
    { key: '08', building: 'c', unit: '402', by: COORDINATOR, description: 'Air conditioner makes a loud rattling noise when it starts.', status: 'COMPLETED', urgency: 'ROUTINE', category: 'HVAC', daysAgo: 15, triage: { confidence: 0.9, subIssue: 'Noisy AC unit' } },
    { key: '09', building: 'd', unit: '102', by: COORDINATOR, description: 'Seeing cockroaches in the kitchen at night.', status: 'TRIAGED', urgency: 'ROUTINE', category: 'PEST', daysAgo: 5, triage: { confidence: 0.94, subIssue: 'Cockroaches in kitchen' } },
    { key: '10', building: 'd', unit: '501', by: COORDINATOR, description: 'Front door lock sticks and the key is very hard to turn.', status: 'TRIAGED', urgency: 'URGENT', category: 'LOCKS_ACCESS', daysAgo: 1, triage: { confidence: 0.8, subIssue: 'Sticking front door lock' } },
    { key: '11', building: 'b', unit: '201', by: COORDINATOR, description: 'Dishwasher does not drain; water stays at the bottom after a cycle.', status: 'NEEDS_REVIEW', urgency: null, category: null, daysAgo: 1.5, triage: { confidence: 0, subIssue: '', valid: false } },
    { key: '12', building: 'd', unit: '301', by: COORDINATOR, description: 'Crack in the living room wall seems to be getting longer.', status: 'SUBMITTED', urgency: null, category: null, daysAgo: 0.5 },
  ];

  const workOrders = wos.map((w) => {
    const createdAt = ago(w.daysAgo);
    return {
      id: `seed_wo_${w.key}`,
      unitId: unitId(w.building, w.unit),
      createdById: w.by,
      description: w.description,
      status: w.status,
      urgency: w.urgency,
      category: w.category,
      createdAt,
      slaDueAt: sla(createdAt, w.urgency),
    };
  });

  const triageResults: SeedData['triageResults'] = wos
    .filter((w) => w.triage)
    .map((w) => {
      const t = w.triage!;
      const createdAt = new Date(ago(w.daysAgo).getTime() + 2 * 60 * 1000);
      const valid = t.valid ?? true;
      // Work order 10: AI said ROUTINE, coordinator raised it to URGENT.
      const aiUrgency: Urgency | null = w.key === '10' ? 'ROUTINE' : w.urgency;
      const rawJson = valid
        ? {
            category: w.category,
            subIssue: t.subIssue,
            urgency: aiUrgency,
            confidence: t.confidence,
            missingInfo: [],
            followUpQuestionIds: [],
            summaryForVendor: `${t.subIssue}. ${w.description}`,
          }
        : { error: 'Model returned text that is not valid JSON', text: 'The dishwasher may have a clog' };
      return {
        id: `seed_triage_${w.key}`,
        workOrderId: `seed_wo_${w.key}`,
        rawJson,
        valid,
        category: valid ? w.category : null,
        urgency: valid ? aiUrgency : null,
        confidence: valid ? t.confidence : null,
        emergencyRule: t.emergencyRule ?? null,
        model: SEED_MODEL,
        promptVersion: SEED_PROMPT_VERSION,
        createdAt,
        ...(w.key === '10' && {
          overriddenById: COORDINATOR,
          overrideReason: 'Door cannot be locked reliably overnight — raise to urgent.',
          overriddenAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
        }),
      };
    });

  const dispatches: SeedData['dispatches'] = [
    { id: 'seed_dispatch_02', workOrderId: 'seed_wo_02', vendorId: 'seed_vendor_flow', approvedById: COORDINATOR, autoDispatched: false, scheduledFor: ago(2, -1), completedAt: null, completionNote: null, costUsd: null, createdAt: ago(2, -0.2) },
    { id: 'seed_dispatch_06', workOrderId: 'seed_wo_06', vendorId: 'seed_vendor_rivermark', approvedById: COORDINATOR, autoDispatched: false, scheduledFor: ago(4, -2), completedAt: null, completionNote: null, costUsd: null, createdAt: ago(4, -0.3) },
    { id: 'seed_dispatch_08', workOrderId: 'seed_wo_08', vendorId: 'seed_vendor_air', approvedById: null, autoDispatched: true, scheduledFor: ago(14), completedAt: ago(13), completionNote: 'Tightened loose fan shroud and replaced one mounting bracket.', costUsd: 180, createdAt: ago(15, -1) },
  ];

  // No seed photos: photos are real files in storage, created through the app.
  const media: SeedData['media'] = [];

  const notifications: SeedData['notifications'] = (['02', '05', '06'] as const).map((key) => {
    const wo = workOrders.find((w) => w.id === `seed_wo_${key}`)!;
    return {
      id: `seed_notify_${key}`,
      channel: 'ONCALL' as const,
      to: 'on-call coordinator',
      body: `EMERGENCY work order ${wo.id}: ${wo.description}`,
      sentAt: new Date(wo.createdAt.getTime() + 60 * 1000),
      createdAt: new Date(wo.createdAt.getTime() + 60 * 1000),
    };
  });

  const t10 = triageResults.find((t) => t.workOrderId === 'seed_wo_10')!;
  const auditLogs: SeedData['auditLogs'] = [
    { id: 'seed_audit_override_10', actorId: COORDINATOR, action: 'triage.override', entity: 'WorkOrder', entityId: 'seed_wo_10', before: { urgency: 'ROUTINE' }, after: { urgency: 'URGENT', reason: t10.overrideReason }, at: t10.overriddenAt! },
    ...dispatches.map((d) => ({
      id: `seed_audit_${d.id}`,
      actorId: d.approvedById,
      action: d.autoDispatched ? 'dispatch.auto' : 'dispatch.approve',
      entity: 'Dispatch',
      entityId: d.id,
      before: null,
      after: { workOrderId: d.workOrderId, vendorId: d.vendorId, autoDispatched: d.autoDispatched },
      at: d.createdAt,
    })),
  ];

  return { properties, units, vendors, users, workOrders, media, triageResults, dispatches, notifications, auditLogs };
}
