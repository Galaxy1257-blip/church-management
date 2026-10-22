// DTO shapes shared between api and web (kept framework-free).
import type {
  BatchStatus,
  CampaignStatus,
  FundType,
  Gender,
  MemberStatus,
  PayChannel,
  RoleKey,
  ServiceStatus,
  SmsStatus,
  TxStatus,
  VisitorStatus,
} from './enums';
import type { Permission } from './permissions';

export interface SessionUser {
  id: string;
  churchId: string;
  churchSlug: string;
  name: string;
  phoneE164: string;
  roles: RoleKey[];
  permissions: Permission[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export interface ChurchSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  pastorDisplayName: string | null;
}

export interface MemberDto {
  id: string;
  memberNo: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  email: string | null;
  gender: Gender | null;
  ageBracketId: string | null;
  dob: string | null;
  status: MemberStatus;
  joinedAt: string | null;
  smsConsent: boolean;
}

export interface ServiceDto {
  id: string;
  name: string;
  startsAt: string;
  status: ServiceStatus;
  branchId: string | null;
}

export interface HeadcountTotalsDto {
  serviceId: string;
  totals: { segmentKey: string; label: string; net: number }[];
  netTotal: number;
}

export interface VisitorDto {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string;
  status: VisitorStatus;
  visitCount: number;
  createdAt: string;
}

export interface FeeQuoteDto {
  giftMinor: number;
  feeMinor: number;
  feeCoverMinor: number;
  chargedMinor: number;
  netToFundMinor: number;
}

export interface FundDto {
  id: string;
  name: string;
  type: FundType;
  isActive: boolean;
}

export interface TransactionDto {
  id: string;
  reference: string;
  fundId: string;
  giftMinor: number;
  chargedMinor: number;
  status: TxStatus;
  channel: PayChannel | null;
  paidAt: string | null;
  giverName: string | null;
}

export interface GivingBatchDto {
  id: string;
  label: string;
  serviceId: string;
  status: BatchStatus;
  countedMinor: number | null;
  countedBy1: string | null;
  countedBy2: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export interface SmsWalletDto {
  balanceUnits: number;
  reservedUnits: number;
}

export interface CampaignDto {
  id: string;
  name: string;
  body: string;
  status: CampaignStatus;
  totalRecipients: number;
  scheduledAt: string | null;
  createdAt: string;
}

export interface SmsLogDto {
  id: string;
  toE164: string;
  body: string;
  segments: number;
  status: SmsStatus;
  source: string;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
