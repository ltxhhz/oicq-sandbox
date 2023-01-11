const fs = require("fs")
const { join } = require("path")
const zlib = require('zlib')
const { randomUUID } = require('crypto')
const cp = require("child_process")
const oicq = require('oicq')
const { VM } = require('vm2')
const utils = require("./src/utils")
const EventEmitter = require("events")
const { genCqcode } = require("./src/utils")
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
 * @prop {string} [sandboxFile] 可在沙盒外层运行的文件
 * @prop {string} [contextArchiveFile] 保存上下文的json文件，默认工作目录 ./ctx.json
 * @prop {boolean} [contextArchiveCompress=false] 是否压缩保存
 * @prop {number|number[]} master 管理者qq
 * @prop {number} [promiseTimeout=2000] 执行代码返回 Promise 时超时的时间(ms)
 * @prop {boolean} [saveCtxOnExit=false] 沙盒进程退出时保存上下文，需提供 [contextArchiveFile]
 * @prop {boolean} [restartOnExit=true] 沙盒进程退出时重启
 * @prop {zlib.BrotliOptions} [brotliOptions] 压缩选项
 * @prop {number} [saveInterval] 是否自动保存 需提供 [contextArchiveFile]
 */

class Sandbox extends EventEmitter {
  /**
   * @type {cp.ChildProcess}
   */
  worker
  /**
   * 执行代码前处理方法
   * 沙盒中运行，不得依赖上下文
   * @type {(code:string,vm:VM)=>string}
   */
  beforeProc = (e, vm) => e

  //todo 
  // logger
  /**
   * 执行代码后处理方法
   * 沙盒中运行，不得依赖上下文
   * 
   * res为undefined说明
   * 1.运行结果为 undefined 但 debug==false
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
  /**
   * 启动一个子进程运行沙盒
   * @param {Cfg} config 配置
   */
  constructor(config) {
    if (!config.master) throw new Error('需提供必选配置项')
    super()
    this.config = {
      ...defaultConfig,
      ...config
    }
    this.start()
  }
  start() {
    console.log(Date(), "sandbox启动")
    this.worker = cp.fork(join(__dirname, './src/sandbox.js'), {
      env: {
        config: JSON.stringify(this.config),
        sandboxRunning: true,
        ...process.env
      }
    })
    this.worker.on('error', err => {
      fs.appendFile("err.log", Date() + " " + err.stack + "\n", () => { })
    })
    this.worker.on('exit', () => {
      console.log('sandbox 停止');
      this.start()
    })
  }
  /**
   * 运行代码
   * @param {oicq.PrivateMessageEvent | oicq.GroupMessageEvent | oicq.DiscussMessageEvent} data 需要合并到沙盒的上下文data对象
   * @return {Promise<string|undefined>}
   */
  run(data) {
    let code = genCqcode(data.message).trim()
    const c = checkCode(code)
    if (c) return c
    const id = randomUUID()
    const prom = new Promise((resolve, reject) => {
      /**@type {(msg:{id:string,result?:string})=>string} */
      const listener = (msg) => {
        if (msg.id == id) {
          this.worker.off('message', listener)
          resolve(msg.result ? utils.fromCqcode(msg.result) : msg.result)
        }
      }
      this.worker.on('message', listener)
    })
    this.worker.send({
      id,
      code: processCode(code),
      beforeProc: '' + this.beforeProc,
      afterProc: '' + this.afterProc,
      data
    })
    return prom
  }

  restart() {
    this.worker.kill()
  }
}

module.exports = {
  Sandbox,
  defineLifeCycle
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
/**
 * @param {import("./src/sandbox").LifeCycle} obj
 */
function defineLifeCycle(obj) {
  return obj
}