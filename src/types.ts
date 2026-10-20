export interface StreamOption {
  quality: string;
  format: string;
  url: string;
}

export interface SubtitleOption {
  language: string;
  id: string;
  label: string;
  url: string;
}

export interface VideoMetadata {
  type: 'movie' | 'episode';
  series: string | null;
  season: number | null;
  episode: number | null;
  title: string;
  fileName: string;
  videoId: string;
  pageUrl: string;
  streams: StreamOption[];
  subtitles: SubtitleOption[];
  duration: string;
}

export interface SearchQueryParams {
  title: string;
  quality?: string;
  all?: string;
  type?: string;
  season?: string;
  episode?: string;
}

export interface SeriesQueryParams {
  title: string;
  season?: string;
}

export interface VideoQueryParams {
  url: string;
  quality?: string;
}

export interface SearchResultItem {
  title: string;
  pageUrl: string;
  videoId: string;
  duration: string | null;
  size: string | null;
}

export interface EpisodeInfo {
  series: string | null;
  season: number | null;
  episode: number | null;
  name: string;
}

export interface EpisodeListItem {
  season: number;
  episode: number;
  title: string;
  sources: SearchResultItem[];
}
