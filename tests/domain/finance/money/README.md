# finance/money test cases

Snapshot: **2026-10-24** · **83 cases**. See the [domain testing guide](../../README.md) and [execution evidence](../../results/README.md).

Each row is one independently executable test. **Input** lists domain data and input commands; test instrumentation is omitted. **Log** shows assertion-verified outcomes from this run, not captured runtime payloads. Named results, where useful, identify how observations were obtained. Simple public-state assertions need no intermediate binding. The columns are reporting concepts independent of comments in the test source. Status is separate. Fixtures and units match the linked source. Refresh this snapshot after relevant source changes.

## Money addition and subtraction

Source: [money-arithmetic.test.ts](money-arithmetic.test.ts)


### Exact sums and differences

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [add_WhenBothAmountsArePositive_ReturnsTheirSum](money-arithmetic.test.ts#L6) | <code>first = Money.fromCents(500)</code><br><code>second = Money.fromCents(700)</code> | <code>sum.toCents()</code> equals <code>1200</code> | **Observation bindings:** <code>sum = first.add(second)</code><br>**Verified outcomes:** <code>sum.toCents()</code> was <code>1200</code> | Passed |
| [add_WhenChainedAfterSubtraction_ReturnsExactAmount](money-arithmetic.test.ts#L15) | <code>first = Money.fromCents(500)</code><br><code>second = Money.fromCents(700)</code> | <code>combined.toCents()</code> equals <code>300</code> | **Observation bindings:** <code>combined = first.subtract(second).add(first)</code><br>**Verified outcomes:** <code>combined.toCents()</code> was <code>300</code> | Passed |
| [subtract_WhenSecondAmountIsLarger_ReturnsNegativeDifference](money-arithmetic.test.ts#L24) | <code>first = Money.fromCents(500)</code><br><code>second = Money.fromCents(700)</code> | <code>difference.toCents()</code> equals <code>-200</code> | **Observation bindings:** <code>difference = first.subtract(second)</code><br>**Verified outcomes:** <code>difference.toCents()</code> was <code>-200</code> | Passed |
| [subtract_WhenAmountIsNegative_IncreasesValue](money-arithmetic.test.ts#L33) | <code>money = Money.fromCents(500)</code> | <code>difference.toCents()</code> equals <code>600</code> | **Observation bindings:** <code>difference = money.subtract(Money.fromCents(-100))</code><br>**Verified outcomes:** <code>difference.toCents()</code> was <code>600</code> | Passed |

### Immutable operands and results

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [fromCents_WhenCreated_ReturnsFrozenInstance](money-arithmetic.test.ts#L43) | <code>cents = 500</code> | <code>Object.isFrozen(money)</code> equals <code>true</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>Object.isFrozen(money)</code> was <code>true</code> | Passed |
| [add_WhenAddingZero_ReturnsNewInstance](money-arithmetic.test.ts#L51) | <code>money = Money.fromCents(500)</code> | <code>sum</code> is a different instance from <code>money</code><br><code>sum.toCents()</code> equals <code>500</code> | **Observation bindings:** <code>sum = money.add(Money.fromCents(0))</code><br>**Verified outcomes:** <code>sum</code> was a different instance from <code>money</code><br><code>sum.toCents()</code> was <code>500</code> | Passed |
| [add_WhenAppliedToOperands_PreservesBothValues](money-arithmetic.test.ts#L60) | <code>first = Money.fromCents(500)</code><br><code>second = Money.fromCents(700)</code><br>**Input commands:** <code>first.add(second)</code> | <code>first.toCents()</code> equals <code>500</code><br><code>second.toCents()</code> equals <code>700</code> | **Verified outcomes:** <code>first.toCents()</code> was <code>500</code><br><code>second.toCents()</code> was <code>700</code> | Passed |
| [subtract_WhenSubtractingZero_ReturnsNewInstance](money-arithmetic.test.ts#L70) | <code>money = Money.fromCents(500)</code> | <code>difference</code> is a different instance from <code>money</code><br><code>difference.toCents()</code> equals <code>500</code> | **Observation bindings:** <code>difference = money.subtract(Money.fromCents(0))</code><br>**Verified outcomes:** <code>difference</code> was a different instance from <code>money</code><br><code>difference.toCents()</code> was <code>500</code> | Passed |
| [subtract_WhenAppliedToOperands_PreservesBothValues](money-arithmetic.test.ts#L79) | <code>first = Money.fromCents(500)</code><br><code>second = Money.fromCents(700)</code><br>**Input commands:** <code>first.subtract(second)</code> | <code>first.toCents()</code> equals <code>500</code><br><code>second.toCents()</code> equals <code>700</code> | **Verified outcomes:** <code>first.toCents()</code> was <code>500</code><br><code>second.toCents()</code> was <code>700</code> | Passed |

## Money arithmetic at safe integer limits

Source: [money-bounds.test.ts](money-bounds.test.ts)


### Addition boundaries

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [add_WhenMaximumAndMinimumAreCombined_ReturnsZero](money-bounds.test.ts#L6) | <code>maximum = Money.fromCents(Number.MAX_SAFE_INTEGER)</code><br><code>minimum = Money.fromCents(Number.MIN_SAFE_INTEGER)</code> | <code>sum.toCents()</code> equals <code>0</code> | **Observation bindings:** <code>sum = maximum.add(minimum)</code><br>**Verified outcomes:** <code>sum.toCents()</code> was <code>0</code> | Passed |
| [add_WhenResultExceedsMaximum_ThrowsRangeError](money-bounds.test.ts#L15) | <code>maximum = Money.fromCents(Number.MAX_SAFE_INTEGER)</code><br>**Input commands:** <code>maximum.add(Money.fromCents(1))</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [add_WhenResultFallsBelowMinimum_ThrowsRangeError](money-bounds.test.ts#L21) | <code>minimum = Money.fromCents(Number.MIN_SAFE_INTEGER)</code><br>**Input commands:** <code>minimum.add(Money.fromCents(-1))</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |

### Subtraction boundaries

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [subtract_WhenOneIsSubtractedFromMaximum_PreservesExactValue](money-bounds.test.ts#L29) | <code>maximum = Money.fromCents(Number.MAX_SAFE_INTEGER)</code> | <code>difference.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER - 1</code> | **Observation bindings:** <code>difference = maximum.subtract(Money.fromCents(1))</code><br>**Verified outcomes:** <code>difference.toCents()</code> was <code>Number.MAX_SAFE_INTEGER - 1</code> | Passed |
| [subtract_WhenResultExceedsMaximum_ThrowsRangeError](money-bounds.test.ts#L37) | <code>maximum = Money.fromCents(Number.MAX_SAFE_INTEGER)</code><br>**Input commands:** <code>maximum.subtract(Money.fromCents(-1))</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [subtract_WhenResultFallsBelowMinimum_ThrowsRangeError](money-bounds.test.ts#L43) | <code>minimum = Money.fromCents(Number.MIN_SAFE_INTEGER)</code><br>**Input commands:** <code>minimum.subtract(Money.fromCents(1))</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |

### Multiplication boundaries

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [multiply_WhenMinimumIsNegated_ReturnsMaximum](money-bounds.test.ts#L51) | <code>minimum = Money.fromCents(Number.MIN_SAFE_INTEGER)</code> | <code>negatedMinimum.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER</code> | **Observation bindings:** <code>negatedMinimum = minimum.multiply(-1)</code><br>**Verified outcomes:** <code>negatedMinimum.toCents()</code> was <code>Number.MAX_SAFE_INTEGER</code> | Passed |
| [multiply_WhenOneCentIsScaledToMaximum_PreservesExactValue](money-bounds.test.ts#L59) | <code>oneCent = Money.fromCents(1)</code> | <code>scaledUnit.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER</code> | **Observation bindings:** <code>scaledUnit = oneCent.multiply(Number.MAX_SAFE_INTEGER)</code><br>**Verified outcomes:** <code>scaledUnit.toCents()</code> was <code>Number.MAX_SAFE_INTEGER</code> | Passed |
| [multiply_WhenMaximumIsDoubled_ThrowsRangeError](money-bounds.test.ts#L67) | <code>maximum = Money.fromCents(Number.MAX_SAFE_INTEGER)</code><br>**Input commands:** <code>maximum.multiply(2)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [multiply_WhenMinimumIsDoubled_ThrowsRangeError](money-bounds.test.ts#L73) | <code>minimum = Money.fromCents(Number.MIN_SAFE_INTEGER)</code><br>**Input commands:** <code>minimum.multiply(2)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |

## Money equality and ordering

Source: [money-comparison.test.ts](money-comparison.test.ts)

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [equals_WhenSeparateInstancesHaveEqualValues_ReturnsTrue](money-comparison.test.ts#L5) | <code>first = Money.fromCents(500)</code><br><code>equal = Money.fromCents(500)</code> | <code>first</code> is a different instance from <code>equal</code><br><code>equalByValue</code> equals <code>true</code> | **Observation bindings:** <code>equalByValue = first.equals(equal)</code><br>**Verified outcomes:** <code>first</code> was a different instance from <code>equal</code><br><code>equalByValue</code> was <code>true</code> | Passed |
| [equals_WhenValuesDiffer_ReturnsFalse](money-comparison.test.ts#L15) | <code>first = Money.fromCents(500)</code><br><code>greater = Money.fromCents(501)</code> | <code>equalByValue</code> equals <code>false</code> | **Observation bindings:** <code>equalByValue = first.equals(greater)</code><br>**Verified outcomes:** <code>equalByValue</code> was <code>false</code> | Passed |
| [compareTo_WhenValuesAreEqual_ReturnsZero](money-comparison.test.ts#L24) | <code>first = Money.fromCents(500)</code><br><code>equal = Money.fromCents(500)</code> | <code>comparison</code> equals <code>0</code> | **Observation bindings:** <code>comparison = first.compareTo(equal)</code><br>**Verified outcomes:** <code>comparison</code> was <code>0</code> | Passed |
| [compareTo_WhenValueIsSmaller_ReturnsNegativeOne](money-comparison.test.ts#L33) | <code>first = Money.fromCents(500)</code><br><code>greater = Money.fromCents(501)</code> | <code>comparison</code> equals <code>-1</code> | **Observation bindings:** <code>comparison = first.compareTo(greater)</code><br>**Verified outcomes:** <code>comparison</code> was <code>-1</code> | Passed |
| [compareTo_WhenValueIsGreater_ReturnsOne](money-comparison.test.ts#L42) | <code>greater = Money.fromCents(501)</code><br><code>first = Money.fromCents(500)</code> | <code>comparison</code> equals <code>1</code> | **Observation bindings:** <code>comparison = greater.compareTo(first)</code><br>**Verified outcomes:** <code>comparison</code> was <code>1</code> | Passed |
| [compareTo_WhenComparingNegativeToZero_ReturnsNegativeOne](money-comparison.test.ts#L51) | <code>negative = Money.fromCents(-1)</code><br><code>zero = Money.fromCents(0)</code> | <code>comparison</code> equals <code>-1</code> | **Observation bindings:** <code>comparison = negative.compareTo(zero)</code><br>**Verified outcomes:** <code>comparison</code> was <code>-1</code> | Passed |

## Money creation from integer cents

Source: [money-construction.test.ts](money-construction.test.ts)


### Exact cent values

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [fromCents_WhenZero_PreservesExactCents](money-construction.test.ts#L6) | <code>cents = 0</code> | <code>money.toCents()</code> equals <code>0</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>0</code> | Passed |
| [fromCents_WhenPositiveCent_PreservesExactCents](money-construction.test.ts#L14) | <code>cents = 1</code> | <code>money.toCents()</code> equals <code>1</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>1</code> | Passed |
| [fromCents_WhenNegativeCent_PreservesExactCents](money-construction.test.ts#L22) | <code>cents = -1</code> | <code>money.toCents()</code> equals <code>-1</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>-1</code> | Passed |
| [fromCents_WhenWholeCents_PreservesExactCents](money-construction.test.ts#L30) | <code>cents = 1001</code> | <code>money.toCents()</code> equals <code>1001</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>1001</code> | Passed |
| [fromCents_WhenMaximumSafeInteger_PreservesExactCents](money-construction.test.ts#L38) | <code>cents = Number.MAX_SAFE_INTEGER</code> | <code>money.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>Number.MAX_SAFE_INTEGER</code> | Passed |
| [fromCents_WhenMinimumSafeInteger_PreservesExactCents](money-construction.test.ts#L46) | <code>cents = Number.MIN_SAFE_INTEGER</code> | <code>money.toCents()</code> equals <code>Number.MIN_SAFE_INTEGER</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>Number.MIN_SAFE_INTEGER</code> | Passed |
| [fromCents_WhenNegativeZero_NormalizesToZero](money-construction.test.ts#L54) | <code>cents = -0</code> | <code>money.toCents()</code> equals <code>0</code> | **Observation bindings:** <code>money = Money.fromCents(cents)</code><br>**Verified outcomes:** <code>money.toCents()</code> was <code>0</code> | Passed |

### Cent input validation

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [fromCents_WhenPositiveFraction_ThrowsRangeError](money-construction.test.ts#L64) | <code>cents = 0.1</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [fromCents_WhenNegativeFraction_ThrowsRangeError](money-construction.test.ts#L70) | <code>cents = -0.1</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [fromCents_WhenNaN_ThrowsRangeError](money-construction.test.ts#L76) | <code>cents = Number.NaN</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [fromCents_WhenPositiveInfinity_ThrowsRangeError](money-construction.test.ts#L82) | <code>cents = Number.POSITIVE_INFINITY</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [fromCents_WhenNegativeInfinity_ThrowsRangeError](money-construction.test.ts#L88) | <code>cents = Number.NEGATIVE_INFINITY</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [fromCents_WhenAboveMaximum_ThrowsRangeError](money-construction.test.ts#L94) | <code>cents = Number.MAX_SAFE_INTEGER + 1</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [fromCents_WhenBelowMinimum_ThrowsRangeError](money-construction.test.ts#L100) | <code>cents = Number.MIN_SAFE_INTEGER - 1</code><br>**Input commands:** <code>Money.fromCents(cents)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |

## Money division with floor rounding

Source: [money-division.test.ts](money-division.test.ts)


### Floor rounding

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [divideFloor_WhenPositiveRemainder_RoundsDownAndPreservesSource](money-division.test.ts#L6) | <code>money = Money.fromCents(1001)</code> | <code>quotient.toCents()</code> equals <code>333</code><br><code>money.toCents()</code> equals <code>1001</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>333</code><br><code>money.toCents()</code> was <code>1001</code> | Passed |
| [divideFloor_WhenNegativeRemainder_RoundsDownAndPreservesSource](money-division.test.ts#L15) | <code>money = Money.fromCents(-1001)</code> | <code>quotient.toCents()</code> equals <code>-334</code><br><code>money.toCents()</code> equals <code>-1001</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>-334</code><br><code>money.toCents()</code> was <code>-1001</code> | Passed |
| [divideFloor_WhenPositiveExactDivision_RoundsDownAndPreservesSource](money-division.test.ts#L24) | <code>money = Money.fromCents(1002)</code> | <code>quotient.toCents()</code> equals <code>334</code><br><code>money.toCents()</code> equals <code>1002</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>334</code><br><code>money.toCents()</code> was <code>1002</code> | Passed |
| [divideFloor_WhenNegativeExactDivision_RoundsDownAndPreservesSource](money-division.test.ts#L33) | <code>money = Money.fromCents(-1002)</code> | <code>quotient.toCents()</code> equals <code>-334</code><br><code>money.toCents()</code> equals <code>-1002</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>-334</code><br><code>money.toCents()</code> was <code>-1002</code> | Passed |
| [divideFloor_WhenPositiveCent_RoundsDownAndPreservesSource](money-division.test.ts#L42) | <code>money = Money.fromCents(1)</code> | <code>quotient.toCents()</code> equals <code>0</code><br><code>money.toCents()</code> equals <code>1</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>0</code><br><code>money.toCents()</code> was <code>1</code> | Passed |
| [divideFloor_WhenNegativeCent_RoundsDownAndPreservesSource](money-division.test.ts#L51) | <code>money = Money.fromCents(-1)</code> | <code>quotient.toCents()</code> equals <code>-1</code><br><code>money.toCents()</code> equals <code>-1</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>-1</code><br><code>money.toCents()</code> was <code>-1</code> | Passed |
| [divideFloor_WhenZero_RoundsDownAndPreservesSource](money-division.test.ts#L60) | <code>money = Money.fromCents(0)</code> | <code>quotient.toCents()</code> equals <code>0</code><br><code>money.toCents()</code> equals <code>0</code> | **Observation bindings:** <code>quotient = money.divideFloor(3)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>0</code><br><code>money.toCents()</code> was <code>0</code> | Passed |
| [divideFloor_WhenMaximumSafeInteger_RoundsDownAndPreservesSource](money-division.test.ts#L69) | <code>money = Money.fromCents(Number.MAX_SAFE_INTEGER)</code> | <code>quotient.toCents()</code> equals <code>4503599627370495</code><br><code>money.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER</code> | **Observation bindings:** <code>quotient = money.divideFloor(2)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>4503599627370495</code><br><code>money.toCents()</code> was <code>Number.MAX_SAFE_INTEGER</code> | Passed |
| [divideFloor_WhenMinimumSafeInteger_RoundsDownAndPreservesSource](money-division.test.ts#L78) | <code>money = Money.fromCents(Number.MIN_SAFE_INTEGER)</code> | <code>quotient.toCents()</code> equals <code>-4503599627370496</code><br><code>money.toCents()</code> equals <code>Number.MIN_SAFE_INTEGER</code> | **Observation bindings:** <code>quotient = money.divideFloor(2)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>-4503599627370496</code><br><code>money.toCents()</code> was <code>Number.MIN_SAFE_INTEGER</code> | Passed |
| [divideFloor_WhenJustBelowMaximumDivisor_RoundsDownAndPreservesSource](money-division.test.ts#L87) | <code>money = Money.fromCents(Number.MAX_SAFE_INTEGER - 1)</code> | <code>quotient.toCents()</code> equals <code>0</code><br><code>money.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER - 1</code> | **Observation bindings:** <code>quotient = money.divideFloor(Number.MAX_SAFE_INTEGER)</code><br>**Verified outcomes:** <code>quotient.toCents()</code> was <code>0</code><br><code>money.toCents()</code> was <code>Number.MAX_SAFE_INTEGER - 1</code> | Passed |

### Division by one and instance identity

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [divideFloor_WhenPositiveRemainderIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L98) | <code>money = Money.fromCents(1001)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>1001</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>1001</code> | Passed |
| [divideFloor_WhenNegativeRemainderIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L107) | <code>money = Money.fromCents(-1001)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>-1001</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>-1001</code> | Passed |
| [divideFloor_WhenPositiveExactDivisionIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L116) | <code>money = Money.fromCents(1002)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>1002</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>1002</code> | Passed |
| [divideFloor_WhenNegativeExactDivisionIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L125) | <code>money = Money.fromCents(-1002)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>-1002</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>-1002</code> | Passed |
| [divideFloor_WhenPositiveCentIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L134) | <code>money = Money.fromCents(1)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>1</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>1</code> | Passed |
| [divideFloor_WhenNegativeCentIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L143) | <code>money = Money.fromCents(-1)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>-1</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>-1</code> | Passed |
| [divideFloor_WhenZeroIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L152) | <code>money = Money.fromCents(0)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>0</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>0</code> | Passed |
| [divideFloor_WhenMaximumSafeIntegerIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L161) | <code>money = Money.fromCents(Number.MAX_SAFE_INTEGER)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>Number.MAX_SAFE_INTEGER</code> | Passed |
| [divideFloor_WhenMinimumSafeIntegerIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L170) | <code>money = Money.fromCents(Number.MIN_SAFE_INTEGER)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>Number.MIN_SAFE_INTEGER</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>Number.MIN_SAFE_INTEGER</code> | Passed |
| [divideFloor_WhenJustBelowMaximumDivisorIsDividedByOne_ReturnsNewInstance](money-division.test.ts#L179) | <code>money = Money.fromCents(Number.MAX_SAFE_INTEGER - 1)</code> | <code>quotient</code> is a different instance from <code>money</code><br><code>quotient.toCents()</code> equals <code>Number.MAX_SAFE_INTEGER - 1</code> | **Observation bindings:** <code>quotient = money.divideFloor(1)</code><br>**Verified outcomes:** <code>quotient</code> was a different instance from <code>money</code><br><code>quotient.toCents()</code> was <code>Number.MAX_SAFE_INTEGER - 1</code> | Passed |

### Divisor validation

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [divideFloor_WhenDivisorIsZero_ThrowsRangeError](money-division.test.ts#L190) | <code>money = Money.fromCents(100)</code><br>**Input commands:** <code>money.divideFloor(0)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [divideFloor_WhenDivisorIsNegative_ThrowsRangeError](money-division.test.ts#L196) | <code>money = Money.fromCents(100)</code><br>**Input commands:** <code>money.divideFloor(-1)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [divideFloor_WhenDivisorIsFractional_ThrowsRangeError](money-division.test.ts#L202) | <code>money = Money.fromCents(100)</code><br>**Input commands:** <code>money.divideFloor(0.5)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [divideFloor_WhenDivisorIsNaN_ThrowsRangeError](money-division.test.ts#L208) | <code>money = Money.fromCents(100)</code><br>**Input commands:** <code>money.divideFloor(Number.NaN)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [divideFloor_WhenDivisorIsInfinite_ThrowsRangeError](money-division.test.ts#L214) | <code>money = Money.fromCents(100)</code><br>**Input commands:** <code>money.divideFloor(Number.POSITIVE_INFINITY)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [divideFloor_WhenDivisorIsUnsafeInteger_ThrowsRangeError](money-division.test.ts#L222) | <code>money = Money.fromCents(100)</code><br>**Input commands:** <code>money.divideFloor(Number.MAX_SAFE_INTEGER + 1)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |

## Money formatting in dollars

Source: [money-dollars.test.ts](money-dollars.test.ts)

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [toDollars_WhenZero_ReturnsTwoDecimalPlaces](money-dollars.test.ts#L5) | <code>money = Money.fromCents(0)</code> | <code>dollars</code> equals <code>"0.00"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"0.00"</code> | Passed |
| [toDollars_WhenOneCent_PadsTheFraction](money-dollars.test.ts#L13) | <code>money = Money.fromCents(1)</code> | <code>dollars</code> equals <code>"0.01"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"0.01"</code> | Passed |
| [toDollars_WhenWholeDollars_PreservesTwoDecimalPlaces](money-dollars.test.ts#L21) | <code>money = Money.fromCents(1000)</code> | <code>dollars</code> equals <code>"10.00"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"10.00"</code> | Passed |
| [toDollars_WhenFractionalDollars_ReturnsExactAmount](money-dollars.test.ts#L29) | <code>money = Money.fromCents(333)</code> | <code>dollars</code> equals <code>"3.33"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"3.33"</code> | Passed |
| [toDollars_WhenNegativeCent_PreservesSign](money-dollars.test.ts#L37) | <code>money = Money.fromCents(-1)</code> | <code>dollars</code> equals <code>"-0.01"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"-0.01"</code> | Passed |
| [toDollars_WhenNegativeDollars_ReturnsExactAmount](money-dollars.test.ts#L45) | <code>money = Money.fromCents(-333)</code> | <code>dollars</code> equals <code>"-3.33"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"-3.33"</code> | Passed |
| [toDollars_WhenMaximumSafeInteger_PreservesEveryCent](money-dollars.test.ts#L53) | <code>money = Money.fromCents(Number.MAX_SAFE_INTEGER)</code> | <code>dollars</code> equals <code>"90071992547409.91"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"90071992547409.91"</code> | Passed |
| [toDollars_WhenMinimumSafeInteger_PreservesEveryCent](money-dollars.test.ts#L61) | <code>money = Money.fromCents(Number.MIN_SAFE_INTEGER)</code> | <code>dollars</code> equals <code>"-90071992547409.91"</code> | **Observation bindings:** <code>dollars = money.toDollars()</code><br>**Verified outcomes:** <code>dollars</code> was <code>"-90071992547409.91"</code> | Passed |

## Money multiplication by integer factors

Source: [money-multiplication.test.ts](money-multiplication.test.ts)


### Products and source immutability

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [multiply_WhenFactorIsPositive_ReturnsProductAndPreservesSource](money-multiplication.test.ts#L6) | <code>money = Money.fromCents(500)</code> | <code>product.toCents()</code> equals <code>1500</code><br><code>money.toCents()</code> equals <code>500</code> | **Observation bindings:** <code>product = money.multiply(3)</code><br>**Verified outcomes:** <code>product.toCents()</code> was <code>1500</code><br><code>money.toCents()</code> was <code>500</code> | Passed |
| [multiply_WhenFactorIsNegative_ReturnsProductAndPreservesSource](money-multiplication.test.ts#L15) | <code>money = Money.fromCents(500)</code> | <code>product.toCents()</code> equals <code>-1500</code><br><code>money.toCents()</code> equals <code>500</code> | **Observation bindings:** <code>product = money.multiply(-3)</code><br>**Verified outcomes:** <code>product.toCents()</code> was <code>-1500</code><br><code>money.toCents()</code> was <code>500</code> | Passed |
| [multiply_WhenFactorIsZero_ReturnsProductAndPreservesSource](money-multiplication.test.ts#L24) | <code>money = Money.fromCents(500)</code> | <code>product.toCents()</code> equals <code>0</code><br><code>money.toCents()</code> equals <code>500</code> | **Observation bindings:** <code>product = money.multiply(0)</code><br>**Verified outcomes:** <code>product.toCents()</code> was <code>0</code><br><code>money.toCents()</code> was <code>500</code> | Passed |
| [multiply_WhenFactorIsOne_ReturnsNewInstance](money-multiplication.test.ts#L33) | <code>money = Money.fromCents(500)</code> | <code>product</code> is a different instance from <code>money</code><br><code>product.toCents()</code> equals <code>500</code> | **Observation bindings:** <code>product = money.multiply(1)</code><br>**Verified outcomes:** <code>product</code> was a different instance from <code>money</code><br><code>product.toCents()</code> was <code>500</code> | Passed |

### Integer factor validation

| Name and location | Input | Oracle — expected result | Log — actual result (assertion-verified) | Status |
|---|---|---|---|---|
| [multiply_WhenFactorIsFractional_RejectsEvenForZeroCents](money-multiplication.test.ts#L44) | <code>money = Money.fromCents(0)</code><br>**Input commands:** <code>money.multiply(0.5)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [multiply_WhenFactorIsNaN_RejectsEvenForZeroCents](money-multiplication.test.ts#L50) | <code>money = Money.fromCents(0)</code><br>**Input commands:** <code>money.multiply(Number.NaN)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [multiply_WhenFactorIsPositiveInfinity_RejectsEvenForZeroCents](money-multiplication.test.ts#L56) | <code>money = Money.fromCents(0)</code><br>**Input commands:** <code>money.multiply(Number.POSITIVE_INFINITY)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [multiply_WhenFactorIsNegativeInfinity_RejectsEvenForZeroCents](money-multiplication.test.ts#L62) | <code>money = Money.fromCents(0)</code><br>**Input commands:** <code>money.multiply(Number.NEGATIVE_INFINITY)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [multiply_WhenFactorIsAboveMaximum_RejectsEvenForZeroCents](money-multiplication.test.ts#L68) | <code>money = Money.fromCents(0)</code><br>**Input commands:** <code>money.multiply(Number.MAX_SAFE_INTEGER + 1)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
| [multiply_WhenFactorIsBelowMinimum_RejectsEvenForZeroCents](money-multiplication.test.ts#L76) | <code>money = Money.fromCents(0)</code><br>**Input commands:** <code>money.multiply(Number.MIN_SAFE_INTEGER - 1)</code> | Throws an error matching <code>RangeError</code> | **Verified outcomes:** Threw an error matching <code>RangeError</code> | Passed |
