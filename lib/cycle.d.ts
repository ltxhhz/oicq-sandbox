/**如果提供了一个替换函数，那么就调用它来获得一个替换值。 */
type deReplacer = (e: any, path: string) => any
type replacer = (e: any, k: string) => any

export declare global {
  interface JSON {
    /**解开循环引用 */
    decycle: (object: any, replacer?: deReplacer) => any;
    /**恢复循环引用 */
    retrocycle: ($: any, replacer?: deReplacer) => any;
  }
}
