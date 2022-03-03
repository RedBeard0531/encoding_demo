"use strict";


class ArrInfoEncoder {
    static encode(root) {
        return new ArrInfoEncoder(root).encode()
    }

    constructor(root) {
        this.infos = {}
        this.walkObj('', [], root, true)
    }

    walkObj(path, arrInfoPrefix, obj, isRoot = false) {
        if (isRoot) {
            this.infoFor('\xff').hasNonEmptySubObjects = true
            assert(() => path == '', this)
            var pathPrefix = ''
            var arrInfo = arrInfoPrefix
        } else {
            this.infoFor(path).hasNonEmptySubObjects = true
            var pathPrefix = path + '.'
            var arrInfo = arrInfoPrefix.concat(['{'])
        }

        for (let field in obj) {
            const subpath = pathPrefix + field
            this.infoFor(subpath).nSeen += 1
            this.handleElem(subpath, arrInfo, 0 /* direct array depth */, obj[field])
        }
    }

    walkArr(path, arrInfoPrefix, arrayDepth, arr) {
        // We compare with exactly 2 here since we only care about
        // arrays directly nested in another array. For [[[]], [], []], for example,
        // we would report three directly nested arrays (not four).
        if (arrayDepth == 2) {
            this.infoFor(path).nDirectlyNestedNonEmptyArrays += 1;
        }
        let arrInfo = arrInfoPrefix.concat(['[', 0])
        const arrInfoIx = arrInfo.length - 1
        for (let i = 0; i < arr.length; i++) {
            arrInfo[arrInfoIx] = i
            this.handleElem(path, arrInfo, arrayDepth, arr[i])
        }
    }

    handleElem(path, arrInfoPrefix, arrayDepth, elem) {
        let info = this.infoFor(path)

        if (Array.isArray(elem)) {
            if (elem.length != 0)
                return this.walkArr(path, arrInfoPrefix, arrayDepth + 1, elem)
            // empty array treated as leaf scalar
        } else if ($.isPlainObject(elem)) {
            info.nSubObjects += 1
            if (!$.isEmptyObject(elem))
                return this.walkObj(path, arrInfoPrefix, elem)
            // empty object treated as leaf scalar
        }

        info.values.push(elem)
        info.rawArrInfos.push(arrInfoPrefix.concat(['|']))
    }

    // Helper that returns the info for a path, constructing the default if none exists yet
    infoFor(path) {
        if (path in this.infos)
            return this.infos[path]

        return (this.infos[path] = {
            nSeen: 0,
            nSubObjects: 0,
            nDirectlyNestedNonEmptyArrays: 0,
            hasNonEmptySubObjects: false,
            values: [],
            rawArrInfos: [],
            arrInfo: [],
            // isSparse: bool, // Added in checkSparse(). Absence means not computed yet.

            path: path // For debugging.
        })
    }

    encodeNum(num) {
        assert(() => typeof num == 'number')
        assert(() => num >= 1)
        return num.toString()
    }

    static parentPath(path) {
        let dot = path.lastIndexOf('.')
        return dot == -1 ? null : path.substring(0, dot)
    }

    checkSparse(path, info) {
        if ('isSparse' in info)
            return // already computed

        let parent = ArrInfoEncoder.parentPath(path)
        if (!parent) {
            // top level fields are automatically dense
            info.isSparse = false
            return
        }

        let parentInfo = this.infoFor(parent)
        this.checkSparse(parent, parentInfo) // ensure parent's sparseness is computed before ours
        if (parentInfo.isSparse) {
            // If parent is sparse, we automatically are.
            info.isSparse = true
            return
        }

        info.isSparse = info.nSeen != parentInfo.nSubObjects ||
            parentInfo.nDirectlyNestedNonEmptyArrays > 0;
    }

    // This is called to encode the output after the object has been completely walked.
    encode() {
        for (let [path, info] of Object.entries(this.infos)) {
            this.checkSparse(path, info)
            assert(() => 'isSparse' in info)

            assert(() => info.values.length == info.rawArrInfos.length)
            if (info.values.length == 0) {
                info.arrInfo = '';
                continue // This can happen if we only see this path to mark existence of subobjects
            }

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

                // Close up all deeper arrays in lastArrInfo.
                for (let action of lastArrInfo.slice(firstDiff).reverse()) {
                    if (action == '[') {
                        arrInfo.push(']')
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

            // Remove any runs of { before a |
            arrInfoStr = arrInfoStr.replace(/\{+\|/g, '|')

            // Remove final run of |
            arrInfoStr = arrInfoStr.replace(/\|+$/, '')

            // Run length encode remaining runs of |
            arrInfoStr = arrInfoStr.replace(/\|(\|+)/g, (_, repeats) => `|${repeats.length}`)

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

    /**
     * Attempts to compute a projection for a column using the encoding information.
     * @param {String} path The dotted path to compute an inclusion projection for. We want the
     *     object that would result by executing the pipeline [{$project: {<path>: 1}}].
     * @param {Object} encodingInfo The entire encoding object. Ideally you can reconstruct the
     *     answer from just `encodingInfo[path]`, but you
     * @returns {{answer?: Object, extraColumnsConsulted?: string[], needsFetch?: string}}
     * If you cannot compute the answer with the encoding scheme, just return {needsFetch: true}.
     */
    static answerProjection(path, encodingInfo) {
        if (path in encodingInfo) {
            let info = encodingInfo[path]
            if (info.hasNonEmptySubObjects) {
                return {needsFetch: 'subobject marker'};
            }
            if (info.isSparse) {
                return {needsFetch: 'sparse data marker'};
            }

            let into = {};
            new ArrInfoDecoder(path,
                               info.values,
                               info.arrInfo,
                               true /* drop unknowns */
                              )
                .decodeRoot(into)
            return {answer: into, extraColumnsConsulted: []};
        }
        return {needsFetch: 'no data for path'};
    }

    constructor(path, values, arrInfo, dropUnknowns=false) {
        // Last argument is true for cursors that are only read from at the end of processing a value.
        // This results in better error printing, by putting the cursor on the element where the error applies.
        this.path = new ArrayCursor('path', path.split('.'), false)
        this.values = new ArrayCursor('values', values, true) // Always read after doing all checks
        this.arrInfo = new StringCursor('arrInfo', arrInfo, false)

        this.dropUnknowns = dropUnknowns;

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

        // Simple no-array case:
        this.uassert('when arrInfo is empty, must have exactly one value',
                     this.values.length == 1)
        this.decodeNestedPath(into)
    }

    decodeNestedPath(into) {
        const field = this.consumePathPart()
        this.uassert(`attempting to insert a field '${field}' into non-object ${into}`,
                     $.isPlainObject(into))

        if (this.path.hasMore()) {
            if (!(field in into)) into[field] = {}
            this.decodeNestedPath(into[field])
        } else {
            this.uassert(`attempting to overwrite field '${field}'`,
                         !(field in into))
            into[field] = this.consumeValue()
        }

        this.unconsumePathPart()
    }

    decodeObj(into) {
        const field = this.consumePathPart()
        this.uassert(`attempting to insert a field '${field}' into non-object ${into}`,
                     $.isPlainObject(into))

        const action = this.consumeArrInfo()
        switch (action) {
            case '{':
                if (!(field in into)) into[field] = {}
                this.decodeObj(into[field])
                break
            case '[':
                if (!(field in into)) into[field] = []
                this.decodeArr(into[field])
                break

            // These are both error cases
            case '|':
                this.uassert(`encountered a '|' following a '{'. Runs of '{' before a '|' are redundant and should be removed`,
                             false)
            default:
                this.uassert(`unexpected action '${action}' while decoding an object, expected one of [{`,
                             false)
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

        let index = this.arrInfo.consumeOptionalNumber()
        let inserted = false
        const outputPosIx = this.outputPos.length
        this.outputPos.push(index)
        loop: while (!this.done()) {
            assert(() => this.outputPos.length == outputPosIx + 1, this)
            this.outputPos[outputPosIx] = index

            const action = this.consumeArrInfo()
            switch (action) {
                case '|':
                    inserted = true
                    let repeatsRemaining = this.arrInfo.consumeOptionalNumber()
                    do {
                        if (this.path.hasMore()) {
                            if (into[index] == undefined) into[index] = {}
                            this.decodeNestedPath(into[index++])
                        } else {
                            this.uassert(`attempting to overwrite element at index ${index}`,
                                into[index] == undefined,
                                {into})
                            into[index++] = this.consumeValue()
                        }
                    } while (repeatsRemaining--);
                    this.uassert("Extra | not run-length-encoded",
                        !(this.arrInfo.hasMore() && this.arrInfo.peek() == '|'))
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
                    index += this.arrInfo.consumeNumber()
                    break

                case ']':
                    this.uassert("closing array without inserting anything",
                                 inserted)
                    break loop;
                default:
                    this.uassert(`unexpected action '${action}' while decoding an array, expected one of []+{|`,
                                 false)
            }
        }
        this.outputPos.pop()

        if (this.dropUnknowns)
            _.pull(into, undefined)

    }

    done() {
        if (this.values.hasMore())
            return false

        this.uassert("ran out of values before consuming full arrInfo",
                     this.consumedAllArrInfo)
        return true
    }

    consumePathPart() {
        this.uassert("Attempting to consume path component but at end",
                     this.path.hasMore())
        const out = this.path.consume()
        this.outputPos.push(out)
        return out
    }
    unconsumePathPart() {
        this.path.unconsume()
        this.outputPos.pop()
    }

    consumeArrInfo() {
        if (!this.arrInfo.hasMore()) {
            this.consumedAllArrInfo = true
            return '|'
        }

        return this.arrInfo.consume()
    }

    consumeValue() {
        this.uassert('consuming value when none left', this.values.hasMore())
        return this.values.consume()
    }

    uassert(msg, cond, extra = {}) {
        if (cond) return
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
        let out = this.message + '\n'
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
        return out
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

    peek({modifyLastRead} = {modifyLastRead: true}) {
        assert(() => this.hasMore(), this)
        if (modifyLastRead)
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
        return this.printPastLastRead ? this.lastRead + 1 : this.lastRead
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
}

class StringCursor extends CursorBase {
    constructor(...args) {
        super(...args)
        assert(() => typeof this.arr == 'string', this)
    }

    toString() {
        let caretRow = this._specialCasesForPrinting() || '^'.padStart(this._indexForPrinting() + 1)
        return `${this.name}:\n${this.arr}\n${caretRow}\n`
    }

    peekIsNumber({modifyLastRead} = {modifyLastRead: true}) {
        if (!this.hasMore())
            return false
        let c = this.peek()
        return c >= '0' && c <= '9'
    }

    // Returns 0 if no number is present, since 0 is implicitly encoded.
    consumeOptionalNumber() {
        let out = 0
        while (this.hasMore() && this.peekIsNumber({modifyLastRead: false})) {
            let c = this.consume()
            const num = +c // convert c to a number
            if (out == 0 && num == 0) {
                throw new ErrorWithCursors("first digit of number can't be zero", this)
            }
            out *= 10
            out += num
        }
        return out
    }
    consumeNumber() {
        if (!this.hasMore())
            throw new ErrorWithCursors(`expected a number but hit end`, this)
        if (!this.peekIsNumber())
            throw new ErrorWithCursors(`expected a number but found '${this.peek()}'`, this)
        return this.consumeOptionalNumber();
    }
}
