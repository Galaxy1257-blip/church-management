// The verse of the day used to be one pinned reference — John 3:16, every
// church, every night. This is the rotation instead: 84 passages, one per day,
// each with a single plain line to sit beside it. The pick is driven by the
// church-local date, so the same day always gives the same reading, a retried
// job never changes the text mid-flight, and no verse repeats inside a season.
// Every reference below resolves in all seven bundled translations (validated
// by daily-reading.test.ts against the real bundle files).
import { localDateKey } from './datetime';

export interface DailyReading {
  ref: string;
  note: string;
}

export const DAILY_READINGS: DailyReading[] = [
  { ref: 'Genesis 1:1', note: 'Before anything else existed, God was already at work.' },
  { ref: 'Exodus 14:14', note: 'This one is not yours to win by yourself.' },
  { ref: 'Numbers 6:24', note: 'A blessing to carry with you today.' },
  { ref: 'Deuteronomy 31:8', note: 'He goes ahead of you, so you can walk without dread.' },
  { ref: 'Joshua 1:9', note: 'Be strong, because God is with you wherever you go.' },
  { ref: 'Ruth 1:16', note: 'Loyalty chooses to stay when leaving would be easier.' },
  { ref: '1 Samuel 16:7', note: 'God looks at the heart, not at the outside.' },
  { ref: 'Psalm 23:1', note: 'A shepherd provides before he asks you to follow.' },
  { ref: 'Psalm 23:4', note: 'The valley is real. Walking it alone is not.' },
  { ref: 'Psalm 27:1', note: 'If God is your light, fear does not get the last word.' },
  { ref: 'Psalm 30:5', note: 'Crying is allowed to last one night only.' },
  { ref: 'Psalm 34:8', note: 'Try God for yourself; trust is not a theory.' },
  { ref: 'Psalm 46:1', note: 'A refuge is somewhere you can run to right now.' },
  { ref: 'Psalm 46:10', note: 'Stop striving. This world was never yours to hold up.' },
  { ref: 'Psalm 51:10', note: 'A clean start is possible. Ask, and mean it.' },
  { ref: 'Psalm 55:22', note: 'Put the weight down; it was never yours to carry.' },
  { ref: 'Psalm 63:1', note: 'Thirsting for God is itself a sign that he is near.' },
  { ref: 'Psalm 91:11', note: 'Your going out and coming in are being guarded.' },
  { ref: 'Psalm 100:4', note: 'Thanksgiving is the door you come through.' },
  { ref: 'Psalm 103:2', note: 'Count his benefits on purpose; forgetting is the danger.' },
  { ref: 'Psalm 119:105', note: 'You do not need the whole road, only the next step.' },
  { ref: 'Psalm 121:1', note: 'Help comes from a direction you did not expect.' },
  { ref: 'Psalm 127:1', note: 'Work without God is effort without a foundation.' },
  { ref: 'Psalm 139:23', note: 'Let God search your heart today; being known is not being shamed.' },
  { ref: 'Proverbs 3:5', note: 'Trust him further than your own reasoning reaches.' },
  { ref: 'Proverbs 4:23', note: 'Guard your inner life; your actions grow out of it.' },
  { ref: 'Proverbs 16:9', note: 'You plan the way, and God is allowed to redirect it.' },
  { ref: 'Proverbs 18:10', note: 'His name is a strong tower: run in and stop falling.' },
  { ref: 'Ecclesiastes 4:9', note: 'Two working together are better than one trying hard.' },
  { ref: 'Isaiah 26:3', note: 'Peace is a mind held on God, not an easy week.' },
  { ref: 'Isaiah 40:31', note: 'Wait on him and trade your tiredness for strength.' },
  { ref: 'Isaiah 41:10', note: 'Three promises in one line: with you, for you, upholding you.' },
  { ref: 'Isaiah 43:1', note: 'You are named, claimed and not forgotten.' },
  { ref: 'Isaiah 46:4', note: 'God carries you to grey hairs, not only to success.' },
  { ref: 'Isaiah 53:5', note: 'Peace with God was bought, not earned.' },
  { ref: 'Isaiah 55:11', note: "God's word never comes back empty-handed." },
  { ref: 'Jeremiah 1:5', note: 'You were known before anyone knew you.' },
  { ref: 'Jeremiah 17:7', note: 'A trust placed in God is a hope nobody can rob.' },
  { ref: 'Jeremiah 29:11', note: "God's thoughts toward you are peace, with an end in sight." },
  { ref: 'Lamentations 3:23', note: 'Mercy is reissued every single morning.' },
  { ref: 'Micah 6:8', note: 'Three things he asks: fairness, mercy, humility.' },
  { ref: 'Habakkuk 2:4', note: 'The upright live by trust, day by day.' },
  { ref: 'Zephaniah 3:17', note: 'God rests in his love over you and rejoices aloud.' },
  { ref: 'Zechariah 4:6', note: "Not your strength or your connections, but God's spirit." },
  { ref: 'Matthew 5:14', note: 'You were made to be seen, not hidden.' },
  { ref: 'Matthew 6:34', note: 'Today has enough of its own; leave tomorrow alone.' },
  { ref: 'Matthew 11:28', note: 'Being tired is the only entrance requirement.' },
  { ref: 'Matthew 18:20', note: 'Two or three gathered are enough for Christ to attend.' },
  { ref: 'Matthew 28:20', note: 'Teach, and remember he is with you to the end.' },
  { ref: 'Mark 4:39', note: 'Christ speaks to your storm, and it stops.' },
  { ref: 'Luke 1:37', note: 'The thing you called impossible is not the limit.' },
  { ref: 'Luke 6:31', note: 'Do first what you are hoping someone will do for you.' },
  { ref: 'Luke 12:32', note: 'A small flock is not a forgotten flock.' },
  { ref: 'John 1:5', note: 'Darkness has never once overtaken this light.' },
  { ref: 'John 8:12', note: 'Follow him and stop walking in the dark.' },
  { ref: 'John 10:10', note: 'Jesus came to give life, and give it in full.' },
  { ref: 'John 11:25', note: "Death is not the last chapter of anyone's story." },
  { ref: 'John 13:35', note: 'Love in action is the badge people notice.' },
  { ref: 'John 14:27', note: 'His peace is not the peace of a quiet week.' },
  { ref: 'John 15:5', note: 'Stay joined to him and fruit follows by itself.' },
  { ref: 'John 16:33', note: 'Trouble is certain; so is his victory over it.' },
  { ref: 'Acts 17:27', note: 'He is not far from any one of us.' },
  { ref: 'Romans 8:28', note: 'God is weaving today into a good end.' },
  { ref: 'Romans 12:12', note: 'Hope lets you rejoice; prayer lets you wait.' },
  { ref: '1 Corinthians 13:4', note: 'Love is measured by what it refuses to do.' },
  { ref: '1 Corinthians 15:58', note: 'Nothing done for the Lord is ever wasted work.' },
  { ref: '2 Corinthians 4:16', note: 'Worn outside, renewed inside, one day at a time.' },
  { ref: '2 Corinthians 5:7', note: 'Walk on what you trust, not on what you see.' },
  { ref: 'Galatians 6:9', note: 'Keep doing right; the harvest has a date.' },
  { ref: 'Ephesians 2:8', note: 'Saved by grace through faith: a gift, not a wage.' },
  { ref: 'Ephesians 4:32', note: 'Be kind and forgive, because you were forgiven.' },
  { ref: 'Philippians 4:6', note: 'Worry about nothing; ask about everything instead.' },
  { ref: 'Philippians 4:13', note: 'Strength for all things comes from the one who supplies it.' },
  { ref: 'Colossians 3:23', note: 'Do your work as though God himself were the employer.' },
  { ref: '1 Thessalonians 5:11', note: 'Build each other up on purpose, every day.' },
  { ref: '2 Timothy 1:7', note: 'Fear is not the spirit you were given.' },
  { ref: 'Hebrews 11:1', note: 'Faith gives solid ground under unseen promises.' },
  { ref: 'Hebrews 13:8', note: 'Christ does not change between yesterday and today.' },
  { ref: 'James 1:2', note: 'Trials can be counted as joy, because they build something.' },
  { ref: '1 Peter 5:7', note: 'He cares for you, so your cares can be handed over.' },
  { ref: '1 John 3:18', note: 'Love in deeds and truth, not only in words.' },
  { ref: 'Jude 1:24', note: 'He is able to keep you from falling.' },
  { ref: 'Revelation 3:20', note: 'Christ knocks; he does not push the door open.' },
  { ref: 'Revelation 21:4', note: 'Tears are on the list of things that are ending.' },
];

/** Serial day number for a YYYY-MM-DD church-local date key. */
function dayNumber(dateKey: string): number {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isNaN(t) ? NaN : Math.floor(t / 86400000);
}

/** Today's reading in the church's own timezone (Accra unless set otherwise). */
export function dailyReading(at: Date = new Date(), timeZone = 'Africa/Accra'): DailyReading {
  return dailyReadingFor(localDateKey(timeZone, at));
}

/** The reading for one date key — same date, same passage, everywhere. */
export function dailyReadingFor(dateKey: string): DailyReading {
  const n = dayNumber(dateKey);
  const i = Number.isFinite(n) ? ((n % DAILY_READINGS.length) + DAILY_READINGS.length) % DAILY_READINGS.length : 0;
  return DAILY_READINGS[i];
}

/**
 * Per-church devotional settings, kept in Church.settings.devotional.
 * `enabled` is the 8pm SMS (it spends wallet units) and a blank `verse` is what
 * lets the rotation run — a saved reference pins that one instead.
 */
export interface DevotionalSettings {
  enabled: boolean;
  translation: string;
  verse: string;
}

export const DEFAULT_DEVOTIONAL: DevotionalSettings = {
  enabled: false,
  translation: 'kjv',
  verse: '',
};

export function resolveDevotional(raw: unknown): DevotionalSettings {
  const d = (raw ?? {}) as Partial<DevotionalSettings>;
  return {
    enabled: d.enabled === true,
    translation: typeof d.translation === 'string' && d.translation.trim() ? d.translation.trim().toLowerCase() : DEFAULT_DEVOTIONAL.translation,
    verse: typeof d.verse === 'string' ? d.verse.trim() : '',
  };
}
