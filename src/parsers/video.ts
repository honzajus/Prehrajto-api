import * as cheerio from 'cheerio';
import { StreamOption, SubtitleOption, VideoMetadata, SearchResultItem } from '../types.js';

function cleanStreamUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(/\\/g, '');
  url = url.replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"')
           .replace(/&#39;/g, "'");

  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  return url;
}

export function parseSearchResults(html: string, baseUrl: string): SearchResultItem[] {
  const $ = cheerio.load(html);
  const results: SearchResultItem[] = [];

  $('a.video.video--small.video--link, a.video--link').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const title = $el.find('.video__title, .video-title, .title').text().trim() || $el.text().trim();

    if (href) {
      const pageUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
      const parts = href.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1] || '';
      const videoId = lastPart.includes('-') ? lastPart.split('-').pop() || lastPart : lastPart;

      results.push({
        title,
        pageUrl,
        videoId
      });
    }
  });

  return results;
}

export function parseVideoPage(html: string, pageUrl: string, fallbackVideoId: string): VideoMetadata {
  const $ = cheerio.load(html);

  let rawTitle = $('h1').first().text().trim() || $('title').text().trim();
  if (rawTitle.includes('\n')) {
    rawTitle = rawTitle.split('\n')[0].trim();
  }

 
  rawTitle = rawTitle.replace(/\s*[A-Za-z0-9_]+@.*$/i, '').trim();

  let series: string | null = null;
  let season: number | null = null;
  let episode: number | null = null;
  let parsedTitle = rawTitle;

 
  const patterns = [
    /(.*?)[._\s]+S(\d+)E(\d+)[._\s]+(.*)/i,
    /(.*?)[._\s]+(\d+)x(\d+)[._\s]+(.*)/i,
    /(.*?)[._\s]+(?:Season|S)[._\s]*(\d+)[._\s]+(?:Episode|Ep|Chapter|Ch)[._\s]*(\d+)[._\s]+(.*)/i,
    /(.*?)[._\s]+(?:Chapter|Ch)[._\s]*(\d+)[._\s]+(?:Season|S)[._\s]*(\d+)[._\s]+(.*)/i
  ];

  for (const pattern of patterns) {
    const match = rawTitle.match(pattern);
    if (match) {
      series = match[1].replace(/[._]/g, ' ').trim();
      
     
      if (pattern.source.includes('Chapter|Ch.*Season|S')) {
        episode = parseInt(match[2], 10);
        season = parseInt(match[3], 10);
      } else {
        season = parseInt(match[2], 10);
        episode = parseInt(match[3], 10);
      }
      
      parsedTitle = match[4].replace(/[._]/g, ' ').trim();
      break;
    }
  }

  if (!series && rawTitle.includes('_')) {
    const parts = rawTitle.split('_');
    if (parts.length >= 2) {
      series = parts[0].trim();
      parsedTitle = parts.slice(1).join(' ').trim();
    }
  }

  const streamsMap = new Map<string, StreamOption>();

 
  $('video source, source, video').each((_, el) => {
    const $el = $(el);
    const rawSrc = $el.attr('src');
    if (!rawSrc) return;

    const cleanUrl = cleanStreamUrl(rawSrc);
    const res = $el.attr('res') || $el.attr('data-res');
    const label = $el.attr('label') || (res ? `${res}p` : '');
    const qualityLabel = label ? (label.endsWith('p') ? label : `${label}p`) : (res ? `${res}p` : 'default');

    if (!streamsMap.has(cleanUrl)) {
      streamsMap.set(cleanUrl, {
        quality: qualityLabel,
        format: cleanUrl.includes('.m3u8') ? 'm3u8' : 'mp4',
        url: cleanUrl
      });
    }
  });

 
  if (streamsMap.size === 0) {
    $('script').each((_, el) => {
      const scriptContent = $(el).html() || '';
      const urlMatches = scriptContent.matchAll(/(?:file|src|url)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/gi);
      
      for (const match of urlMatches) {
        const rawUrl = match[1];
        if (rawUrl) {
          const cleanUrl = cleanStreamUrl(rawUrl);
          
          let quality = 'default';
          if (cleanUrl.includes('1080') || scriptContent.includes('1080')) quality = '1080p';
          else if (cleanUrl.includes('720') || scriptContent.includes('720')) quality = '720p';
          else if (cleanUrl.includes('480') || scriptContent.includes('480')) quality = '480p';

          if (!streamsMap.has(cleanUrl)) {
            streamsMap.set(cleanUrl, {
              quality,
              format: cleanUrl.includes('.m3u8') ? 'm3u8' : 'mp4',
              url: cleanUrl
            });
          }
        }
      }
    });
  }

  const streams = Array.from(streamsMap.values());


  const subtitles: SubtitleOption[] = [];
  $('track[kind="subtitles"]').each((_, el) => {
    const $track = $(el);
    let srclang = $track.attr('srclang') || $track.attr('label') || 'ENG';
    const src = $track.attr('src') || '';
    const idMatch = src.match(/id=([^&]+)/) || src.match(/\/(\d+)\.[a-z]+$/);

    if (srclang.toLowerCase().includes('cz') || srclang.toLowerCase().includes('cze')) {
      srclang = 'CZE';
    } else if (srclang.toLowerCase().includes('en') || srclang.toLowerCase().includes('eng')) {
      srclang = 'ENG';
    }

    subtitles.push({
      language: srclang.toUpperCase(),
      id: idMatch ? idMatch[1] : 'unknown'
    });
  });


  let duration = $('.video-info__duration, .duration, span:contains("Délka"), span:contains("Duration")')
    .first()
    .text()
    .replace(/Délka:/i, '')
    .replace(/Duration:/i, '')
    .trim();

  if (!duration || duration === '') {
    duration = 'N/A';
  }

  return {
    series,
    season,
    episode,
    title: parsedTitle,
    videoId: fallbackVideoId,
    pageUrl,
    streams,
    subtitles,
    duration
  };
}