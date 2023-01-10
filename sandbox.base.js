const { vm, vmOptions, box, include } = require("./src/sandbox")
//建议获取代码提示后将上面一行注释，否则运行时会出现警告


/**
 * @type {import("./src/sandbox").LifeCycle} 
 */
module.exports = {
  /**
   * 执行内部脚本前(执行完会冻结所有内置对象、增加内部对象)
   */
  beforeInternalScript() {

  },
  /**
   * 读取持久化上下文前
   */
  beforeLoadContext() { },
  /**
   * 读取持久化上下文后
   */
  onLoadContext() { },
}