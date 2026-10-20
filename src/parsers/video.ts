import * as cheerio from 'cheerio';
import { StreamOption, SubtitleOption, VideoMetadata, SearchResultItem, EpisodeInfo } from '../types.js';

// Junk commonly appended to file names on prehraj.to (language, quality, codecs, uploader tags)
const JUNK_WORDS = new Set([
  'cz', 'sk', 'en', 'eng', 'cze', 'dabing', 'dab', 'dabbing', 'titulky', 'tit', 'sub', 'subs', 'cztit',
  'hd', 'fullhd', 'full', 'uhd', 'uhdr', 'hdr', 'dv', '4k', 'top', 'kvalita', 'topkvalita', 'verze', 'super',
  '480p', '576p', '720p', '1080p', '2160p', 'hevc', 'x264', 'x265', 'h264', 'h265', 'web', 'webrip', 'webdl',
  'bluray', 'brrip', 'bdrip', 'dvdrip', 'amzn', 'nf', 'dsnp', 'hmax', 'atvp', 'ddp5', 'ddp5.1', 'aac', 'ac3', 'dd5',
  'mkv', 'mp4', 'avi', 'mui', 'ok', 'up', 'new', 'nové', 'nove', 'czen', 'czsk', 'czdabing', 'czdab', 'cztitulky'
]);

function decodeEntities(value: string): string {
  return value
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanStreamUrl(rawUrl: string): string {
  let url = decodeEntities(rawUrl.trim());
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }
  return url;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

export function formatEpisodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

// Release info (resolution, source, codec...) - everything from this token on is dropped
const RELEASE_TOKEN = /^(\d{3,4}p|4k|web|webrip|web-?dl|bluray|brrip|bdrip|dvdrip|hdr|hdr10|dv|hevc|[xh]26[45]|amzn|nf|dsnp|hmax|atvp|ddp?\d.*|aac.*|ac3)$/i;

const LANGUAGE_TAGS = new Set(['cz', 'sk', 'dabing', 'dab', 'titulky', 'cztit', 'czdabing', 'czdab', 'cztitulky', 'czen', 'czsk']);

function junkKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9áčďéěíňóřšťúůýž]/g, '');
}

function cleanName(value: string): string {
  let words = value
    .replace(/\.(mkv|mp4|avi)$/i, '')
    .replace(/[._+]/g, ' ')
    .replace(/[\[\](){}#=~@|…,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const releaseIndex = words.findIndex(w => RELEASE_TOKEN.test(w.replace(/^-+|-+$/g, '')));
  if (releaseIndex !== -1) words = words.slice(0, releaseIndex);

  // Leading tags first, so "CZ Dab Ženská svého druhu" keeps its name
  while (words.length && (JUNK_WORDS.has(junkKey(words[0])) || !junkKey(words[0]))) words.shift();

  // Language tags mark the end of the real name ("Sám doma 1 (1990) - CZ Dabing Top2026")
  const languageIndex = words.findIndex((w, i) => i > 0 && LANGUAGE_TAGS.has(junkKey(w)));
  if (languageIndex !== -1) words = words.slice(0, languageIndex);

  // Drop trailing junk words but keep real words in the middle (e.g. "Kosti a krev")
  while (words.length && (JUNK_WORDS.has(junkKey(words[words.length - 1])) || !junkKey(words[words.length - 1]))) words.pop();

  return words.join(' ').replace(/^[\s\-–:]+|[\s\-–:]+$/g, '').trim();
}

/**
 * Detects season/episode markers in a file name, e.g. "The Boys S05E08 Kosti a krev",
 * "The.Boys.s5e8", "The Boys 5x08", "The Boys S05 E08".
 */
export function parseEpisodeInfo(rawTitle: string): EpisodeInfo {
  const patterns = [
    /^(.*?)(?:^|[^a-z0-9])S(\d{1,2})[\s._-]*E(\d{1,3})(?!\d)(.*)$/i,
    /^(.*?)(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?!\d)(.*)$/i,
    /^(.*?)(?:^|[^a-z0-9])(?:Season|Serie|Série|Řada)[\s._-]*(\d{1,2})[\s._-]*(?:Episode|Ep|Díl|Dil|Epizoda)[\s._-]*(\d{1,3})(?!\d)(.*)$/i
  ];

  for (const pattern of patterns) {
    const match = rawTitle.match(pattern);
    if (match) {
      const series = cleanName(match[1]);
      return {
        series: series || null,
        season: parseInt(match[2], 10),
        episode: parseInt(match[3], 10),
        name: cleanName(match[4])
      };
    }
  }

  return { series: null, season: null, episode: null, name: cleanName(rawTitle) };
}

/** True when the parsed series name corresponds to the requested title. */
export function seriesMatches(parsedSeries: string | null, query: string): boolean {
  if (!parsedSeries) return false;
  const a = compactText(parsedSeries);
  const b = compactText(query);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function parseSearchResults(html: string, baseUrl: string): SearchResultItem[] {
  const $ = cheerio.load(html);
  const results: SearchResultItem[] = [];
  const seen = new Set<string>();

  $('a.video--link').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;

    const title = $el.find('.video__title').first().text().trim() || $el.attr('title')?.trim() || '';
    const pageUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
    const parts = new URL(pageUrl).pathname.split('/').filter(Boolean);
    const videoId = parts[parts.length - 1] || '';

    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);

    results.push({
      title,
      pageUrl,
      videoId,
      duration: $el.find('.video__tag--time').first().text().trim() || null,
      size: $el.find('.video__tag--size').first().text().trim() || null
    });
  });

  return results;
}

function readJsProp(objectSource: string, prop: string): string | null {
  const match = objectSource.match(new RegExp(`['"]?${prop}['"]?\\s*:\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`, 'i'));
  return match ? match[2] : null;
}

function normalizeQuality(label: string | null, res: string | null): string {
  const source = label || res || '';
  const match = source.match(/(\d{3,4})\s*p?/i);
  return match ? `${match[1]}p` : 'default';
}

function normalizeLanguage(srclang: string | null, label: string | null): string {
  const value = (srclang || label?.split(/\s*-\s*/)[0] || '').toLowerCase().replace(/\d+$/, '');
  if (value.startsWith('cz') || value.startsWith('ces') || value.startsWith('cs')) return 'CZE';
  if (value.startsWith('sk') || value.startsWith('slo')) return 'SLK';
  if (value.startsWith('en')) return 'ENG';
  return value ? value.toUpperCase() : 'UNKNOWN';
}

export function parseVideoPage(html: string, pageUrl: string, fallbackVideoId: string): VideoMetadata {
  const $ = cheerio.load(html);

  const fileName =
    $('h1 span').first().text().trim() ||
    $('h1').first().text().trim().split('\n')[0].trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().trim();

  const info = parseEpisodeInfo(fileName);
  const isEpisode = info.season !== null && info.episode !== null;

  let title: string;
  if (isEpisode) {
    title = info.name || `${info.series ?? ''} ${formatEpisodeCode(info.season!, info.episode!)}`.trim();
  } else {
    title = info.name || fileName;
  }

  const streamsMap = new Map<string, StreamOption>();
  const subtitlesMap = new Map<string, SubtitleOption>();

  const addStream = (rawUrl: string, label: string | null, res: string | null) => {
    const url = cleanStreamUrl(rawUrl);
    if (!/^https?:\/\//i.test(url) || streamsMap.has(url)) return;
    streamsMap.set(url, {
      quality: normalizeQuality(label, res),
      format: /\.m3u8(\?|$)/i.test(url) ? 'm3u8' : 'mp4',
      url
    });
  };

  const addSubtitle = (rawUrl: string, srclang: string | null, label: string | null) => {
    const url = cleanStreamUrl(rawUrl);
    if (!/^https?:\/\//i.test(url) || subtitlesMap.has(url)) return;
    const idMatch = label?.match(/-\s*(\d+)\s*-/) || url.match(/[?&]id=(\d+)/);
    subtitlesMap.set(url, {
      language: normalizeLanguage(srclang, label),
      id: idMatch ? idMatch[1] : 'unknown',
      label: label || srclang || '',
      url
    });
  };

  // Static HTML players (rare on prehraj.to, kept as a fallback)
  $('video source[src], video[src]').each((_, el) => {
    const $el = $(el);
    addStream($el.attr('src')!, $el.attr('label') || null, $el.attr('res') || $el.attr('data-res') || null);
  });
  $('track[src]').each((_, el) => {
    const $el = $(el);
    addSubtitle($el.attr('src')!, $el.attr('srclang') || null, $el.attr('label') || null);
  });

  // prehraj.to defines sources/tracks as JS object literals: { file|src: "...", label: '720p', kind: "captions" }
  $('script:not([src])').each((_, el) => {
    const script = $(el).html() || '';
    if (!/sources|videos\.push|tracks/.test(script)) return;

    for (const match of script.matchAll(/\{[^{}]*?\b(?:file|src)\s*:\s*["'][^"']+["'][^{}]*\}/g)) {
      const obj = match[0];
      const url = readJsProp(obj, 'file') || readJsProp(obj, 'src');
      if (!url) continue;

      const kind = readJsProp(obj, 'kind');
      const label = readJsProp(obj, 'label');

      if (kind && /captions|subtitles/i.test(kind)) {
        addSubtitle(url, readJsProp(obj, 'srclang'), label);
      } else if (/\.(mp4|m3u8|webm|mkv)(\?|$)/i.test(url) || readJsProp(obj, 'type')?.startsWith('video/')) {
        addStream(url, label, readJsProp(obj, 'res'));
      }
    }
  });

  const streams = Array.from(streamsMap.values()).sort(
    (a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0)
  );

  let duration = $('meta[itemprop="duration"]').attr('content')?.trim() || '';
  if (!duration) {
    $('span.color-primary').each((_, el) => {
      if (!duration && /Délka/i.test($(el).text())) {
        duration = $(el).next('span').text().trim();
      }
    });
  }

  return {
    type: isEpisode ? 'episode' : 'movie',
    series: isEpisode ? info.series : null,
    season: info.season,
    episode: info.episode,
    title,
    fileName,
    videoId: fallbackVideoId,
    pageUrl,
    streams,
    subtitles: Array.from(subtitlesMap.values()),
    duration: duration || 'N/A'
  };
}
