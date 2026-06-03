import { BadRequestException } from '@nestjs/common'
import { promises as dns } from 'dns'
import isIP from 'validator/lib/isIP'
import isURL from 'validator/lib/isURL'

interface SafeOutboundUrlOptions {
  allowedHosts?: string[]
  allowedPrivateOrigins?: string[]
  skipDnsLookup?: boolean
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '')
}

function normalizeHostname(hostname: string): string {
  return stripIpv6Brackets(hostname).replace(/\.$/, '').toLowerCase()
}

export function normalizeUrlOrigin(url: URL): string {
  const hostname = normalizeHostname(url.hostname)
  const host = isIPv6(hostname) ? `[${hostname}]` : hostname

  return `${url.protocol.toLowerCase()}//${host}${url.port ? `:${url.port}` : ''}`
}

function isDevelopment(): boolean {
  return (process.env.NODE_ENV || 'development') === 'development'
}

export function isIPv4(address: string): boolean {
  return isIP(normalizeHostname(address), 4)
}

export function isIPv6(address: string): boolean {
  return isIP(normalizeHostname(address), 6)
}

export function isHttpUrl(rawUrl: string): boolean {
  return isURL(rawUrl, {
    protocols: ['http'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
    allow_protocol_relative_urls: false
  })
}

export function isHttpsUrl(rawUrl: string): boolean {
  return isURL(rawUrl, {
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
    allow_protocol_relative_urls: false
  })
}

function isHttpOrHttpsUrl(rawUrl: string): boolean {
  return isHttpUrl(rawUrl) || isHttpsUrl(rawUrl)
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(part => Number(part))

  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }

  const [a, b] = parts

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase()

  if (normalized === '::1' || normalized === '::') {
    return true
  }

  if (normalized.startsWith('::ffff:')) {
    return isPrivateIPv4(normalized.slice('::ffff:'.length))
  }

  return normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)
}

export function isLoopbackAddress(address: string): boolean {
  const normalized = normalizeHostname(address)

  if (isIPv4(normalized)) {
    return normalized.startsWith('127.')
  }

  if (isIPv6(normalized)) {
    return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1'
  }

  return false
}

export function isPrivateAddress(address: string): boolean {
  const normalized = normalizeHostname(address)

  if (isIPv4(normalized)) {
    return isPrivateIPv4(normalized)
  }

  if (isIPv6(normalized)) {
    return isPrivateIPv6(normalized)
  }

  return false
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return normalized === 'localhost' || normalized.endsWith('.localhost')
}

export function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)

  return isDevelopment() && (isLocalHostname(normalized) || isLoopbackAddress(normalized))
}

export function isAllowedHostname(hostname: string, allowedHosts: string[]): boolean {
  const normalized = normalizeHostname(hostname)

  return allowedHosts
    .map(allowedHost => normalizeHostname(allowedHost))
    .some(allowedHost => normalized === allowedHost || normalized.endsWith(`.${allowedHost}`))
}

export function isAllowedUrlOrigin(rawUrl: string | URL, allowedOrigins: string[]): boolean {
  let url: URL

  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl)
  } catch {
    return false
  }

  const normalized = normalizeUrlOrigin(url)

  return allowedOrigins
    .map(allowedOrigin => {
      try {
        return normalizeUrlOrigin(new URL(allowedOrigin))
      } catch {
        return
      }
    })
    .some(allowedOrigin => normalized === allowedOrigin)
}

export async function assertSafeOutboundUrl(
  rawUrl: string,
  options: SafeOutboundUrlOptions = {}
): Promise<URL> {
  let url: URL

  if (!isHttpOrHttpsUrl(rawUrl)) {
    throw new BadRequestException('URL protocol is not allowed')
  }

  try {
    url = new URL(rawUrl)
  } catch {
    throw new BadRequestException('Invalid URL')
  }

  const hostname = normalizeHostname(url.hostname)
  const isDevelopmentHost = isLocalDevelopmentHost(hostname)
  const isAllowedPrivateOrigin = isAllowedUrlOrigin(url, options.allowedPrivateOrigins || [])

  if (isLocalHostname(hostname) && !isDevelopmentHost && !isAllowedPrivateOrigin) {
    throw new BadRequestException('Localhost URLs are not allowed')
  }

  if (
    options.allowedHosts &&
    !isDevelopmentHost &&
    !isAllowedHostname(hostname, options.allowedHosts)
  ) {
    throw new BadRequestException('URL host is not allowed')
  }

  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (!isDevelopmentHost && !isAllowedPrivateOrigin && isPrivateAddress(hostname)) {
      throw new BadRequestException('Private network URLs are not allowed')
    }

    return url
  }

  if (!options.skipDnsLookup) {
    const addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true
    })

    if (
      addresses.some(
        row =>
          isPrivateAddress(row.address) &&
          !(isDevelopmentHost && isLoopbackAddress(row.address)) &&
          !isAllowedPrivateOrigin
      )
    ) {
      throw new BadRequestException('Private network URLs are not allowed')
    }
  }

  return url
}
