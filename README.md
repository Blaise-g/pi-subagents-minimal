# Minimal Subagents for Pi

A deliberately narrow Pi extension for isolated, bounded repository Investigation. V1 supports one Investigation or a flat batch, with read-only local capabilities and an optional closure-bound Markdown report.

## Development install

The package is currently pre-release and intended for local iteration. From this checkout, install it by absolute path:

```sh
pi install /absolute/path/to/pi-subagents-minimal
```

Pi references a local package in place, so source changes are available on the next Pi session without publishing a package. Use `-l` to record the package in project settings instead of user settings.

Supported hosts are stable Pi `>=0.84.3 <0.85.0` and Node `>=22.19.0`.

## Public release

The planned stable install is:

```sh
pi install npm:pi-subagents-minimal@1.0.0
```

`1.0.0` will be published only after the exact tagged candidate passes the complete release contract. [Maintainer release instructions](https://github.com/Blaise-g/pi-subagents-minimal/blob/main/docs/releasing.md) describe the auditable process.
