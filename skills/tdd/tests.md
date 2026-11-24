# Good and Bad Tests

Examples use a small integrator module with a public `rk4_step(f, t, y, dt)`
and `integrate(f, y0, t_end, dt)`.

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```python
# GOOD: tests observable behavior against an analytic solution
def test_oscillator_returns_after_one_period():
    # x'' = -x has period 2*pi; start at x=1, v=0
    period = 2 * math.pi
    y_end = integrate(oscillator, y0=[1.0, 0.0], t_end=period, dt=period / 10_000)
    assert y_end == pytest.approx([1.0, 0.0], abs=1e-8)
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```python
# BAD: tests implementation details
def test_rk4_calls_stage_four_times(mocker):
    stage = mocker.patch("integrators._stage")
    rk4_step(oscillator, 0.0, [1.0, 0.0], 0.1)
    assert stage.call_count == 4
```

Red flags:

- Mocking internal collaborators
- Testing private functions
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```python
# BAD: bypasses the interface to verify
def test_integrate_fills_history():
    integ = Integrator(oscillator)
    integ.run(t_end=1.0)
    assert integ._history[-1] is not None

# GOOD: verifies through the interface
def test_integrate_reaches_t_end():
    result = integrate(oscillator, y0=[1.0, 0.0], t_end=1.0, dt=0.01)
    assert result.t[-1] == pytest.approx(1.0)
```

**Tautological tests**: Expected value restates the implementation, so the test passes by construction.

```python
# BAD: expected value is recomputed the way the code computes it
def test_energy():
    y = [0.6, 0.8]
    assert energy(y) == 0.5 * (y[0] ** 2 + y[1] ** 2)

# GOOD: expected value is an independent, known literal
def test_energy():
    assert energy([0.6, 0.8]) == pytest.approx(0.5)
```

**Long sequences**: a test of a long list or array gives its last element a
value that differs from the rest, and asserts it, so a mutant that drops,
repeats or mishandles the end of the sequence is killed. Same-valued
elements let such a mutant pass.

```python
# BAD: every element equal; a mutant that drops or repeats the last one survives
samples = [1.0] * 150_000

# GOOD: the last element differs, and the test asserts it
samples = [1.0] * 149_999 + [2.0]
assert smooth(samples)[-1] == pytest.approx(2.0)
```
