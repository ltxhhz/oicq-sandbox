const internal_properties = [
  'Object', 'Function', 'Array', 'Number', 'parseFloat', 'parseInt', 'Boolean', 'String', 'Symbol', 'Date', 'RegExp', 'eval', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'JSON', 'Promise', 'Math', 'Intl', 'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'Uint8ClampedArray', 'BigUint64Array', 'BigInt64Array', 'DataView', 'Map', 'BigInt', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'isFinite', 'isNaN', 'SharedArrayBuffer', 'Atomics', 'WebAssembly'
]
// delete globalThis
delete console

function view(str) {
  return str.replace(/[&\[\]]/g, (s) => {
    if (s === "&") return "&amp;"
    if (s === "[") return "&#91;"
    if (s === "]") return "&#93;"
  })
}

var raw = view
//函数定义中若包含CQ码，可用此原型方法查看
Function.prototype.view = function () {
  return view(this.toString())
}

var tmp = {
  insert: {
    data: {
      configurable: false,
      enumerable: false,
      writable: true
    },
    __config: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: __config
    },
    __utils: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: __utils
    },
    __env: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: __env
    }
    // set_history:{}
  },
  keys: []
}
tmp.keys = Object.keys(tmp.insert)

Object.defineProperties(global, tmp.insert)
Reflect.ownKeys(global).forEach(e => {
  if (tmp.keys.includes(e) || e == 'tmp') return
  if (e == 'global') return Object.defineProperty(global, e, {
    writable: false,
    configurable: false,
    value: global[e]
  })
  if (internal_properties.includes(e)) {
    Object.freeze(global[e])
    Object.freeze(global[e].prototype)
    Object.defineProperty(global, e, {
      writable: false,
      configurable: false,
      value: global[e]
    })
    return
  }
  if (Object.getOwnPropertyDescriptor(global, e).enumerable) {
    Object.defineProperty(global, e, {
      value: global[e],
      writable: false,
      configurable: false
    })
  } else {
    delete global[e]
  }
})

delete tmp

global
// delete global
