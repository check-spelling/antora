'use strict'

const convict = require('convict')
const json = require('json5')
const toml = require('@iarna/toml')
const yaml = require('js-yaml')

const ARGS_SCANNER_RX = /(?:([^=,]+)|(?==))(?:,|$|=(|("|').*?\3|[^,]+)(?:,|$))/g
const PRIMITIVE_TYPES = [Boolean, Number, String]

/**
 * A convict function wrapper that registers custom formats and parsers and
 * isolates the configuration from the process environment by default.
 */
function solitaryConvict (schema, opts) {
  registerFormats(convict)
  registerParsers(convict)
  return convict(schema, opts || { args: [], env: {} })
}

function registerParsers (convict) {
  convict.addParser([
    { extension: 'json', parse: json.parse },
    { extension: 'toml', parse: toml.parse },
    { extension: 'yaml', parse: yaml.load },
    { extension: 'yml', parse: yaml.load },
    {
      extension: '*',
      parse: () => {
        throw new Error('Unexpected playbook file type (must be yml, json, or toml')
      },
    },
  ])
}

function registerFormats (convict) {
  convict.addFormat({
    name: 'map',
    validate: (val) => {
      if (!(val == null || val.constructor === Object)) throw new Error('must be a map (i.e., key/value pairs)')
    },
    coerce: (val, config, name) => {
      if (config == null) return val
      const accum = config.has(name) ? config.get(name) : {}
      let match
      ARGS_SCANNER_RX.lastIndex = 0
      while ((match = ARGS_SCANNER_RX.exec(val))) {
        const [, k, v] = match
        if (k) accum[k] = v ? (v === '-' ? '-' : yaml.load(v)) : ''
      }
      return accum
    },
  })
  convict.addFormat({
    name: 'primitive-map',
    validate: (val) => {
      if (val == null) return
      if (
        !(
          val.constructor === Object &&
          Object.entries(val).every(([k, v]) => k && (!v || ~PRIMITIVE_TYPES.indexOf(v.constructor)))
        )
      ) {
        throw new Error('must be a primitive map (i.e., key/value pairs, primitive values only)')
      }
    },
    coerce: (val, config, name) => {
      if (config == null) return val
      const accum = config.has(name) ? config.get(name) : {}
      let match
      ARGS_SCANNER_RX.lastIndex = 0
      while ((match = ARGS_SCANNER_RX.exec(val))) {
        const [, k, v] = match
        if (k) {
          let parsed
          if (v && v !== '-') {
            parsed = yaml.load(v)
            if (parsed && PRIMITIVE_TYPES.indexOf(parsed.constructor) < 0) parsed = v
          } else {
            parsed = v || ''
          }
          accum[~k.indexOf('-') ? k.replace(/-/g, '_') : k] = parsed
        }
      }
      return accum
    },
  })
  convict.addFormat({
    name: 'boolean-or-string',
    validate: (val) => {
      if (!(val == null || val.constructor === String || val.constructor === Boolean)) {
        throw new Error('must be a boolean or string')
      }
    },
  })
  convict.addFormat({
    name: 'dir-or-virtual-files',
    validate: (val) => {
      if (!(val == null || val.constructor === String || Array.isArray(val))) {
        throw new Error('must be a directory path or list of virtual files')
      }
    },
  })
  convict.addFormat({
    name: 'url',
    validate: (val) => {
      if (val == null) return
      if (val.constructor !== String) throw new Error('must be a string')
      let protocol
      try {
        protocol = new URL(val).protocol
      } catch {
        throw new Error('must be a valid URL')
      }
      if (!(protocol === 'https:' || protocol === 'http:')) throw new Error('must be an HTTP or HTTPS URL')
    },
  })
  convict.addFormat({
    name: 'url-or-pathname',
    validate: (val) => {
      if (val == null) return
      if (val.constructor !== String) throw new Error('must be a string')
      let parsedUrl
      try {
        parsedUrl = new URL((val.charAt() === '/' ? 'https://example.org' : '') + val)
      } catch {
        throw new Error('must be a valid URL or a pathname (i.e., root-relative path)')
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('must be an HTTP or HTTPS URL or a pathname (i.e., root-relative path)')
      }
      if (~parsedUrl.pathname.indexOf('%20')) throw new Error('pathname segment must not contain spaces')
    },
  })
}

module.exports = solitaryConvict
