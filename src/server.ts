import Fastify from 'fastify';
import { searchRoutes } from './routes/search.js';

const fastify = Fastify({
  logger: true
});

fastify.get('/health', async () => {
  return { status: 'ok jsi negr' };
});

await fastify.register(searchRoutes);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = '127.0.0.1';
    
    await fastify.listen({ port, host });
    console.log(`\nhttp://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
