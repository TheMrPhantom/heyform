import * as util from 'util'

type LegacyUtil = typeof util & {
  isString?: (value: unknown) => value is string
}

const legacyUtil = util as LegacyUtil

if (typeof legacyUtil.isString !== 'function') {
  legacyUtil.isString = (value: unknown): value is string => typeof value === 'string'
}
