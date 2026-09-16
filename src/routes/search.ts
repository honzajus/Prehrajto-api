import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { searchAndFetchVideo } from '../services/prehrajto.js';
import { SearchQueryParams } from '../types.js';

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get('/api/search', async (request: FastifyRequest<{ Querystring: SearchQueryParams }>, reply: FastifyReply) => {
    const { title, quality, all } = request.query;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return reply.status(400).send({
        success: false,
        error: 'Missing query parameter "title"'
      });
    }

    try {
      const fetchAll = all === 'true' || all === '1';
      const result = await searchAndFetchVideo(title.trim(), quality, fetchAll);
      return reply.send({
        success: true,
        result
      });
    } catch (error: any) {
      fastify.log.error(error);
      
      const isNotFound = error.message?.includes('No videos found');
      return reply.status(isNotFound ? 404 : 500).send({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  });
}