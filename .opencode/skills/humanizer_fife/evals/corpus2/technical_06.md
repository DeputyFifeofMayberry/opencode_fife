# ShellKit 2.0: The Command Line, Reconsidered

Today we're announcing ShellKit 2.0, the release that reimagines what a terminal toolkit can be. If you write command-line tools — or you've been meaning to — this is the version you've been waiting for.

## A New Core

ShellKit 2.0 replaces its argument parser with a composable pipeline engine. Moreover, commands are now declarative: describe your flags once, and ShellKit generates help text, shell completions, and man pages automatically. Furthermore, type-safe config loading means invalid flags fail at parse time, not in production.

## Built-In Polish

- Progress bars that render correctly in every terminal
- Automatic color degradation for non-TTY output
- Structured logging with JSON output for pipelines

## Why 2.0

It's worth noting that this is a breaking release. The v1 API remains available through a compatibility layer, and our migration guide covers every rename with before-and-after examples. Additionally, a codemod handles the most common migrations automatically.

## Get Started

Install with your favorite package manager and run `shellkit init`. The future of command-line development is declarative, type-safe, and delightful — and it starts today. Happy building!
