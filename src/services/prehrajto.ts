import { request } from 'undici';
import {
  parseSearchResults,
  parseVideoPage,
  parseEpisodeInfo,
  seriesMatches,
  compactText,
  normalizeText,
  formatEpisodeCode
} from '../parsers/video.js';
import { VideoMetadata, SearchResultItem, EpisodeListItem } from '../types.js';

const BASE_URL = 'https://prehraj.to';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const MAX_CANDIDATES = 8;
const CONCURRENCY = 4;
const SEARCH_CACHE_TTL = 15 * 60 * 1000;
// prehraj.to allows only ~5 searches per minute per IP and then blocks for ~60s
const RATE_LIMIT_COOLDOWN = 60 * 1000;

const searchCache = new Map<string, { at: number; results: Promise<SearchResultItem[]> }>();
let rateLimitedUntil = 0;

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export interface SearchOptions {
  title: string;
  quality?: string;
  all?: boolean;
  type?: 'movie' | 'series';
  season?: number;
  episode?: number;
}

async function fetchHtml(url: string): Promise<string | null> {
  const response = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': USER_AGENT,
      'accept-language': 'cs-CZ,cs;q=0.9,en;q=0.8'
    },
    maxRedirections: 3,
    headersTimeout: 10000,
    bodyTimeout: 15000
  });

  if (response.statusCode !== 200) {
    await response.body.dump();
    if (response.statusCode === 404) return null;
    if (response.statusCode === 429) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
      throw rateLimitError();
    }
    throw new HttpError(502, `prehraj.to responded with status ${response.statusCode}`);
  }

  return response.body.text();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function rateLimitError(): HttpError {
  const seconds = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
  return new HttpError(429, `prehraj.to search rate limit reached, try again in ${seconds}s`);
}

function isRateLimit(error: unknown): boolean {
  return error instanceof HttpError && error.statusCode === 429;
}

export async function searchVideos(query: string): Promise<SearchResultItem[]> {
  const key = normalizeText(query);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL) return cached.results;

  if (Date.now() < rateLimitedUntil) throw rateLimitError();

  // Only the first result page is publicly available, further pages require login
  const results = fetchHtml(`${BASE_URL}/hledej/${encodeURIComponent(query)}`)
    .then(html => (html ? parseSearchResults(html, BASE_URL) : []));
  searchCache.set(key, { at: Date.now(), results });
  results.catch(() => searchCache.delete(key));
  return results;
}

function normalizeQualityParam(quality?: string): string | null {
  if (!quality) return null;
  const match = quality.match(/\d{3,4}/);
  return match ? `${match[0]}p` : null;
}

function applyQuality(video: VideoMetadata, quality: string | null): boolean {
  if (!quality) return true;
  const filtered = video.streams.filter(s => s.quality === quality);
  if (filtered.length === 0) return false;
  video.streams = filtered;
  return true;
}

export async function fetchVideo(pageUrl: string, videoId?: string): Promise<VideoMetadata | null> {
  let url: URL;
  try {
    url = new URL(pageUrl, BASE_URL);
  } catch {
    throw new HttpError(400, 'Invalid video URL');
  }
  if (url.hostname !== 'prehraj.to' && !url.hostname.endsWith('.prehraj.to')) {
    throw new HttpError(400, 'Only prehraj.to URLs are supported');
  }

  const html = await fetchHtml(url.toString());
  if (!html) return null;

  const id = videoId || url.pathname.split('/').filter(Boolean).pop() || '';
  return parseVideoPage(html, url.toString(), id);
}

export async function fetchVideoByUrl(pageUrl: string, quality?: string): Promise<VideoMetadata> {
  const video = await fetchVideo(pageUrl);
  if (!video) throw new HttpError(404, 'Video not found');
  if (video.streams.length === 0) throw new HttpError(404, 'Video has no playable streams');
  applyQuality(video, normalizeQualityParam(quality));
  return video;
}

function matchesMovie(itemTitle: string, query: string): boolean {
  const title = compactText(itemTitle);
  const compactQuery = compactText(query);
  if (compactQuery && title.includes(compactQuery)) return true;
  const words = normalizeText(query).split(' ').filter(Boolean);
  return words.length > 0 && words.every(w => title.includes(w));
}

function isSequel(itemTitle: string, query: string): boolean {
  const title = compactText(itemTitle);
  const index = title.indexOf(compactText(query));
  if (index === -1) return false;
  const rest = title.slice(index + compactText(query).length);
  return /^[2-9](?!\d)/.test(rest);
}

/**
 * Most common real episode name across uploads. Most uploads have no name at all and uploader
 * tags ("DIABLO") are one-word one-offs, so a name needs 2+ uploads or 2+ words to count.
 */
function bestEpisodeName(items: SearchResultItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = parseEpisodeInfo(item.title).name;
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  let best = '';
  let bestScore = -1;
  for (const [name, count] of counts) {
    const words = name.split(' ').length;
    if (count < 2 && words < 2) continue;
    const score = count * 10 + Math.min(words, 5);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

function pickEpisodeCandidates(results: SearchResultItem[], series: string, season: number, episode: number) {
  return results.filter(item => {
    const info = parseEpisodeInfo(item.title);
    return info.season === season && info.episode === episode && seriesMatches(info.series, series);
  });
}

function pickMovieCandidates(results: SearchResultItem[], query: string, strict: boolean) {
  const notEpisodes = results.filter(item => parseEpisodeInfo(item.title).season === null);
  const matching = notEpisodes.filter(item => matchesMovie(item.title, query));
  if (!/\d/.test(query)) {
    // "Sám doma" should prefer the first movie over "Sám doma 2" (stable sort keeps site relevance otherwise)
    matching.sort((a, b) => Number(isSequel(a.title, query)) - Number(isSequel(b.title, query)));
  }
  if (matching.length > 0) return matching;
  if (strict) return notEpisodes;
  // Not a movie at all (e.g. a series title without season/episode) - keep site relevance order
  return notEpisodes.length > 0 ? notEpisodes : results;
}

async function resolveCandidates(candidates: SearchResultItem[], quality: string | null, all: boolean): Promise<VideoMetadata[]> {
  if (all) {
    const videos = await mapLimit(candidates, CONCURRENCY, item =>
      fetchVideo(item.pageUrl, item.videoId).catch(error => {
        if (isRateLimit(error)) throw error;
        return null;
      })
    );
    return videos.filter((v): v is VideoMetadata => !!v && v.streams.length > 0 && applyQuality(v, quality));
  }

  // Walk candidates in relevance order; skip removed videos and those without the requested quality
  let fallback: VideoMetadata | null = null;
  for (const item of candidates.slice(0, MAX_CANDIDATES)) {
    const video = await fetchVideo(item.pageUrl, item.videoId).catch(error => {
      if (isRateLimit(error)) throw error;
      return null;
    });
    if (!video || video.streams.length === 0) continue;
    if (applyQuality(video, quality)) return [video];
    fallback ??= video;
  }
  return fallback ? [fallback] : [];
}

export async function searchAndFetchVideo(options: SearchOptions): Promise<VideoMetadata | VideoMetadata[]> {
  const quality = normalizeQualityParam(options.quality);
  let { season, episode, type } = options;
  let title = options.title;

  // prehraj.to search needs words separated: "SamDoma" -> "Sam Doma"
  if (!/\s/.test(title)) {
    title = title.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
  }

  // Allow "The Boys S05E08" directly in the title
  if (season === undefined && episode === undefined) {
    const info = parseEpisodeInfo(title);
    if (info.season !== null && info.series) {
      title = info.series;
      season = info.season;
      episode = info.episode!;
    }
  }

  if (type === 'series' || season !== undefined || episode !== undefined) {
    season ??= 1;
    episode ??= 1;
    const code = formatEpisodeCode(season, episode);

    let candidates = pickEpisodeCandidates(await searchVideos(`${title} ${code}`), title, season, episode);
    if (candidates.length === 0) {
      // Some uploads use the "5x08" notation
      candidates = pickEpisodeCandidates(await searchVideos(`${title} ${season}x${String(episode).padStart(2, '0')}`), title, season, episode);
    }
    if (candidates.length === 0) {
      throw new HttpError(404, `No videos found for ${title} ${code}`);
    }

    const videos = await resolveCandidates(candidates, quality, !!options.all);
    if (videos.length === 0) throw new HttpError(404, `No playable videos found for ${title} ${code}`);
    const episodeName = bestEpisodeName(candidates);
    for (const video of videos) {
      video.title = episodeName || `${video.series ?? title} ${code}`;
    }
    return options.all ? videos : videos[0];
  }

  const results = await searchVideos(title);
  const candidates = pickMovieCandidates(results, title, type === 'movie');
  if (candidates.length === 0) {
    throw new HttpError(404, 'No videos found');
  }

  const videos = await resolveCandidates(candidates, quality, !!options.all);
  if (videos.length === 0) throw new HttpError(404, 'No playable videos found');
  return options.all ? videos : videos[0];
}

function collectEpisodes(results: SearchResultItem[], series: string, into: Map<string, EpisodeListItem>, onlySeason?: number) {
  for (const item of results) {
    const info = parseEpisodeInfo(item.title);
    if (info.season === null || info.episode === null || !seriesMatches(info.series, series)) continue;
    if (onlySeason !== undefined && info.season !== onlySeason) continue;

    const key = formatEpisodeCode(info.season, info.episode);
    let entry = into.get(key);
    if (!entry) {
      entry = { season: info.season, episode: info.episode, title: '', sources: [] };
      into.set(key, entry);
    }
    if (!entry.sources.some(s => s.videoId === item.videoId)) entry.sources.push(item);
  }
}

function sortEpisodes(map: Map<string, EpisodeListItem>): EpisodeListItem[] {
  return Array.from(map.values())
    .map(e => ({ ...e, title: bestEpisodeName(e.sources) || formatEpisodeCode(e.season, e.episode) }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

// Listings use a single search (search is heavily rate limited), so they cover what the first result page shows
export async function listSeason(title: string, season: number): Promise<EpisodeListItem[]> {
  const episodes = new Map<string, EpisodeListItem>();
  collectEpisodes(await searchVideos(`${title} S${String(season).padStart(2, '0')}`), title, episodes, season);
  return sortEpisodes(episodes);
}

export async function listSeries(title: string): Promise<{ season: number; episodes: EpisodeListItem[] }[]> {
  const episodes = new Map<string, EpisodeListItem>();
  collectEpisodes(await searchVideos(title), title, episodes);

  const seasons = new Map<number, EpisodeListItem[]>();
  for (const e of sortEpisodes(episodes)) {
    if (!seasons.has(e.season)) seasons.set(e.season, []);
    seasons.get(e.season)!.push(e);
  }
  return Array.from(seasons.entries()).map(([season, eps]) => ({ season, episodes: eps }));
}
