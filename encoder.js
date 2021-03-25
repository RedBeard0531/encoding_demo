"use strict";


class ArrInfoEncoder {
    static encode(root, options) {
        return new ArrInfoEncoder(root, options).encode()
    }

    constructor(root, {lengthPrefixNumbers}) {
        this.infos = {}
        this.lengthPrefixNumbers = lengthPrefixNumbers
        this.walkObj('', [], root, true)
    }

    walkObj(path, arrInfoPrefix, obj, isRoot = false) {
        if (isRoot) {
            this.infoFor('\xff').hasSubObjects = true
            assert(() => path == '', this)
            var pathPrefix = ''
            var arrInfo = arrInfoPrefix
        } else {
            this.infoFor(path).hasSubObjects = true
            var pathPrefix = path + '.'
            var arrInfo = arrInfoPrefix.concat(['{'])
        }

        for (let field in obj) {
            this.handleElem(pathPrefix + field, arrInfo, obj[field])
        }
    }

    walkArr(path, arrInfoPrefix, arr) {
        let arrInfo = arrInfoPrefix.concat(['[', 0])
        const arrInfoIx = arrInfo.length - 1
        for (let i = 0; i < arr.length; i++) {
            arrInfo[arrInfoIx] = i
            this.handleElem(path, arrInfo, arr[i])
        }
    }

    handleElem(path, arrInfoPrefix, elem) {
        if (Array.isArray(elem)) {
            if (elem.length != 0)
                return this.walkArr(path, arrInfoPrefix, elem)
            // empty array treated as leaf scalar
        } else if ($.isPlainObject(elem)) {
            if (!$.isEmptyObject(elem))
                return this.walkObj(path, arrInfoPrefix, elem)
            // empty object treated as leaf scalar
        }

        let info = this.infoFor(path)
        info.values.push(elem)
        info.rawArrInfos.push(arrInfoPrefix.concat(['|']))
    }

    // Helper that returns the info for a path, constructing the default if none exists yet
    infoFor(path) {
        if (path in this.infos)
            return this.infos[path]

        return (this.infos[path] = {
            hasSubObjects: false,
            values: [],
            rawArrInfos: [],
            arrInfo: [],
        })
    }

    encodeNum(num) {
        assert(() => typeof num == 'number')
        const str = num.toString()
        assert(() => str.length <= 9)
        if (this.lengthPrefixNumbers)
            return `${str.length}:${str}`
        return str
    }

    // This is called to encode the output after the object has been completely walked.
    encode() {
        for (let info of Object.values(this.infos)) {
            assert(() => info.values.length == info.rawArrInfos.length)
            if (info.values.length == 0)
                continue // This can happen if we only see this path to mark existence of subobjects

            // start with a copy of the first arrInfo, then encode the deltas to each after it
            let arrInfo = Array.from(info.rawArrInfos[0])
            for (let i = 1; i < info.rawArrInfos.length; i++) {
                const lastArrInfo = info.rawArrInfos[i - 1]
                const myArrInfo = info.rawArrInfos[i]

                // Find the first difference
                let firstDiff = null
                for (let j = 1; j < lastArrInfo.length; j++) {
                    if (myArrInfo[j] != lastArrInfo[j]) {
                        firstDiff = j
                        break
                    }
                }
                assert(() => firstDiff !== null)

                // Close up all deeper objects and arrays in lastArrInfo.
                for (let action of lastArrInfo.slice(firstDiff).reverse()) {
                    if (action == '[') {
                        arrInfo.push(']')
                    } else if (action == '{') {
                        arrInfo.push('}')
                    }
                }

                // If they differ by index in the same array, encode the number of skipped elements, if
                // any.
                if (typeof lastArrInfo[firstDiff] == 'number') {
                    // Because of how we walk arrays, if last is a number, this must be a higher number.
                    assert(() => typeof myArrInfo[firstDiff] == 'number')
                    let delta = myArrInfo[firstDiff] - lastArrInfo[firstDiff]
                    assert(() => delta >= 1, myArrInfo[firstDiff], lastArrInfo[firstDiff], delta)

                    // We implicitly advance by 1, so only encode when skipping indexes
                    let skip = delta - 1
                    if (skip > 0) {
                        arrInfo.push('+')
                        arrInfo.push(skip)
                    }
                    firstDiff++
                }

                // Now put the rest of myArrInfo into arrInfo
                for (let action of myArrInfo.slice(firstDiff)) {
                    arrInfo.push(action)
                }
            }

            // If there are no arrays then no arrayInfo is needed
            if (arrInfo.indexOf('[') == -1) {
                assert(() => info.values.length == 1)
                // arrInfo must be a run of { followed by as single |
                assert(() => arrInfo.join('').match(/^\{*\|$/))
                info.arrInfo = ''
                continue
            }

            // Remove all explicitly encoded zero indexes, since they are implicit
            arrInfo = arrInfo.filter(e => e !== 0)

            // encode all numbers, then flatten to a string
            let arrInfoStr = arrInfo.map((e) => typeof e == 'string' ? e : this.encodeNum(e)).join('')

            // Replace any {|} or a final {| with ^
            arrInfoStr.replace(/\{\|\}|\{\|$/g, '^')

            // Reduce final run of | or ^ to a single copy (it is implicitly repeated)
            arrInfoStr.replace(/([|^])\1+$/, '$1')

            info.arrInfo = arrInfoStr
        }

        return this.infos
    }
}

class ArrInfoDecoder {
    static decode(path, values, arrInfo, into = {}) {
        new ArrInfoDecoder(path, values, arrInfo).decodeRoot(into)
        return into
    }

    constructor(path, values, arrInfo) {
        // Last argument is true for cursors that are only read from at the end of processing a value.
        // This results in better error printing, by putting the cursor on the element where the error applies.
        this.path = new ArrayCursor('path', path.split('.'), false)
        this.values = new ArrayCursor('values', values, true) // Always read after doing all checks
        this.arrInfo = new StringCursor('arrInfo', arrInfo, false)

        // thes are only used for error reporting
        this.into = {}
        this.outputPos = []

        this.uassert('must have at least one value',
            values.length > 0)

        // Guaranteed by String.split()
        assert(() => this.path.length > 0, this.path, path)
    }

    decodeRoot(into = {}) {
        this.into = into

        if (!this.arrInfo.empty())
            return this.decodeObj(into)

        this.uassert('when arrInfo is empty, must have exactly one value',
                     this.values.length == 1)

        // Simple no-array case:
        while (this.path.hasMore()) {
            const field = this.consumePathPart()
            this.uassert(`attempting to insert a field '${field}' into non-object ${into}`,
                         $.isPlainObject(into))

            if (!this.path.hasMore()) {
                into[field] = this.consumeValue()
                return
            }

            if (!(field in into)) into[field] = {}
            into = into[field]
        }
    }

    decodeObj(into) {
        const field = this.consumePathPart()
        this.uassert(`attempting to insert a field '${field}' into non-object ${into}`,
                     $.isPlainObject(into))

        const action = this.consumeArrInfo()
        switch (action) {
            case '^':
                if (!(field in into)) into[field] = {}
                this.doCaret(into[field]);
                break
            case '|':
                this.uassert(`attempting to overwrite field '${field}'`,
                             !(field in into))
                this.assertConsumedFullPath()
                into[field] = this.consumeValue();
                break
            case '{':
                if (!(field in into)) into[field] = {}
                this.decodeObj(into[field])
                break
            case '[':
                if (!(field in into)) into[field] = []
                this.decodeArr(into[field])
                break
            default:
                this.uassert(`unexpected action '${action}' while decoding an object, expected one of [{|^`,
                             false);
        }
        if (!this.done()) {
            const next = this.consumeArrInfo()
            this.uassert(`expected '}' but found '${next}'`,
                         next == '}')
        }
        this.unconsumePathPart()
    }
    decodeArr(into) {
        // This logic takes advantage of 3 facts about JavaScript arrays:
        // 1) arr[num] will automatically extend the array and fill with undefined
        // 2) JSON.stringify() serializes undefined values in arrays as null
        // 3) Using into[index] == undefined checks which also match null, to support
        //    merging into objects parsed from JSON

        this.uassert(`attempting to insert an element into non-array ${into}`,
                     Array.isArray(into))

        let index = 0
        if (this.arrInfo.peekIsNumber())
            index = this.arrInfo.consumeNumber()

        let inserted = false
        const outputPosIx = this.outputPos.length
        this.outputPos.push(index)
        while (!this.done()) {
            assert(() => this.outputPos.length == outputPosIx + 1, this)
            this.outputPos[outputPosIx] = index

            const action = this.consumeArrInfo()
            switch (action) {
                case '^':
                    inserted = true
                    if (into[index] == undefined) into[index] = {}
                    this.doCaret(into[index++])
                    break
                case '|':
                    inserted = true
                    this.uassert(`attempting to overwrite element at index ${index}`,
                                 into[index] == undefined,
                                 {index})
                    this.assertConsumedFullPath()
                    into[index++] = this.consumeValue()
                    break
                case '{':
                    inserted = true
                    if (into[index] == undefined) into[index] = {}
                    this.decodeObj(into[index++])
                    break
                case '[':
                    inserted = true
                    if (into[index] == undefined) into[index] = []
                    this.decodeArr(into[index++])
                    break
                case '+':
                    this.uassert('skipping in array without inserting anything (use "[5" rather than "[+5" to set initial index)',
                                 inserted)
                    inserted = false // expect to insert something after skipping
                    this.uassert(`expected a number but found '${this.arrInfo.peek()}'`,
                                 this.arrInfo.peekIsNumber())
                    index += this.arrInfo.consumeNumber()
                    break

                case ']':
                    this.uassert("closing array without inserting anything",
                                 inserted)
                    this.outputPos.pop()
                    return
                default:
                    this.uassert(`unexpected action '${action}' while decoding an array, expected one of []+{|^`,
                                 false);
            }
        }

        this.outputPos.pop()
    }

    done() {
        if (this.values.hasMore())
            return false

        this.uassert("ran out of values before consuming full arrInfo",
                     this.consumedAllArrInfo)
        return true;
    }

    doCaret(into) {
        const field = this.consumePathPart()
        this.uassert("'^' must consume last path component",
                     !this.path.hasMore())
        this.uassert(`attempting to insert a field '${field}' into non-object ${into}`,
                     $.isPlainObject(into))
        this.uassert(`attempting to overwrite field '${field}'`,
                     !(field in into))
        into[field] = this.consumeValue()
        this.unconsumePathPart()
    }

    assertConsumedFullPath() {
        this.uassert("Must have consumed full path to process '|'",
                     !this.path.hasMore())
    }
    consumePathPart() {
        this.uassert("Attempting to consume path component but at end",
                     this.path.hasMore())
        const out = this.path.consume()
        this.outputPos.push(out)
        return out;
    }
    unconsumePathPart() {
        this.path.unconsume()
        this.outputPos.pop()
    }

    consumeArrInfo() {
        assert(() => this.arrInfo.hasMore(), this)
        const out = this.arrInfo.peek()
        if (this.arrInfo.atLastElem()) {
            this.consumedAllArrInfo = true
            this.uassert(`last byte of arrInfo must be '|' or '^', but found '${out}'`,
                         ['|', '^'].includes(out))
            // stay positioned here, and repeat last terminal byte
        } else {
            this.arrInfo.consume()
        }
        return out
    }

    consumeValue() {
        this.uassert('consuming value when none left', this.values.hasMore())
        return this.values.consume()
    }

    uassert(msg, cond, extra = {}) {
        if (cond) return;
        throw new ErrorWithCursors(msg, this.path, this.arrInfo, this.values)
            .addExtra({
                outputPos: this.outputPos,
                outputSoFar: this.into,
                ...extra,
            })
    }
}

//
// Everything below here is internal helpers
//

function assert(cond, ...rest) {
    const ok = cond()
    if (ok) return
    console.assert(false, cond, ...rest)
    throw Error(`Failed internal assertion: ${cond}\n(more info may be available in js console)`)
}

class ErrorWithCursors extends Error {
    constructor(msg, ...cursors) {
        super(msg)
        this.cursors = cursors
        this.extra = {}
    }

    addExtra(extra) {
        Object.assign(this.extra, extra)
        return this
    }

    toString() {
        let out = this.message + '\n';
        if (!$.isEmptyObject(this.extra)) {
            out += 'extra context:\n'
            for (let [name, val] of Object.entries(this.extra)) {
                out += `  ${name}: ${JSON.stringify(val)}\n`
            }
        }
        if (this.cursors.length > 0) {
            out += 'cursors:\n'
            for (let cursor of this.cursors) {
                out += cursor.toString()
                out += '\n'
            }
        }
        return out;
    }
}

class CursorBase {
    constructor(name, arr, printPastLastRead) {
        this.name = name
        this.arr = arr // may be a string
        this.index = 0
        this.lastRead = -1
        this.printPastLastRead = printPastLastRead
    }

    get length() {
        return this.arr.length
    }

    empty() {
        return this.arr.length == 0
    }

    hasMore() {
        return this.index < this.arr.length
    }
    atLastElem() {
        return this.index == this.arr.length-1
    }

    peek() {
        assert(() => this.hasMore(), this)
        this.lastRead = this.index
        return this.arr[this.index]
    }
    consume() {
        assert(() => this.hasMore(), this)
        this.lastRead = this.index
        return this.arr[this.index++]
    }
    unconsume() {
        assert(() => this.index > 0, this)
        this.index--
        // Somewhat of a lie, but better reflects current position.
        this.lastRead = this.index - 1
    }

    _specialCasesForPrinting() {
        if (this.printPastLastRead) {
            if (this.index == this.arr.length)
                return '(cursor past end)'
        } else {
            // In the printPastLastRead case, we print the cursor at index 0
            if (this.lastRead == -1)
                return '(nothing read yet)'
        }
        return null
    }

    _indexForPrinting() {
        return this.printPastLastRead ? this.lastRead + 1 : this.lastRead;
    }
}

class ArrayCursor extends CursorBase {
    constructor(...args) {
        super(...args)
        assert(() => Array.isArray(this.arr), this)
    }
    toString() {
        let row = '['
        let offset
        let len
        for (let i = 0; i < this.arr.length; i++) {
            if (i == this._indexForPrinting())
                offset = row.length
            const elem = JSON.stringify(this.arr[i])
            len = elem.length
            row += elem
            if (i < this.arr.length - 1)
                row += ', '
        }
        row += ']'
        let caretRow = this._specialCasesForPrinting() || ''.padStart(offset) + '^'.padEnd(len, '~')
        return `${this.name}:\n${row}\n${caretRow}\n`
    }
};

class StringCursor extends CursorBase {
    constructor(...args) {
        super(...args)
        assert(() => typeof this.arr == 'string', this)
    }

    toString() {
        let caretRow = this._specialCasesForPrinting() || '^'.padStart(this._indexForPrinting() + 1)
        return `${this.name}:\n${this.arr}\n${caretRow}\n`
    }

    peekIsNumber() {
        let c = this.peek();
        return c >= '0' && c <= '9'
    }
    consumeNumber() {
        assert(() => this.peekIsNumber(), this)
        let out = 0
        while (this.hasMore() && this.peekIsNumber() || this.peek() == ':') {
            let c = this.consume();
            if (c == ':') {
                // Ignoring length prefix.
                out = 0
                continue
            }
            const num = +c // convert c to a number
            if (out == 0 && num == 0) {
                throw new ErrorWithCursors("first digit of number can't be zero", this)
            }
            out *= 10
            out += num
        }
        return out
    }
}
