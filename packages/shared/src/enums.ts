// ============================================================
// Enum mirrors of schema.prisma enums (source of truth is the
// schema; these unions keep api/web/shared type-safe without
// importing the generated Prisma client into the browser).
// ============================================================

export type RoleKey =
  | 'SUPER_ADMIN'
  | 'PASTOR'
  | 'FINANCE_ADMIN'
  | 'USHER'
  | 'FOLLOWUP_TEAM'
  | 'LEADER'
  | 'MEMBER'
  | 'ELDER'
  | 'SECRETARY';
export const ROLE_KEYS: RoleKey[] = [
  'SUPER_ADMIN',
  'PASTOR',
  'FINANCE_ADMIN',
  'USHER',
  'FOLLOWUP_TEAM',
  'LEADER',
  'MEMBER',
  'ELDER',
  'SECRETARY',
];

export type Gender = 'MALE' | 'FEMALE';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';
export type VisitorStatus = 'NEW' | 'IN_FOLLOWUP' | 'RETURNED' | 'CONVERTED' | 'OPTED_OUT' | 'LOST';
export type ServiceStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';
export type SegmentKind = 'IN_PERSON' | 'ONLINE';
export type FundType = 'TITHE' | 'OFFERING' | 'WELFARE' | 'BUILDING' | 'MISSIONS' | 'SEED' | 'EVENT' | 'OTHER' | 'FIRST_FRUIT' | 'THANKSGIVING' | 'HARVEST' | 'ANNIVERSARY';
export type TxStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'ABANDONED' | 'REVERSED';
export type PayChannel = 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';
export type MomoProvider = 'MTN' | 'TELECEL' | 'AT';
export type BatchStatus = 'OPEN' | 'COUNTED' | 'APPROVED' | 'DEPOSITED';
export type MessageChannel = 'SMS' | 'WHATSAPP';
export type SmsSource =
  | 'CAMPAIGN'
  | 'DRIP'
  | 'ANNOUNCEMENT'
  | 'EVENT'
  | 'ROSTER'
  | 'RECEIPT'
  | 'NUDGE'
  | 'REPLY'
  | 'OTP'
  | 'ADHOC';
export type SmsStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPPRESSED';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'DONE' | 'CANCELLED';
export type LedgerReason = 'PURCHASE' | 'RESERVE' | 'COMMIT' | 'REFUND' | 'ADJUST';

/** Sources that are exempt from opt-out suppression (transactional by policy). */
export const SMS_OPTOUT_EXEMPT_SOURCES: readonly SmsSource[] = ['RECEIPT', 'NUDGE', 'REPLY', 'OTP', 'ADHOC'];

/** Sources that a STOP reply cancels. */
export const SMS_OPTOUT_BLOCKING_SOURCES: readonly SmsSource[] = ['CAMPAIGN', 'DRIP', 'ANNOUNCEMENT', 'EVENT', 'ROSTER'];

export const OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'] as const;
export const OPT_IN_KEYWORDS = ['START', 'UNSTOP', 'SUBSCRIBE', 'YES', 'HELP'] as const;

export function matchOptKeyword(body: string): { kind: 'OUT' | 'IN'; keyword: string } | null {
  const word = body.trim().toUpperCase();
  if ((OPT_OUT_KEYWORDS as readonly string[]).includes(word)) return { kind: 'OUT', keyword: word };
  if ((OPT_IN_KEYWORDS as readonly string[]).includes(word)) return { kind: 'IN', keyword: word };
  return null;
}
