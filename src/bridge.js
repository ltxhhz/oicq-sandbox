const { VM } = require('vm2')
const sandbox = require('./sandbox')
const utils = require('./utils')
/**@type {import('..').Cfg} */
const config = JSON.parse(process.env.config)
if (config.sandboxFile) {
  try {//todo 规范
    const ctx = require(config.sandboxFile)
    for (const key in ctx) {
      if (Object.hasOwnProperty.call(ctx, key)) {
        sandbox.include(key, ctx[key])
      }
    }
  } catch (error) {
    console.error(error);
  }
}

process.on('message',
  /**@param {{
   * id:string,
   * code:string,
   * beforeProc:string|(code:string,vm:VM)=>string,
   * afterProc:string|(res:any,vm:VM)=>string,
   * data?:any
   * }} msg */
  (msg, sendHandle) => {
    msg.afterProc = new Function(`return ${msg.afterProc}`)()
    msg.beforeProc = new Function(`return ${msg.beforeProc}`)()
    if (msg.data) {
      sandbox.setData(msg.data)
    }

    let res = sandbox.run(msg.beforeProc(msg.code, sandbox.vm))
    res = utils.filter(res)
    process.send({
      id: msg.id,
      result: msg.afterProc(res, sandbox.vm)
    })
  })

if (config.saveCtxOnExit && config.contextArchiveFile) {
  process.on('exit', code => {
    sandbox.saveContext()
  })
}