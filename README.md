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

- 安装模块

```bash
npm i oicq-sandbox
```

- 导入使用

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

- 配置项
```js
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
```

- 自定义上下文

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

> 欢迎提 pr&issue

## 已知问题&Todo
  - [ ] string.ify 处理大数组会报错
  - [ ] 支持其他类型变量持久化
  - [ ] 为过滤输出添加选项
  - [ ] 自定义序列化 data 对象

