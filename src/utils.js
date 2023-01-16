const oicq = require('oicq')
const querystring = require('querystring')
const stringify = require('string.ify')
const stringifyConfigure = stringify.configure({
  pure: false,
  json: false,
  maxDepth: 2,
  maxLength: 10,
  maxArrayLength: 20,
  maxObjectLength: 20,
  maxStringLength: 30,
  precision: undefined,
  formatter: undefined,
  pretty: true,
  rightAlignKeys: true,
  fancy: false,
  indentation: '  ',
})

//#region 不能涩涩
const ero = /(母狗|看批|日批|香批|批里|成人|无码|苍井空|b里|嫩b|嫩比|小便|大便|粪|屎|尿|淦|屄|屌|奸|淫|穴|肏|肛|骚|逼|妓|艹|子宫|月经|危险期|安全期|戴套|无套|内射|中出|射在里|射在外|精子|卵子|受精|幼女|嫩幼|粉嫩|日我|日烂|草我|草烂|干我|日死|草死|干死|狂草|狂干|狂插|狂操|日比|草比|搞我|舔我|舔阴|浪女|浪货|浪逼|浪妇|发浪|浪叫|淫荡|淫乱|荡妇|荡女|荡货|操烂|抽插|被干|被草|被操|被日|被上|被艹|被插|被射|射爆|射了|颜射|射脸|按摩棒|肉穴|小穴|阴核|阴户|阴阜|阴蒂|阴囊|阴部|阴道|阴唇|阴茎|肉棒|阳具|龟头|勃起|爱液|蜜液|精液|食精|咽精|吃精|吸精|吞精|喷精|射精|遗精|梦遗|深喉|人兽|兽交|滥交|拳交|乱交|群交|肛交|足交|脚交|口爆|口活|口交|乳交|乳房|乳头|乳沟|巨乳|玉乳|豪乳|暴乳|爆乳|乳爆|乳首|乳罩|奶子|奶罩|摸奶|胸罩|摸胸|胸部|胸推|推油|大保健|黄片|爽片|a片|野战|叫床|露出|露b|漏出|漏b|乱伦|轮奸|轮暴|轮操|强奸|强暴|情色|色情|全裸|裸体|果体|酥痒|捏弄|套弄|体位|骑乘|后入|二穴|三穴|嬲|调教|凌辱|饥渴|好想要|性交|性奴|性虐|性欲|性行为|性爱|做爱|作爱|手淫|撸管|自慰|痴女|鸡8|鸡ba|鸡鸡|鸡巴|鸡吧|鸡儿|肉便器|泄欲|发泄|高潮|潮吹|潮喷|爽死|爽翻|爽爆|你妈|屁眼|后庭|菊花|援交|操死|插死)/ig
//#endregion
module.exports = {
  /**
   * 消息对象转 cq 码
   * @param {oicq.MessageElem[]} content
   */
  genCqcode(content) {
    let cqcode = ""
    for (let elem of content) {
      if (elem.type === "text") {
        cqcode += elem.text
        continue
      }
      const tmp = { ...elem }
      if (tmp.type == 'json') tmp.data = JSON.stringify(tmp.data)
      delete tmp.type
      const str = querystring.stringify(tmp, ",", "=", { encodeURIComponent: (s) => s.replace(/&|,|\[|\]/g, escapeCQInside) })
      cqcode += "[CQ:" + elem.type + (str ? "," : "") + str + "]"
    }
    return cqcode
  },
  /**
   * cq 码转消息对象
   * @param {string} str
   */
  fromCqcode(str) {
    /**@type {MessageElem[]} */
    const elems = []
    const res = str.matchAll(/\[CQ:[^\]]+\]/g)
    let prev_index = 0
    for (let v of res) {
      const text = str.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ)
      if (text) elems.push(text)
      const element = v[0]
      let cq = element.replace("[CQ:", "type=")
      cq = cq.substring(0, cq.length - 1)
      elems.push(querystring.parse(cq, ',', '=', {
        decodeURIComponent: s => s.replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeCQInside)
      }))
      const el = elems[elems.length - 1]
      for (const k in el) {
        if (k != 'text') {
          try {
            el[k] = JSON.parse(el[k])
          } catch (error) { }
        }
      }

      prev_index = v.index + element.length
    }
    if (prev_index < str.length) {
      const text = str.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ)
      if (text) elems.push(text)
    }
    return elems
  },
  /**
   * 对象文本化和过滤
   * @param {any} msg 
   */
  filter(msg) {
    if (typeof msg === 'undefined') return
    else if (typeof msg !== 'string')
      msg = stringifyConfigure(msg)
    msg = msg.replace(ero, "⃺")
    if (!msg.length) return
    return msg
  },
  stringifyConfigure
}
/**
 * @param {string} s
 */
function unescapeCQ(s) {
  if (s === "&#91;") return "["
  if (s === "&#93;") return "]"
  if (s === "&amp;") return "&"
  return ""
}

function escapeCQInside(s) {
  if (s === "&") return "&amp;"
  if (s === ",") return "&#44;"
  if (s === "[") return "&#91;"
  if (s === "]") return "&#93;"
  return ""
}

/**
 * 描述
 * @date 2023-01-02
 * @param {string} s
 */
function unescapeCQInside(s) {
  if (s === "&#44;") return ","
  if (s === "&#91;") return "["
  if (s === "&#93;") return "]"
  if (s === "&amp;") return "&"
  return ""
}
