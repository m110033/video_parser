import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface CachedM3u8Entry {
  videoId: string; // unique id per video (e.g., gamer SN or anime1 post URL)
  m3u8Url: string;
  referer: string;
  cookies: string;
  expiresAt: number; // epoch ms
  lastFetched: number; // epoch ms
  site: string; // gamer | anime1
}

@Injectable()
export class M3u8CacheService {
  private readonly logger = new Logger(M3u8CacheService.name);

  // videoId -> cache entry
  private cache = new Map<string, CachedM3u8Entry>();

  // clientIp -> set of videoIds that client has requested
  private clientVideoMap = new Map<string, Set<string>>();

  // TTL for m3u8 (ms). Gamer ~1h; we'll treat anime1 similarly unless specified.
  private readonly defaultTtlMs = 55 * 60 * 1000; // refresh a bit earlier than 60m

  markViewed(clientIp: string, videoId: string) {
    if (!this.clientVideoMap.has(clientIp)) {
      this.clientVideoMap.set(clientIp, new Set());
    }
    const set = this.clientVideoMap.get(clientIp);
    if (set) set.add(videoId);
  }

  getViewedVideoIds(): string[] {
    const ids = new Set<string>();
    for (const set of this.clientVideoMap.values()) {
      set.forEach(id => ids.add(id));
    }
    return [...ids];
  }

  get(videoId: string): CachedM3u8Entry | undefined {
    const entry = this.cache.get(videoId);
    if (!entry) return undefined;
    // if expired, drop it
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(videoId);
      return undefined;
    }
    return entry;
  }

  set(partial: Omit<CachedM3u8Entry, 'expiresAt' | 'lastFetched'> & { ttlMs?: number }) {
    const ttlMs = partial.ttlMs ?? this.defaultTtlMs;
    const entry: CachedM3u8Entry = {
      ...partial,
      expiresAt: Date.now() + ttlMs,
      lastFetched: Date.now(),
    };
    this.cache.set(partial.videoId, entry);
    return entry;
  }

  update(videoId: string, updater: (old: CachedM3u8Entry) => CachedM3u8Entry) {
    const old = this.cache.get(videoId);
    if (!old) return;
    this.cache.set(videoId, updater(old));
  }

  // For debugging/inspection
  stats() {
    return {
      totalCached: this.cache.size,
      totalClients: this.clientVideoMap.size,
      viewedVideos: this.getViewedVideoIds().length,
    };
  }

  // Periodic cleanup & refresh trigger
  @Cron(CronExpression.EVERY_30_MINUTES)
  handleRefreshTick() {
    const now = Date.now();
    const threshold = now + 10 * 60 * 1000; // refresh if will expire within next 10 minutes
    let refreshCount = 0;
    for (const videoId of this.getViewedVideoIds()) {
      const entry = this.cache.get(videoId);
      if (!entry) continue;
      if (entry.expiresAt <= threshold) {
        // Mark for refresh by clearing so next request triggers fetch
        this.cache.delete(videoId);
        refreshCount++;
      }
    }
    if (refreshCount > 0) {
      this.logger.log(`Scheduled refresh invalidated ${refreshCount} near-expiry m3u8 entries.`);
    }
    // Cleanup expired
    let removed = 0;
    for (const [vid, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(vid);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} expired m3u8 cache entries.`);
    }
  }
}
