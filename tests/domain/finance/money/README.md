# finance/money test cases

Snapshot: **2026-10-24, payout refactor** · **82 cases, 82 passed**. See the [domain testing guide](../../README.md) and [execution evidence](../../results/README.md).

Each row is one independently executable test; its first input value links to the test definition. **Oracle** is the expected result. **Log** contains assertion-verified observations from the recorded run, not captured runtime payloads. A result states only what that case's assertions establish; partial matches, approximate values, and identity checks retain their narrower meaning. Refresh this snapshot after relevant source changes.

Money amounts are expressed in cents; validation cases deliberately include invalid numeric values. Dollar formatting results are strings, and equality/ordering results are booleans or comparison signs. `NaN`, `Infinity`, and `-Infinity` denote the corresponding numeric inputs; `-0` is negative zero. Operands are constructed separately unless stated otherwise; their reference identities are not part of value equality.

## Addition, subtraction, and immutability

### Money addition

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [500](money-arithmetic.test.ts#L6) | 700 | 1200 | 1200 |
| [500](money-arithmetic.test.ts#L43) | 0 | 500 cents; source unchanged at 500 cents; zero operand unchanged at 0 cents | 500 cents; source unchanged at 500 cents; zero operand unchanged at 0 cents |
| [500](money-arithmetic.test.ts#L54) | 700 | Operands unchanged: 500, 700 | Operands unchanged: 500, 700 |

### Subtract the second amount, then add the first amount

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [500](money-arithmetic.test.ts#L15) | 700 | 300 | 300 |

### Money subtraction

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [500](money-arithmetic.test.ts#L24) | 700 | -200 | -200 |
| [500](money-arithmetic.test.ts#L33) | -100 | 600 | 600 |
| [500](money-arithmetic.test.ts#L64) | 0 | 500 cents; source unchanged at 500 cents; zero operand unchanged at 0 cents | 500 cents; source unchanged at 500 cents; zero operand unchanged at 0 cents |
| [500](money-arithmetic.test.ts#L75) | 700 | Operands unchanged: 500, 700 | Operands unchanged: 500, 700 |

## Safe integer boundaries

### Money addition at the limits

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [9007199254740991](money-bounds.test.ts#L6) | -9007199254740991 | 0 | 0 |
| [9007199254740991](money-bounds.test.ts#L15) | 1 | RangeError | RangeError |
| [-9007199254740991](money-bounds.test.ts#L21) | -1 | RangeError | RangeError |

### Money subtraction at the limits

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [9007199254740991](money-bounds.test.ts#L29) | 1 | 9007199254740990 | 9007199254740990 |
| [9007199254740991](money-bounds.test.ts#L37) | -1 | RangeError | RangeError |
| [-9007199254740991](money-bounds.test.ts#L43) | 1 | RangeError | RangeError |

### Money multiplication at the limits

**Input:** Amount (cents), Factor · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Amount (cents) | Factor | Expected Result | Test Result |
|---|---|---|---|
| [-9007199254740991](money-bounds.test.ts#L51) | -1 | 9007199254740991 | 9007199254740991 |
| [1](money-bounds.test.ts#L59) | 9007199254740991 | 9007199254740991 | 9007199254740991 |
| [9007199254740991](money-bounds.test.ts#L67) | 2 | RangeError | RangeError |
| [-9007199254740991](money-bounds.test.ts#L73) | 2 | RangeError | RangeError |

## Equality and ordering

### Compare money for equality

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [500](money-comparison.test.ts#L5) | 500 | true | true |
| [500](money-comparison.test.ts#L14) | 501 | false | false |

### Compare money ordering

**Input:** First amount (cents), Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| First amount (cents) | Second amount (cents) | Expected Result | Test Result |
|---|---|---|---|
| [500](money-comparison.test.ts#L23) | 500 | 0 | 0 |
| [500](money-comparison.test.ts#L32) | 501 | -1 | -1 |
| [501](money-comparison.test.ts#L41) | 500 | 1 | 1 |
| [-1](money-comparison.test.ts#L50) | 0 | -1 | -1 |

## Creation from cents

### Construct a money value

**Input:** Amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **14 passed / 14 cases**.

| Amount (cents) | Expected Result | Test Result |
|---|---|---|
| [0](money-construction.test.ts#L6) | 0 | 0 |
| [1](money-construction.test.ts#L14) | 1 | 1 |
| [-1](money-construction.test.ts#L22) | -1 | -1 |
| [1001](money-construction.test.ts#L30) | 1001 | 1001 |
| [9007199254740991](money-construction.test.ts#L38) | 9007199254740991 | 9007199254740991 |
| [-9007199254740991](money-construction.test.ts#L46) | -9007199254740991 | -9007199254740991 |
| [-0](money-construction.test.ts#L54) | 0 | 0 |
| [0.1](money-construction.test.ts#L64) | RangeError | RangeError |
| [-0.1](money-construction.test.ts#L70) | RangeError | RangeError |
| [NaN](money-construction.test.ts#L76) | RangeError | RangeError |
| [Infinity](money-construction.test.ts#L82) | RangeError | RangeError |
| [-Infinity](money-construction.test.ts#L88) | RangeError | RangeError |
| [9007199254740992](money-construction.test.ts#L94) | RangeError | RangeError |
| [-9007199254740992](money-construction.test.ts#L100) | RangeError | RangeError |

## Division

### Divide with floor rounding

**Input:** Amount (cents), Divisor · **Oracle:** Expected Result · **Log:** Test Result

Execution: **10 passed / 10 cases**.

| Amount (cents) | Divisor | Expected Result | Test Result |
|---|---|---|---|
| [1001](money-division.test.ts#L6) | 3 | 333; source unchanged: 1001 | 333; source unchanged: 1001 |
| [-1001](money-division.test.ts#L15) | 3 | -334; source unchanged: -1001 | -334; source unchanged: -1001 |
| [1002](money-division.test.ts#L24) | 3 | 334; source unchanged: 1002 | 334; source unchanged: 1002 |
| [-1002](money-division.test.ts#L33) | 3 | -334; source unchanged: -1002 | -334; source unchanged: -1002 |
| [1](money-division.test.ts#L42) | 3 | 0; source unchanged: 1 | 0; source unchanged: 1 |
| [-1](money-division.test.ts#L51) | 3 | -1; source unchanged: -1 | -1; source unchanged: -1 |
| [0](money-division.test.ts#L60) | 3 | 0; source unchanged: 0 | 0; source unchanged: 0 |
| [9007199254740991](money-division.test.ts#L69) | 2 | 4503599627370495; source unchanged: 9007199254740991 | 4503599627370495; source unchanged: 9007199254740991 |
| [-9007199254740991](money-division.test.ts#L78) | 2 | -4503599627370496; source unchanged: -9007199254740991 | -4503599627370496; source unchanged: -9007199254740991 |
| [9007199254740990](money-division.test.ts#L87) | 9007199254740991 | 0; source unchanged: 9007199254740990 | 0; source unchanged: 9007199254740990 |

### Divide by one

**Input:** Amount (cents), Divisor · **Oracle:** Expected Result · **Log:** Test Result

Execution: **10 passed / 10 cases**.

| Amount (cents) | Divisor | Expected Result | Test Result |
|---|---|---|---|
| [1001](money-division.test.ts#L98) | 1 | 1001 cents; source unchanged at 1001 cents | 1001 cents; source unchanged at 1001 cents |
| [-1001](money-division.test.ts#L107) | 1 | -1001 cents; source unchanged at -1001 cents | -1001 cents; source unchanged at -1001 cents |
| [1002](money-division.test.ts#L116) | 1 | 1002 cents; source unchanged at 1002 cents | 1002 cents; source unchanged at 1002 cents |
| [-1002](money-division.test.ts#L125) | 1 | -1002 cents; source unchanged at -1002 cents | -1002 cents; source unchanged at -1002 cents |
| [1](money-division.test.ts#L134) | 1 | 1 cents; source unchanged at 1 cents | 1 cents; source unchanged at 1 cents |
| [-1](money-division.test.ts#L143) | 1 | -1 cents; source unchanged at -1 cents | -1 cents; source unchanged at -1 cents |
| [0](money-division.test.ts#L152) | 1 | 0 cents; source unchanged at 0 cents | 0 cents; source unchanged at 0 cents |
| [9007199254740991](money-division.test.ts#L161) | 1 | 9007199254740991 cents; source unchanged at 9007199254740991 cents | 9007199254740991 cents; source unchanged at 9007199254740991 cents |
| [-9007199254740991](money-division.test.ts#L170) | 1 | -9007199254740991 cents; source unchanged at -9007199254740991 cents | -9007199254740991 cents; source unchanged at -9007199254740991 cents |
| [9007199254740990](money-division.test.ts#L179) | 1 | 9007199254740990 cents; source unchanged at 9007199254740990 cents | 9007199254740990 cents; source unchanged at 9007199254740990 cents |

### Reject invalid divisors

**Input:** Amount (cents), Divisor · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Amount (cents) | Divisor | Expected Result | Test Result |
|---|---|---|---|
| [100](money-division.test.ts#L190) | 0 | RangeError | RangeError |
| [100](money-division.test.ts#L196) | -1 | RangeError | RangeError |
| [100](money-division.test.ts#L202) | 0.5 | RangeError | RangeError |
| [100](money-division.test.ts#L208) | NaN | RangeError | RangeError |
| [100](money-division.test.ts#L214) | Infinity | RangeError | RangeError |
| [100](money-division.test.ts#L222) | 9007199254740992 | RangeError | RangeError |

## Dollar formatting

### Format as a dollar string

**Input:** Amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **8 passed / 8 cases**.

| Amount (cents) | Expected Result | Test Result |
|---|---|---|
| [0](money-dollars.test.ts#L5) | `0.00` | `0.00` |
| [1](money-dollars.test.ts#L13) | `0.01` | `0.01` |
| [1000](money-dollars.test.ts#L21) | `10.00` | `10.00` |
| [333](money-dollars.test.ts#L29) | `3.33` | `3.33` |
| [-1](money-dollars.test.ts#L37) | `-0.01` | `-0.01` |
| [-333](money-dollars.test.ts#L45) | `-3.33` | `-3.33` |
| [9007199254740991](money-dollars.test.ts#L53) | `90071992547409.91` | `90071992547409.91` |
| [-9007199254740991](money-dollars.test.ts#L61) | `-90071992547409.91` | `-90071992547409.91` |

## Multiplication

### Multiply by an integer

**Input:** Amount (cents), Factor · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Amount (cents) | Factor | Expected Result | Test Result |
|---|---|---|---|
| [500](money-multiplication.test.ts#L6) | 3 | 1500; source unchanged: 500 | 1500; source unchanged: 500 |
| [500](money-multiplication.test.ts#L15) | -3 | -1500; source unchanged: 500 | -1500; source unchanged: 500 |
| [500](money-multiplication.test.ts#L24) | 0 | 0; source unchanged: 500 | 0; source unchanged: 500 |
| [500](money-multiplication.test.ts#L33) | 1 | 500 cents; source unchanged at 500 cents | 500 cents; source unchanged at 500 cents |

### Reject invalid factors even for zero cents

**Input:** Amount (cents), Factor · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Amount (cents) | Factor | Expected Result | Test Result |
|---|---|---|---|
| [0](money-multiplication.test.ts#L44) | 0.5 | RangeError | RangeError |
| [0](money-multiplication.test.ts#L50) | NaN | RangeError | RangeError |
| [0](money-multiplication.test.ts#L56) | Infinity | RangeError | RangeError |
| [0](money-multiplication.test.ts#L62) | -Infinity | RangeError | RangeError |
| [0](money-multiplication.test.ts#L68) | 9007199254740992 | RangeError | RangeError |
| [0](money-multiplication.test.ts#L76) | -9007199254740992 | RangeError | RangeError |
