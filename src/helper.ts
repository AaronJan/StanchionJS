/**
 * 
 * @param {boolean} expect 
 */
export function isBoolean(expect: boolean) {
    return (actual: boolean) => actual === expect;
}

/**
 * 
 */
export function noop() { }