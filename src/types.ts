export interface StreamOption {
  quality: string;
  format: string;
  url: string;
}

export interface SubtitleOption {
  language: string;
  id: string;
}

export interface VideoMetadata {
  series: string | null;
  season: number | null;
  episode: number | null;
  title: string;
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
}

export interface SearchResultItem {
  title: string;
  pageUrl: string;
  videoId: string;
}