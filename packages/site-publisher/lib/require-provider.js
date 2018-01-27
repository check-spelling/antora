'use strict'

const path = require('path')

/**
 * Generates a function to resolve and require a custom provider.
 *
 * @memberof site-publisher
 *
 * @returns {Function} A function to require a provider.
 */
function createRequireProvider () {
  const requestCache = new Map()
  /**
   * Requires a provider, first resolving the path if necessary.
   *
   * If the request is an absolute path, that value is used as is. If the
   * request begins with a dot (.), the value is resolved relative to the
   * specified base directory. Otherwise, the request is resolved as the name
   * of a node module, a search which includes the node_modules folder in the
   * specified base directory. The resolved value is then passed to the require
   * function and the result returned.
   *
   * @param {String} request - The path or module name to resolve.
   * @param {String} requireBase - The absolute path from which to resolve a
   *   relative path or module name.
   *
   * @returns {Object} The object returned by calling require on the resolved path.
   */
  return function requireProvider (request, requireBase) {
    let resolved = requestCache.get(request)
    if (!resolved) {
      if (path.isAbsolute(request)) {
        resolved = request
      } else if (request.charAt(0) === '.') {
        resolved = path.join(requireBase, request)
      } else {
        resolved = require.resolve(request, {
          paths: [path.join(requireBase, 'node_modules')].concat(require.resolve.paths('')),
        })
      }
      requestCache.set(request, resolved)
    }

    return require(resolved)
  }
}

module.exports = createRequireProvider
