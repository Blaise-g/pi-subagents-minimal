# Minimal Subagents for Pi

A deliberately narrow Pi extension for isolated, bounded repository Investigation. V1 supports one Investigation or a flat batch, with read-only local capabilities and an optional closure-bound Markdown report.

## Development install

The package is currently pre-release and intended for local iteration. From this checkout, install it by absolute path:

```sh
pi install /absolute/path/to/pi-subagents-minimal
```

Pi references a local package in place, so source changes are available on the next Pi session without publishing a package. Use `-l` to record the package in project settings instead of user settings.

Supported hosts are stable Pi `>=0.84.3 <0.85.0` and Node `>=22.19.0`.

## Using the extension

The extension adds `delegate`, which starts one bounded Investigation or a flat batch in the background. Pi will receive a concise completion notification; it can then use `delegation_control` to inspect the durable result or cancel live work.

Ask Pi naturally—the Orchestrator should construct the tool request. For example:

- **Repository exploration:** “Delegate an Investigation to locate where configuration precedence is implemented. Return exact paths and symbols and explain the precedence concisely.”
- **Evidence-intensive research:** “Delegate an Investigation to establish the repository's session-isolation behavior from local sources and write the complete evidence to `artifacts/session-isolation.md`.”
- **Two-axis diff review:** “Review the changes since `<fixed-point>` using `code-review-diff`.”
- **Three-lens simplification:** “Review the current changes using `code-simplify`.”

The optional `reportPath` must be a project-relative Markdown path beneath `artifacts/`. Without one, an Investigation is read-only and returns a bounded answer. With one, it can create or replace exactly that report and returns a concise summary and path.

The `research`, `code-review-diff`, and `code-simplify` skills are not bundled with this package. They are optional parent workflows that own task framing; the extension supplies the isolated Investigation runtime. Direct exploration and evidence-intensive Investigation do not require a parent skill.

Record dogfooding defects or concrete behavioral questions as issues; do not treat ad hoc model output as release certification.

## Public release

The planned stable install is:

```sh
pi install npm:pi-subagents-minimal@1.0.0
```

`1.0.0` will be published only after the exact tagged candidate passes the complete release contract. [Maintainer release instructions](https://github.com/Blaise-g/pi-subagents-minimal/blob/main/docs/releasing.md) describe the auditable process.
