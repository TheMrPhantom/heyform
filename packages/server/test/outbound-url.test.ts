import * as assert from 'assert'

import {
  assertSafeOutboundUrl,
  isAllowedHostname,
  isAllowedUrlOrigin,
  isHttpUrl,
  isHttpsUrl,
  isIPv4,
  isIPv6,
  isLocalDevelopmentHost,
  isLocalHostname,
  isPrivateAddress
} from '../src/utils/outbound-url'

async function withNodeEnv<T>(
  nodeEnv: string | undefined,
  callback: () => T | Promise<T>
): Promise<T> {
  const previous = process.env.NODE_ENV

  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = nodeEnv
  }

  try {
    return await callback()
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }
}

function testValidatorUrlAndIpHelpers() {
  assert.strictEqual(isIPv4('127.0.0.1'), true)
  assert.strictEqual(isIPv4('::1'), false)
  assert.strictEqual(isIPv6('::1'), true)
  assert.strictEqual(isIPv6('127.0.0.1'), false)
  assert.strictEqual(isHttpUrl('http://localhost:3000'), true)
  assert.strictEqual(isHttpsUrl('https://example.com'), true)
  assert.strictEqual(isHttpUrl('ftp://example.com'), false)
  assert.strictEqual(isHttpsUrl('http://example.com'), false)
}

function testPrivateAddressDetection() {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fd00::1',
    'fe80::1'
  ]) {
    assert.strictEqual(isPrivateAddress(address), true, address)
  }

  assert.strictEqual(isPrivateAddress('8.8.8.8'), false)
  assert.strictEqual(isPrivateAddress('2001:4860:4860::8888'), false)
}

async function testLocalhostDetection() {
  assert.strictEqual(isLocalHostname('localhost'), true)
  assert.strictEqual(isLocalHostname('foo.localhost'), true)
  assert.strictEqual(isLocalHostname('example.com'), false)

  await withNodeEnv('development', () => {
    assert.strictEqual(isLocalDevelopmentHost('localhost'), true)
    assert.strictEqual(isLocalDevelopmentHost('127.0.0.1'), true)
  })

  await withNodeEnv('production', () => {
    assert.strictEqual(isLocalDevelopmentHost('localhost'), false)
    assert.strictEqual(isLocalDevelopmentHost('127.0.0.1'), false)
  })
}

function testAllowedHostnameDetection() {
  assert.strictEqual(isAllowedHostname('images.unsplash.com', ['images.unsplash.com']), true)
  assert.strictEqual(
    isAllowedHostname('cdn.googleusercontent.com', ['googleusercontent.com']),
    true
  )
  assert.strictEqual(
    isAllowedHostname('evilgoogleusercontent.com', ['googleusercontent.com']),
    false
  )
  assert.strictEqual(
    isAllowedUrlOrigin('http://192.168.1.10:9157/static/webhook.png', ['http://192.168.1.10:9157']),
    true
  )
  assert.strictEqual(
    isAllowedUrlOrigin('http://192.168.1.10:9158/static/webhook.png', ['http://192.168.1.10:9157']),
    false
  )
  assert.strictEqual(
    isAllowedUrlOrigin('https://192.168.1.10:9157/static/webhook.png', [
      'http://192.168.1.10:9157'
    ]),
    false
  )
}

async function testSafeOutboundUrlPolicy() {
  await withNodeEnv('development', async () => {
    const localhost = await assertSafeOutboundUrl('http://localhost:3000/avatar.png', {
      allowedHosts: ['example.com'],
      skipDnsLookup: true
    })
    const loopback = await assertSafeOutboundUrl('http://127.0.0.1:3000/avatar.png', {
      allowedHosts: ['example.com']
    })

    assert.strictEqual(localhost.hostname, 'localhost')
    assert.strictEqual(loopback.hostname, '127.0.0.1')
  })

  await withNodeEnv('production', async () => {
    await assert.rejects(
      () => assertSafeOutboundUrl('http://localhost:3000/avatar.png', { skipDnsLookup: true }),
      (error: any) => error?.message === 'Localhost URLs are not allowed'
    )
    await assert.rejects(
      () => assertSafeOutboundUrl('http://127.0.0.1:3000/avatar.png', { skipDnsLookup: true }),
      (error: any) => error?.message === 'Private network URLs are not allowed'
    )

    const firstPartyPrivateUrl = await assertSafeOutboundUrl(
      'http://192.168.1.10:9157/static/webhook.png',
      {
        allowedHosts: ['192.168.1.10'],
        allowedPrivateOrigins: ['http://192.168.1.10:9157'],
        skipDnsLookup: true
      }
    )

    assert.strictEqual(firstPartyPrivateUrl.hostname, '192.168.1.10')

    await assert.rejects(
      () =>
        assertSafeOutboundUrl('http://192.168.1.10:9157/static/webhook.png', {
          allowedHosts: ['192.168.1.10'],
          skipDnsLookup: true
        }),
      (error: any) => error?.message === 'Private network URLs are not allowed'
    )
    await assert.rejects(
      () =>
        assertSafeOutboundUrl('http://192.168.1.10:9158/static/webhook.png', {
          allowedHosts: ['192.168.1.10'],
          allowedPrivateOrigins: ['http://192.168.1.10:9157'],
          skipDnsLookup: true
        }),
      (error: any) => error?.message === 'Private network URLs are not allowed'
    )

    const publicImageUrl = await assertSafeOutboundUrl('https://images.unsplash.com/photo.jpg', {
      allowedHosts: ['images.unsplash.com'],
      skipDnsLookup: true
    })

    assert.strictEqual(publicImageUrl.hostname, 'images.unsplash.com')
  })
}

async function run() {
  testValidatorUrlAndIpHelpers()
  testPrivateAddressDetection()
  await testLocalhostDetection()
  testAllowedHostnameDetection()
  await testSafeOutboundUrlPolicy()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
