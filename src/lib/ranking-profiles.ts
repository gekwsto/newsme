// Extensible ranking profiles — add new profiles here without schema changes.
// Each profile defines how to weight scores for a given distribution channel.

export type ProfileKey = 'facebook' | 'seo' | 'linkedin' | 'newsletter';

export interface RankingProfile {
  key: ProfileKey;
  label: string;
  emoji: string;
  defaultSort: string;
  // Weights for a future computed "profile score" (must sum to 1.0)
  weights: {
    viral: number;
    discussion: number;
    businessValue: number;
    searchPotential: number;
    controversy: number;
    facebookDiscussion: number;
  };
}

export const RANKING_PROFILES: Record<ProfileKey, RankingProfile> = {
  facebook: {
    key: 'facebook',
    label: 'Facebook Growth',
    emoji: '📘',
    defaultSort: 'facebook',
    weights: { viral: 0.15, discussion: 0.20, businessValue: 0.05, searchPotential: 0.05, controversy: 0.25, facebookDiscussion: 0.30 },
  },
  seo: {
    key: 'seo',
    label: 'Google SEO',
    emoji: '🔍',
    defaultSort: 'search',
    weights: { viral: 0.15, discussion: 0.10, businessValue: 0.25, searchPotential: 0.35, controversy: 0.05, facebookDiscussion: 0.10 },
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    emoji: '💼',
    defaultSort: 'business',
    weights: { viral: 0.15, discussion: 0.20, businessValue: 0.40, searchPotential: 0.15, controversy: 0.05, facebookDiscussion: 0.05 },
  },
  newsletter: {
    key: 'newsletter',
    label: 'Newsletter',
    emoji: '📧',
    defaultSort: 'overall',
    weights: { viral: 0.20, discussion: 0.25, businessValue: 0.25, searchPotential: 0.15, controversy: 0.10, facebookDiscussion: 0.05 },
  },
};

export const DEFAULT_PROFILE: ProfileKey = 'facebook';
