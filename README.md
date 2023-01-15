# oicq-sandbox

适用于 **[oicq](https://github.com/takayama-lily/oicq)** 的 js 代码沙盒插件

## 说明
- 受 [takayamabot](https://github.com/takayama-lily/takayamabot) 启发改编而成
- 使用 **[vm2](https://github.com/patriksimek/vm2)** 模块编写，比较安全
- 可持久化上下文，可选压缩保存
- 自动保存上下文
- 可自定义上下文
- jsdoc 类型支持
- 藏话屏蔽
- 方便适配其他库
- 支持 `[Circuler]` 对象
- 支持 `Promise`

## 使用方法

### 安装模块

```bash
npm i oicq-sandbox
```

### 导入使用

```js
const { Sandbox } = require("oicq-sandbox");
const { createClient } = require("oicq");
const client = createClient(10000);
const sandbox = new Sandbox({
  master:10000
})
client.on("message", (e) => {
  sandbox.run(e)
    .then((res) => {
      res && e.reply(res);
    })
    .catch((err) => {
      err && e.reply(err);
    });
});
```

#### 配置项
```js
/**
 * @typedef {Object} Cfg
 * @prop {string} [sandboxFile] 可在沙盒外层运行的文件
 * @prop {string} [contextArchiveFile] 保存上下文的json文件，默认工作目录下 `./ctx.json`
 * @prop {string} [errLogFile] 错误日志文件，默认工作目录下 `./err.log`
 * @prop {boolean} [contextArchiveCompress=false] 是否压缩保存，默认 `false`
 * @prop {number|number[]} master 管理者qq
 * @prop {boolean} [cqCodeEnable=true] 启用cq码，默认 `true`
 * @prop {number} [promiseTimeout=2000] 执行代码返回 `Promise` 时超时的时间 (ms)，默认 `2000`
 * @prop {boolean} [saveCtxOnExit=false] 沙盒进程退出时保存上下文，默认 `false`
 * @prop {boolean} [restartOnExit=true] 沙盒进程退出时重启，默认 `true`
 * @prop {zlib.BrotliOptions} [brotliOptions] 压缩选项，默认 `{params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 5}} `
 * @prop {number} [saveInterval] 是否自动保存
 */
```

### 自定义上下文

  - 在项目中新建 js 文件，将路径传给 sandboxFile 选项
  ```js
  const sandbox = new Sandbox({
    master:10000,
    sandboxFile:'path'
  })
  ```

  - 在文件中定义沙盒生命周期函数
  > 函数运行环境包含所需上下文，具体上下文中变量的作用可查看 **[sandbox.js](https://github.com/ltxhhz/oicq-sandbox/blob/master/src/sandbox.js)**
  ```js
  const { box, vm, vmOptions, include } = require('oicq-sandbox/src/sandbox')
  //导入上一行可用于获取代码提示，实际运行时应注释，否侧运行时会有警告被打印

  const { defineLifeCycle } = require('oicq-sandbox');

  module.exports = defineLifeCycle({
    beforeInternalScript() {
      console.log('beforeInternalScript', typeof include);
    },
    beforeLoadContext() {
      console.log('beforeLoadContext', typeof vm);
    },
    onLoadContext() {
      console.log('onLoadContext', typeof vmOptions);
    }
  })
  ```
  查看 **[示例文件](https://github.com/ltxhhz/oicq-sandbox/blob/master/sandbox.base.js)**

### 自定义解析 data 对象

- 首先为 `Sandbox` 实例的属性 `dataPreProc` 赋值一个用来在 `run` 方法中运行的函数，函数返回值为：
```js
/**
 * @typedef {Object} DataPreProcResult
 * @prop {string} [msgKey="message"] 消息键名，默认 `"message"`
 * @prop {T} data
 * @prop {string} code 需要执行的代码
 */
```

或不执行代码直接返回结果

```js
/**
 * @typedef {Object} DataPreProcResult1
 * @prop {Promise<string|undefined>} [result] 如果不为空则直接作为结果返回
 */
```

> 默认开启了 cq 码支持，如需关闭，在设置项提供 `cqCodeEnable` 的值

- 如果内部其他属性相对原版 oicq 的定义有变化则需要在 `sandboxFile` 文件中定义其他方法用来修改沙盒中对 `data` 对象的使用  

比如判断是否为主人的函数 [isMaster](https://github.com/ltxhhz/oicq-sandbox/blob/master/src/sandbox.js#L55)，需要读取 `data.sender.user_id`，如果这样不能判断，则需要在 `sandboxFile` 文件中定义 `beforeVMCreate` 方法以修改这个方法(在方法中对 `box.utils.isMaster` 赋值)  
也可以通过对其他变量的修改达到自定义的效果

> 欢迎提 pr&issue

## 已知问题&Todo
  - [ ] string.ify 处理大数组会报错
  - [ ] 支持其他类型变量持久化
  - [ ] 为过滤输出添加选项
  - [x] 自定义序列化 data 对象
  - [ ] 添加事件
  - [ ] 使用 `logger`
  - [ ] 实现 callAPI

