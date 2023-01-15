const { VM } = require('vm2')
const { join } = require('path')
const { existsSync, statSync } = require('fs')
const jsonfile = require('jsonfile')
const utils = require('./utils')
const zlib = require('zlib')
require('../lib/cycle')
const excludeList = new Set([
  '__config', '__env', '__utils', 'eval', 'global', 'Function', 'raw', 'view'
])
/**@type {import('..').Cfg} */
const config = JSON.parse(process.env.config)
/**@type {LifeCycle|undefined} */
let lifeCycle
if (config.sandboxFile) {
  try {
    lifeCycle = require(config.sandboxFile)
  } catch (error) {
    console.error(`[sandboxFile] 读取失败`, error);
  }
}

const funcReg = /^(function|\(.*?\)\s*=\s*>).+/
let func

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
    loadContext,
  },
  config
}
const vmOptions = {
  wasm: false,
  eval: true,
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
}

if (lifeCycle?.beforeVMCreate) eval(`func= ${funcReg.test(lifeCycle?.beforeVMCreate) ? lifeCycle.beforeVMCreate : 'function ' + lifeCycle?.beforeVMCreate};func?.();func=null`)


const vm = new VM(vmOptions)

/**
 * 
 * 参数 `result` 为 `undefined` 说明:  
 * 1.运行结果为 `undefined` 但 `debug==false`  
 * 2.运行出错而失败
 * @callback AfterCodeExec
 * @param {any} result 运行结果
 * @return any
 */

/**
 * @typedef {Object} LifeCycle
 * @prop {VoidFunction} [beforeVMCreate] 创建虚拟机前
 * @prop {VoidFunction} [beforeInternalScript] 执行内部脚本前(执行完会冻结所有内置对象、增加内部对象)
 * @prop {VoidFunction} [beforeLoadContext] 读取持久化上下文前
 * @prop {VoidFunction} [onLoadContext] 读取持久化上下文后
 * @prop {(code:string)=>string} [beforeCodeExec] 代码执行前，返回处理过的代码
 * @prop {(result:any)=>any} [afterCodeExec] 代码执行后，返回处理过的执行结果
 * 
 * @typedef {typeof box} Box 配合 `vmOptions` 中的 `sandbox` 使用，访问隔离
 * @typedef {typeof vmOptions} VMOptions 
 * @typedef {VM} VM
 * @typedef {typeof include} Include 传递一个外部对象到上下文对象
 */

module.exports = { box, vmOptions, vm, include }

if (lifeCycle?.beforeInternalScript) eval(`func= ${funcReg.test(lifeCycle.beforeInternalScript) ? lifeCycle.beforeInternalScript : 'function ' + lifeCycle.beforeInternalScript};func?.();func=null`)

vm.runFile(join(__dirname, './sandbox.code.js'))

if (lifeCycle?.beforeLoadContext) eval(`func= ${funcReg.test(lifeCycle.beforeLoadContext) ? lifeCycle.beforeLoadContext : 'function ' + lifeCycle.beforeLoadContext};func?.();func=null`)

//读取上下文
if (config.contextArchiveFile
  && existsSync(config.contextArchiveFile)
  && statSync(config.contextArchiveFile).size) loadContext()

if (lifeCycle?.onLoadContext) eval(`func= ${funcReg.test(lifeCycle.onLoadContext) ? lifeCycle.onLoadContext : 'function ' + lifeCycle.onLoadContext};func?.();func=null`)

if (config.saveInterval) {
  console.log('开启定时保存上下文');
  setInterval(saveContext, config.saveInterval);
}

box.env.initialized = true

const beforeExec = lifeCycle?.beforeCodeExec ? eval(`func= ${funcReg.test(lifeCycle?.beforeCodeExec) ? lifeCycle.beforeCodeExec : 'function ' + lifeCycle.beforeCodeExec}`) : e => e,
  afterExec = lifeCycle?.afterCodeExec ? eval(`func= ${funcReg.test(lifeCycle.afterCodeExec) ? lifeCycle.afterCodeExec : 'function ' + lifeCycle.afterCodeExec}`) : res => res == undefined ? res : String(res)


process.on('message',/**@param {import('..').Msg} msg */(msg, sendHandle) => {
  if (msg.type == 'default') {
    if (msg.data.data) setData(msg.data.data)

    run(beforeExec(msg.data.code, vm)).then(res => {
      res = utils.filter(res)
      process.send({
        id: msg.data.id,
        result: afterExec(res, vm)
      })
    })
  } else {
    if (msg.data.type == 'exit') {
      if (config.saveCtxOnExit && config.contextArchiveFile) {
        console.log('退出前保存');
        saveContext()
      }
      process.exit()
    }
  }

})

if (config.saveCtxOnExit && config.contextArchiveFile) {
  process.on('SIGINT', code => {
    console.log('退出前保存');
    saveContext()
    process.exit()
  })
}

/**
   * 传递一个外部对象到上下文对象
   * @date 2023-01-08
   * @param {string} name 键
   * @param {any} obj 值
   * @param {Object} Obj
   * @param {boolean} Obj.freeze 是否不可修改
   * @param {boolean} Obj.exclude 是否不用持久化
   */
function include(name, obj, { freeze = true, exclude = true }) {
  if (freeze) vm.freeze(obj, name)
  else vm.setGlobal(name, obj)
  if (exclude) excludeList.add(name)
  vm.run(`__utils.contextify(${name})`)
}
/**
 * 运行代码，返回结果
 * @param {string} code
 */
async function run(code) {
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
    try {
      res = await Promise.race([res, new Promise((res, rej) => setTimeout(() => {
        rej(new Error(`Promise timeout. [${box.config.promiseTimeout}]`))
      }, box.config.promiseTimeout))])
    } catch (e) {
      if (debug) {
        /**@type {string[]} */
        let line = e.stack.split("\n")
        line.splice(2)
        res = `${line.join('\n')}\n...`
      }
    }
  } else if (res == undefined) {
    return debug ? '<undefined>' : res
  }
  return res
}

function setData(data) {
  vm.setGlobal('data', data)
  vm.run(`__utils.contextify(data)`)
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
  const noGlobal = /^\$\["(global|globalThis)"\]$/
  const ctx = JSON.decycle(vm.sandbox, (e, path) => {
    if (noGlobal.test(path)) return
    return e
  })
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
  saveFn(ctx)
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
    let flag = 0
    JSON.retrocycle(vm.sandbox, (e, k) => {
      if ((k == 'global' || k == 'globalThis') && flag < 2) {
        flag++
        return
      }
      return e
    })

    restoreFunctions(fn)
  } else {
    vm.setGlobals(file.ctx)
    let flag = 0
    JSON.retrocycle(vm.sandbox, (e, k) => {
      if ((k == 'global' || k == 'globalThis') && flag < 2) {
        flag++
        return
      }
      return e
    })

    restoreFunctions(file.fn)
  }
  return '读取成功'
}