// Plain-English names for the action codes the app writes to the audit log.
//
// The log itself stores codes (`member.update`), because codes are what the
// writers can agree on across modules. A person reading the log should not have to
// learn them. Every code the app writes today is listed here; a code that is not
// listed is shown as written rather than guessed at, so a new action can never
// appear here wearing someone else's words.
const ACTION_LABELS: Record<string, string> = {
  'announcement.approve': 'Approved or declined a notice sent in by a member',
  'announcement.create': 'Added an announcement',
  'audit.chain.broken': 'The log itself failed its own check',
  'billing.cash.confirmed': 'Confirmed a subscription payment made in cash',
  'billing.checkout': 'Started a subscription payment',
  'billing.claim.cash': 'Recorded a cash subscription payment',
  'billing.pause': 'Paused or resumed a church workspace',
  'billing.payment.cancelled': 'Cancelled a subscription payment',
  'billing.payment.paid': 'A subscription payment arrived',
  'branch.create': 'Added a branch',
  'campaign.create': 'Started a special offering',
  'care.task.create': 'Opened a care item',
  'care.task.update': 'Updated a care item',
  checkin: 'Checked someone in',
  'child.checkin': 'Checked a child in',
  'child.checkout': 'Checked a child out',
  'child.guardian': 'Changed who may collect a child',
  'church.create': 'Created a church workspace',
  'church.join-code': 'Changed the code people use to add themselves',
  'church.profile.update': 'Changed the church settings',
  'counseling.add': 'Wrote a counselling note',
  'demographics.brackets.save': 'Changed the age groups',
  'demographics.settings.update': 'Changed the age group settings',
  'event.create': 'Added an event',
  'event.rsvp': 'Someone said they are coming to an event',
  'expense.create': 'Recorded spending',
  'finance.batch.approve': 'Approved an offering count',
  'finance.batch.counted': 'Saved the money counted',
  'finance.batch.create': 'Opened an offering count',
  'finance.batch.deposit': 'Marked an offering count as banked',
  'finance.batch.entries.add': 'Added entries to an offering count',
  'finance.collection.record': 'Recorded the collection at the door',
  'followup.workflow.create': 'Created a follow-up plan',
  'followup.workflow.publish': 'Turned a follow-up plan on',
  'giving.fees.update': 'Changed who pays the giving fees',
  'giving.initialize': 'Someone started giving online',
  'giving.settle.success': 'Confirmed an online gift in the offering',
  'group.create': 'Added a group or cell',
  'group.meeting.record': 'Took the register at a group meeting',
  'group.member.add': 'Put someone in a group',
  'group.member.remove': 'Took someone out of a group',
  'group.update': 'Changed a group or cell',
  'headcount.sync': 'Saved the attendance count',
  'member.age_promotion': 'Moved members to the next age group',
  'member.age_promotion.auto': 'The app moved someone to the next age group on their birthday',
  'member.create': 'Added a member',
  'member.delete': 'Removed a member',
  'member.import.confirm': 'Confirmed an imported list of members',
  'member.join': 'Someone added themselves with the church code',
  'member.milestones.update': 'Changed a member dates',
  'member.qr.issue': 'Printed a members check-in code',
  'member.stage.update': 'Changed what stage a member is at',
  'member.update': 'Changed a member record',
  'pastoral.add': 'Wrote a pastoral note',
  'platform.member.import': 'Imported members from the platform office',
  'platform.church.update': 'Changed a church from the platform office',
  'platform.impersonate': 'Opened a church workspace as its own staff',
  'pledge.create': 'Recorded a pledge',
  'prayer.add': 'Added a prayer request',
  'push.unsubscribe': 'Someone switched off phone notifications',
  'reminder.send': 'Sent a reminder',
  'remittance.submit': 'Sent money to the head church',
  'roster.assign': 'Put someone on the serving rota',
  'seed.defaults': 'Set up the starting funds and age groups',
  'service.create': 'Added a service',
  'service.schedule.save': 'Changed the service times',
  'settings.devotional.update': 'Changed the daily reading settings',
  'settings.sms_gateway.update': 'Changed the SMS provider',
  'sms.campaign.create': 'Set up an SMS campaign',
  'sms.campaign.send': 'Sent an SMS campaign',
  'sms.keyword.out': 'A number texted STOP to us',
  'sms.optout.remove': 'Put a number back on the SMS list',
  'transfer.request': 'Asked to move a member to another branch',
  'visitor.assign': 'Gave a visitor to someone to follow up',
  'visitor.convert': 'Made a visitor a member',
  'visitor.register': 'Wrote down a visitor',
  'visitor.return': 'Marked a visitor as back again',
  'welfare.approved': 'Decided a welfare request',
  'welfare.submit': 'Asked for welfare help',
};

/**
 * What the log calls the first word of an action, for the filter dropdown.
 *
 * Each entry has to read differently from every other one, because these are the
 * words in the picker: two sections sharing a name would give the same label twice
 * and filter two different sets of lines.
 */
const GROUP_LABELS: Record<string, string> = {
  announcement: 'News',
  audit: 'The log itself',
  billing: 'Subscription',
  branch: 'Branches',
  campaign: 'Special offerings',
  care: 'Care',
  checkin: 'Check-in',
  child: 'Children',
  church: 'Church settings',
  counseling: 'Counselling',
  demographics: 'Age groups',
  event: 'Events',
  expense: 'Expenses',
  finance: 'Offering counts',
  followup: 'Follow-up',
  giving: 'Online giving',
  group: 'Groups & cells',
  headcount: 'Attendance',
  member: 'Members',
  pastoral: 'Notes about members',
  platform: 'Platform office',
  pledge: 'Pledges',
  prayer: 'Prayer requests',
  push: 'Phone notifications',
  reminder: 'Reminders',
  remittance: 'Money to head church',
  roster: 'Serving team',
  seed: 'The starting setup',
  service: 'Services',
  settings: 'Settings',
  sms: 'SMS',
  transfer: 'Member transfers',
  visitor: 'Visitors',
  welfare: 'Welfare',
};

/**
 * A code the app has never written, or one a module added without a label here, is
 * shown exactly as stored. Guessing at words for an unknown code would put
 * something in the log that the log never said.
 */
export function actionLabel(action: string): { text: string; known: boolean } {
  const label = ACTION_LABELS[action];
  return label ? { text: label, known: true } : { text: action, known: false };
}

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

export function groupOf(action: string): string {
  return action.includes('.') ? action.slice(0, action.indexOf('.')) : action;
}
