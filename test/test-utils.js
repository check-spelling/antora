'use strict'

process.env.NODE_ENV = 'test'

const chai = require('chai')
const fs = require('fs')
const { Transform } = require('stream')
const map = (transform) => new Transform({ objectMode: true, transform })
const ospath = require('path')
const { removeSync: rimrafSync } = require('fs-extra')

chai.use(require('chai-fs'))
chai.use(require('chai-cheerio'))
chai.use(require('chai-spies'))
// dirty-chai must be loaded after the other plugins
// see https://github.com/prodatakey/dirty-chai#plugin-assertions
chai.use(require('dirty-chai'))
chai.Assertion.addMethod('endWith', function (expected) {
  const subject = this._obj
  let verdict = false
  if (typeof subject === 'string' && typeof expected === 'string') verdict = subject.endsWith(expected)
  return this.assert(
    verdict,
    'expected #{this} to end with #{exp}',
    'expected #{this} to not end with #{exp}',
    expected,
    undefined
  )
})

function unlinkSync (path_) {
  try {
    fs.unlinkSync(path_)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

function rmdirSyncPosix (dir) {
  try {
    const lst = fs.readdirSync(dir, { withFileTypes: true })
    lst.forEach((it) =>
      it.isDirectory() ? rmdirSyncPosix(ospath.join(dir, it.name)) : unlinkSync(ospath.join(dir, it.name))
    )
    fs.rmdirSync(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return
    if (err.code === 'ENOTDIR') return unlinkSync(dir)
    throw err
  }
}

function rmdirSyncWindows (dir) {
  // NOTE: Windows requires either rimraf (from fs-extra) or Node 12 to remove a non-empty directory
  rimrafSync(dir)
  //fs.rmdirSync(dir, { recursive: true })
}

// Removes the specified directory (including all of its contents) or file.
// Equivalent to fs.promises.rmdir(dir, { recursive: true }) in Node 12.
const rmdirSync = process.platform === 'win32' ? rmdirSyncWindows : rmdirSyncPosix

function emptyDirSync (dir) {
  let lst
  try {
    lst = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') {
      fs.mkdirSync(dir, { recursive: true })
      return
    }
    if (err.code === 'ENOTDIR') {
      unlinkSync(dir)
      fs.mkdirSync(dir, { recursive: true })
      return
    }
    throw err
  }
  lst.forEach((it) => (it.isDirectory() ? rmdirSync(ospath.join(dir, it.name)) : unlinkSync(ospath.join(dir, it.name))))
}

module.exports = {
  bufferizeContents: () =>
    map((file, enc, next) => {
      if (file.isStream()) {
        const data = []
        const readChunk = (chunk) => data.push(chunk)
        const stream = file.contents
        stream.on('data', readChunk)
        stream.once('end', () => {
          stream.removeListener('data', readChunk)
          file.contents = Buffer.concat(data)
          next(null, file)
        })
      } else {
        next(null, file)
      }
    }),
  captureStdErr: async (fn, ...args) => {
    const stdErrWrite = process.stderr.write
    const messages = []
    try {
      process.stderr.write = (msg) => messages.push(msg.trim())
      await fn(...args)
      return messages
    } finally {
      process.stderr.write = stdErrWrite
    }
  },
  captureStdErrSync: (fn, ...args) => {
    const stdErrWrite = process.stderr.write
    const messages = []
    try {
      process.stderr.write = (msg) => messages.push(msg.trim())
      fn(...args)
      return messages
    } finally {
      process.stderr.write = stdErrWrite
    }
  },
  deferExceptions: async (fn, ...args) => {
    let deferredFn
    try {
      const result = await fn(...args)
      deferredFn = () => result
    } catch (err) {
      deferredFn = () => {
        throw err
      }
    }
    return deferredFn
  },
  emptyDirSync,
  expect: chai.expect,
  heredoc: (literals, ...values) => {
    const str =
      literals.length > 1
        ? values.reduce((accum, value, idx) => accum + value + literals[idx + 1], literals[0])
        : literals[0]
    const lines = str.trimRight().split(/^/m)
    if (lines.length > 1) {
      if (lines[0] === '\n') lines.shift()
    } else {
      return str
    }
    const indentRx = /^ +/
    const indentSize = Math.min(...lines.filter((l) => l.startsWith(' ')).map((l) => l.match(indentRx)[0].length))
    return (indentSize ? lines.map((l) => (l.startsWith(' ') ? l.substr(indentSize) : l)) : lines).join('')
  },
  rmdirSync,
  spy: chai.spy,
  toJSON: (obj) => JSON.stringify(obj, undefined, '  '),
}
