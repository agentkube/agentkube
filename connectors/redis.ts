// connectors/redis.ts
import IORedis from 'ioredis';

const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, 
  enableReadyCheck: false,    
  retryStrategy: (times: number) => {
    if (times > 3) {
      return null; 
    }
    return Math.min(times * 1000, 3000); 
  }
};

const redis = new IORedis(redisOptions);

// Handle connection events
redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

export default redis;
export { redisOptions };