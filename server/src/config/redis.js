const inMemoryCache = new Map();

const initRedis = async () => {
  console.log('Using in-memory cache (Redis not available)');
  return null;
};

const getRedisClient = () => null;

const isUsingInMemory = () => true;

const cacheWrapper = {
  get: async (key) => {
    return inMemoryCache.get(key);
  },
  set: async (key, value, options) => {
    inMemoryCache.set(key, value);
    return 'OK';
  },
  incr: async (key) => {
    const current = inMemoryCache.get(key) || 0;
    inMemoryCache.set(key, current + 1);
    return current + 1;
  },
  expire: async (key, seconds) => {
    return 'OK';
  }
};

module.exports = { initRedis, getRedisClient, isUsingInMemory, cacheWrapper };
