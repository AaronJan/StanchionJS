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

/**
 * 
 * @param array 
 */
export function randomInArray<U>(array: Array<U>): U {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * 
 * @param array 
 */
export function shuffleArray(array: Array<any>) {
    const cloneArray = [...array];

    for (let i = cloneArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cloneArray[i], cloneArray[j]] = [cloneArray[j], cloneArray[i]];
    }

    return cloneArray;
}