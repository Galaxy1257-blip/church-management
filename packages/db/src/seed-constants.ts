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

// Common, recurring funds every church starts with. Anything else (building,
// missions, anniversary, seed offering…) is added from Settings → Offering with
// the + button, so no unused category clutters the offering form.
export const DEFAULT_FUNDS = [
  { name: 'Offering', type: 'OFFERING' as const },
  { name: 'Tithe', type: 'TITHE' as const },
  { name: 'Mini Harvest', type: 'HARVEST' as const },
  { name: 'Annual Harvest', type: 'HARVEST' as const },
  { name: 'Welfare', type: 'WELFARE' as const },
];

/**
 * Simple attendance groups by default: Sunday School split into Boys and Girls,
 * and Adults split into Men and Women. A church can rename any group, switch to
 * detailed age groups, or add its own groups in Settings → Church groups.
 */
export const DEFAULT_BRACKETS = [
  {
    key: 'SUNDAY_SCHOOL',
    label: 'Sunday School',
    minAge: 0,
    maxAge: 12,
    genderSplit: true,
    maleLabel: 'Sunday School (Boys)',
    femaleLabel: 'Sunday School (Girls)',
    segmentKey: 'SUNDAY_SCHOOL',
  },
  {
    key: 'ADULTS',
    label: 'Adults',
    minAge: 13,
    maxAge: null,
    genderSplit: true,
    maleLabel: 'Men',
    femaleLabel: 'Women',
    segmentKey: 'ADULTS',
  },
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
