// Defaults applied to every church at onboarding (BUILD_ORDER Phase 0 seed).
import { ROLE_PERMISSIONS, SUPER_ADMIN_PERMISSION, RoleKey } from '@chms/shared';

export const DEFAULT_ROLES: { key: RoleKey; name: string }[] = [
  { key: 'SUPER_ADMIN', name: 'Super Admin' },
  { key: 'PASTOR', name: 'Pastor' },
  { key: 'FINANCE_ADMIN', name: 'Finance Admin' },
  { key: 'USHER', name: 'Usher' },
  { key: 'FOLLOWUP_TEAM', name: 'Follow-up Team' },
  { key: 'LEADER', name: 'Leader' },
  { key: 'MEMBER', name: 'Member' },
  // R4.7 Ghana church roles
  { key: 'ELDER', name: 'Elder' },
  { key: 'SECRETARY', name: 'Church Secretary' },
];

export function permissionsForRoleSeed(key: RoleKey): string[] {
  return key === 'SUPER_ADMIN' ? [SUPER_ADMIN_PERMISSION] : (ROLE_PERMISSIONS[key] as string[]);
}

export const DEFAULT_FUNDS = [
  { name: 'Tithe', type: 'TITHE' as const },
  { name: 'Offering', type: 'OFFERING' as const },
  { name: 'Welfare', type: 'WELFARE' as const },
  { name: 'Building', type: 'BUILDING' as const },
  { name: 'Missions', type: 'MISSIONS' as const },
  // R4.4 Ghana-typical funds
  { name: 'First Fruits', type: 'FIRST_FRUIT' as const },
  { name: 'Thanksgiving', type: 'THANKSGIVING' as const },
  { name: 'Harvest', type: 'HARVEST' as const },
];

export const DEFAULT_BRACKETS = [
  { key: 'TODDLERS', label: 'Nursery & Toddlers', minAge: 0, maxAge: 4, genderSplit: false, segmentKey: 'TODDLERS' },
  { key: 'CHILDREN', label: 'Children Ministry', minAge: 5, maxAge: 12, genderSplit: false, segmentKey: 'CHILDREN' },
  { key: 'TEENS', label: 'Teens Chapel', minAge: 13, maxAge: 19, genderSplit: false, segmentKey: 'TEENS' },
  { key: 'YOUNG_ADULTS', label: 'Young Adults', minAge: 20, maxAge: 35, genderSplit: false, segmentKey: 'YOUNG_ADULTS' },
  { key: 'ADULTS', label: 'Main Sanctuary Adults', minAge: 36, maxAge: 59, genderSplit: true, segmentKey: 'ADULTS' },
  { key: 'SENIORS', label: 'Golden Age Fellowship', minAge: 60, maxAge: null, genderSplit: false, segmentKey: 'SENIORS' },
] as const;

/** Online-only extra section (not an age bracket). */
export const ONLINE_SEGMENT = { key: 'LIVESTREAM', label: 'Livestream', sortOrder: 90 };

export const DEFAULT_EXPENSE_CATEGORIES = ['Utilities', 'Media', 'Events', 'Welfare', 'Missions', 'Other'];

export const VISITOR_WORKFLOW_STEPS = [
  { position: 0, delayMinutes: 0, template: 'Hi {firstName}! It was great having you at {churchName} today. — Pastor {pastorName}' },
  { position: 1, delayMinutes: 4320, template: "Hi {firstName}, we're praying for you this week. Anything we can join you in? Reply here." },
  { position: 2, delayMinutes: 10080, template: 'Hi {firstName}, we\'d love to see you again this Sunday at {churchName}. Service starts 9:00am.' },
  { position: 3, delayMinutes: 20160, template: 'Hi {firstName}, can we call you? Reply YES and someone from our care team will reach out.' },
];
