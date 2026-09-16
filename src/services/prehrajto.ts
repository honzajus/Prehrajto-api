import { request } from 'undici';
import { parseSearchResults, parseVideoPage } from '../parsers/video.js';
import { VideoMetadata } from '../types.js';

const BASE_URL = 'https://prehraj.to';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export async function searchAndFetchVideo(titleQuery: string, requestedQuality?: string, fetchAll: boolean = false): Promise<VideoMetadata | VideoMetadata[]> {
  const searchUrl = `${BASE_URL}/hledej/${encodeURIComponent(titleQuery)}`;

  const searchResponse = await request(searchUrl, {
    method: 'GET',
    headers: { 'user-agent': USER_AGENT },
    headersTimeout: 10000,
    bodyTimeout: 10000
  });

  if (searchResponse.statusCode !== 200) {
    throw new Error(`Search failed with status: ${searchResponse.statusCode}`);
  }

  const searchHtml = await searchResponse.body.text();
  const searchResults = parseSearchResults(searchHtml, BASE_URL);

  if (searchResults.length === 0) {
    throw new Error('No videos found');
  }

 
  const itemsToFetch = fetchAll ? searchResults : [searchResults[0]];
  const results: VideoMetadata[] = [];

  for (const item of itemsToFetch) {
    try {
      const videoResponse = await request(item.pageUrl, {
        method: 'GET',
        headers: { 'user-agent': USER_AGENT },
        headersTimeout: 10000,
        bodyTimeout: 10000
      });

      if (videoResponse.statusCode === 200) {
        const videoHtml = await videoResponse.body.text();
        const videoData = parseVideoPage(videoHtml, item.pageUrl, item.videoId);

        if (requestedQuality && videoData.streams.length > 0) {
          const targetQuality = requestedQuality.toLowerCase().endsWith('p') 
            ? requestedQuality.toLowerCase() 
            : `${requestedQuality}p`;

          const filtered = videoData.streams.filter(s => s.quality.toLowerCase() === targetQuality);
          if (filtered.length > 0) {
            videoData.streams = filtered;
          }
        }
        results.push(videoData);
      }
    } catch {
     
    }
  }

  return fetchAll ? results : results[0];
}