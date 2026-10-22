// R4.10 denomination presets — terminology pack applied at onboarding and in
// Settings. Purely a label map (the schema stays denomination-neutral); APIs
// and UIs read Church.settings.terminology for display labels.
export type DenominationKey = 'DEFAULT' | 'PENTECOSTAL' | 'METHODIST_PRESBYTERIAN' | 'CATHOLIC' | 'APOSTOLIC';

export interface DenominationTerms {
  unit: string; // what a branch is called (Branch, Society, Parish, Assembly…)
  unitPlural: string;
  unitLeader: string; // Elder, Reverend, Parish Priest, Head Pastor…
  gathering: string; // Sunday Service, Divine Service, Holy Mass…
  leadershipBody: string; // Council of Elders, Session, Parish Council…
}

export interface DenominationPreset {
  key: DenominationKey;
  label: string;
  terms: DenominationTerms;
}

export const DENOMINATION_PRESETS: DenominationPreset[] = [
  {
    key: 'DEFAULT',
    label: 'Non-denominational / Pentecostal (default)',
    terms: { unit: 'Branch', unitPlural: 'Branches', unitLeader: 'Elder', gathering: 'Sunday Service', leadershipBody: 'Council of Elders' },
  },
  {
    key: 'PENTECOSTAL',
    label: 'Pentecostal (Assemblies, Christ Embassy style)',
    terms: { unit: 'Assembly', unitPlural: 'Assemblies', unitLeader: 'Pastor', gathering: 'Service', leadershipBody: 'Executive Council' },
  },
  {
    key: 'METHODIST_PRESBYTERIAN',
    label: 'Methodist / Presbyterian (parish–society–diocese)',
    terms: { unit: 'Society', unitPlural: 'Societies', unitLeader: 'Reverend', gathering: 'Divine Service', leadershipBody: 'Session / Circuit' },
  },
  {
    key: 'CATHOLIC',
    label: 'Catholic (parish–diocese)',
    terms: { unit: 'Parish', unitPlural: 'Parishes', unitLeader: 'Parish Priest', gathering: 'Holy Mass', leadershipBody: 'Parish Pastoral Council' },
  },
  {
    key: 'APOSTOLIC',
    label: 'Apostolic / Foursquare (mission–area)',
    terms: { unit: 'Area', unitPlural: 'Areas', unitLeader: 'Apostle / Evangelist', gathering: 'Meeting', leadershipBody: 'Council of Ministers' },
  },
];

export function denominationPreset(key: string | null | undefined): DenominationPreset {
  return DENOMINATION_PRESETS.find((p) => p.key === key) ?? DENOMINATION_PRESETS[0]!;
}
