# C# best practices

## Scope

- Start by confirming the target framework, language version, project type, and deployment model before giving specific guidance.
- Distinguish libraries, ASP.NET services, desktop apps, worker services, test projects, and source generators because their constraints differ.
- Prefer project-local conventions when they are already automated and internally consistent.
- Use the defaults below when the repository has no clear standard.

## Version and environment gates

Confirm these first because they materially change the recommendations:

- **Target framework**: .NET Framework, .NET, Unity, Xamarin legacy, MAUI, or constrained runtime.
- **Language version**: modern features such as records, pattern matching, collection expressions, and primary constructors depend on it.
- **Nullability**: whether nullable reference types are enabled and treated as part of the contract.
- **Deployment model**: ASP.NET request pipeline, background service, native AOT, Blazor, desktop UI, or library.

## Review priorities

- identify correctness and behavior-preservation constraints before recommending stylistic cleanup
- prefer conventions that make ownership, dependencies, and change seams easier to understand
- keep project-local standards when they are already automated and internally consistent
- distinguish general C# guidance from ASP.NET, EF Core, Unity, or UI-framework-specific rules
- treat async correctness, nullability, and disposal as design topics rather than style trivia

## Default design choices

### Nullability and contracts

- Enable nullable reference types for new code when possible.
- Treat nullability warnings as feedback about API shape.
- Prefer explicit option-like modeling, guard clauses, and clear parameter validation over hidden null assumptions.
- Keep public contracts honest: do not suppress nullable warnings just to quiet the build.

### Async and cancellation

- Use `async` and `await` for I/O-bound work.
- Keep cancellation tokens explicit on operations that may block, wait, or perform network or storage work.
- Avoid blocking on tasks in ordinary application code.
- Distinguish CPU-bound work from I/O-bound work rather than wrapping everything in `Task.Run`.

### Dependency structure

- Prefer small services with constructor injection and focused abstractions.
- Use records, readonly structs, or immutable DTOs where they clarify intent.
- Keep domain logic away from transport, configuration, and persistence adapters.
- Be deliberate about static state, ambient context, and extension methods that hide important dependencies.

### Resource and exception handling

- Dispose resources deterministically with `using` or `await using`.
- Catch exceptions only where the code can add context, translate the failure, or recover.
- Avoid catch-all exception handling in lower layers.
- Keep logging and observability at meaningful boundaries.

## Tooling baseline

| Concern | Preferred baseline |
| --- | --- |
| formatting | one `.editorconfig` and formatter path for the repository |
| analyzers | enable SDK analyzers and any project-required rule sets |
| build validation | treat warnings intentionally; avoid normalizing warning debt |
| tests | unit tests for core logic plus integration tests for framework boundaries |
| docs | keep XML documentation generation enabled for public libraries where API discoverability matters |

## Common red flags

- nullable warnings suppressed instead of addressed through design
- asynchronous APIs that ignore cancellation or block on tasks
- services that depend on many unrelated collaborators and know too much about infrastructure
- disposable objects escaped into long-lived state with unclear ownership
- catch-all exception handlers that log and continue without a recovery strategy
- public APIs that expose framework-specific types without a clear reason

## Review checklist

- [ ] The target framework, language version, and project type are identified before advice becomes specific.
- [ ] Nullable reference types and parameter validation reflect the real contract.
- [ ] Async methods propagate cancellation, errors, and disposal intentionally.
- [ ] Dependency direction keeps domain logic separate from outer adapters.
- [ ] Resource ownership is visible and deterministic.
- [ ] Formatting, analyzers, tests, and documentation generation are easy to run in CI.

## Migration playbook

- turn on analyzers and nullable feedback before broad refactoring
- address async blocking, disposal leaks, and boundary validation before style-only cleanup
- reduce constructor bloat and dependency tangles before renaming symbols for aesthetics
- move framework-specific concerns outward so domain logic becomes easier to test
- add focused tests around behavior that must remain stable, then simplify implementation detail

## Reference starting points

- [C# coding conventions](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- [Generate XML API documentation comments](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/)
- [Recommended XML documentation tags](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags)
