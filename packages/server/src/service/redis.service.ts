import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectRedis } from '@svtslv/nestjs-ioredis'
import { Redis } from 'ioredis'

import { hs } from '@heyform-inc/utils'

interface BaseOptions {
  key: string
}

interface SetOptions extends BaseOptions {
  value: any
  duration: string
}

interface HsetOptions extends SetOptions {
  field: string
}

interface HgetOptions extends BaseOptions {
  field?: string
}

interface HdelOptions extends BaseOptions {
  field?: string | string[]
}

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
`

@Injectable()
export class RedisService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  public get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  public async getInt(key: string, defaultValue = 0): Promise<number> {
    const result = await this.get(key)

    return parseInt(result, defaultValue)
  }

  public async throttler(key: string, limit: number, ttl: string) {
    const duration = hs(ttl)

    if (!duration) {
      throw new Error(`Invalid rate limit duration: ${ttl}`)
    }

    const [count, timeLeft] = (await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, duration)) as [
      number,
      number
    ]

    if (count > limit) {
      throw new HttpException(
        `Too many requests. Please try again in ${Math.max(timeLeft, 0)} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS
      )
    }
  }

  public set({ key, value, duration }: SetOptions): Promise<any> {
    return this.redis.set(key, value, 'ex', hs(duration))
  }

  public hset({ key, field, value, duration }: HsetOptions): Promise<[Error | null, any][]> {
    return this.multi([
      ['hset', key, field, value],
      ['expire', key, hs(duration)]
    ])
  }

  public hsetObject({ key, value: obj, duration }: SetOptions): Promise<[Error | null, any][]> {
    return this.multi([
      ...Object.keys(obj).map(field => ['hset', key, field, obj[field]]),
      ['expire', key, hs(duration)]
    ])
  }

  public hget({
    key,
    field
  }: HgetOptions): Promise<string | null> | Promise<Record<string, string>> {
    if (field) {
      return this.redis.hget(key, field)
    }
    return this.redis.hgetall(key)
  }

  public hdel({ key, field }: HdelOptions): Promise<number> {
    if (field) {
      return this.redis.hdel(key, field as KeyType)
    }
    return this.del(key)
  }

  /**
   * Atomically read and remove a hash field. This uses Lua for compatibility
   * with Redis versions that do not provide HGETDEL.
   */
  public hgetdel({ key, field }: Required<HgetOptions>): Promise<string | null> {
    return this.redis.eval(
      "local value = redis.call('HGET', KEYS[1], ARGV[1]); if value then redis.call('HDEL', KEYS[1], ARGV[1]); end; return value",
      1,
      key,
      field
    ) as Promise<string | null>
  }

  public multi(commands: any[][]): Promise<[Error | null, any][]> {
    return this.redis.multi(commands).exec()
  }

  public incr(key: string): Promise<number> {
    return this.redis.incr(key)
  }

  public del(key: string): Promise<number> {
    return this.redis.del(key)
  }

  public ping(): Promise<'PONG'> {
    return this.redis.ping() as Promise<'PONG'>
  }
}
