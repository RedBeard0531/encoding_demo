"use strict";

class ErrorWithCursors extends Error {
    constructor(msg, ...cursors) {
        super(msg)
        this.cursors = cursors
    }
}

class Cursor {
    constructor(str) {
        this.str = str
        this.index = 0
    }

    peek() {
        if (this.index > this.str.length) {

        }
        return this.str[this.index]
    }
}

function assert(cond, ...rest) {
    if (cond) return
    console.assert(cond, ...rest)
    // TODO make this better...
    throw Error("Failed assertion (open js console to see more info)")
}

function encode(root) {
    let paths = {}
    {
        let dottedPath = ''
        let arrInfo = []
        function mutPath(path) {
            if (path in paths)
                return paths[path]
            return (paths[path] = {
                hasSubObjects: false,
                values: [],
                rawArrInfos: [],
                arrInfo: [],
            })
        }
        function walkObj(obj) {
            const isRoot = obj == root
            mutPath(isRoot ? '\xff' : dottedPath).hasSubObjects = true

            if (!isRoot)
                arrInfo.push('{')
            const oldDottedPath = dottedPath
            for (let field in obj) {
                dottedPath += (isRoot ? '' : '.') + field
                handleElem(obj[field])
                dottedPath = oldDottedPath
            }
            if (!isRoot)
                arrInfo.pop()
        }
        function walkArr(arr) {
            arrInfo.push('[')
            for (let i = 0; i < arr.length; i++) {
                arrInfo.push(i)
                handleElem(arr[i])
                arrInfo.pop()
            }
            arrInfo.pop()
        }
        function handleElem(elem) {
            if (Array.isArray(elem)) {
                if (elem.length != 0)
                    return walkArr(elem)
                // empty array treated as leaf scalar
            } else if ($.isPlainObject(elem)) {
                if (!$.isEmptyObject(elem))
                    return walkObj(elem)
                // empty object treated as leaf scalar
            }

            let info = mutPath(dottedPath)
            info.values.push(elem)
            info.rawArrInfos.push(arrInfo.concat(['|']))
        }
        walkObj(root)
    }

    for (let path in paths) {
        let info = paths[path]
        assert(info.values.length == info.rawArrInfos.length)
        if (info.rawArrInfos.length == 0)
            continue

        let arrInfo = Array.from(info.rawArrInfos[0]) // start with a copy of the first arrInfo.
        for (let i = 1; i < info.rawArrInfos.length; i++) {
            const lastArrInfo = info.rawArrInfos[i-1]
            const myArrInfo = info.rawArrInfos[i]

            // Find the first difference
            let firstDiff = null
            for (let j = 1; j < lastArrInfo.length; j++) {
                if (myArrInfo[j] != lastArrInfo[j]) {
                    firstDiff = j
                    break
                }
            }
            assert(firstDiff !== null)

            // Close up all deeper objects and arrays in lastArrInfo.
            for (let j = lastArrInfo.length-1; j >= firstDiff ; j--) {
                if (lastArrInfo[j] == '[') {
                    arrInfo.push(']')
                } else if (lastArrInfo[j] == '{') {
                    arrInfo.push('}')
                }
            }

            // If they differ by index in the same array, encode the number of skipped elements, if
            // any.
            if (typeof lastArrInfo[firstDiff] == 'number') {
                assert(typeof myArrInfo[firstDiff] == 'number')
                let delta = myArrInfo[firstDiff] - lastArrInfo[firstDiff]
                assert(delta >= 1, myArrInfo[firstDiff], lastArrInfo[firstDiff], delta)
                let skip = delta - 1
                if (skip > 0) {
                    arrInfo.push('+')
                    arrInfo.push(skip)
                }
                firstDiff++
            }

            // Now put the rest of myArrInfo into arrInfo
            for (let j = firstDiff; j < myArrInfo.length; j++) {
                arrInfo.push(myArrInfo[j])
            }
        }

        // If there are no arrays no arrayInfo is needed
        if (arrInfo.indexOf('[') == -1) {
            assert(info.values.length == 1)
            info.arrInfo = []
            continue
        }

        // Remove all explicitly encoded zero indexes, since they are implicit
        arrInfo = arrInfo.filter(e => e !== 0)

        // Replace runs of {|} with ^
        for (let i = 0; i < arrInfo.length - 2; i++) {
            if (arrInfo[i] == '{' && arrInfo[i+1] == '|' && arrInfo[i+2] == '}') {
                arrInfo.splice(i, 3, '^')
            }
        }

        // Replace a final {| with ^
        if (arrInfo.length >= 2 && arrInfo[arrInfo.length-2] == '{' && arrInfo[arrInfo.length-1] == '|') {
            arrInfo.pop()
            arrInfo.pop()
            arrInfo.push('^')
        }

        // Reduce final run of | or ^
        while (arrInfo.length > 1 && arrInfo[arrInfo.length-1] == arrInfo[arrInfo.length-2]) {
            const lastChar = arrInfo[arrInfo.length-1] 
            assert(lastChar == '|' || lastChar == '^', arrInfo)
            arrInfo.pop()
        }

        info.arrInfo = arrInfo
    }

    return paths
}

function tokenizeArrInfo(arrInfoStr) {
    let arrInfoArr = []
    let index = 0
    for (let c of arrInfoStr) {
        switch (c) {
            case '{':
            case '}':
            case '[':
            case ']':
            case '|':
            case '^':
            case '+':
                arrInfoArr.push(c)
                break

            // Supporting both simple and length-prefixed encoding.
            case ':':
                // Prior character must have been the single digit length prefix.
                // Ignore it and do simple numeric decoding of the suffix.
                // Not validating that the number has the expected number of digits.
                assert(arrInfoArr.length > 0)
                assert(typeof arrInfoArr.pop() == 'number')
                break

            // Decode a simple-encoded number.
            default:
                assert(c >= '0' && c <= '9', c)
                const num = +c
                assert(arrInfoArr.length > 0)
                if (typeof arrInfoArr[arrInfo.length-1] == 'number') {
                    arrInfoArr[arrInfo.length-1] *= 10
                    arrInfoArr[arrInfo.length-1] += num
                } else {
                    // First digit can't be 0.
                    // 0 is always implicitly encoded when the complete number.
                    assert(num > 0, num)
                    arrInfoArr.push(num)
                }
                break
        }
    }
    return arrInfoArr
}

class Decoder {
    constructor(path, values, arrInfo) {
        this.path = path.split('.')
        this.values = values
        this.arrInfo = arrInfo

        this.pathIx = 0
        this.arrInfoIx = 0
        this.valueIx = 0
    }

    decodeRoot(into = {}) {
        if (this.arrInfo.length > 0)
            return this.decodeObj(into)
        assert(this.values.length == 1)

        while (this.arrInfoIx < this.arrInfo.length - 1) {
            const field = this.consumePathPart()
            if (!(field in into)) into[field] = {}
            assert($.isPlainObject(into[field]), field, into[field])
            into = into[field]
        }
        into[this.peekLastPathPart()] = this.consumeValue()
    }

    decodeObj(into) {
        assert($.isPlainObject(into), into)
        const field = this.consumePathPart()
        const action = this.consumeArrInfo()
        switch (action) {
            case '^':
                assert(!(field in into), field, into)
                into[field] = this.doCaret()
                break
            case '|':
                assert(!(field in into), field, into)
                this.assertConsumedFullPath()
                into[field] = this.consumeValue();
                break
            case '{':
                if (!(field in into)) into[field] = {}
                assert($.isPlainObject(into[field]), field, into[field])
                this.decodeObj(into[field])
                break
            case '[':
                if (!(field in into)) into[field] = []
                assert(Array.isArray(into[field]), field, into[field])
                this.decodeArr(into[field])
                break
            default:
                assert(!"unexpected action in decodeObj", action, this)
        }

        assert(this.done() || this.consumeArrInfo() == '}')
        this.unconsumePathPart()
    }
    decodeArr(into) {
        // This logic takes advantage of 2 facts about JavaScript arrays:
        // 1) arr[num] will automatically extend the array and fill with undefined
        // 2) JSON.stringify() serializes undefined values in arrays as null

        assert(Array.isArray(into), into)

        let index = 0
        if (typeof this.peekArrInfo() == 'number')
            index = this.consumeArrInfo()

        while (!this.done()) {
            const action = this.consumeArrInfo()
            switch (action) {
                case '^':
                    assert(into[index] == undefined, index, into)
                    into[index++] = this.doCaret()
                    break
                case '|':
                    assert(into[index] == undefined, index, into)
                    this.assertConsumedFullPath()
                    into[index++] = this.consumeValue()
                    break
                case '{':
                    if (into[index] == undefined) into[index] = {}
                    assert($.isPlainObject(into[index]), index, into[index])
                    this.decodeObj(into[index++])
                    break
                case '[':
                    if (into[index] == undefined) into[index] = []
                    assert(Array.isArray(into[index]), index, into[index])
                    this.decodeArr(into[index++])
                    break
                case '+':
                    const num = this.consumeArrInfo()
                    assert(typeof num == 'number', num)
                    index += num
                    break

                case ']':
                    return
                default:
                    assert(!"unexpected action in decodeArr", action, this)
            }
        }
    }

    done() {
        return this.valueIx == this.values.length
    }

    doCaret() {
        const field = this.peekLastPathPart()
        return {[field]: this.consumeValue()}
    }

    peekLastPathPart() {
        assert(this.pathIx == this.path.length - 1)
        return this.path[this.pathIx]
    }
    assertConsumedFullPath() {
        assert(this.pathIx == this.path.length)
    }
    consumePathPart() {
        assert(this.pathIx < this.path.length)
        return this.path[this.pathIx++]
    }
    unconsumePathPart() {
        assert(this.pathIx > 0);
        this.pathIx--
    }

    peekArrInfo() {
        assert(this.arrInfoIx < this.arrInfo.length)
        return this.arrInfo[this.arrInfoIx]
    }
    consumeArrInfo() {
        assert(this.arrInfoIx < this.arrInfo.length)
        const out = this.peekArrInfo()
        if (this.arrInfoIx == this.arrInfo.length - 1) {
            assert(['|', '^'].includes(out), this.arrInfo)
            // stay positioned here, and repeat last terminal byte
        } else {
            this.arrInfoIx++
        }
        return out
    }

    consumeValue() {
        assert(this.valueIx < this.values.length)
        return this.values[this.valueIx++]
    }
};

function decode(path, values, arrInfo, into = {}) {
    if (typeof arrInfo == 'string')
        arrInfo = tokenizeArrInfo(arrInfo)
    new Decoder(path, values, arrInfo).decodeRoot(into)
    return into
}
