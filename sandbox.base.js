const { defineLifeCycle } = require(".")
const { vm, vmOptions, box, include } = require("./src/sandbox")
//建议获取代码提示后将上面一行注释，否则运行时会出现警告


module.exports = defineLifeCycle({
  /**
   * 代码执行前，返回处理过的代码
   */
  beforeCodeExec(code) {
    console.log('将要执行', code);
    return code
  },
  /**
   * 代码执行后，返回处理过的执行结果
   */
  afterCodeExec(res) {
    console.log('执行结果', res);
    if (res == undefined) {
      return res
    } else {
      return String(res)
    }
  },
  /**
   * 创建虚拟机之前
   */
  beforeVMCreate() { },
  /**
   * 执行内部脚本前(执行完会冻结所有内置对象、增加内部对象)
   */
  beforeInternalScript() { },
  /**
   * 读取持久化上下文前
   */
  beforeLoadContext() { },
  /**
   * 读取持久化上下文后
   */
  onLoadContext() { },
})