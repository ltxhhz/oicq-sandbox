const { VM } = require('vm2')
const { join } = require('path')
const { existsSync, statSync } = require('fs')
const jsonfile = require('jsonfile')
const zlib = require('zlib')
const excludeList = new Set([
  '__config', '__env', '__utils', 'eval', 'global', 'Function', 'raw', 'view'
])
/**@type {import('..').Cfg} */
const config = JSON.parse(process.env.config)

const box = {
  env: {
    initialized: false,
    userCodeRunning: false
  },
  utils: {
    contextify(o) {
      const contextField = []
      const tmp = (o) => {
        switch (typeof o) {
          case "object":
          case "function":
            if (o !== null) {
              if (contextField.includes(o)) return
              Object.freeze(o)
              contextField.push(o)
              for (let k of Reflect.ownKeys(o)) {
                try {
                  tmp(o[k])
                } catch (error) { }
              }
            }
            break
          default:
            break
        }
      }
      tmp(o)
    },
    isMaster() {
      return typeof box.config.master === 'number' ? vm.getGlobal('data')?.sender?.user_id == box.config.master : box.config.master.includes(vm.getGlobal('data')?.sender?.user_id)
    },
    saveContext,
    loadContext
  },
  config
}
const vm = new VM({
  wasm: false,
  eval: false,
  sandbox: {
    __env: new Proxy({}, {
      get(t, k) {
        if (box.env.userCodeRunning) return
        return Reflect.get(box.env, k)
      },
      set(t, k, v) {
        return false
      },
      defineProperty(t, k) {
        return false
      }
    }),
    __utils: new Proxy({}, {
      get(t, k) {
        if (['isMaster'].includes(k)) {
          return Reflect.get(box.utils, k)
        }
        if (!box.utils.isMaster() && box.env.userCodeRunning) return
        return Reflect.get(box.utils, k)
      },
      set(t, k, v) {
        return false
      },
      defineProperty(t, k) {
        return false
      }
    }),
    __config: new Proxy({}, {
      get(t, k) {
        if (box.env.userCodeRunning) return
        return Reflect.get(box.config, k)
      },
      set(t, k, v) {
        return false
      },
      defineProperty(t, k) {
        return false
      }
    })
  },
  // timeout: 500
})

vm.runFile(join(__dirname, './sandbox.code.js'))

//读取上下文
if (config.contextArchiveFile
  && existsSync(config.contextArchiveFile)
  && statSync(config.contextArchiveFile).size) loadContext()

if (config.saveInterval) {
  setInterval(saveContext, config.saveInterval);
}

box.env.initialized = true

module.exports = {
  vm,
  /**
   * 运行代码，返回结果
   * @param {string} code
   */
  run(code) {
    if (!box.env.initialized) {
      console.log('沙盒尚未初始化');
      return
    }
    code = code.trim()
    let debug = /^\\/.test(code)
    if (debug) code = code.substring(1)
    let res
    try {
      box.env.userCodeRunning = true
      res = vm.run(code)
    } catch (e) {
      if (debug) {
        /**@type {string[]} */
        let line = e.stack.split("\n")
        line.splice(2)
        return `${line.join('\n')}\n...`
      } else {
        return
      }
    } finally {
      box.env.userCodeRunning = false
    }
    if (res instanceof Promise) {
      res = Promise.race([res, new Promise((res, rej) => setTimeout(() => {
        rej(`Promise timeout. [${box.config.promiseTimeout}]`)
      }, box.config.promiseTimeout))])
    } else if (res == undefined) {
      return debug ? '<undefined>' : res
    }
    return res
  },
  /**
   * 传递一个外部对象到上下文对象，
   * @date 2023-01-08
   * @param {string} name 键
   * @param {any} obj 值
   * @param {Object} Obj
   * @param {boolean} Obj.freeze 是否不可修改
   * @param {boolean} Obj.exclude 是否不用持久化
   * @returns {any}
   */
  include(name, obj, { freeze = true, exclude = true }) {
    // if (vm.getGlobal(name)) {
    //   throw new Error(`属性 [${name}] 已存在于沙盒上下文中.`)
    // } else {
    if (freeze) vm.freeze(obj, name)
    else vm.setGlobal(name, obj)
    if (exclude) excludeList.add(name)
    vm.run(`__utils.contextify(${name})`)
    // }
  },
  setData(data) {
    vm.setGlobal('data', data)
    vm.run(`__utils.contextify(data)`)
  },
  saveContext,
  loadContext
}

/**
 * 保存上下文
 * @date 2023-01-09
 */
function saveContext() {
  // todo 正则匹配代码中的其他非基元类型(class,Proxy等)赋值来保存
  if (!config.contextArchiveFile) {
    throw new Error('需提供配置项 [contextArchiveFile]')
  }
  const obj = {}
  const o = vm.sandbox
  let globalFlag = 0
  const ctx = JSON.parse(JSON.stringify(o, (k, v) => {
    if (k == '') return v
    if ((k == 'global' || k == 'globalThis') && globalFlag != 2) return
    return v
  }))
  excludeList.forEach((v1) => delete ctx[v1])

  const saveFn = o => {
    for (const k in o) {
      if (Object.hasOwnProperty.call(o, k) && !excludeList.has(k)) {
        if (typeof o[k] === 'function') {
          obj[k] = o[k] + ''
        } else if (typeof o[k] == 'object' && o[k] !== null) {
          if (o === vm.sandbox) {
            try {
              if (JSON.stringify(o[k]).length > 0xa00000) {
                delete o[k]
                continue
              }
            } catch (error) {
              delete o[k]
              continue
            }
          }
          obj[k] = {}
          saveFn(o[k])
        } else if (typeof o[k] === 'bigint') {
          o[k] = o[k] + 'n'
        }
      }
    }
  }
  saveFn(o)
  if (config.contextArchiveCompress) {
    jsonfile.writeFileSync(config.contextArchiveFile, {
      compress: true,
      ctx: zlib.brotliCompressSync(JSON.stringify(ctx), config.brotliOptions).toString('base64'),
      fn: zlib.brotliCompressSync(JSON.stringify(obj), config.brotliOptions).toString('base64')
    }, { spaces: 2 })
  } else {
    jsonfile.writeFileSync(config.contextArchiveFile, {
      ctx,
      fn: obj
    }, { spaces: 2 })
  }
  return '保存成功'
}
/**
 * 读取上下文
 * @date 2023-01-09
 */
function loadContext() {
  if (!config.contextArchiveFile) {
    throw new Error('需提供配置项 [contextArchiveFile]')
  }
  const restoreFunctions = (o, name) => {
    for (let k in o) {
      let key = name ? name + `["${k}"]` : `${k}`
      if (typeof o[k] === "string") {
        try {
          vm.run(`${key}=${o[k]}`)
        } catch (e) { }
      } else if (typeof o[k] === "object") {
        restoreFunctions(o[k], key)
      }
    }
  }
  /**@type {{compress?:boolean,ctx:string,fn:string}} */
  let file
  try {
    file = jsonfile.readFileSync(config.contextArchiveFile)
  } catch (error) {
    throw new Error('存档文件可能损坏')
  }
  if (file.compress) {
    const ctx = JSON.parse(zlib.brotliDecompressSync(Buffer.from(file.ctx, 'base64')).toString())
    const fn = JSON.parse(zlib.brotliDecompressSync(Buffer.from(file.fn, 'base64')).toString())
    vm.setGlobals(ctx)
    restoreFunctions(fn)
  } else {
    vm.setGlobals(file.ctx)
    restoreFunctions(file.fn)
  }
  return '读取成功'
}