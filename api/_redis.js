// Cliente compartido de Upstash Redis.
// Acepta cualquiera de los dos nombres de variables de entorno que usa
// la integración "Upstash for Redis" desde el Marketplace de Vercel.
import { Redis } from "@upstash/redis";

const url =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.warn(
    "[mapa-reconexion] Faltan las variables de entorno de Redis (KV_REST_API_URL / KV_REST_API_TOKEN). " +
      "Conecta la integración de almacenamiento en tu proyecto de Vercel."
  );
}

export const redis = new Redis({ url, token });

export function tokenKey(token) {
  return "mapa-token:" + token;
}
