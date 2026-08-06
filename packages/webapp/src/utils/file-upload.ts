import { helper, qs, removeObjectNil } from '@heyform-inc/utils'

interface FileUploadDisplayValue {
  filename: string
  url: string
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function urlBuilder(prefix: string, query: Record<string, unknown>): string {
  const hashIndex = prefix.indexOf('#')
  const url = hashIndex < 0 ? prefix : prefix.slice(0, hashIndex)
  const hash = hashIndex < 0 ? '' : prefix.slice(hashIndex)
  const separator = url.includes('?') ? '&' : '?'

  return url + separator + qs.stringify(removeObjectNil(query), { encode: true }) + hash
}

export function getFileUploadValue(value: unknown): FileUploadDisplayValue | undefined {
  let filename = 'Attachment'
  let url: string | undefined

  if (typeof value === 'string') {
    url = value
  } else if (helper.isObject(value)) {
    const file = value as Record<string, unknown>

    if (typeof file.filename === 'string' && helper.isValid(file.filename)) {
      filename = file.filename
    }

    if (typeof file.url === 'string') {
      url = file.url
    } else {
      const prefix = file.urlPrefix || file.cdnUrlPrefix
      const key = file.key || file.cdnKey

      if (typeof prefix === 'string' && typeof key === 'string') {
        url = `${prefix.replace(/\/$/, '')}/${key.replace(/^\//, '')}`
      }
    }
  }

  if (typeof url !== 'string') {
    return
  }

  if (isHttpUrl(url) || /^\/{1,2}[^/]/.test(url)) {
    return {
      filename,
      url: urlBuilder(url, {
        attname: filename
      })
    }
  }
}
