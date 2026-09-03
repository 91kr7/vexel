---
id: answers-are-read-from-the-code
kind: guideline
scope: any
date: 2026-09-03
source: chat, while investigating why two connections were opened at client startup
---

# An answer about this application is read from the code, never recalled

**Rule** → Every claim about what this application does — a mechanism, an endpoint, a component's
behaviour, whether something is still there — is established by opening the files that decide it,
in the turn the answer is given. Recollection of earlier work in the same session is not a source,
and neither is what a subagent reported. When the code cannot settle it, say so and say what was
read.

**Why** → "quando ti chiedo le cose puoi analizzare il codice! senza andare a memoria!!!", said on
2026-09-03 after two answers in a row had to be withdrawn. The first proposed sharing one
connection between consumers of `/api/containers/stats/subscription`, assuming it carried data; it
carries none, and the proposal was for a problem that did not exist. The second said the server had
no way to know whether anyone was listening on the live channel; the server keeps a set of open
channels and holds the refresh demand on it, which the human remembered from the requirements and
the assistant did not. Both were settled in seconds by reading. An answer given from memory costs
the human the work of catching it, which is the opposite of what asking was for.

**How to apply** → any phase: read before answering, and cite what was read so the human can check
it. A correction of an earlier answer names what was read this time, not what was assumed before.
See [[explain-in-plain-italian]] for the form the answer then takes.
