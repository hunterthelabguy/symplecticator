# When to Mock

Mock at **system boundaries** only:

- The cluster scheduler (`sbatch`, `squeue`) and other external commands
- Files on shared storage (sometimes; prefer a temporary directory)
- Time and randomness (pass a seeded generator instead of mocking)
- Network services, if the code talks to any

Don't mock:

- Your own functions and modules
- Internal collaborators
- Anything you control

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```python
# Easy to test: the caller supplies the generator
def sample_initial_positions(n, rng):
    return rng.normal(size=(n, 3))

# Hard to test: hidden global state
def sample_initial_positions(n):
    return np.random.normal(size=(n, 3))
```

**2. Prefer specific operations over a generic runner**

Create one function per external operation instead of one generic function
with conditional logic:

```python
# GOOD: each function is independently mockable
scheduler = SimpleNamespace(
    submit=lambda script: run(["sbatch", script]),
    status=lambda job_id: run(["squeue", "-j", job_id]),
    cancel=lambda job_id: run(["scancel", job_id]),
)

# BAD: mocking requires conditional logic inside the mock
def scheduler(command, *args):
    return run([command, *args])
```

The specific approach means:
- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which operations a test exercises
- Clearer types per operation
