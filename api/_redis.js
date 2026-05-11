import { Redis } from "@upstash/redis";

export function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }
  return new Redis({ url, token });
}
