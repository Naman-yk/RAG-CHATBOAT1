import { Redis } from "@upstash/redis";

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function getCachedAnswer(query: string) {
    const cached = await redis.get(query);
    if (!cached) {
        return null;
    }
    // @upstash/redis parses JSON automatically
    return typeof cached === 'string' ? JSON.parse(cached) : cached;
}

export async function cacheAnswer(query: string, data: any) {
    await redis.set(query, JSON.stringify(data), { ex: 60 * 60 * 24 })
}