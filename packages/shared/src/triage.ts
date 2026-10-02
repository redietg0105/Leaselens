import { z } from 'zod';
import { CategorySchema, UrgencySchema, type Category, type Urgency } from './enums';

// ───────────── Approved follow-up question bank ─────────────
// The AI may only pick question ids from this list. Answers are multiple choice only, so no
// free text (which could contain names or phone numbers) is ever collected or sent to the AI.

export interface FollowUpQuestion {
  id: string;
  categories: Category[];
  text: string;
  options: { value: string; label: string }[];
}

const yesNoUnsure = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

export const QUESTION_BANK = [
  {
    id: 'water_active',
    categories: ['PLUMBING', 'APPLIANCE', 'STRUCTURAL'],
    text: 'Is water dripping or flowing right now?',
    options: yesNoUnsure,
  },
  {
    id: 'water_source',
    categories: ['PLUMBING'],
    text: 'Where is the water coming from?',
    options: [
      { value: 'ceiling', label: 'The ceiling' },
      { value: 'sink', label: 'Under or around a sink' },
      { value: 'toilet', label: 'The toilet' },
      { value: 'tub_shower', label: 'The tub or shower' },
      { value: 'appliance', label: 'An appliance' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'water_amount',
    categories: ['PLUMBING', 'APPLIANCE'],
    text: 'How much water is there?',
    options: [
      { value: 'drops', label: 'A few drops' },
      { value: 'puddle', label: 'A small puddle' },
      { value: 'spreading', label: 'It is spreading' },
      { value: 'flooding', label: 'It is flooding the floor' },
    ],
  },
  {
    id: 'power_scope',
    categories: ['ELECTRICAL'],
    text: 'How much of the apartment has no power?',
    options: [
      { value: 'one_outlet', label: 'One outlet or light' },
      { value: 'one_room', label: 'One room' },
      { value: 'several_rooms', label: 'Several rooms' },
      { value: 'whole_apartment', label: 'The whole apartment' },
    ],
  },
  {
    id: 'breaker_reset',
    categories: ['ELECTRICAL'],
    text: 'Have you tried resetting the breaker?',
    options: [
      { value: 'yes_no_help', label: "Yes, it didn't help" },
      { value: 'no', label: 'No' },
      { value: 'dont_know', label: "I don't know where it is" },
    ],
  },
  {
    id: 'hvac_mode',
    categories: ['HVAC'],
    text: 'Is the problem with heating or cooling?',
    options: [
      { value: 'heat', label: 'Heating' },
      { value: 'cooling', label: 'Air conditioning' },
      { value: 'both', label: 'Both' },
    ],
  },
  {
    id: 'indoor_temp',
    categories: ['HVAC'],
    text: 'About how warm or cold is it inside?',
    options: [
      { value: 'below_60', label: 'Below 60°F' },
      { value: '60_68', label: '60–68°F' },
      { value: '68_78', label: '68–78°F' },
      { value: 'above_78', label: 'Above 78°F' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'appliance_type',
    categories: ['APPLIANCE'],
    text: 'Which appliance is it?',
    options: [
      { value: 'fridge', label: 'Refrigerator' },
      { value: 'stove_oven', label: 'Stove or oven' },
      { value: 'dishwasher', label: 'Dishwasher' },
      { value: 'washer_dryer', label: 'Washer or dryer' },
      { value: 'microwave', label: 'Microwave' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'appliance_working',
    categories: ['APPLIANCE'],
    text: 'Does it still work at all?',
    options: [
      { value: 'partly', label: 'Yes, partly' },
      { value: 'not_at_all', label: 'Not at all' },
    ],
  },
  {
    id: 'pest_type',
    categories: ['PEST'],
    text: 'What kind of pest is it?',
    options: [
      { value: 'roaches', label: 'Cockroaches' },
      { value: 'rodents', label: 'Mice or rats' },
      { value: 'bed_bugs', label: 'Bed bugs' },
      { value: 'ants', label: 'Ants' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'pest_frequency',
    categories: ['PEST'],
    text: 'How often do you see them?',
    options: [
      { value: 'once', label: 'Just once' },
      { value: 'daily', label: 'Every day' },
      { value: 'many_daily', label: 'Several times a day' },
    ],
  },
  {
    id: 'door_lockable',
    categories: ['LOCKS_ACCESS'],
    text: 'Can you lock your front door right now?',
    options: yesNoUnsure,
  },
  {
    id: 'damage_size',
    categories: ['STRUCTURAL', 'OTHER'],
    text: 'About how big is the damaged area?',
    options: [
      { value: 'coin', label: 'Smaller than a coin' },
      { value: 'hand', label: 'About the size of a hand' },
      { value: 'larger', label: 'Larger than that' },
    ],
  },
  {
    id: 'started_when',
    categories: ['PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'PEST', 'STRUCTURAL', 'LOCKS_ACCESS', 'OTHER'],
    text: 'When did this start?',
    options: [
      { value: 'today', label: 'Today' },
      { value: 'this_week', label: 'This week' },
      { value: 'longer', label: 'More than a week ago' },
    ],
  },
] as const satisfies readonly FollowUpQuestion[];

export type QuestionId = (typeof QUESTION_BANK)[number]['id'];
export const QUESTION_IDS = QUESTION_BANK.map((q) => q.id) as [QuestionId, ...QuestionId[]];
export const QuestionIdSchema = z.enum(QUESTION_IDS);

export function getQuestion(id: string): FollowUpQuestion | undefined {
  return (QUESTION_BANK as readonly FollowUpQuestion[]).find((q) => q.id === id);
}

export const MAX_FOLLOW_UPS = 2;

// ───────────── What the AI must return ─────────────

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const VENDOR_SUMMARY_MAX_WORDS = 60;

/** Gemini's structured output. Anything that doesn't match → NEEDS_REVIEW. */
export const TriageOutputSchema = z.object({
  category: CategorySchema,
  subIssue: z.string().trim().min(1).max(120),
  urgency: UrgencySchema,
  confidence: z.number().min(0).max(1),
  missingInfo: z.array(z.string().max(200)).max(5),
  followUpQuestionIds: z.array(QuestionIdSchema).max(MAX_FOLLOW_UPS),
  summaryForVendor: z
    .string()
    .trim()
    .min(1)
    .refine((s) => countWords(s) <= VENDOR_SUMMARY_MAX_WORDS, `At most ${VENDOR_SUMMARY_MAX_WORDS} words`),
});
export type TriageOutput = z.infer<typeof TriageOutputSchema>;

// ───────────── Tenant answers ─────────────

export const SubmitAnswersSchema = z.object({
  answers: z
    .array(z.object({ questionId: QuestionIdSchema, answer: z.string().min(1).max(40) }))
    .min(1, 'Please answer the question.')
    .max(MAX_FOLLOW_UPS),
});
export type SubmitAnswers = z.infer<typeof SubmitAnswersSchema>;

// ───────────── Plain words for tenants ─────────────

export const CATEGORY_LABEL: Record<Category, string> = {
  PLUMBING: 'Plumbing (leaks, drains, toilets)',
  ELECTRICAL: 'Electrical (power, outlets, lights)',
  HVAC: 'Heating or air conditioning',
  APPLIANCE: 'Appliance',
  PEST: 'Pests',
  STRUCTURAL: 'Walls, floors, ceilings or windows',
  LOCKS_ACCESS: 'Locks and doors',
  OTHER: 'Other',
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  EMERGENCY: 'Emergency — we are responding now',
  URGENT: 'Urgent — we aim to respond within 24 hours',
  ROUTINE: 'Routine — we aim to respond within 3 days',
};

/** Response targets by urgency, in hours. */
export const SLA_HOURS: Record<Urgency, number> = { EMERGENCY: 4, URGENT: 24, ROUTINE: 72 };

// ───────────── Emergency instructions (shown before any AI runs) ─────────────

export const EMERGENCY_RULE_IDS = [
  'gas-smell',
  'smoke-fire',
  'active-leak-ceiling',
  'flooding',
  'sparking-burning',
  'no-heat-cold',
  'lockout-vulnerable',
] as const;
export type EmergencyRuleId = (typeof EMERGENCY_RULE_IDS)[number];
export const EmergencyRuleIdSchema = z.enum(EMERGENCY_RULE_IDS);

export const EMERGENCY_INSTRUCTIONS: Record<EmergencyRuleId, { title: string; steps: string[] }> = {
  'gas-smell': {
    title: 'Possible gas leak',
    steps: [
      'Leave the apartment now and take everyone with you.',
      "Don't turn lights or switches on or off, light anything, or use your phone inside.",
      "Once outside, call 911 and your gas utility's emergency line.",
    ],
  },
  'smoke-fire': {
    title: 'Fire or smoke',
    steps: ['Get everyone out and close the door behind you.', 'Call 911 from outside.', "Don't use the elevator."],
  },
  'active-leak-ceiling': {
    title: 'Water coming through the ceiling',
    steps: [
      'Stay away from outlets, lights and electrical items near the water.',
      "If it's safe, move valuables away and put a bucket under the leak.",
      'If water touches electrical fixtures or the ceiling sags, leave the room and call 911.',
    ],
  },
  flooding: {
    title: 'Flooding',
    steps: [
      'If you can do it safely, turn off the water valve for the sink, toilet or appliance.',
      'Stay away from outlets and electrical items near the water.',
      'If water reaches electrical fixtures, leave the apartment and call 911.',
    ],
  },
  'sparking-burning': {
    title: 'Sparks or burning smell',
    steps: [
      "Don't touch the outlet, switch or appliance.",
      "If it's safe, switch off the breaker for that area.",
      'If you see smoke or flames, get out and call 911.',
    ],
  },
  'no-heat-cold': {
    title: 'No heat',
    steps: [
      'Dress warmly and close windows and doors to keep heat in.',
      'Never use the oven, stove or a grill to heat the apartment.',
      'If anyone feels unwell from the cold, call 911.',
    ],
  },
  'lockout-vulnerable': {
    title: 'Locked out with someone who may need help',
    steps: ['If someone inside needs help right now, call 911.', 'Stay near the door so our on-call team can reach you.'],
  },
};
