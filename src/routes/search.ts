import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { searchAndFetchVideo, fetchVideoByUrl, listSeason, listSeries, HttpError } from '../services/prehrajto.js';
import { SearchQueryParams, SeriesQueryParams, VideoQueryParams } from '../types.js';

function parsePositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, `Query parameter "${name}" must be a positive integer`);
  }
  return parsed;
}

function requireTitle(title: unknown): string {
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new HttpError(400, 'Missing query parameter "title"');
  }
  return title.trim();
}

function sendError(fastify: FastifyInstance, reply: FastifyReply, error: any) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  if (statusCode >= 500) fastify.log.error(error);
  return reply.status(statusCode).send({
    success: false,
    error: error.message || 'Internal server error'
  });
}

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get('/api/search', async (request: FastifyRequest<{ Querystring: SearchQueryParams }>, reply: FastifyReply) => {
    try {
      const { quality, all, type } = request.query;
      const title = requireTitle(request.query.title);

      if (type !== undefined && type !== 'movie' && type !== 'series') {
        throw new HttpError(400, 'Query parameter "type" must be "movie" or "series"');
      }

      const result = await searchAndFetchVideo({
        title,
        quality,
        all: all === 'true' || all === '1',
        type,
        season: parsePositiveInt(request.query.season, 'season'),
        episode: parsePositiveInt(request.query.episode, 'episode')
      });

      return reply.send({ success: true, result });
    } catch (error) {
      return sendError(fastify, reply, error);
    }
  });

  fastify.get('/api/series', async (request: FastifyRequest<{ Querystring: SeriesQueryParams }>, reply: FastifyReply) => {
    try {
      const title = requireTitle(request.query.title);
      const season = parsePositiveInt(request.query.season, 'season');

      if (season !== undefined) {
        const episodes = await listSeason(title, season);
        if (episodes.length === 0) throw new HttpError(404, `No episodes found for ${title} season ${season}`);
        return reply.send({ success: true, result: { series: title, season, episodes } });
      }

      const seasons = await listSeries(title);
      if (seasons.length === 0) throw new HttpError(404, `No seasons found for ${title}`);
      return reply.send({ success: true, result: { series: title, seasons } });
    } catch (error) {
      return sendError(fastify, reply, error);
    }
  });

  fastify.get('/api/video', async (request: FastifyRequest<{ Querystring: VideoQueryParams }>, reply: FastifyReply) => {
    try {
      const { url, quality } = request.query;
      if (!url || typeof url !== 'string') throw new HttpError(400, 'Missing query parameter "url"');
      return reply.send({ success: true, result: await fetchVideoByUrl(url, quality) });
    } catch (error) {
      return sendError(fastify, reply, error);
    }
  });
}
