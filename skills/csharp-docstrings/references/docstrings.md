# C# documentation convention

## Preferred convention

XML documentation comments

## Decision rules

- preserve an established machine-readable style when the repository or toolchain already depends on it
- otherwise standardize on the preferred convention above for the requested surface
- document public and externally consumed symbols before private helpers
- keep summaries, parameters, returns, errors, and examples aligned with the real code
- enable XML documentation file generation when the project is expected to surface API docs downstream

## Why this is the default

C# has native triple-slash XML documentation comments. The compiler can emit them into an XML documentation file, IDEs surface them as IntelliSense, and downstream tools such as DocFX can turn them into API reference sites. That makes XML comments the canonical machine-readable API documentation convention for C#.

## Best targets

- public types and public members
- interfaces, records, delegates, and generic types that form part of an external contract
- extension methods and public options objects that callers use directly
- protected members only when they are part of an intended subclassing surface

## Core tag set

Use the smallest truthful set of tags that helps callers.

- `<summary>`
- `<param>`
- `<typeparam>`
- `<returns>`
- `<value>` for properties where the meaning is not obvious
- `<remarks>` for longer narrative context
- `<exception>` when callers truly need to plan for a thrown exception
- `<example>` for usage snippets
- `<see>` or `<seealso>` for discoverability
- `<inheritdoc/>` when inheritance is the right source of truth

## Canonical syntax

```text
/// <summary>Build the current report snapshot.</summary>
/// <param name="request">Immutable report request.</param>
/// <returns>Generated snapshot.</returns>
public ReportSnapshot Build(ReportRequest request) => ...;
```

## Generic example

```text
/// <summary>Transform a source value into a result value.</summary>
/// <typeparam name="TSource">Input value type.</typeparam>
/// <typeparam name="TResult">Output value type.</typeparam>
/// <param name="value">Input value.</param>
/// <returns>The transformed result.</returns>
public TResult Convert<TSource, TResult>(TSource value) => ...;
```

## Tooling notes

- Comments must immediately precede the declaration they document.
- Parameter names in `<param>` tags must exactly match the signature or tools may drop them.
- XML must be well formed.
- `<inheritdoc/>` is often better than duplicating text on overrides or interface implementations when the inherited text is still accurate.

## External tool access

```text
dotnet build -p:GenerateDocumentationFile=true
docfx build
```

## Migration guidance

- convert detached prose comments into declaration-adjacent XML comments
- document the supported public API first rather than trying to annotate every private helper
- standardize summary wording and tag ordering across similar APIs
- verify the emitted XML file and IntelliSense output after changes

## Review checklist

- [ ] The comment is attached to the declaration external tools inspect.
- [ ] `<param>` and `<typeparam>` names match the signature exactly.
- [ ] `<summary>` is concise, truthful, and not just a restatement of the member name.
- [ ] `<remarks>`, `<example>`, and `<exception>` add real value rather than filler.
- [ ] Inherited members use `<inheritdoc/>` where duplication would drift.

## Anti-patterns

- malformed XML that silently drops documentation from downstream tools
- describing exceptions, nullability, or side effects that the code does not actually expose
- copying summaries onto overrides without noticing behavioral differences
- documenting internal implementation detail instead of the public contract
- generating XML files but never validating that the intended comments actually appear there

## Reference starting points

- [Generate XML API documentation comments](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/)
- [Documentation comments in the C# language specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/documentation-comments)
- [Recommended XML documentation tags](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags)
- [Compiler output options](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/output)
