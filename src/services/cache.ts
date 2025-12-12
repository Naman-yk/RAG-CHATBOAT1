import { Redis } from "@upstash/redis";

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function getCachedAnswer(query: string) {
    const catched = await redis.get(query);
    if (!catched) {
        return null;
    }
    return JSON.parse(catched as string);
}

export async function cacheAnswer(query: string, data: any) {
    await redis.set(query, JSON.stringify(data), { ex: 60 * 60 * 24 })
}