const fs = require("fs")
const { join } = require("path")
const zlib = require('zlib')
const { randomUUID } = require('crypto')
const cp = require("child_process")
const { VM } = require('vm2')
const utils = require("./src/utils")
/**
 * @type {cp.ChildProcess}
 */
let worker,
  /**
   * @type {(code:string,vm:VM)=>string}
   */
  beforeProc = (e, vm) => e,
  /**
   * res为undefined说明
   * 1.运行结果为undefined 但debug==false
   * 2.运行出错而失败
   * @type {(res:any,vm:VM)=>string}
   */
  afterProc = (res, vm) => {
    if (res == undefined) {
      return res
    } else {
      return String(res)
    }
  }
const defaultConfig = {
  restartOnExit: true,
  promiseTimeout: 2000,
  contextArchiveFile: join(process.cwd(), './ctx.json'),
  brotliOptions: {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 5
    }
  }
}
/**
 * @typedef {Object} Cfg
 * @prop {string} [sandboxFile] 需要导入沙盒上下文的文件
 * @prop {string} [contextArchiveFile] 保存上下文的json文件，默认工作目录 ./ctx.json
 * @prop {boolean} [contextArchiveCompress=false] 是否压缩保存
 * @prop {number|number[]} master 管理者qq
 * @prop {number} [promiseTimeout=2000] 执行代码返回 Promise 时超时的时间(ms)
 * @prop {boolean} [saveCtxOnExit=false] 沙盒进程退出时保存上下文，需提供 [contextArchiveFile]
 * @prop {boolean} [restartOnExit=true] 沙盒进程退出时重启
 * @prop {zlib.BrotliOptions} [brotliOptions] 压缩选项
 * @prop {number} [saveInterval] 是否自动保存 需提供 [contextArchiveFile]
 */

module.exports = {
  /**
   * 启动一个子进程运行沙盒
   * @param {Cfg} config 配置
   */
  start(config) {
    if (!config.master) throw new Error('需提供必选配置项')
    config = {
      ...defaultConfig,
      ...config
    }
    console.log(Date(), "sandbox启动", config)
    worker = cp.fork(join(__dirname, './src/bridge.js'), {
      env: {
        config: JSON.stringify(config),
        ...process.env
      }
    })
    worker.on('error', err => {
      fs.appendFile("err.log", Date() + " " + err.stack + "\n", () => { })
    })
    worker.on('exit', () => {
      console.log('sandbox 停止');
      this.start(config)
    })
  },
  restart() {
    worker.kill()
    // this.start()
  },
  /**
   * 执行代码前处理方法
   * 沙盒中运行，不得依赖上下文
   * @param {(code:string,vm:VM) => string} func
   */
  setBeforeProc(func) {
    beforeProc = func
  },
  /**
   * 执行代码后处理方法
   * 沙盒中运行，不得依赖上下文
   * @param {(res: any, vm: VM) => string} func
   */
  setAfterProc(func) {
    afterProc = func
  },
  /**
   * 运行代码
   * @param {string} code
   * @param {any} data 需要合并到沙盒的上下文data对象
   * @return {Promise<string|undefined>}
   */
  run(code, data) {
    code = code.trim()
    const c = checkCode(code)
    if (c) return c
    const id = randomUUID()
    const prom = new Promise((resolve, reject) => {
      /**@type {(msg:{id:string,result?:string})=>string} */
      const listener = (msg) => {
        if (msg.id == id) {
          worker.off('message', listener)
          resolve(msg.result ? utils.fromCqcode(msg.result) : msg.result)
        }
      }
      worker.on('message', listener)
    })
    worker.send({
      id,
      code: processCode(code),
      beforeProc: '' + beforeProc,
      afterProc: '' + afterProc,
      data
    })
    return prom
  },
  ...utils
}

/**
 * 检查代码
 * @date 2023-01-03
 * @param {string} code
 */
function checkCode(code) {
  if (/^([\d|\s]+|\[CQ:at,qq=\d+\]|true|false|null|undefined)$/.test(code)) {
    return Promise.resolve()
  }
  // 删除注释
  code = code.replace(/\/\/.*|\/\*[\S\s]*?\*\//g, '')
  const r = code.replace(/{[\S\s]*?}|for\([\S\s]*?\)|\[[\S\s]*?\]|'[\S\s]*?'|"[\S\s]*?"|`[\S\s]*?`/g, '')
  if (/(let|const)\s+\w+/.test(r) || (/class/.test(r) && !/=\s*class\s*\w*\s*/.test(r))) {
    const line = new SyntaxError('最外层作用域不能用let,const,class声明变量').stack.split('\n')
    line.splice(1)
    return Promise.reject(line.join('\n'))
  }
}

/**
 * 处理代码
 * @date 2023-01-07
 * @param {string} code
 * @returns {string}
 */
function processCode(code) {
  return code
}