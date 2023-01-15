const fs = require("fs")
const { join } = require("path")
const zlib = require('zlib')
const { randomUUID } = require('crypto')
const cp = require("child_process")
const oicq = require('oicq')
const { VM } = require('vm2')
const utils = require("./src/utils")
const EventEmitter = require("events")
/**@type {Cfg} */
const defaultConfig = {
  restartOnExit: true,
  promiseTimeout: 2000,
  cqCodeEnable: true,
  contextArchiveFile: join(process.cwd(), './ctx.json'),
  errLogFile: join(process.cwd(), './err.log'),
  brotliOptions: {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 5
    }
  }
}
/**
 * @typedef {Object} Cfg
 * @prop {string} [sandboxFile] 可在沙盒外层运行的文件
 * @prop {string} [contextArchiveFile] 保存上下文的json文件，默认工作目录下 `./ctx.json`
 * @prop {string} [errLogFile] 错误日志文件，传入假值则不输出，默认工作目录下 `./err.log`
 * @prop {boolean} [contextArchiveCompress=false] 是否压缩保存，默认 `false`
 * @prop {number|number[]} master 管理者qq
 * @prop {boolean} [cqCodeEnable=true] 启用cq码，默认 `true`
 * @prop {number} [promiseTimeout=2000] 执行代码返回 `Promise` 时超时的时间 (ms)，默认 `2000`
 * @prop {boolean} [saveCtxOnExit=false] 沙盒进程退出时保存上下文，默认 `false`
 * @prop {boolean} [restartOnExit=true] 沙盒进程退出时重启，默认 `true`
 * @prop {zlib.BrotliOptions} [brotliOptions] 压缩选项，默认 `{params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 5}} `
 * @prop {number} [saveInterval] 是否自动保存
 */

/**
 * @typedef {Object} CodeMsg
 * @prop {string} id
 * @prop {string} code
 * @prop {Object} data
 */

/**
 * @typedef {Object} InternalMsg
 * @prop {string} type
 * @prop {any} data
 */

/**
 * @typedef {{type:"default",data:CodeMsg}|{type:"internal",data:InternalMsg}} Msg
 */
/**
 * @template {any} T
 */
class Sandbox extends EventEmitter {
  /**
   * @type {cp.ChildProcess}
   */
  worker
  /**
   * 执行代码前处理方法
   * 沙盒中运行，不得依赖上下文
   * @deprecated 已经无效，使用 `[sandboxFile]` 中的 `beforeCodeExec` 替换
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
   * @deprecated 已经无效，使用 `sandboxFile` 中的 `afterCodeExec` 替换
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
   * @typedef {Object} DataPreProcResult
   * @prop {string} [msgKey="message"] 消息键名，默认 `"message"`
   * @prop {T} data
   * @prop {string} code 需要执行的代码
   */
  /**
   * @typedef {Object} DataPreProcResult1
   * @prop {Promise<string|undefined>} [result] 如果不为空则直接作为结果返回
   */
  /** 
   * @callback DataPreProc
   * @param {T} data
   * @return {DataPreProcResult|DataPreProcResult1}
   */

  /**
   * data 预处理函数
   * @type {DataPreProc?}
   */
  dataPreProc

  /**@type {Cfg} */
  config

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
      if (this.config.errLogFile) fs.appendFile(this.config.errLogFile, Date() + " " + err.stack + "\n", () => { })
    })
    this.worker.on('exit', () => {
      console.log('sandbox 停止');
      if (this.config.restartOnExit) this.start()
    })
    return this
  }
  /**
   * 运行代码
   * @param {oicq.PrivateMessageEvent | oicq.GroupMessageEvent | oicq.DiscussMessageEvent | T} data 需要合并到沙盒的上下文data对象
   * @return {Promise<string|undefined>}
   */
  run(data) {
    /**@type {string} */
    let code
    if (this.dataPreProc) {
      const c = this.dataPreProc(data)
      if (c.result) return c.result
      code = this.config.cqCodeEnable ? utils.genCqcode(c.code) : c.code
    } else {
      code = this.config.cqCodeEnable ? utils.genCqcode(data.message).trim() : data.raw_message
      const c = checkCode(code)
      if (c) return c
    }
    const id = randomUUID()
    const prom = new Promise((resolve, reject) => {
      /**@type {(msg:{id:string,result?:string})=>string} */
      const listener = (msg) => {
        if (msg.id == id) {
          this.worker.off('message', listener)
          resolve(msg.result ? this.config.cqCodeEnable ? utils.fromCqcode(msg.result) : msg.result : undefined)
        }
      }
      this.worker.on('message', listener)
    })
    this.worker.send(/** @type {Msg} */({
      type: 'default',
      data: {
        id,
        code: processCode(code),
        beforeProc: '' + this.beforeProc,
        afterProc: '' + this.afterProc,
        data
      }
    }))
    return prom
  }
  /**
   * 重启沙盒
   */
  restart() {
    if (this.worker.killed) {
      this.start()
    } else {
      this.worker.send(/** @type {Msg} */({
        type: 'internal',
        data: {
          type: 'exit'
        }
      }))
    }
  }
}

module.exports = {
  Sandbox,
  /**
   * @param {import("./src/sandbox").LifeCycle} obj
   */
  defineLifeCycle(obj) {
    return obj
  }
}

/**
 * 检查代码
 * @date 2023-01-03
 * @param {string} code
 */
function checkCode(code) {
  if (/^([\d|\s]+|'\[CQ:at,qq=\d+\]'|true|false|null|undefined)$/.test(code)) {
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
