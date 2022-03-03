"use strict";

class FullArrInfoEncoder {
    static encode(root) {
        return new FullArrInfoEncoder(root).encode()
    }

    constructor(root) {
        this.infos = {}
        this.walkObj('', root, null)
    }

    walkObj(path, obj, parentInfo) {
        let pathToMe;
        let pathPrefix;
        if (parentInfo === null) {
            assert(() => path == '', this)
            pathPrefix = ''
            pathToMe = [];
        } else {
            pathPrefix = path + '.'
            pathToMe = parentInfo.pathToMe.concat(['{']);
        }

        for (let field in obj) {
            const subpath = pathPrefix + field
            let subInfo = this.infoFor(subpath, pathToMe.slice() /* copy */);
            this.handleElem(subpath, obj[field], subInfo, parentInfo)
        }
    }

    walkArr(path, arr, currentInfo, parentInfo) {
        // TODO going to need 'arrInfoPrefix' to be maintained separately than normal 'valueInfo' to
        // get the shape right.
        currentInfo.pathToMe.push('[');
        for (currentInfo.arrayItrIndex = 0; currentInfo.arrayItrIndex < arr.length; currentInfo.arrayItrIndex++) {
            const elem = arr[currentInfo.arrayItrIndex];
            if ($.isPlainObject(elem)) {
                // TODO what about if we have an outer index?
                this.infoFor(path).valueInfo.push('*'); // '*' == "I skipped an object".
            }
            this.handleElem(path, elem, currentInfo, parentInfo)
        }
        // Now that we've finished iterating, add in the fields at the end for sparseness.
        for (let [iPath, iInfo] of Object.entries(this.infos)) {
            if (iPath.startsWith(path + ".")) {
                if (iInfo.lastSeenIdx != arr.length) {
                    for (let i = iInfo.lastSeenIdx + 1; i < arr.length; ++i) {
                        if (currentInfo.valueInfo[i] === '*') {
                            iInfo.valueInfo.push("*");
                        } else {
                            iInfo.valueInfo.push(".");
                        }
                    }
                }
            }
        }
        // Ok so the 'pathToMe' is interesting. We just finished consuming an array, but we could be
        // back to this path in the future. In that case we should track that we previously had some
        // values and are now opening a new array. So we add all the 'valueInfo' to the 'pathToMe'
        // before closing the array.
        currentInfo.pathToMe = currentInfo.pathToMe.concat(currentInfo.valueInfo).concat([']']);
        currentInfo.valueInfo = [];
    }

    handleElem(path, elem, currentInfo, parentInfo) {
        if (Array.isArray(elem)) {
            if (this.currentlyInArray(currentInfo)) {
                // Don't bother double recursing, just add the array as a "value".
                return this.addPossiblySparseValue(elem, currentInfo, parentInfo);
            }
            return this.walkArr(path, elem, currentInfo, parentInfo)
        }
        else if ($.isPlainObject(elem)) {
            return this.walkObj(path, elem, currentInfo)
        }

        this.addPossiblySparseValue(elem, currentInfo, parentInfo);
    }

    addPossiblySparseValue(value, currentInfo, parentInfo) {
        currentInfo.values.push(value);
        if (this.currentlyInArray(parentInfo)) {
            let parentItrIndex = parentInfo.arrayItrIndex;
             // Expect that the parent is tracking all values in the array, with a "*" for "object here".
            assert(() => parentInfo.valueInfo[parentInfo.valueInfo.length - 1] === "*");
            if (parentItrIndex === 0) {
                // Nothing special required. Just add the 'v' and move on.
            }  else {
                // There were some elements of the parent array that did not contain a value for our
                // path. Let's figure out what they were and copy them down.
                //
                // For example: {a: [{}, "scalar", {}, {b: 1}]} for "a.b".
                // Here 'parentDraftInfo' would be ['{', '[', '*', 'v', '*', '*'] and we want to copy
                // down ["*", ".", '*'].
                //
                // As another example: [{b: 1}, "scalar", {}, {b: 2}] where 'value' is 2 (we're at
                // the second "a.b"). Here 'parentDraftInfo' is the same but we have
                // 'currentInfo.lastSeenIdx' = 0 and we can skip copying the first "*" which
                // corresponds to our '1' value.
                let idxToStartCopyDown = 0;
                if (currentInfo.lastSeenIdx !== null) {
                    idxToStartCopyDown = currentInfo.lastSeenIdx + 1;
                }
                for (let i = idxToStartCopyDown; i < parentItrIndex; ++i) {
                    const pv = parentInfo.valueInfo[i];
                    if (pv === "v") {
                        currentInfo.valueInfo.push(".");
                    } else if (pv === "*") {
                        currentInfo.valueInfo.push("*");
                    } else {
                        assert(() => false);
                    }
                }
            }
            // Track the index where we saw a value for this path. It's the number of values in the
            // parent - 1, since the parent already added a "*" to represent us.
            currentInfo.lastSeenIdx = parentInfo.valueInfo.length - 1;
        }
        currentInfo.valueInfo.push('v');

    }
    currentlyInArray(infoObj) {
        if (infoObj === null) {
            return false;  // We are traversing the root still.
        }
        return infoObj.arrayItrIndex !== null;
    }

    // Helper that returns the info for a path, constructing the default if none exists yet
    infoFor(path, optionalSeedPath) {
        if (path in this.infos)
            return this.infos[path]

        return (this.infos[path] = {
            lastSeenIdx: null,
            arrayItrIndex: null,
            values: [],
            pathToMe: optionalSeedPath || [],
            valueInfo: [],
        })
    }

    // This is called to encode the output after the object has been completely walked.
    encode() {
        for (let [path, info] of Object.entries(this.infos)) {
            info.arrInfo = info.pathToMe.concat(info.valueInfo).join('');
        }

        return this.infos
    }
}

class FullArrInfoDecoder {
    static decode(path, values, arrInfo, into = {}) {
        new FullArrInfoDecoder(path, values, arrInfo).decodeRoot(into)
        return into
    }

    /**
     * Attempts to compute a projection for a column using the encoding information.
     * @param {String} path The dotted path to compute an inclusion projection for. We want the
     *     object that would result by executing the pipeline [{$project: {<path>: 1}}].
     * @param {Object} encodingInfo The entire encoding object. Ideally you can reconstruct the
     *     answer from just `encodingInfo[path]`, but you
     * @returns {answer: {Object}, extraColumnsConsulted: [{String}], needsFetch: {bool}}
     * If you cannot compute the answer with the encoding scheme, just return {needsFetch: true}.
     */
    static answerProjection(path, encodingInfo) {
        if (path in encodingInfo) {
            let into = {};
            new FullArrInfoDecoder(path, encodingInfo[path].values, encodingInfo[path].arrInfo)
                .decodeRoot(into)
            return {answer: into, extraColumnsConsulted: []};
        }
        return {needsFetch: true};
    }

    constructor(path, values, arrInfo) {
        // Last argument is true for cursors that are only read from at the end of processing a value.
        // This results in better error printing, by putting the cursor on the element where the error applies.
        this.path = new ArrayCursor('path', path.split('.'), false)
        this.values = new ArrayCursor('values', values, true) // Always read after doing all checks
        this.arrInfo = new StringCursor('valueInfo', arrInfo, false)

        // thes are only used for error reporting
        this.into = {}
        this.outputPos = []

        this.uassert('must have at least one value', values.length > 0)

        // Guaranteed by String.split()
        assert(() => this.path.length > 0, this.path, path)
    }

    decodeRoot(into = {}) {
        this.into = into

        if (!this.arrInfo.empty())
            return this.decodeObj(into)

        // Simple no-array case:
        this.uassert('when valueInfo is empty, must have exactly one value',
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
            case '}':
                return
            case 'v':
                into[field] = this.consumeValue();
                break
            case '*':
                // Nothing to do here - leave an empty obj.
                break
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

        let index = 0;
        while (!this.done()) {
            const action = this.consumeArrInfo()
            switch (action) {
                case 'v':
                    if (this.path.hasMore()) {
                        let pathPart =this.consumePathPart();
                        into[index++] = {[pathPart]: this.consumeValue()}
                        this.unconsumePathPart();
                    } else {
                        into[index++] = this.consumeValue()
                    }
                    break
                case '{':
                    if (into[index] == undefined) into[index] = {}
                    this.decodeObj(into[index])
                    break
                case '[':
                    if (this.path.hasMore()) {
                        let pathPart =this.consumePathPart();
                        into[index] = {[pathPart]: []}
                        this.decodeArr(into[index++][pathPart])
                    } else {
                        into[index++] = this.consumeValue()
                    }
                    break
                case '.':
                    // into[index++] = "<uscalar>";
                    break
                case ']':
                    return
                case '*':
                    into[index++] = {};
                    break
                default:
                    this.uassert(`unexpected action '${action}' while decoding an array, expected one of []+{v`,
                                 false)
            }
        }

        this.outputPos.pop()
    }

    done() {
        if (this.values.hasMore())
            return false

        return this.consumedAllArrInfo;
    }

    consumePathPart() {
        this.uassert("Attempting to consume path component but at end",
                     this.path.hasMore())
        const out = this.path.consume()
        return out
    }
    unconsumePathPart() {
        this.path.unconsume()
    }

    consumeArrInfo() {
        if (this.consumedAllArrInfo) {
            return 'v'
        }

        let nextPiece = this.arrInfo.consume()
        this.consumedAllArrInfo = !this.arrInfo.hasMore();
        return nextPiece;
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

/*
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
*/
