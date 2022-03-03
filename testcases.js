const testCases = [
    { 'input': {}, 'expectedProjectionOutput': {}, 'expectedFieldPathOutput': 'missing' },
    {
        'input': { "a": null },
        'expectedProjectionOutput': {},
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": "scalar" },
        'expectedProjectionOutput': {},
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": {} },
        'expectedProjectionOutput': { "a": {} },
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": { "x": 1, "b": "scalar" } },
        'expectedProjectionOutput': { "a": {} },
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": { "b": {} } },
        'expectedProjectionOutput': { "a": { "b": {} } },
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": { "x": 1, "b": {} } },
        'expectedProjectionOutput': { "a": { "b": {} } },
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": { "x": 1, "b": { "x": 1 } } },
        'expectedProjectionOutput': { "a": { "b": {} } },
        'expectedFieldPathOutput': 'missing'
    },
    {
        'input': { "a": { "b": { "c": "scalar" } } },
        'expectedProjectionOutput': { "a": { "b": { "c": "scalar" } } },
        'expectedFieldPathOutput': '"scalar"'
    },
    {
        'input': { "a": { "b": { "c": null } } },
        'expectedProjectionOutput': { "a": { "b": { "c": null } } },
        'expectedFieldPathOutput': 'null'
    },
    {
        'input': { "a": { "b": { "c": [[1, 2], [{}], 2] } } },
        'expectedProjectionOutput': { "a": { "b": { "c": [[1, 2], [{}], 2] } } },
        'expectedFieldPathOutput': [[1, 2], [{}], 2]
    },
    {
        'input': { "a": { "x": 1, "b": { "x": 1, "c": ["scalar"] } } },
        'expectedProjectionOutput': { "a": { "b": { "c": ["scalar"] } } },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": { "x": 1, "b": { "c": { "x": 1 } } } },
        'expectedProjectionOutput': { "a": { "b": { "c": { "x": 1 } } } },
        'expectedFieldPathOutput': '{  "x" : 1 }'
    },
    {
        'input': { "a": { "b": [] } },
        'expectedProjectionOutput': { "a": { "b": [] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": [null] } },
        'expectedProjectionOutput': { "a": { "b": [] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": ["scalar"] } },
        'expectedProjectionOutput': { "a": { "b": [] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": [[]] } },
        'expectedProjectionOutput': { "a": { "b": [[]] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": [1, {}, 2] } },
        'expectedProjectionOutput': { "a": { "b": [{}] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": [[1, 2], [{}], 2] } },
        'expectedProjectionOutput': { "a": { "b": [[], [{}]] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "x": 1, "b": [[1, 2], [{}], 2] } },
        'expectedProjectionOutput': { "a": { "b": [[], [{}]] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": [{ "c": "scalar" }] } },
        'expectedProjectionOutput': { "a": { "b": [{ "c": "scalar" }] } },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": { "b": [{ "c": "scalar" }, { c: "scalar2" }] } },
        'expectedProjectionOutput':
        { "a": { "b": [{ "c": "scalar" }, { "c": "scalar2" }] } },
        'expectedFieldPathOutput': ["scalar", "scalar2"]
    },
    {
        'input': { "a": { "b": [{ "c": [[1, 2], [{}], 2] }] } },
        'expectedProjectionOutput': { "a": { "b": [{ "c": [[1, 2], [{}], 2] }] } },
        'expectedFieldPathOutput': [[[1, 2], [{}], 2]]
    },
    {
        'input': { "a": { "b": [1, { "c": "scalar" }, 2] } },
        'expectedProjectionOutput': { "a": { "b": [{ "c": "scalar" }] } },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": { "b": [1, { "c": [[1, 2], [{}], 2] }, 2] } },
        'expectedProjectionOutput': { "a": { "b": [{ "c": [[1, 2], [{}], 2] }] } },
        'expectedFieldPathOutput': [[[1, 2], [{}], 2]]
    },
    {
        'input': { "a": { "x": 1, "b": [1, { "c": [[1, 2], [{}], 2] }, 2] } },
        'expectedProjectionOutput': { "a": { "b": [{ "c": [[1, 2], [{}], 2] }] } },
        'expectedFieldPathOutput': [[[1, 2], [{}], 2]]
    },
    {
        'input': { "a": { "b": [[1, 2], [{ "c": "scalar" }], 2] } },
        'expectedProjectionOutput': { "a": { "b": [[], [{ "c": "scalar" }]] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": { "b": [[1, 2], [{ "c": [[1, 2], [{}], 2] }], 2] } },
        'expectedProjectionOutput':
        { "a": { "b": [[], [{ "c": [[1, 2], [{}], 2] }]] } },
        'expectedFieldPathOutput': []
    },
    {
        'input':
        { "a": { "x": 1, "b": [[1, 2], [{ "c": [[1, 2], [{}], 2] }], 2] } },
        'expectedProjectionOutput':
        { "a": { "b": [[], [{ "c": [[1, 2], [{}], 2] }]] } },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [] },
        'expectedProjectionOutput': { "a": [] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [null] },
        'expectedProjectionOutput': { "a": [] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": ["scalar"] },
        'expectedProjectionOutput': { "a": [] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [[]] },
        'expectedProjectionOutput': { "a": [[]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [{}] },
        'expectedProjectionOutput': { "a": [{}] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [1, {}, 2] },
        'expectedProjectionOutput': { "a": [{}] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [[1, 2], [{}], 2] },
        'expectedProjectionOutput': { "a": [[], [{}]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [{ "b": "scalar" }] },
        'expectedProjectionOutput': { "a": [{}] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [{ "b": null }] },
        'expectedProjectionOutput': { "a": [{}] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [1, { "b": "scalar" }, 2] },
        'expectedProjectionOutput': { "a": [{}] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [1, { "b": [] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": [null] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": ["scalar"] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": [[]] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [[]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": [] }] },
        'expectedProjectionOutput': { "a": [{ "b": [] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": ["scalar"] }] },
        'expectedProjectionOutput': { "a": [{ "b": [] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": [[]] }] },
        'expectedProjectionOutput': { "a": [{ "b": [[]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": {} }] },
        'expectedProjectionOutput': { "a": [{ "b": {} }] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [{ "b": { "c": "scalar" } }] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": "scalar" } }] },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": [{ "b": { "c": [[1, 2], [{}], 2] } }] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": [[1, 2], [{}], 2] } }] },
        'expectedFieldPathOutput': [[[1, 2], [{}], 2]]
    },
    {
        'input': { "a": [{ "b": { "x": 1 } }] },
        'expectedProjectionOutput': { "a": [{ "b": {} }] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [{ "b": { "x": 1, "c": "scalar" } }] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": "scalar" } }] },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": [{ "b": [{ "c": "scalar" }] }] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": "scalar" }] }] },
        'expectedFieldPathOutput': [["scalar"]]
    },
    {
        'input': { "a": [{ "b": [{ "c": ["scalar"] }] }] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": ["scalar"] }] }] },
        'expectedFieldPathOutput': [[["scalar"]]]
    },
    {
        'input': { "a": [{ "b": [1, { "c": ["scalar"] }, 2] }] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": ["scalar"] }] }] },
        'expectedFieldPathOutput': [[["scalar"]]]
    },
    {
        'input': { "a": [{ "b": [{}] }] },
        'expectedProjectionOutput': { "a": [{ "b": [{}] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": [[1, 2], [{}], 2] }] },
        'expectedProjectionOutput': { "a": [{ "b": [[], [{}]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": [[1, 2], [{ "c": "scalar" }], 2] }] },
        'expectedProjectionOutput': { "a": [{ "b": [[], [{ "c": "scalar" }]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [{ "b": [[1, 2], [{ "c": ["scalar"] }], 2] }] },
        'expectedProjectionOutput': { "a": [{ "b": [[], [{ "c": ["scalar"] }]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": {} }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": {} }] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [1, { "b": { "c": "scalar" } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": "scalar" } }] },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": [1, { "b": { "c": { "x": 1 } } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": { "x": 1 } } }] },
        'expectedFieldPathOutput': [{ "x": 1 }]
    },
    {
        'input': { "a": [1, { "b": { "c": [1, {}, 2] } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": [1, {}, 2] } }] },
        'expectedFieldPathOutput': [[1, {}, 2]]
    },
    {
        'input': { "a": [1, { "b": { "x": 1 } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": {} }] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [1, { "b": { "x": 1, "c": "scalar" } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": "scalar" } }] },
        'expectedFieldPathOutput': ["scalar"]
    },
    {
        'input': { "a": [1, { "b": { "x": 1, "c": [[]] } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": [[]] } }] },
        'expectedFieldPathOutput': [[[]]]
    },
    {
        'input': { "a": [1, { "b": { "x": 1, "c": [1, {}, 2] } }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": { "c": [1, {}, 2] } }] },
        'expectedFieldPathOutput': [[1, {}, 2]]
    },
    {
        'input': { "a": [1, { "b": [{}] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{}] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": [{ "c": "scalar" }] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": "scalar" }] }] },
        'expectedFieldPathOutput': [["scalar"]]
    },
    {
        'input': { "a": [1, { "b": [{ "c": { "x": 1 } }] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": { "x": 1 } }] }] },
        'expectedFieldPathOutput': [[{ "x": 1 }]]
    },
    {
        'input': { "a": [1, { "b": [{ "c": [1, {}, 2] }] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": [1, {}, 2] }] }] },
        'expectedFieldPathOutput': [[[1, {}, 2]]]
    },
    {
        'input': { "a": [1, { "b": [1, {}, 2] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{}] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": [1, { "c": null }, 2] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": null }] }] },
        'expectedFieldPathOutput': [[null]]
    },
    {
        'input': { "a": [1, { "b": [1, { "c": "scalar" }, 2] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": "scalar" }] }] },
        'expectedFieldPathOutput': [["scalar"]]
    },
    {
        'input': { "a": [1, { "b": [1, { "c": [1, {}, 2] }, 2] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [{ "c": [1, {}, 2] }] }] },
        'expectedFieldPathOutput': [[[1, {}, 2]]]
    },
    {
        'input': { "a": [1, { "b": [[1, 2], [{}], 2] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [[], [{}]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": [[1, 2], [{ "c": "scalar" }], 2] }, 2] },
        'expectedProjectionOutput': { "a": [{ "b": [[], [{ "c": "scalar" }]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [1, { "b": [[1, 2], [{ "c": [1, {}, 2] }], 2] }, 2] },
        'expectedProjectionOutput':
        { "a": [{ "b": [[], [{ "c": [1, {}, 2] }]] }] },
        'expectedFieldPathOutput': [[]]
    },
    {
        'input': { "a": [[1, 2], [{ "b": "scalar" }], 2] },
        'expectedProjectionOutput': { "a": [[], [{}]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [[1, 2], [{ "b": { "x": 1, "c": "scalar" } }], 2] },
        'expectedProjectionOutput': { "a": [[], [{ "b": { "c": "scalar" } }]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [[1, 2], [{ "b": { "x": 1, "c": [1, {}, 2] } }], 2] },
        'expectedProjectionOutput': { "a": [[], [{ "b": { "c": [1, {}, 2] } }]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [[1, 2], [{ "b": [] }], 2] },
        'expectedProjectionOutput': { "a": [[], [{ "b": [] }]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': { "a": [[1, 2], [{ "b": [1, { "c": "scalar" }, 2] }], 2] },
        'expectedProjectionOutput': { "a": [[], [{ "b": [{ "c": "scalar" }] }]] },
        'expectedFieldPathOutput': []
    },
    {
        'input':
        { "a": [[1, 2], [{ "b": [[1, 2], [{ "c": "scalar" }], 2] }], 2] },
        'expectedProjectionOutput':
        { "a": [[], [{ "b": [[], [{ "c": "scalar" }]] }]] },
        'expectedFieldPathOutput': []
    },
    {
        'input':
        { "a": [[1, 2], [{ "b": [[1, 2], [{ "c": [[1, 2], [{}], 2] }], 2] }], 2] },
        'expectedProjectionOutput':
        { "a": [[], [{ "b": [[], [{ "c": [[1, 2], [{}], 2] }]] }]] },
        'expectedFieldPathOutput': []
    },
    {
        'input': {a: [{b: [{c: 1}, {}]}]},
        'expectedProjectionOutput': {a: {b: [{c: 1}, {}]}},
        'expectedFieldPathOutput': [1],
    },
    {
        'input': {a: [{b: [{c: 1}, {d: 1}]}]},
        'expectedProjectionOutput': {a: {b: [{c: 1}, {}]}},
        'expectedFieldPathOutput': [1],
    },
    {
        'input': {a: [{b: {c: 1}}, {b: {}}]},
        'expectedProjectionOutput': {a: [{b: {c: 1}}, {b: {}}]},
        'expectedFieldPathOutput': [1],
    },
    {
        'input': {a: [{b: {c: 1}}, {b: {d: 1}}]},
        'expectedProjectionOutput': {a: [{b: {c: 1}}, {b: {}}]},
        'expectedFieldPathOutput': [1],
    },
    {
        'input': {a: [{b: {c: 1}}, {}]},
        'expectedProjectionOutput': {a: [{b: {c: 1}}, {b: {}}]},
        'expectedFieldPathOutput': [1],
    },
    {
        'input': {a: [{b: {c: 1}}, {b: null}]},
        'expectedProjectionOutput': {a: [{b: {c: 1}}, {}]},
        'expectedFieldPathOutput': [1],
    },
    {
        'input': {a: [{b: {c: 1}}, {b: []}]},
        'expectedProjectionOutput': {a: [{b: {c: 1}}, {}]},
        'expectedFieldPathOutput': [1],
    },
];
