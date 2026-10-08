# Product Specification

## Core promise

ArtifactPassport gives every AI-generated artifact a stable identity, measurable QA report, and portable handoff mechanism.

## Primary users

- Indie developers using AI coding assistants.
- People building websites with AI.
- AI-heavy freelancers delivering client work.
- Students and nontraditional learners receiving generated files.
- Technical users moving artifacts between phone and computer.

## Non-goals

- General-purpose AI chat.
- Malware detection.
- Full static analysis of arbitrary programming languages.
- Cloud file storage as the primary product.
- Replacing version control.

## Differentiation

The unit of the product is not the conversation and not the prompt. It is the **artifact**.

The passport format intentionally combines:

1. Exact-byte identity.
2. Bounded deterministic validation.
3. Security heuristics.
4. Versionable provenance metadata.
5. Cross-device transfer.

That combination is the product thesis.

## UX rule

Every screen should answer one of three questions:

**What did I get?**

**Can I trust that this is the same artifact?**

**How do I move it where I need it?**

Anything that does not reinforce one of those questions belongs on the roadmap rather than in the MVP.
