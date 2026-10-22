-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('SUPER_ADMIN', 'FINANCE_ADMIN', 'USHER', 'FOLLOWUP_TEAM', 'LEADER', 'MEMBER', 'ELDER', 'SECRETARY');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED');

-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('NEW', 'IN_FOLLOWUP', 'RETURNED', 'CONVERTED', 'OPTED_OUT', 'LOST');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SegmentKind" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('TITHE', 'OFFERING', 'WELFARE', 'BUILDING', 'MISSIONS', 'SEED', 'EVENT', 'OTHER', 'FIRST_FRUIT', 'THANKSGIVING', 'HARVEST', 'ANNIVERSARY');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'ABANDONED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayChannel" AS ENUM ('MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'CASH', 'CHEQUE');

-- CreateEnum
CREATE TYPE "MomoProvider" AS ENUM ('MTN', 'TELECEL', 'AT');

-- CreateEnum
CREATE TYPE "FeeMode" AS ENUM ('CHURCH_ABSORBS', 'GIVER_ABSORBS', 'GIVER_CHOICE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'COUNTED', 'APPROVED', 'DEPOSITED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "SmsSource" AS ENUM ('CAMPAIGN', 'DRIP', 'ANNOUNCEMENT', 'EVENT', 'ROSTER', 'RECEIPT', 'NUDGE', 'REPLY', 'OTP', 'ADHOC');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'REJECTED', 'EXPIRED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FollowTrigger" AS ENUM ('VISITOR_REGISTERED', 'MEMBER_ABSENT', 'NEW_MEMBER', 'MANUAL');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('SMS', 'TASK', 'PROMPT');

-- CreateEnum
CREATE TYPE "DelayFrom" AS ENUM ('ENROLLMENT', 'PREVIOUS_STEP');

-- CreateEnum
CREATE TYPE "ProgressState" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrayerVisibility" AS ENUM ('PASTORAL_ONLY', 'FOLLOWUP_TEAM');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('PURCHASE', 'RESERVE', 'COMMIT', 'REFUND', 'ADJUST');

-- CreateEnum
CREATE TYPE "PledgeFrequency" AS ENUM ('ONE_TIME', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PledgeStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QrKind" AS ENUM ('VISITOR_FORM', 'GIVE', 'MEMBER_APP');

-- CreateTable
CREATE TABLE "AgeBracket" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER,
    "genderSplit" BOOLEAN NOT NULL DEFAULT false,
    "segmentKey" TEXT NOT NULL,
    "ministryNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Church" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "pastorDisplayName" TEXT,
    "smsSenderId" TEXT,
    "paystackSubaccount" TEXT,
    "intlGiving" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "region" TEXT,
    "isHq" BOOLEAN NOT NULL DEFAULT false,
    "smsSenderId" TEXT,
    "paystackSubaccount" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "totpSecret" TEXT,
    "memberId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserBranch" (
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateTable
CREATE TABLE "ChurchGivingSettings" (
    "churchId" UUID NOT NULL,
    "feeMode" "FeeMode" NOT NULL DEFAULT 'CHURCH_ABSORBS',
    "feeBps" INTEGER NOT NULL DEFAULT 195,
    "feeFlatMinor" INTEGER NOT NULL DEFAULT 10,
    "feeCapMinor" INTEGER,
    "feeDefaultOptIn" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChurchGivingSettings_pkey" PRIMARY KEY ("churchId")
);

-- CreateTable
CREATE TABLE "ChurchKey" (
    "churchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "wrappedKey" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchKey_pkey" PRIMARY KEY ("churchId","version")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "churchId" UUID NOT NULL,
    "accountCreated" BOOLEAN NOT NULL DEFAULT false,
    "brandingDone" BOOLEAN NOT NULL DEFAULT false,
    "paystackDone" BOOLEAN NOT NULL DEFAULT false,
    "senderIdDone" BOOLEAN NOT NULL DEFAULT false,
    "membersImported" BOOLEAN NOT NULL DEFAULT false,
    "defaultsCreated" BOOLEAN NOT NULL DEFAULT false,
    "testGiftDone" BOOLEAN NOT NULL DEFAULT false,
    "wentLiveAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("churchId")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "stats" JSONB,
    "errorFileKey" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "memberNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneE164" TEXT,
    "email" TEXT,
    "gender" "Gender",
    "dob" DATE,
    "ageBracketId" UUID,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATE,
    "address" TEXT,
    "smsConsent" BOOLEAN NOT NULL DEFAULT true,
    "smsConsentAt" TIMESTAMP(3),
    "preferredChannel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "qrToken" TEXT,
    "qrIssuedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "photoKey" TEXT,
    "salvationDate" DATE,
    "baptismDate" DATE,
    "marriageDate" DATE,
    "ordinationDate" DATE,
    "discipleshipStage" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "householdId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "relation" TEXT NOT NULL,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("householdId","memberId")
);

-- CreateTable
CREATE TABLE "MemberGuardian" (
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "canPickup" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MemberGuardian_pkey" PRIMARY KEY ("childId","guardianId")
);

-- CreateTable
CREATE TABLE "MemberTransfer" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "fromBranchId" UUID NOT NULL,
    "toBranchId" UUID NOT NULL,
    "requestedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phoneE164" TEXT NOT NULL,
    "ageBracketId" UUID,
    "firstServiceId" UUID,
    "invitedByMemberId" UUID,
    "assignedToUserId" UUID,
    "qrCodeId" UUID,
    "status" "VisitorStatus" NOT NULL DEFAULT 'NEW',
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "consentSms" BOOLEAN NOT NULL DEFAULT true,
    "convertedMemberId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" UUID,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","memberId")
);

-- CreateTable
CREATE TABLE "GroupMeeting" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "topic" TEXT,
    "offeringMinor" INTEGER,
    "reportedBy" UUID NOT NULL,

    CONSTRAINT "GroupMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAttendance" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "memberId" UUID,
    "guestName" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GroupAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupNote" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "bodyCipher" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterShift" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "duty" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "RosterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerRequest" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "memberId" UUID,
    "visitorId" UUID,
    "submittedBy" TEXT,
    "body" TEXT,
    "bodyCipher" BYTEA,
    "nonce" BYTEA,
    "keyVersion" INTEGER,
    "visibility" "PrayerVisibility" NOT NULL DEFAULT 'FOLLOWUP_TEAM',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "shareToWall" BOOLEAN NOT NULL DEFAULT false,
    "moderation" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerAction" (
    "requestId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerAction_pkey" PRIMARY KEY ("requestId","memberId")
);

-- CreateTable
CREATE TABLE "CounselingNote" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "bodyCipher" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "sharedWith" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelfareRequest" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "memberId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "descriptionCipher" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "amountRequestedMinor" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewedBy" UUID,
    "approvedBy" UUID,
    "disbursedExpenseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelfareRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeadcountSegment" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "SegmentKind" NOT NULL DEFAULT 'IN_PERSON',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HeadcountSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "name" TEXT NOT NULL,
    "rrule" TEXT,
    "startTime" TEXT NOT NULL,
    "segmentIds" UUID[],

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "templateId" UUID,
    "eventGroupId" UUID,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Headcount" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientSeq" INTEGER NOT NULL,
    "recordedBy" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Headcount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "memberId" UUID,
    "visitorId" UUID,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "deviceId" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildCheckIn" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "tagNo" TEXT NOT NULL,
    "pickupCodeHash" TEXT NOT NULL,
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "checkedOutBy" UUID,

    CONSTRAINT "ChildCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venue" TEXT,
    "capacity" INTEGER,
    "rsvpOpensAt" TIMESTAMP(3),
    "rsvpClosesAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "feeMinor" INTEGER NOT NULL DEFAULT 0,
    "fundId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID,
    "guestName" TEXT,
    "guestPhoneE164" TEXT,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'GOING',
    "qrToken" TEXT,
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrCode" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "kind" "QrKind" NOT NULL DEFAULT 'VISITOR_FORM',
    "shortCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FundType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "fundId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goalMinor" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pledge" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "memberId" UUID NOT NULL,
    "fundId" UUID NOT NULL,
    "campaignId" UUID,
    "amountMinor" INTEGER NOT NULL,
    "frequency" "PledgeFrequency" NOT NULL DEFAULT 'ONE_TIME',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "status" "PledgeStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GivingBatch" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "serviceId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "countedBy1" UUID,
    "countedBy2" UUID,
    "countedMinor" INTEGER,
    "approvedBy" UUID,
    "depositRef" TEXT,
    "depositedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GivingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "fundId" UUID NOT NULL,
    "memberId" UUID,
    "giverName" TEXT,
    "giverPhoneE164" TEXT,
    "giftMinor" INTEGER NOT NULL,
    "feeCoverMinor" INTEGER NOT NULL DEFAULT 0,
    "chargedMinor" INTEGER NOT NULL,
    "feeEstimateMinor" INTEGER NOT NULL DEFAULT 0,
    "gatewayFeeMinor" INTEGER,
    "netSettledMinor" INTEGER,
    "settledMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "presentmentCurrency" TEXT,
    "presentmentMinor" INTEGER,
    "fxRateLocked" DECIMAL(18,6),
    "channel" "PayChannel",
    "momoProvider" "MomoProvider",
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "paystackTxId" BIGINT,
    "gatewayResponse" JSONB,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "recordedBy" UUID,
    "batchId" UUID,
    "bankRef" TEXT,
    "attemptOf" UUID,
    "failureCode" TEXT,
    "nudgeSentAt" TIMESTAMP(3),
    "receiptSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("provider","eventKey")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL DEFAULT 'GHS',
    "rate" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" UUID NOT NULL,
    "churchId" UUID,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "missingLocal" JSONB NOT NULL,
    "missingRemote" JSONB NOT NULL,
    "amountMismatch" JSONB NOT NULL,
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "categoryId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "spentOn" DATE NOT NULL,
    "payee" TEXT NOT NULL,
    "note" TEXT,
    "receiptKey" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedBy" UUID NOT NULL,
    "approvedBy" UUID,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsWallet" (
    "churchId" UUID NOT NULL,
    "balanceUnits" INTEGER NOT NULL DEFAULT 0,
    "reservedUnits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsWallet_pkey" PRIMARY KEY ("churchId")
);

-- CreateTable
CREATE TABLE "SmsLedger" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsPackage" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SmsPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsPurchase" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "units" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "SmsPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCampaign" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "source" "SmsSource" NOT NULL,
    "campaignId" UUID,
    "progressId" UUID,
    "toE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsOptOut" (
    "churchId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'CHURCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("churchId","phoneE164")
);

-- CreateTable
CREATE TABLE "OptEvent" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "keyword" TEXT,
    "inboundSmsId" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundSms" (
    "id" UUID NOT NULL,
    "churchId" UUID,
    "fromE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerId" TEXT,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "InboundSms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "providerTemplateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bodyPreview" TEXT NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingPrompt" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "progressId" UUID,
    "refId" UUID,
    "options" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTask" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "visitorId" UUID,
    "memberId" UUID,
    "promptId" UUID,
    "type" TEXT NOT NULL,
    "assignedTo" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "branchId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "audience" JSONB NOT NULL,
    "channels" TEXT[],
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "userId" UUID,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertState" (
    "churchId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertState_pkey" PRIMARY KEY ("churchId","key")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "speaker" TEXT,
    "preachedOn" DATE NOT NULL,
    "seriesId" UUID,
    "externalUrl" TEXT,
    "fileKey" TEXT,
    "durationSec" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpWorkflow" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "FollowTrigger" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
    "quietStart" INTEGER NOT NULL DEFAULT 20,
    "quietEnd" INTEGER NOT NULL DEFAULT 8,

    CONSTRAINT "FollowUpWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpWorkflowVersion" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpWorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpStep" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "StepType" NOT NULL DEFAULT 'SMS',
    "delayFrom" "DelayFrom" NOT NULL DEFAULT 'ENROLLMENT',
    "delayMinutes" INTEGER NOT NULL,
    "sendAtLocal" TEXT,
    "template" TEXT NOT NULL,
    "taskTitle" TEXT,
    "question" TEXT,
    "onYesPosition" INTEGER,
    "onNoPosition" INTEGER,

    CONSTRAINT "FollowUpStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpProgress" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "visitorId" UUID,
    "memberId" UUID,
    "state" "ProgressState" NOT NULL DEFAULT 'ACTIVE',
    "nextPosition" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStepAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FollowUpProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "fromBranchId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralAction" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "memberId" UUID,
    "type" TEXT NOT NULL,
    "actionDate" DATE NOT NULL,
    "note" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastoralAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgeBracket_churchId_isActive_sortOrder_idx" ON "AgeBracket"("churchId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AgeBracket_churchId_key_key" ON "AgeBracket"("churchId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Church_slug_key" ON "Church"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_churchId_code_key" ON "Branch"("churchId", "code");

-- CreateIndex
CREATE INDEX "User_churchId_idx" ON "User"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "User_churchId_phoneE164_key" ON "User"("churchId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Role_churchId_key_key" ON "Role"("churchId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Member_qrToken_key" ON "Member"("qrToken");

-- CreateIndex
CREATE INDEX "Member_churchId_phoneE164_idx" ON "Member"("churchId", "phoneE164");

-- CreateIndex
CREATE INDEX "Member_churchId_branchId_lastName_firstName_idx" ON "Member"("churchId", "branchId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Member_churchId_memberNo_key" ON "Member"("churchId", "memberNo");

-- CreateIndex
CREATE INDEX "MemberTransfer_churchId_status_idx" ON "MemberTransfer"("churchId", "status");

-- CreateIndex
CREATE INDEX "Visitor_churchId_status_createdAt_idx" ON "Visitor"("churchId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_churchId_phoneE164_key" ON "Visitor"("churchId", "phoneE164");

-- CreateIndex
CREATE INDEX "Group_churchId_type_idx" ON "Group"("churchId", "type");

-- CreateIndex
CREATE INDEX "GroupMeeting_groupId_heldAt_idx" ON "GroupMeeting"("groupId", "heldAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAttendance_meetingId_memberId_key" ON "GroupAttendance"("meetingId", "memberId");

-- CreateIndex
CREATE INDEX "GroupNote_groupId_memberId_idx" ON "GroupNote"("groupId", "memberId");

-- CreateIndex
CREATE INDEX "RosterShift_churchId_serviceId_idx" ON "RosterShift"("churchId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterShift_serviceId_memberId_duty_key" ON "RosterShift"("serviceId", "memberId", "duty");

-- CreateIndex
CREATE INDEX "PrayerRequest_churchId_status_createdAt_idx" ON "PrayerRequest"("churchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CounselingNote_churchId_subjectId_idx" ON "CounselingNote"("churchId", "subjectId");

-- CreateIndex
CREATE INDEX "WelfareRequest_churchId_status_idx" ON "WelfareRequest"("churchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HeadcountSegment_churchId_key_key" ON "HeadcountSegment"("churchId", "key");

-- CreateIndex
CREATE INDEX "Service_churchId_branchId_startsAt_idx" ON "Service"("churchId", "branchId", "startsAt");

-- CreateIndex
CREATE INDEX "Headcount_serviceId_segmentId_idx" ON "Headcount"("serviceId", "segmentId");

-- CreateIndex
CREATE INDEX "Headcount_churchId_serviceId_idx" ON "Headcount"("churchId", "serviceId");

-- CreateIndex
CREATE INDEX "Attendance_churchId_serviceId_idx" ON "Attendance"("churchId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_serviceId_memberId_key" ON "Attendance"("serviceId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_serviceId_visitorId_key" ON "Attendance"("serviceId", "visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "ChildCheckIn_serviceId_childId_key" ON "ChildCheckIn"("serviceId", "childId");

-- CreateIndex
CREATE INDEX "Event_churchId_startsAt_idx" ON "Event"("churchId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_qrToken_key" ON "EventRsvp"("qrToken");

-- CreateIndex
CREATE INDEX "EventRsvp_eventId_status_idx" ON "EventRsvp"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_guestPhoneE164_key" ON "EventRsvp"("eventId", "guestPhoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_shortCode_key" ON "QrCode"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_churchId_name_key" ON "Fund"("churchId", "name");

-- CreateIndex
CREATE INDEX "Pledge_churchId_memberId_idx" ON "Pledge"("churchId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Transaction_churchId_status_paidAt_idx" ON "Transaction"("churchId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "Transaction_churchId_fundId_paidAt_idx" ON "Transaction"("churchId", "fundId", "paidAt");

-- CreateIndex
CREATE INDEX "Transaction_churchId_memberId_paidAt_idx" ON "Transaction"("churchId", "memberId", "paidAt");

-- CreateIndex
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_churchId_bankRef_key" ON "Transaction"("churchId", "bankRef");

-- CreateIndex
CREATE INDEX "ExchangeRate_base_quote_fetchedAt_idx" ON "ExchangeRate"("base", "quote", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_churchId_name_key" ON "ExpenseCategory"("churchId", "name");

-- CreateIndex
CREATE INDEX "Expense_churchId_spentOn_idx" ON "Expense"("churchId", "spentOn");

-- CreateIndex
CREATE UNIQUE INDEX "SmsLedger_idempotencyKey_key" ON "SmsLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SmsLedger_churchId_createdAt_idx" ON "SmsLedger"("churchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsPurchase_reference_key" ON "SmsPurchase"("reference");

-- CreateIndex
CREATE INDEX "SmsCampaign_churchId_status_idx" ON "SmsCampaign"("churchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SmsLog_idempotencyKey_key" ON "SmsLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SmsLog_churchId_status_queuedAt_idx" ON "SmsLog"("churchId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "SmsLog_providerMessageId_idx" ON "SmsLog"("providerMessageId");

-- CreateIndex
CREATE INDEX "SmsLog_toE164_queuedAt_idx" ON "SmsLog"("toE164", "queuedAt");

-- CreateIndex
CREATE INDEX "SmsLog_campaignId_idx" ON "SmsLog"("campaignId");

-- CreateIndex
CREATE INDEX "OptEvent_churchId_phoneE164_idx" ON "OptEvent"("churchId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "InboundSms_providerId_key" ON "InboundSms"("providerId");

-- CreateIndex
CREATE INDEX "InboundSms_fromE164_receivedAt_idx" ON "InboundSms"("fromE164", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_churchId_name_key" ON "WhatsAppTemplate"("churchId", "name");

-- CreateIndex
CREATE INDEX "PendingPrompt_phoneE164_status_expiresAt_idx" ON "PendingPrompt"("phoneE164", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CareTask_promptId_key" ON "CareTask"("promptId");

-- CreateIndex
CREATE INDEX "CareTask_churchId_status_dueAt_idx" ON "CareTask"("churchId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CareTask_churchId_memberId_idx" ON "CareTask"("churchId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "Notification_churchId_userId_readAt_idx" ON "Notification"("churchId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_phoneE164_expiresAt_idx" ON "OtpChallenge"("phoneE164", "expiresAt");

-- CreateIndex
CREATE INDEX "MediaItem_churchId_preachedOn_idx" ON "MediaItem"("churchId", "preachedOn");

-- CreateIndex
CREATE INDEX "FollowUpWorkflow_churchId_trigger_isActive_idx" ON "FollowUpWorkflow"("churchId", "trigger", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpWorkflowVersion_workflowId_version_key" ON "FollowUpWorkflowVersion"("workflowId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpStep_versionId_position_key" ON "FollowUpStep"("versionId", "position");

-- CreateIndex
CREATE INDEX "FollowUpProgress_state_nextRunAt_idx" ON "FollowUpProgress"("state", "nextRunAt");

-- CreateIndex
CREATE INDEX "FollowUpProgress_churchId_state_idx" ON "FollowUpProgress"("churchId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpProgress_workflowId_visitorId_key" ON "FollowUpProgress"("workflowId", "visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpProgress_workflowId_memberId_key" ON "FollowUpProgress"("workflowId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedBy_key" ON "RefreshToken"("replacedBy");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_churchId_expiresAt_idx" ON "RefreshToken"("churchId", "expiresAt");

-- CreateIndex
CREATE INDEX "Remittance_churchId_status_idx" ON "Remittance"("churchId", "status");

-- CreateIndex
CREATE INDEX "Remittance_churchId_fromBranchId_idx" ON "Remittance"("churchId", "fromBranchId");

-- CreateIndex
CREATE INDEX "PastoralAction_churchId_actionDate_idx" ON "PastoralAction"("churchId", "actionDate");

-- CreateIndex
CREATE INDEX "PastoralAction_churchId_memberId_idx" ON "PastoralAction"("churchId", "memberId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberGuardian" ADD CONSTRAINT "MemberGuardian_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberGuardian" ADD CONSTRAINT "MemberGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMeeting" ADD CONSTRAINT "GroupMeeting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAttendance" ADD CONSTRAINT "GroupAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GroupMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerAction" ADD CONSTRAINT "PrayerAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrayerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Headcount" ADD CONSTRAINT "Headcount_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Headcount" ADD CONSTRAINT "Headcount_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "HeadcountSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GivingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsPurchase" ADD CONSTRAINT "SmsPurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SmsPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SmsCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpWorkflowVersion" ADD CONSTRAINT "FollowUpWorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "FollowUpWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpStep" ADD CONSTRAINT "FollowUpStep_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FollowUpWorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpProgress" ADD CONSTRAINT "FollowUpProgress_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "FollowUpWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpProgress" ADD CONSTRAINT "FollowUpProgress_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FollowUpWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpProgress" ADD CONSTRAINT "FollowUpProgress_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

